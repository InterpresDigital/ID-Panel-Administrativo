import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  StartSensitivity,
  TurnCoverage,
} from "@google/genai";
import {
  AI_RFI_SECTIONS,
  ALLOWED_STRING_RFI_FIELDS,
  AiBriefingAnswers,
  INITIAL_AI_BRIEFING_ANSWERS,
  buildVoiceConsultantSystemPrompt,
  clampSection,
  finishVoiceInterviewTool,
  getNextQuestionGuidance,
  hasAnySectionProgress,
  isSectionFilled,
  isSectionPartial,
  resolveResumeSection,
  safeStr,
  sanitizeLegacyAnswers,
  toStringArray,
  updateRfiFieldsTool,
} from "../utils/aiBriefingTypes";
import { requestEphemeralVoiceToken } from "./geminiService";

export type VoiceSessionStatus =
  | "idle"
  | "requesting_token"
  | "connecting"
  | "connected"
  | "speaking"
  | "paused"
  | "error"
  | "ended";

export interface VoiceBriefingCallbacks {
  onStatusChange: (status: VoiceSessionStatus, errorMessage?: string) => void;
  onFieldsUpdated: (partial: Partial<AiBriefingAnswers>, pendingSection?: number) => void;
  onTranscriptUpdate: (role: "user" | "agent", text: string) => void;
  onAudioLevel: (level: number) => void;
  onInterviewFinished: (summaryMessage?: string) => void;
}

function downsampleTo16kHz(input: Float32Array, inputSampleRate: number): Float32Array {
  if (!inputSampleRate || inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCMBase64(float32Array: Float32Array): string {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToFloat32PCM(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export class AiVoiceBriefingSession {
  private session: any = null;
  private micStream: MediaStream | null = null;
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private nextPlaybackTime = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private echoGuardUntilMs = 0;
  private speechGateOpenUntilMs = 0;
  private spokeInCurrentModelTurn = false;
  private isMuted = false;
  private isPaused = false;
  private closed = false;
  private latestAnswers: AiBriefingAnswers = { ...INITIAL_AI_BRIEFING_ANSWERS };
  private currentBriefingId = "";
  private resumptionHandle: string | null = null;
  private autoReconnectCount = 0;
  private reconnecting = false;
  private pendingGoAwayRotation = false;
  private keepAliveTimer: number | null = null;
  private pendingFinishSummary: string | null = null;
  private postFinishTurnCompleted = false;
  private finishRequestedAtMs = 0;
  private lastAudioActivityAtMs = 0;
  private finishTimer: number | null = null;

  constructor(private callbacks: VoiceBriefingCallbacks) {}

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.callbacks.onAudioLevel(0);
    }
  }

  public getPaused(): boolean {
    return this.isPaused;
  }

  public setPaused(paused: boolean) {
    if (this.closed || !this.session) return;
    this.isPaused = paused;
    if (paused) {
      // Cortar audio saliente de inmediato y congelar envío de micrófono sin perder la conexión
      this.stopPlaybackQueue();
      this.callbacks.onAudioLevel(0);
      this.callbacks.onStatusChange("paused");
    } else {
      if (this.playbackCtx && this.playbackCtx.state === "suspended") {
        this.playbackCtx.resume().catch(() => {});
      }
      if (this.captureCtx && this.captureCtx.state === "suspended") {
        this.captureCtx.resume().catch(() => {});
      }
      this.callbacks.onStatusChange("connected");
    }
  }

  public async start(briefingId: string, currentAnswers: AiBriefingAnswers): Promise<void> {
    this.closed = false;
    this.isPaused = false;
    this.currentBriefingId = briefingId;
    this.resumptionHandle = null;
    this.autoReconnectCount = 0;
    this.reconnecting = false;
    this.pendingGoAwayRotation = false;
    this.latestAnswers = sanitizeLegacyAnswers(currentAnswers);
    this.spokeInCurrentModelTurn = false;
    this.speechGateOpenUntilMs = 0;
    this.pendingFinishSummary = null;
    this.postFinishTurnCompleted = false;
    this.finishRequestedAtMs = 0;
    this.lastAudioActivityAtMs = 0;

    try {
      this.callbacks.onStatusChange("requesting_token");

      // Inicializar contextos de audio dentro del gesto directo del usuario (crítico en iOS / Android)
      this.playbackCtx = new AudioContext({ sampleRate: 24000 });
      if (this.playbackCtx.state === "suspended") {
        this.playbackCtx.resume().catch(() => {});
      }

      // Ejecutar solicitud de micrófono y token efímero EN PARALELO para minimizar tiempo de arranque
      const [micStream, tokenData] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
        requestEphemeralVoiceToken(briefingId),
      ]);

      if (this.closed) {
        micStream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.micStream = micStream;
      await this.connectSocketSession(tokenData.token, tokenData.model, false);
      this.startKeepAliveWatchdog();
    } catch (error: any) {
      this.cleanupAudio();
      const friendly =
        error?.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Actívalo en tu navegador o continúa en modo manual."
          : error?.message || "No fue posible iniciar la entrevista por voz.";
      this.callbacks.onStatusChange("error", friendly);
    }
  }

  private async connectSocketSession(
    token: string,
    model?: string,
    isSilentReconnect = false
  ): Promise<void> {
    if (this.closed || !this.playbackCtx) return;

    if (!isSilentReconnect) {
      this.callbacks.onStatusChange("connecting");
    }
    this.nextPlaybackTime = this.playbackCtx.currentTime;

    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const session = await ai.live.connect({
      model: model || "gemini-2.5-flash-native-audio-preview-12-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        thinkingConfig: {
          thinkingBudget: 0,
        },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede",
            },
          },
        },
        // Compresión deslizante de ventana: elimina el corte automático de 10 minutos (~600s) de Gemini Live Audio
        contextWindowCompression: {
          slidingWindow: {},
        },
        // Soporte nativo de reanudación de sesión ante microcortes de red
        sessionResumption: this.resumptionHandle ? { handle: this.resumptionHandle } : {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 250,
            silenceDurationMs: 1150,
          },
          activityHandling: ActivityHandling.NO_INTERRUPTION,
          turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
        },
        systemInstruction: buildVoiceConsultantSystemPrompt(this.latestAnswers),
        tools: [{ functionDeclarations: [updateRfiFieldsTool, finishVoiceInterviewTool] }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          this.autoReconnectCount = 0;
        },
        onmessage: (msg: LiveServerMessage) => {
          this.handleServerMessage(msg);
        },
        onerror: (err: any) => {
          console.warn("Aviso de red en Gemini Live:", err);
        },
        onclose: (ev: any) => {
          if (this.closed) {
            this.cleanupAudio();
            return;
          }
          if (this.pendingFinishSummary !== null) {
            const msgSummary = this.pendingFinishSummary;
            this.pendingFinishSummary = null;
            this.cleanupAudio();
            this.callbacks.onInterviewFinished(msgSummary);
            return;
          }
          // Reconexión automática transparente (hasta 4 intentos consecutivos) ante rotación de socket o microcorte
          if (
            !this.isPaused &&
            !this.currentBriefingId === false &&
            (typeof navigator === "undefined" || navigator.onLine !== false)
          ) {
            if (this.reconnecting) {
              // Ya hay una rotación transparente en curso (ej. por GoAway preventivo)
              return;
            }
            if (this.autoReconnectCount < 4) {
              console.info("Renovando canal de voz automáticamente sin corte...", ev?.code);
              this.attemptSilentReconnect();
              return;
            }
          }

          console.warn("WebSocket Gemini Live cerrado:", ev?.code, ev?.reason);
          this.cleanupAudio();
          this.callbacks.onStatusChange(
            "error",
            "La señal de internet se desconectó. Tu avance está guardado; toca Reanudar cuando recuperes conexión."
          );
        },
      },
    });

    if (this.closed) {
      session.close();
      return;
    }

    this.session = session;
    this.reconnecting = false;
    this.pendingGoAwayRotation = false;
    this.callbacks.onStatusChange("connected");

    // Si es primera conexión (o reconexión de respaldo sin handle previo), detonar el turno correspondiente
    if (!isSilentReconnect || !this.resumptionHandle) {
      try {
        const hasProgress = hasAnySectionProgress(this.latestAnswers);
        const who = this.latestAnswers.contactName
          ? `${this.latestAnswers.contactName}${
              this.latestAnswers.companyName ? ` de ${this.latestAnswers.companyName}` : ""
            }`
          : "";

        this.echoGuardUntilMs = Date.now() + 1800;

        const guestIntro = isSilentReconnect
          ? `Continúa exactamente en la pregunta en curso con brevedad ejecutiva, sin repetir el saludo.`
          : hasProgress
          ? `Hola Nexia${who ? `, soy ${who}` : ""}. Ya estoy listo para retomar donde nos quedamos.`
          : `Hola Nexia${who ? `, soy ${who}` : ""}. Estoy listo para iniciar por primera vez.`;

        this.session.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [{ text: guestIntro }],
            },
          ],
          turnComplete: true,
        });
      } catch (e) {
        console.warn("No se pudo enviar turno inicial:", e);
      }
    }

    if (!this.captureCtx) {
      this.startMicrophoneStreaming();
    }
  }

  private rotateSocketSmoothly() {
    if (this.closed || this.isPaused || this.reconnecting || this.pendingFinishSummary !== null) {
      return;
    }
    this.pendingGoAwayRotation = false;
    const oldSession = this.session;
    this.reconnecting = true;
    this.session = null;
    try {
      oldSession?.close();
    } catch {}
    this.reconnecting = false;
    this.attemptSilentReconnect();
  }

  private async attemptSilentReconnect() {
    if (this.closed || this.reconnecting || !this.currentBriefingId) return;
    this.reconnecting = true;
    this.autoReconnectCount += 1;
    this.session = null;

    try {
      const tokenData = await requestEphemeralVoiceToken(this.currentBriefingId);
      if (this.closed) return;
      try {
        await this.connectSocketSession(tokenData.token, tokenData.model, true);
      } catch (resumeErr) {
        // Si el handle previo caducó, abrir socket limpio conservando 100% de respuestas sin cortar al usuario
        if (this.resumptionHandle && !this.closed) {
          console.warn("Handle previo caducado; renovando canal limpio con estado completo...", resumeErr);
          this.resumptionHandle = null;
          const freshToken = await requestEphemeralVoiceToken(this.currentBriefingId);
          if (this.closed) return;
          await this.connectSocketSession(freshToken.token, freshToken.model, true);
        } else {
          throw resumeErr;
        }
      }
    } catch (err) {
      console.warn("Intento de reconexión silenciosa falló:", err);
      this.reconnecting = false;
      if (!this.closed && !this.isPaused && this.autoReconnectCount < 4) {
        window.setTimeout(() => {
          if (!this.closed && !this.isPaused) {
            this.attemptSilentReconnect();
          }
        }, 800);
        return;
      }
      if (!this.closed) {
        this.cleanupAudio();
        this.callbacks.onStatusChange(
          "error",
          "La señal de internet se desconectó. Tu avance está guardado; toca Reanudar cuando recuperes conexión."
        );
      }
    }
  }

  private startKeepAliveWatchdog() {
    if (this.keepAliveTimer) window.clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = window.setInterval(() => {
      if (this.closed || this.isPaused) return;
      if (this.playbackCtx && this.playbackCtx.state === "suspended") {
        this.playbackCtx.resume().catch(() => {});
      }
      if (this.captureCtx && this.captureCtx.state === "suspended") {
        this.captureCtx.resume().catch(() => {});
      }
    }, 4000);
  }

  private startMicrophoneStreaming() {
    if (!this.micStream || !this.session) return;

    try {
      this.captureCtx = new AudioContext({ sampleRate: 16000 });
    } catch {
      this.captureCtx = new AudioContext();
    }
    if (this.captureCtx.state === "suspended") {
      this.captureCtx.resume().catch(() => {});
    }

    const actualRate = this.captureCtx.sampleRate || 16000;
    const source = this.captureCtx.createMediaStreamSource(this.micStream);
    this.scriptProcessor = this.captureCtx.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (event) => {
      if (this.closed || this.isPaused || !this.session) return;

      const rawInput = event.inputBuffer.getChannelData(0);
      const inputData = downsampleTo16kHz(rawInput, actualRate);
      const now = Date.now();

      // Protección anti-eco reforzada (laptops y altavoces móviles):
      // Mientras Nexia IA habla (+ margen completo de latencia de hardware y reverberación de sala),
      // enviamos silencio digital puro (ceros) para mantener estable el piso de ruido del VAD del servidor
      // sin que jamás escuche su propia voz de regreso.
      if (this.isMuted || this.activeSources.size > 0 || now < this.echoGuardUntilMs) {
        this.callbacks.onAudioLevel(this.activeSources.size > 0 ? 0.08 : 0);
        const silenceBase64 = floatTo16BitPCMBase64(new Float32Array(inputData.length));
        try {
          this.session.sendRealtimeInput({
            audio: {
              data: silenceBase64,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch {}
        return;
      }

      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rawRms = Math.sqrt(sum / inputData.length);
      const uiLevel = Math.min(1, rawRms * 6);
      this.callbacks.onAudioLevel(uiLevel);

      // Compuerta de ruido suave (Noise Gate con 750ms de cola natural):
      // Evita que el zumbido del ventilador, aire acondicionado o ruido de escritorio haga que Gemini
      // alucine palabras cuando el cliente está callado pensando.
      if (rawRms >= 0.01) {
        this.speechGateOpenUntilMs = now + 750;
      }

      const pcmToSend =
        now <= this.speechGateOpenUntilMs ? inputData : new Float32Array(inputData.length);
      const base64Audio = floatTo16BitPCMBase64(pcmToSend);

      try {
        this.session.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch (e) {
        console.warn("Error enviando chunk de audio:", e);
      }
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.captureCtx.destination);
  }

  private handleServerMessage(msg: LiveServerMessage) {
    if (this.closed) return;

    try {
      // Guardar handle de reanudación continua provisto por Gemini Live
      const newHandle = (msg as any).sessionResumptionUpdate?.newHandle;
      if (typeof newHandle === "string" && newHandle.trim()) {
        this.resumptionHandle = newHandle;
      }

      // Rotación preventiva transparente cuando Gemini avisa GoAway (~60s antes de expirar socket)
      if ((msg as any).goAway) {
        this.pendingGoAwayRotation = true;
        if (!this.isPaused && this.activeSources.size === 0 && !this.spokeInCurrentModelTurn) {
          this.rotateSocketSmoothly();
          return;
        }
      }

      // 1. Si hubo interrupción mientras no estaba pausado
      if (msg.serverContent?.interrupted) {
        this.stopPlaybackQueue();
        if (!this.isPaused) {
          this.callbacks.onStatusChange("connected");
        }
      }

      // 2. Transcripciones en tiempo real
      const inTx = msg.serverContent?.inputTranscription?.text;
      if (inTx && inTx.trim()) {
        this.spokeInCurrentModelTurn = false;
        this.callbacks.onTranscriptUpdate("user", inTx);
      }
      const outTx = msg.serverContent?.outputTranscription?.text;
      if (outTx && outTx.trim()) {
        this.callbacks.onTranscriptUpdate("agent", outTx);
      }

      // 3. Reproducción fluida de chunks de audio PCM 24kHz (omitir si el usuario puso Pausa)
      if (!this.isPaused) {
        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) {
            this.enqueueAudioChunk(part.inlineData.data);
          }
        }
      }

      if (msg.serverContent?.turnComplete) {
        this.spokeInCurrentModelTurn = false;
        if (!this.isPaused && this.activeSources.size === 0) {
          this.callbacks.onStatusChange("connected");
          if (this.pendingGoAwayRotation && this.pendingFinishSummary === null) {
            this.rotateSocketSmoothly();
            return;
          }
        }
        if (this.pendingFinishSummary !== null) {
          this.postFinishTurnCompleted = true;
          if (this.activeSources.size === 0) {
            this.scheduleGracefulFinish(900);
          }
        }
      }

      // 4. Ejecución flexible y segura de Tool Calls en vivo (Autollenado + Navegación Libre + Brújula)
      if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0) {
        const allowedStrings = new Set<string>(ALLOWED_STRING_RFI_FIELDS as string[]);

        const responses = msg.toolCall.functionCalls.map((fc) => {
          const args = (fc.args && typeof fc.args === "object" ? fc.args : {}) as Record<string, any>;

          if (fc.name === "updateRfiFields") {
            const {
              markSectionPending,
              noAdditionalComments,
              focusSection,
              appendMode,
              ...fieldUpdates
            } = args;

            const cleaned: Partial<AiBriefingAnswers> = {};
            const useAppend = Boolean(appendMode);

            for (const [key, val] of Object.entries(fieldUpdates)) {
              if (val === undefined || val === null || val === "") continue;

              if (key === "targetUsers" || key === "channels") {
                const incomingArr = toStringArray(val);
                if (incomingArr.length > 0) {
                  const prevArr = toStringArray((this.latestAnswers as any)[key]);
                  (cleaned as any)[key] = useAppend
                    ? Array.from(new Set([...prevArr, ...incomingArr]))
                    : incomingArr;
                }
              } else if (allowedStrings.has(key)) {
                const incomingText = safeStr(val).trim();
                if (!incomingText) continue;

                const prevText = safeStr((this.latestAnswers as any)[key]).trim();
                if (
                  (useAppend || key === "additionalComments") &&
                  prevText &&
                  !incomingText.toLowerCase().includes(prevText.toLowerCase()) &&
                  !prevText.toLowerCase().includes(incomingText.toLowerCase())
                ) {
                  (cleaned as any)[key] =
                    key === "additionalComments"
                      ? `${prevText}\n• ${incomingText}`
                      : `${prevText}. ${incomingText}`;
                } else {
                  (cleaned as any)[key] = incomingText;
                }
              }
            }

            if (
              noAdditionalComments === true ||
              (typeof cleaned.additionalComments === "string" &&
                cleaned.additionalComments.trim().length > 0)
            ) {
              cleaned.observationsConfirmed = true;
            }

            const requestedFocus =
              typeof focusSection === "number" && Number.isFinite(focusSection)
                ? clampSection(focusSection)
                : undefined;

            if (requestedFocus) {
              cleaned.lastActiveSection = requestedFocus;
            }

            const candidateAnswers = sanitizeLegacyAnswers({
              ...this.latestAnswers,
              ...cleaned,
            });

            let validPendingSec: number | undefined = undefined;
            if (
              typeof markSectionPending === "number" &&
              markSectionPending >= 1 &&
              markSectionPending <= 9 &&
              !isSectionFilled(candidateAnswers, markSectionPending) &&
              !isSectionPartial(candidateAnswers, markSectionPending)
            ) {
              validPendingSec = clampSection(markSectionPending);
              candidateAnswers.pendingSections = Array.from(
                new Set([...(candidateAnswers.pendingSections || []), validPendingSec])
              );
            }

            this.latestAnswers = candidateAnswers;
            this.callbacks.onFieldsUpdated(cleaned, validPendingSec);

            const guidance = getNextQuestionGuidance(this.latestAnswers);
            const focusedSecMeta = requestedFocus
              ? AI_RFI_SECTIONS[requestedFocus - 1]
              : undefined;
            const focusedSnapshot = focusedSecMeta
              ? Object.fromEntries(
                  focusedSecMeta.fields.map((f) => [f, (this.latestAnswers as any)[f]])
                )
              : undefined;

            return {
              id: fc.id,
              name: fc.name,
              response: {
                status: "saved",
                focusedStageOnScreen: requestedFocus || guidance.stage,
                ...(focusedSnapshot ? { currentDataInFocusedStage: focusedSnapshot } : {}),
                suggestedNextStage: guidance.stage,
                suggestedStageTitle: guidance.stageTitle,
                suggestedNextQuestion: guidance.nextQuestion,
                guidanceNote: this.spokeInCurrentModelTurn
                  ? "Datos guardados. Si ya hablaste en este turno, NO generes otro turno de voz seguido; espera en silencio al cliente."
                  : requestedFocus
                  ? `Pantalla en Etapa ${requestedFocus} (${focusedSecMeta?.shortTitle || ""}). Atiende de forma breve y natural (máx. 2 frases) lo que el cliente desea profundizar o ajustar aquí; cuando esté listo para seguir, retoma Etapa ${guidance.stage}: "${guidance.nextQuestion}".`
                  : guidance.stage10ReadyToClose
                  ? guidance.nextQuestion
                  : `Datos guardados. CERO ROLLO: si fue una respuesta normal, di SOLO 2 o 3 palabras de acuse + la pregunta de Etapa ${guidance.stage}: "${guidance.nextQuestion}" (máx. 18 palabras en total, sin repetir lo dicho por el cliente). Solo si el cliente hizo una pregunta abierta o pidió regresar, responde en máx. 2 frases breves. Espera en silencio.`,
              },
            };
          }

          if (fc.name === "finishVoiceInterview") {
            const stage10Answered =
              Boolean(this.latestAnswers.observationsConfirmed) ||
              Boolean(
                this.latestAnswers.additionalComments &&
                  this.latestAnswers.additionalComments.trim().length > 0
              );

            if (!stage10Answered) {
              this.latestAnswers = {
                ...this.latestAnswers,
                lastActiveSection: 10,
              };
              this.callbacks.onFieldsUpdated({ lastActiveSection: 10 });
              return {
                id: fc.id,
                name: fc.name,
                response: {
                  status: "wait_stage_10_observations_pending",
                  instruction:
                    "Aún NO cierres la llamada. Pregunta primero al cliente en la Etapa 10 si desea dejar alguna observación o complementar algún punto anterior, espera su respuesta, regístrala con updateRfiFields y solo después despídete e invoca finishVoiceInterview.",
                },
              };
            }

            this.pendingFinishSummary = safeStr(args.summaryMessage || "completed");
            this.postFinishTurnCompleted = false;
            this.finishRequestedAtMs = Date.now();
            this.startFinishDrainMonitor();

            return {
              id: fc.id,
              name: fc.name,
              response: {
                status: "interview_completed",
                instruction:
                  "Despídete brevemente si aún no lo hiciste e invita al cliente a revisar el resumen de sus respuestas en pantalla.",
              },
            };
          }

          return {
            id: fc.id,
            name: fc.name,
            response: { status: "ok" },
          };
        });

        try {
          this.session?.sendToolResponse({ functionResponses: responses });
        } catch (e) {
          console.warn("Error enviando respuesta de toolCall:", e);
        }
      }
    } catch (err) {
      console.error("Error controlado procesando mensaje de Gemini Live:", err);
    }
  }

  private scheduleGracefulFinish(delayMs: number) {
    if (this.finishTimer) window.clearTimeout(this.finishTimer);
    this.finishTimer = window.setTimeout(() => {
      if (this.closed || this.pendingFinishSummary === null) return;
      // Nunca cortar a Nexia IA si sigue reproduciendo audio en altavoz
      if (this.activeSources.size > 0) {
        this.scheduleGracefulFinish(700);
        return;
      }
      const summary = this.pendingFinishSummary;
      this.pendingFinishSummary = null;
      this.callbacks.onInterviewFinished(summary);
    }, delayMs);
  }

  private startFinishDrainMonitor() {
    if (this.finishTimer) window.clearTimeout(this.finishTimer);
    const checkDrain = () => {
      if (this.closed || this.pendingFinishSummary === null) return;
      const now = Date.now();
      const elapsedSinceFinish = now - this.finishRequestedAtMs;
      const quietMs = this.lastAudioActivityAtMs > 0 ? now - this.lastAudioActivityAtMs : elapsedSinceFinish;

      if (this.activeSources.size === 0) {
        if (this.postFinishTurnCompleted && quietMs >= 800) {
          const summary = this.pendingFinishSummary;
          this.pendingFinishSummary = null;
          this.callbacks.onInterviewFinished(summary);
          return;
        }
        if (elapsedSinceFinish >= 4000 && quietMs >= 2200) {
          const summary = this.pendingFinishSummary;
          this.pendingFinishSummary = null;
          this.callbacks.onInterviewFinished(summary);
          return;
        }
      }
      this.finishTimer = window.setTimeout(checkDrain, 500);
    };
    this.finishTimer = window.setTimeout(checkDrain, 1000);
  }

  private enqueueAudioChunk(base64Data: string) {
    if (!this.playbackCtx || this.isPaused) return;
    if (this.playbackCtx.state === "suspended") {
      this.playbackCtx.resume().catch(() => {});
    }

    const float32 = base64ToFloat32PCM(base64Data);
    const audioBuffer = this.playbackCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.playbackCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playbackCtx.destination);

    const hwLatencyMs = Math.round(
      (((this.playbackCtx as any).outputLatency || 0.12) +
        ((this.playbackCtx as any).baseLatency || 0.05)) *
        1000
    );
    const tailGuardMs = hwLatencyMs + 780;

    const startTime = Math.max(this.playbackCtx.currentTime, this.nextPlaybackTime);
    source.start(startTime);
    this.nextPlaybackTime = startTime + audioBuffer.duration;
    this.echoGuardUntilMs =
      Date.now() + Math.ceil((this.nextPlaybackTime - this.playbackCtx.currentTime) * 1000) + tailGuardMs;

    this.spokeInCurrentModelTurn = true;
    this.activeSources.add(source);
    this.lastAudioActivityAtMs = Date.now();
    this.callbacks.onStatusChange("speaking");

    source.onended = () => {
      this.activeSources.delete(source);
      this.lastAudioActivityAtMs = Date.now();
      this.echoGuardUntilMs = Date.now() + tailGuardMs;
      if (this.activeSources.size === 0 && !this.closed) {
        if (this.pendingFinishSummary !== null && this.postFinishTurnCompleted) {
          this.scheduleGracefulFinish(900);
        } else if (!this.isPaused) {
          this.callbacks.onStatusChange("connected");
          if (this.pendingGoAwayRotation && !this.spokeInCurrentModelTurn && this.pendingFinishSummary === null) {
            this.rotateSocketSmoothly();
          }
        }
      }
    };
  }

  private stopPlaybackQueue() {
    this.activeSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    this.activeSources.clear();
    this.echoGuardUntilMs = 0;
    if (this.playbackCtx) {
      this.nextPlaybackTime = this.playbackCtx.currentTime;
    }
  }

  private cleanupAudio() {
    if (this.keepAliveTimer) {
      window.clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.finishTimer) {
      window.clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    this.stopPlaybackQueue();
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch {}
      this.scriptProcessor = null;
    }
    if (this.captureCtx) {
      this.captureCtx.close().catch(() => {});
      this.captureCtx = null;
    }
    if (this.playbackCtx) {
      this.playbackCtx.close().catch(() => {});
      this.playbackCtx = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.callbacks.onAudioLevel(0);
  }

  public stop() {
    this.closed = true;
    this.pendingFinishSummary = null;
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.cleanupAudio();
    this.callbacks.onStatusChange("ended");
  }
}
