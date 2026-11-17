import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import {
  AI_RFI_SECTIONS,
  AiBriefingAnswers,
  INITIAL_AI_BRIEFING_ANSWERS,
  buildVoiceConsultantSystemPrompt,
  finishVoiceInterviewTool,
  isSectionFilled,
  resolveResumeSection,
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
  private isMuted = false;
  private isPaused = false;
  private closed = false;
  private latestAnswers: AiBriefingAnswers = { ...INITIAL_AI_BRIEFING_ANSWERS };
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
    this.latestAnswers = { ...currentAnswers };
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
      const { token, model } = tokenData;

      this.callbacks.onStatusChange("connecting");
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
          systemInstruction: buildVoiceConsultantSystemPrompt(currentAnswers),
          tools: [{ functionDeclarations: [updateRfiFieldsTool, finishVoiceInterviewTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            // La sesión queda lista al resolver ai.live.connect
          },
          onmessage: (msg: LiveServerMessage) => {
            this.handleServerMessage(msg);
          },
          onerror: (err: any) => {
            console.error("Error en Gemini Live:", err);
            if (!this.closed) {
              this.callbacks.onStatusChange(
                "error",
                "La conexión de voz tuvo una interrupción de red. Tus avances están guardados; toca Reanudar Voz para seguir justo donde te quedaste."
              );
            }
          },
          onclose: (ev: any) => {
            if (!this.closed) {
              if (this.pendingFinishSummary !== null) {
                const msgSummary = this.pendingFinishSummary;
                this.pendingFinishSummary = null;
                this.callbacks.onInterviewFinished(msgSummary);
              } else {
                console.warn("WebSocket Gemini Live cerrado:", ev?.code, ev?.reason);
                this.callbacks.onStatusChange(
                  "error",
                  "La llamada de voz se pausó por inactividad o cambio de señal. Tu avance está guardado; toca Reanudar para continuar en la misma etapa."
                );
              }
            }
            this.cleanupAudio();
          },
        },
      });

      if (this.closed) {
        session.close();
        return;
      }

      this.session = session;
      this.callbacks.onStatusChange("connected");

      // Detonar saludo breve y la pregunta exacta de la etapa correspondiente antes de abrir el micrófono
      try {
        const resumeStage = resolveResumeSection(currentAnswers);
        const stageMeta = AI_RFI_SECTIONS[resumeStage - 1] || AI_RFI_SECTIONS[0];
        const hasProgress =
          resumeStage > 1 ||
          AI_RFI_SECTIONS.some((sec) => isSectionFilled(currentAnswers, sec.number));
        const who = currentAnswers.contactName
          ? `${currentAnswers.contactName}${currentAnswers.companyName ? ` de ${currentAnswers.companyName}` : ""}`
          : "";

        const guestIntro =
          resumeStage === 10
            ? `Hola${who ? `, soy ${who}` : ""}. Ya completamos las etapas 1 a la 9 y nos quedamos en la Etapa 10 (Observaciones finales). Preséntate brevemente como Nexia IA y pregúntame directamente si deseo dejar alguna observación o comentario adicional antes de pasar a revisar mi resumen.`
            : hasProgress
            ? `Hola${who ? `, soy ${who}` : ""}. Regreso para retomar mi briefing exactamente en la Etapa ${resumeStage} (${stageMeta.shortTitle}). Preséntate muy brevemente como Nexia IA confirmando que retomamos en la Etapa ${resumeStage} y hazme únicamente la siguiente pregunta pendiente de esta etapa (sin repetir las etapas anteriores).`
            : who
            ? `Hola, soy ${who}. Iniciemos la Etapa 1 del briefing. Preséntate diciendo "Hola, soy Nexia IA, la inteligencia artificial de Interpres Digital" y hazme únicamente la primera pregunta.`
            : `Hola, iniciemos la Etapa 1 del briefing. Preséntate diciendo "Hola, soy Nexia IA, la inteligencia artificial de Interpres Digital" y hazme únicamente la primera pregunta.`;

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

      // Iniciar captura de micrófono con protección anti-eco de altavoz móvil
      this.startMicrophoneStreaming();
    } catch (error: any) {
      this.cleanupAudio();
      const friendly =
        error?.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Actívalo en tu navegador o continúa en modo manual."
          : error?.message || "No fue posible iniciar la entrevista por voz.";
      this.callbacks.onStatusChange("error", friendly);
    }
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
      if (this.closed || this.isMuted || this.isPaused || !this.session) return;

      // Protección anti-eco en celulares (altavoz -> micrófono):
      // Mientras el Consultor IA está hablando (+ 320ms de cola acústica), no reenviar el eco del altavoz
      // para evitar que la IA se auto-interrumpa a mitad de frase. El usuario siempre puede tocar "Pausar IA".
      if (this.activeSources.size > 0 || Date.now() < this.echoGuardUntilMs) {
        this.callbacks.onAudioLevel(0.08);
        return;
      }

      const rawInput = event.inputBuffer.getChannelData(0);
      const inputData = downsampleTo16kHz(rawInput, actualRate);

      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.min(1, Math.sqrt(sum / inputData.length) * 6);
      this.callbacks.onAudioLevel(rms);

      const base64Audio = floatTo16BitPCMBase64(inputData);
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
      if (!this.isPaused && this.activeSources.size === 0) {
        this.callbacks.onStatusChange("connected");
      }
      if (this.pendingFinishSummary !== null) {
        this.postFinishTurnCompleted = true;
        if (this.activeSources.size === 0) {
          this.scheduleGracefulFinish(900);
        }
      }
    }

    // 4. Ejecución de Tool Calls en vivo (Autollenado visual del RFI)
    if (msg.toolCall?.functionCalls && msg.toolCall.functionCalls.length > 0) {
      const responses = msg.toolCall.functionCalls.map((fc) => {
        const args = (fc.args || {}) as Record<string, any>;

        if (fc.name === "updateRfiFields") {
          const { markSectionPending, noAdditionalComments, ...fieldUpdates } = args;
          const cleaned: Partial<AiBriefingAnswers> = {};

          for (const [key, val] of Object.entries(fieldUpdates)) {
            if (val !== undefined && val !== null && val !== "") {
              (cleaned as any)[key] = val;
            }
          }

          if (
            noAdditionalComments === true ||
            (typeof cleaned.additionalComments === "string" &&
              cleaned.additionalComments.trim().length > 0)
          ) {
            cleaned.observationsConfirmed = true;
          }

          // Combinar en la memoria viva de la sesión
          const mergedComments =
            typeof cleaned.additionalComments === "string" &&
            cleaned.additionalComments.trim() &&
            this.latestAnswers.additionalComments?.trim() &&
            !cleaned.additionalComments.includes(this.latestAnswers.additionalComments.trim())
              ? `${this.latestAnswers.additionalComments.trim()}\n• ${cleaned.additionalComments.trim()}`
              : cleaned.additionalComments;

          this.latestAnswers = {
            ...this.latestAnswers,
            ...cleaned,
            ...(mergedComments !== undefined ? { additionalComments: mergedComments } : {}),
          };

          this.callbacks.onFieldsUpdated(
            cleaned,
            typeof markSectionPending === "number" ? markSectionPending : undefined
          );

          return {
            id: fc.id,
            name: fc.name,
            response: { status: "updated_on_screen" },
          };
        }

        if (fc.name === "finishVoiceInterview") {
          const stage10Answered =
            Boolean(this.latestAnswers.observationsConfirmed) ||
            Boolean(this.latestAnswers.additionalComments && this.latestAnswers.additionalComments.trim().length > 0);

          // Candado de seguridad: jamás permitir que se corte la entrevista sin haber preguntado y confirmado Etapa 10
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
                  "Aún NO cierres la llamada. Pregunta primero al cliente en la Etapa 10 si desea dejar alguna observación o comentario adicional, espera su respuesta, regístrala con updateRfiFields (usando additionalComments o noAdditionalComments=true) y solo después despídete e invoca finishVoiceInterview.",
              },
            };
          }

          this.pendingFinishSummary = String(args.summaryMessage || "completed");
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

    const startTime = Math.max(this.playbackCtx.currentTime, this.nextPlaybackTime);
    source.start(startTime);
    this.nextPlaybackTime = startTime + audioBuffer.duration;
    this.echoGuardUntilMs = Date.now() + Math.ceil((this.nextPlaybackTime - this.playbackCtx.currentTime) * 1000) + 320;

    this.activeSources.add(source);
    this.lastAudioActivityAtMs = Date.now();
    this.callbacks.onStatusChange("speaking");

    source.onended = () => {
      this.activeSources.delete(source);
      this.lastAudioActivityAtMs = Date.now();
      this.echoGuardUntilMs = Date.now() + 320;
      if (this.activeSources.size === 0 && !this.closed) {
        if (this.pendingFinishSummary !== null && this.postFinishTurnCompleted) {
          this.scheduleGracefulFinish(900);
        } else if (!this.isPaused) {
          this.callbacks.onStatusChange("connected");
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
