import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { db, storage } from "../services/firebase";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  Upload,
  Trash2,
  Share2,
  Copy,
  ArrowRight,
  ArrowLeft,
  PhoneOff,
  PenTool,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Building2,
  User,
  Mail,
  Phone,
  Lock,
  X,
  ExternalLink,
  Check,
  Pause,
  Play,
} from "lucide-react";
import clsx from "clsx";
import {
  AI_RFI_SECTIONS,
  AUTONOMY_OPTIONS,
  AiBriefingAnswers,
  AiBriefingAttachment,
  BUDGET_RANGE_OPTIONS,
  CHANNEL_OPTIONS,
  INITIAL_AI_BRIEFING_ANSWERS,
  TARGET_USER_OPTIONS,
  clampSection,
  getFirstIncompleteSection,
  hasAnySectionProgress,
  isSectionFilled,
  isSectionPartial,
  resolveResumeSection,
  safeStr,
  sanitizeLegacyAnswers,
  toAttachmentArray,
  toNumberArray,
  toStringArray,
} from "../utils/aiBriefingTypes";
import {
  AiVoiceBriefingSession,
  VoiceSessionStatus,
} from "../services/aiVoiceBriefingService";
import { sendTelegramAiBriefingNotification } from "../services/telegramService";
import { getAppBaseUrl } from "../utils/urlUtils";

const LOGO_URL =
  "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/3.png";

const PublicAiBriefing: React.FC = () => {
  const { clientId } = useParams<{ clientId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftParam = searchParams.get("draft");

  const [loadingInit, setLoadingInit] = useState(true);
  const [briefingId, setBriefingId] = useState<string | null>(draftParam);
  const [answers, setAnswers] = useState<AiBriefingAnswers>(INITIAL_AI_BRIEFING_ANSWERS);
  const [step, setStep] = useState<"welcome" | "workspace" | "submitted">("welcome");
  const [activeMode, setActiveMode] = useState<"voice" | "manual">("voice");
  const [usedVoiceOnce, setUsedVoiceOnce] = useState(false);
  const [usedManualOnce, setUsedManualOnce] = useState(false);
  const [activeSection, setActiveSection] = useState<number>(1);

  // Saving & Share state
  const [savingDraft, setSavingDraft] = useState(false);
  const [copiedDraftLink, setCopiedDraftLink] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submittingFinal, setSubmittingFinal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [voiceCompletedBanner, setVoiceCompletedBanner] = useState(false);

  // Voice Session State
  const voiceRef = useRef<AiVoiceBriefingSession | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptLog, setTranscriptLog] = useState<
    Array<{ role: "user" | "agent"; text: string }>
  >([]);
  const [recentlyUpdatedSection, setRecentlyUpdatedSection] = useState<number | null>(null);

  // Telemetría interna de duración de voz (exclusiva para el Panel Administrativo)
  const briefingIdRef = useRef<string | null>(draftParam);
  const answersRef = useRef<AiBriefingAnswers>(INITIAL_AI_BRIEFING_ANSWERS);
  const activeSectionRef = useRef<number>(1);
  const wakeLockRef = useRef<any>(null);
  const manualDebounceRef = useRef<number | null>(null);
  const accumulatedVoiceSecondsRef = useRef<number>(0);
  const activeCallStartMsRef = useRef<number | null>(null);
  const flushedInCurrentCallRef = useRef<number>(0);
  const lastVoiceSessionAtRef = useRef<string>("");
  const hasSentTelegramRef = useRef<boolean>(false);

  useEffect(() => {
    briefingIdRef.current = briefingId;
  }, [briefingId]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  // Posicionar siempre en la parte superior al entrar al workspace o activar el micrófono de Voz IA
  useEffect(() => {
    if (step === "workspace") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step, activeMode]);

  const saveLocalSnapshot = useCallback((id: string | null, nextAnswers: AiBriefingAnswers) => {
    if (!id) return;
    try {
      localStorage.setItem(
        `interpres_ai_rfi_snapshot_${id}`,
        JSON.stringify({ updatedAtMs: Date.now(), answers: nextAnswers })
      );
    } catch {
      // ignore quota errors
    }
  }, []);

  const clearLocalSnapshot = useCallback((id: string | null) => {
    if (!id) return;
    try {
      localStorage.removeItem(`interpres_ai_rfi_snapshot_${id}`);
    } catch {}
  }, []);

  // Screen Wake Lock: evita que el protector de pantalla o bloqueo automático interrumpa la entrevista de voz
  useEffect(() => {
    const shouldKeepAwake =
      step === "workspace" &&
      activeMode === "voice" &&
      (voiceStatus === "connected" ||
        voiceStatus === "speaking" ||
        voiceStatus === "connecting" ||
        voiceStatus === "requesting_token");

    let cancelled = false;

    const acquireWakeLock = async () => {
      if (!shouldKeepAwake || cancelled) return;
      try {
        const wl = (navigator as any).wakeLock;
        if (wl && typeof wl.request === "function" && !wakeLockRef.current) {
          wakeLockRef.current = await wl.request("screen");
          wakeLockRef.current?.addEventListener?.("release", () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        // Ignorar silenciosamente si el navegador no soporta Wake Lock
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {}
        wakeLockRef.current = null;
      }
    };

    if (shouldKeepAwake) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }

    const onVisChange = () => {
      if (document.visibilityState === "visible" && shouldKeepAwake) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisChange);
      releaseWakeLock();
    };
  }, [step, activeMode, voiceStatus]);

  const captureElapsedVoiceSeconds = useCallback((endCall = false): number => {
    if (activeCallStartMsRef.current !== null) {
      const elapsedSec = Math.max(
        0,
        Math.round((Date.now() - activeCallStartMsRef.current) / 1000)
      );
      const delta = elapsedSec - flushedInCurrentCallRef.current;
      if (delta > 0) {
        accumulatedVoiceSecondsRef.current += delta;
        flushedInCurrentCallRef.current = elapsedSec;
      }
      if (endCall) {
        activeCallStartMsRef.current = null;
        flushedInCurrentCallRef.current = 0;
      }
    }
    return accumulatedVoiceSecondsRef.current;
  }, []);

  const syncVoiceTelemetryToFirestore = useCallback(
    async (targetId: string | null, endCall = false) => {
      const totalSecs = captureElapsedVoiceSeconds(endCall);
      if (!targetId || totalSecs <= 0) return;
      try {
        const updateData: Record<string, any> = {
          voiceDurationSeconds: totalSecs,
          updatedAt: serverTimestamp(),
        };
        if (lastVoiceSessionAtRef.current) {
          updateData.lastVoiceSessionAt = lastVoiceSessionAtRef.current;
        }
        await setDoc(doc(db, "briefings", targetId), updateData, { merge: true });
      } catch (err) {
        console.warn("Error sincronizando duración de voz:", err);
      }
    },
    [captureElapsedVoiceSeconds]
  );

  // Autoguardado periódico y respaldo inmediato si se oculta la pestaña o entra el protector de pantalla
  useEffect(() => {
    const handlePageHidden = () => {
      if (document.visibilityState === "hidden" && briefingIdRef.current) {
        const snapshotAns: AiBriefingAnswers = {
          ...answersRef.current,
          lastActiveSection: activeSectionRef.current,
        };
        saveLocalSnapshot(briefingIdRef.current, snapshotAns);
        syncVoiceTelemetryToFirestore(briefingIdRef.current, false);
        setDoc(
          doc(db, "briefings", briefingIdRef.current),
          {
            answers: snapshotAns,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handlePageHidden);
    window.addEventListener("pagehide", handlePageHidden);

    let timer: number | undefined;
    if (voiceStatus === "connected" || voiceStatus === "speaking") {
      timer = window.setInterval(() => {
        if (briefingIdRef.current) {
          syncVoiceTelemetryToFirestore(briefingIdRef.current, false);
        }
      }, 8000);
    }

    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handlePageHidden);
      window.removeEventListener("pagehide", handlePageHidden);
    };
  }, [voiceStatus, saveLocalSnapshot, syncVoiceTelemetryToFirestore]);

  const storageDraftKey = `interpres_ai_rfi_draft_${clientId || "general"}`;
  const initializedRef = useRef(false);

  // Detener voz y guardar duración acumulada únicamente cuando se desmonte la página por completo
  useEffect(() => {
    return () => {
      if (briefingIdRef.current && activeCallStartMsRef.current !== null) {
        syncVoiceTelemetryToFirestore(briefingIdRef.current, true);
      }
      voiceRef.current?.stop();
    };
  }, [syncVoiceTelemetryToFirestore]);

  // Load existing draft (URL ?draft=, Firestore por clientId, o memoria local del navegador)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const applyLoadedDraft = (id: string, data: Record<string, any>) => {
      setBriefingId(id);
      briefingIdRef.current = id;
      setSearchParams({ draft: id }, { replace: true });
      accumulatedVoiceSecondsRef.current = Number(data.voiceDurationSeconds) || 0;
      lastVoiceSessionAtRef.current =
        typeof data.lastVoiceSessionAt === "string" ? data.lastVoiceSessionAt : "";
      if (data.completionMode === "voice" || data.completionMode === "hybrid") {
        setUsedVoiceOnce(true);
      }
      if (data.completionMode === "manual" || data.completionMode === "hybrid") {
        setUsedManualOnce(true);
      }
      if (data.answers) {
        let cleaned = sanitizeLegacyAnswers(data.answers);

        // Si el navegador guardó un snapshot local más reciente antes de entrar en suspensión, recuperarlo
        try {
          const rawSnap = localStorage.getItem(`interpres_ai_rfi_snapshot_${id}`);
          if (rawSnap) {
            const parsedSnap = JSON.parse(rawSnap);
            const firestoreMs = (data.updatedAt?.seconds || data.createdAt?.seconds || 0) * 1000;
            if (parsedSnap?.answers && Number(parsedSnap.updatedAtMs || 0) > firestoreMs) {
              cleaned = sanitizeLegacyAnswers({
                ...cleaned,
                ...parsedSnap.answers,
              });
              setDoc(
                doc(db, "briefings", id),
                { answers: cleaned, updatedAt: serverTimestamp() },
                { merge: true }
              ).catch(() => {});
            }
          }
        } catch {}

        const resumeSec =
          data.completionMode === "manual" && typeof data.answers?.lastActiveSection === "number"
            ? clampSection(data.answers.lastActiveSection, getFirstIncompleteSection(cleaned))
            : resolveResumeSection(cleaned);
        const syncedAnswers: AiBriefingAnswers = {
          ...cleaned,
          lastActiveSection: resumeSec,
        };
        setAnswers(syncedAnswers);
        answersRef.current = syncedAnswers;
        setActiveSection(resumeSec);
        activeSectionRef.current = resumeSec;

        if (
          cleaned.operatingHours !== (data.answers.operatingHours || "") ||
          cleaned.operatingLanguages !== (data.answers.operatingLanguages || "") ||
          !Array.isArray(data.answers.targetUsers) ||
          !Array.isArray(data.answers.channels)
        ) {
          setDoc(doc(db, "briefings", id), { answers: syncedAnswers }, { merge: true }).catch(() => {});
        }
      }
      if (data.status === "completed") {
        hasSentTelegramRef.current = true;
        localStorage.removeItem(storageDraftKey);
        clearLocalSnapshot(id);
        setStep("submitted");
      } else {
        localStorage.setItem(storageDraftKey, id);
        setStep("workspace");
        setActiveMode(data.completionMode === "voice" ? "voice" : "manual");
      }
    };

    const init = async () => {
      try {
        // 1. Si el enlace ya trae ?draft=<id> explícito
        if (draftParam) {
          const snap = await getDoc(doc(db, "briefings", draftParam));
          if (snap.exists()) {
            applyLoadedDraft(snap.id, snap.data());
            setLoadingInit(false);
            return;
          }
        }

        // 2. Si es enlace personalizado por cliente (/briefing/ia/:clientId), buscar borrador activo en Firestore
        if (clientId) {
          const qClient = query(
            collection(db, "briefings"),
            where("clientId", "==", clientId)
          );
          const qSnap = await getDocs(qClient);
          const clientDrafts: Array<{ id: string; data: any }> = [];
          qSnap.forEach((d) => {
            const dData = d.data();
            if (dData.briefingType === "ai-agent" && dData.status === "draft") {
              clientDrafts.push({ id: d.id, data: dData });
            }
          });
          if (clientDrafts.length > 0) {
            clientDrafts.sort((a, b) => {
              const tA = a.data.updatedAt?.seconds || a.data.createdAt?.seconds || 0;
              const tB = b.data.updatedAt?.seconds || b.data.createdAt?.seconds || 0;
              return tB - tA;
            });
            applyLoadedDraft(clientDrafts[0].id, clientDrafts[0].data);
            setLoadingInit(false);
            return;
          }
        }

        // 3. Revisar memoria local del navegador (cuando el usuario vuelve a abrir /#/briefing/ia)
        const rememberedId = localStorage.getItem(storageDraftKey);
        if (rememberedId) {
          const remSnap = await getDoc(doc(db, "briefings", rememberedId));
          if (remSnap.exists() && remSnap.data()?.status === "draft") {
            applyLoadedDraft(remSnap.id, remSnap.data());
            setLoadingInit(false);
            return;
          } else {
            localStorage.removeItem(storageDraftKey);
          }
        }

        // 4. Si no hay borrador previo y viene clientId, precargar datos de contacto del cliente
        if (clientId) {
          const clientSnap = await getDoc(doc(db, "clients", clientId));
          if (clientSnap.exists()) {
            const c = clientSnap.data();
            setAnswers((prev) => ({
              ...prev,
              companyName: c.companyName || prev.companyName,
              contactName: c.name || prev.contactName,
              contactEmail: c.email || prev.contactEmail,
              contactPhone: c.phone || prev.contactPhone,
            }));
          }
        }
      } catch (err) {
        console.warn("Error inicializando briefing IA:", err);
      } finally {
        setLoadingInit(false);
      }
    };
    init();
  }, [clientId, draftParam, setSearchParams, storageDraftKey]);

  // Persist draft helper
  const persistDraft = useCallback(
    async (
      nextAnswers: AiBriefingAnswers,
      currentId: string | null,
      statusOverride: "draft" | "completed" = "draft",
      modeOverride?: "voice" | "manual" | "hybrid"
    ): Promise<string> => {
      setSavingDraft(true);
      try {
        const computedMode =
          modeOverride ||
          (usedVoiceOnce && usedManualOnce
            ? "hybrid"
            : usedVoiceOnce
            ? "voice"
            : "manual");

        const currentVoiceSecs = captureElapsedVoiceSeconds(false);

        const payload: Record<string, any> = {
          briefingType: "ai-agent",
          status: statusOverride,
          completionMode: computedMode,
          clientId: clientId || "",
          companyName: nextAnswers.companyName.trim(),
          clientName: nextAnswers.contactName.trim(),
          email: nextAnswers.contactEmail.trim(),
          whatsapp: nextAnswers.contactPhone.trim(),
          voiceDurationSeconds: currentVoiceSecs,
          answers: nextAnswers,
          updatedAt: serverTimestamp(),
        };

        if (lastVoiceSessionAtRef.current) {
          payload.lastVoiceSessionAt = lastVoiceSessionAtRef.current;
        }

        if (statusOverride === "completed") {
          payload.completedAt = serverTimestamp();
        }

        if (currentId) {
          saveLocalSnapshot(currentId, nextAnswers);
          await setDoc(doc(db, "briefings", currentId), payload, { merge: true });
          if (statusOverride === "completed") {
            localStorage.removeItem(storageDraftKey);
            clearLocalSnapshot(currentId);
          } else {
            localStorage.setItem(storageDraftKey, currentId);
          }
          return currentId;
        } else {
          payload.createdAt = serverTimestamp();
          const created = await addDoc(collection(db, "briefings"), payload);
          setBriefingId(created.id);
          briefingIdRef.current = created.id;
          saveLocalSnapshot(created.id, nextAnswers);
          setSearchParams({ draft: created.id }, { replace: true });
          if (statusOverride === "completed") {
            localStorage.removeItem(storageDraftKey);
            clearLocalSnapshot(created.id);
          } else {
            localStorage.setItem(storageDraftKey, created.id);
          }
          return created.id;
        }
      } finally {
        setSavingDraft(false);
      }
    },
    [
      captureElapsedVoiceSeconds,
      clearLocalSnapshot,
      clientId,
      saveLocalSnapshot,
      setSearchParams,
      storageDraftKey,
      usedManualOnce,
      usedVoiceOnce,
    ]
  );

  // Start from Welcome Cover (recupera borrador previo por correo si existía para nunca reiniciar desde cero)
  const handleStartBriefing = async (chosenMode: "voice" | "manual") => {
    if (
      !answers.companyName.trim() ||
      !answers.contactName.trim() ||
      !answers.contactEmail.trim()
    ) {
      setWelcomeError(
        "Por favor completa Empresa solicitante, Nombre del contacto y Correo electrónico para comenzar."
      );
      return;
    }

    if (!answers.privacyConsentAccepted) {
      setWelcomeError(
        "Debes aceptar la casilla de Privacidad, Confidencialidad, Uso Ético de IA y Autorización de información antes de iniciar el briefing."
      );
      return;
    }

    setWelcomeError(null);
    let targetId = briefingId;
    let baseAnswers = answers;

    // Si abrieron el enlace limpio sin ?draft= y existe un borrador previo con avance real para este correo,
    // preguntar al usuario si desea retomarlo o iniciar un diagnóstico nuevo desde cero (evita decir "Hola de nuevo" por error)
    if (!targetId) {
      try {
        const normalizedEmail = answers.contactEmail.trim().toLowerCase();
        const qByEmail = query(
          collection(db, "briefings"),
          where("email", "==", normalizedEmail)
        );
        const snapByEmail = await getDocs(qByEmail);
        const matchingDrafts: Array<{ id: string; data: any }> = [];
        snapByEmail.forEach((d) => {
          const dData = d.data();
          if (
            dData.briefingType === "ai-agent" &&
            dData.status === "draft" &&
            hasAnySectionProgress(dData.answers)
          ) {
            matchingDrafts.push({ id: d.id, data: dData });
          }
        });
        if (matchingDrafts.length > 0) {
          matchingDrafts.sort((a, b) => {
            const tA = a.data.updatedAt?.seconds || a.data.createdAt?.seconds || 0;
            const tB = b.data.updatedAt?.seconds || b.data.createdAt?.seconds || 0;
            return tB - tA;
          });
          const best = matchingDrafts[0];
          const recovered = sanitizeLegacyAnswers(best.data.answers);
          const stagePrev = resolveResumeSection(recovered);
          const wantsToResume = window.confirm(
            `Encontramos un diagnóstico previo en curso para "${
              best.data.companyName || answers.companyName
            }" (Etapa ${stagePrev} de 10).\n\n¿Deseas retomarlo donde te quedaste?\n(Presiona Cancelar si prefieres iniciar un diagnóstico nuevo desde cero).`
          );
          if (wantsToResume) {
            targetId = best.id;
            setBriefingId(best.id);
            briefingIdRef.current = best.id;
            accumulatedVoiceSecondsRef.current = Number(best.data.voiceDurationSeconds) || 0;
            baseAnswers = {
              ...recovered,
              companyName: answers.companyName.trim() || recovered.companyName,
              contactName: answers.contactName.trim() || recovered.contactName,
              contactEmail: answers.contactEmail.trim() || recovered.contactEmail,
              contactPhone: answers.contactPhone.trim() || recovered.contactPhone,
            };
          }
        }
      } catch (err) {
        console.warn("Búsqueda de borrador previo por email omitida:", err);
      }
    }

    const resumeSec = targetId ? resolveResumeSection(baseAnswers) : 1;
    const stampedAnswers: AiBriefingAnswers = {
      ...baseAnswers,
      privacyConsentAccepted: true,
      privacyConsentAcceptedAt:
        baseAnswers.privacyConsentAcceptedAt ||
        new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" }),
      lastActiveSection: resumeSec,
    };
    setAnswers(stampedAnswers);
    answersRef.current = stampedAnswers;
    setActiveSection(resumeSec);
    activeSectionRef.current = resumeSec;

    const id = await persistDraft(
      stampedAnswers,
      targetId,
      "draft",
      chosenMode === "voice" ? "voice" : "manual"
    );

    // Subir inmediatamente al tope de la página para que el usuario vea de frente el micrófono de Nexia IA
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });

    if (chosenMode === "voice") {
      setUsedVoiceOnce(true);
      setActiveMode("voice");
      setStep("workspace");
      startVoiceSession(id, stampedAnswers);
    } else {
      setUsedManualOnce(true);
      setActiveMode("manual");
      setStep("workspace");
    }
  };

  // Start / Reconnect Gemini Live Voice Session (siempre toma el estado más fresco para retomar en la etapa exacta)
  const startVoiceSession = async (targetBriefingId: string, currentAns?: AiBriefingAnswers) => {
    if (activeCallStartMsRef.current !== null) {
      await syncVoiceTelemetryToFirestore(targetBriefingId, true);
    }
    voiceRef.current?.stop();
    setVoiceError(null);
    setIsVoicePaused(false);
    setVoiceCompletedBanner(false);
    setUsedVoiceOnce(true);

    // Combinar memoria en vivo con el borrador remoto más reciente por si el navegador despertó tras suspensión
    let freshAnswers: AiBriefingAnswers = {
      ...answersRef.current,
      ...(currentAns || {}),
    };
    try {
      const latestSnap = await getDoc(doc(db, "briefings", targetBriefingId));
      if (latestSnap.exists() && latestSnap.data()?.answers) {
        const remoteAns = sanitizeLegacyAnswers(latestSnap.data().answers);
        freshAnswers = sanitizeLegacyAnswers({
          ...remoteAns,
          ...answersRef.current,
        });
      }
    } catch {
      // Si hay latencia momentánea, continuar con answersRef.current
    }

    const resumeSec = resolveResumeSection(freshAnswers);
    freshAnswers = {
      ...freshAnswers,
      lastActiveSection: resumeSec,
    };
    setAnswers(freshAnswers);
    answersRef.current = freshAnswers;
    setActiveSection(resumeSec);
    activeSectionRef.current = resumeSec;

    const session = new AiVoiceBriefingSession({
      onStatusChange: (st, errMsg) => {
        setVoiceStatus(st);
        setIsVoicePaused(st === "paused");
        if (errMsg) setVoiceError(errMsg);

        if (st === "connected" || st === "speaking") {
          if (activeCallStartMsRef.current === null) {
            activeCallStartMsRef.current = Date.now();
            flushedInCurrentCallRef.current = 0;
            lastVoiceSessionAtRef.current = new Date().toLocaleString("es-MX", {
              timeZone: "America/Mexico_City",
            });
          }
        } else if (st === "paused" || st === "ended" || st === "error" || st === "idle") {
          if (activeCallStartMsRef.current !== null) {
            syncVoiceTelemetryToFirestore(targetBriefingId, true);
          }
        }
      },
      onAudioLevel: (lvl) => setAudioLevel(lvl),
      onTranscriptUpdate: (role, text) => {
        setTranscriptLog((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            const updated = [...prev];
            updated[updated.length - 1] = { role, text: `${last.text} ${text}`.trim() };
            return updated.slice(-12);
          }
          return [...prev.slice(-11), { role, text: text.trim() }];
        });
      },
      onFieldsUpdated: (partial, pendingSec) => {
        setAnswers((prev) => {
          const nextPending = new Set(toNumberArray(prev.pendingSections));
          if (typeof pendingSec === "number" && pendingSec >= 1 && pendingSec <= 10) {
            nextPending.add(clampSection(pendingSec));
          }

          const nextPartial = { ...partial };
          if (
            typeof nextPartial.additionalComments === "string" &&
            nextPartial.additionalComments.trim() &&
            safeStr(prev.additionalComments).trim() &&
            !nextPartial.additionalComments.includes(safeStr(prev.additionalComments).trim())
          ) {
            nextPartial.additionalComments = `${safeStr(prev.additionalComments).trim()}\n• ${nextPartial.additionalComments.trim()}`;
          }

          const merged: AiBriefingAnswers = sanitizeLegacyAnswers({
            ...prev,
            ...nextPartial,
            pendingSections: Array.from(nextPending),
          });

          // Si el cliente pidió expresamente posicionar una etapa (focusSection -> lastActiveSection), respetarla;
          // de lo contrario, usar SIEMPRE la primera etapa pendiente en estricto orden secuencial (1 → 9 → 10)
          // para que jamás se brinque etapas cuando se capturan datos anticipados.
          const touchedSec = AI_RFI_SECTIONS.find((sec) =>
            sec.fields.some((f) => f in partial)
          );
          if (touchedSec) {
            setRecentlyUpdatedSection(touchedSec.number);
            setTimeout(() => setRecentlyUpdatedSection(null), 2800);
          }

          const computedSection =
            typeof partial.lastActiveSection === "number"
              ? clampSection(partial.lastActiveSection)
              : getFirstIncompleteSection(merged);

          merged.lastActiveSection = computedSection;
          answersRef.current = merged;
          setActiveSection(computedSection);
          activeSectionRef.current = computedSection;

          saveLocalSnapshot(targetBriefingId, merged);
          persistDraft(merged, targetBriefingId, "draft");
          return merged;
        });
      },
      onInterviewFinished: () => {
        syncVoiceTelemetryToFirestore(targetBriefingId, true);
        voiceRef.current?.stop();
        const finalMerged: AiBriefingAnswers = {
          ...answersRef.current,
          observationsConfirmed: true,
          lastActiveSection: 10,
        };
        setAnswers(finalMerged);
        answersRef.current = finalMerged;
        saveLocalSnapshot(targetBriefingId, finalMerged);
        persistDraft(finalMerged, targetBriefingId, "draft");
        setVoiceCompletedBanner(true);
        setActiveSection(10);
        activeSectionRef.current = 10;
        setActiveMode("manual");
      },
    });

    voiceRef.current = session;
    await session.start(targetBriefingId, freshAnswers);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    voiceRef.current?.setMuted(next);
  };

  const handleTogglePauseVoice = () => {
    if (!voiceRef.current) return;
    const nextPaused = !isVoicePaused;
    setIsVoicePaused(nextPaused);
    voiceRef.current.setPaused(nextPaused);
  };

  const handleStopVoiceAndEdit = () => {
    if (briefingIdRef.current) {
      syncVoiceTelemetryToFirestore(briefingIdRef.current, true);
    }
    voiceRef.current?.stop();
    setIsVoicePaused(false);
    setUsedManualOnce(true);
    setActiveMode("manual");
  };

  const scheduleDebouncedPersist = useCallback(
    (nextAns: AiBriefingAnswers) => {
      if (!briefingIdRef.current) return;
      saveLocalSnapshot(briefingIdRef.current, nextAns);
      if (manualDebounceRef.current) {
        window.clearTimeout(manualDebounceRef.current);
      }
      manualDebounceRef.current = window.setTimeout(() => {
        if (briefingIdRef.current) {
          persistDraft(nextAns, briefingIdRef.current, "draft");
        }
      }, 1000);
    },
    [persistDraft, saveLocalSnapshot]
  );

  // Update field manually with instant local backup + debounced Firestore save
  const updateField = <K extends keyof AiBriefingAnswers>(
    field: K,
    value: AiBriefingAnswers[K]
  ) => {
    setUsedManualOnce(true);
    setAnswers((prev) => {
      const next: AiBriefingAnswers = {
        ...prev,
        [field]: value,
        lastActiveSection: activeSectionRef.current,
      };
      answersRef.current = next;
      if (step === "workspace") {
        scheduleDebouncedPersist(next);
      }
      return next;
    });
  };

  const toggleArrayOption = (field: "channels" | "targetUsers", item: string) => {
    setUsedManualOnce(true);
    setAnswers((prev) => {
      const current = toStringArray(prev[field]);
      const exists = current.includes(item);
      const nextArr = exists ? current.filter((x) => x !== item) : [...current, item];
      const next: AiBriefingAnswers = {
        ...prev,
        [field]: nextArr,
        lastActiveSection: activeSectionRef.current,
      };
      answersRef.current = next;
      if (step === "workspace") {
        scheduleDebouncedPersist(next);
      }
      return next;
    });
  };

  const togglePendingSection = (secNum: number) => {
    setAnswers((prev) => {
      const set = new Set(prev.pendingSections || []);
      if (set.has(secNum)) set.delete(secNum);
      else set.add(secNum);
      const next: AiBriefingAnswers = {
        ...prev,
        pendingSections: Array.from(set),
        lastActiveSection: activeSectionRef.current,
      };
      answersRef.current = next;
      if (briefingId) persistDraft(next, briefingId, "draft");
      return next;
    });
  };

  const handleSaveManualStep = async (nextSec?: number) => {
    const targetSec = typeof nextSec === "number" ? nextSec : activeSection;
    const nextAns: AiBriefingAnswers = {
      ...answersRef.current,
      lastActiveSection: targetSec,
    };
    setAnswers(nextAns);
    answersRef.current = nextAns;
    if (typeof nextSec === "number") {
      setActiveSection(nextSec);
      activeSectionRef.current = nextSec;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    await persistDraft(nextAns, briefingId, "draft");
  };

  // Shareable draft URL for colleague / IT team (siempre con panel.interpresdigital.com)
  const handleCopyShareableLink = async () => {
    const id = await persistDraft(answers, briefingId, "draft");
    const baseUrl = getAppBaseUrl();
    const shareUrl = `${baseUrl}/#/briefing/ia${clientId ? `/${clientId}` : ""}?draft=${id}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedDraftLink(true);
    setTimeout(() => setCopiedDraftLink(false), 3000);
  };

  // File Upload for Section 10
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    try {
      const id = await persistDraft(answers, briefingId, "draft");
      const uploaded: AiBriefingAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 15 * 1024 * 1024) {
          alert(`El archivo "${file.name}" supera el límite de 15 MB.`);
          continue;
        }
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const storageRef = ref(storage, `ai_briefing_attachments/${id}/${safeName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploaded.push({
          name: file.name,
          url,
          size: file.size,
          type: file.type || "application/octet-stream",
          uploadedAt: new Date().toISOString(),
        });
      }

      if (uploaded.length > 0) {
        const next = {
          ...answers,
          attachments: [...(answers.attachments || []), ...uploaded],
        };
        setAnswers(next);
        await persistDraft(next, id, "draft");
      }
    } catch (err) {
      console.error("Error subiendo adjuntos:", err);
      alert("Hubo un inconveniente al subir el archivo. Intenta nuevamente.");
    } finally {
      setUploadingFiles(false);
      e.target.value = "";
    }
  };

  const handleRemoveAttachment = async (idx: number) => {
    const next = {
      ...answers,
      attachments: answers.attachments.filter((_, i) => i !== idx),
    };
    setAnswers(next);
    if (briefingId) await persistDraft(next, briefingId, "draft");
  };

  const handleFinalSubmit = async () => {
    captureElapsedVoiceSeconds(true);
    voiceRef.current?.stop();
    setSubmittingFinal(true);
    try {
      await persistDraft(answers, briefingId, "completed");

      const computedMode: "voice" | "manual" | "hybrid" =
        usedVoiceOnce && usedManualOnce
          ? "hybrid"
          : usedVoiceOnce
          ? "voice"
          : "manual";
      const filledCount = AI_RFI_SECTIONS.filter((s) =>
        isSectionFilled(answers, s.number)
      ).length;

      await sendTelegramAiBriefingNotification({
        companyName: answers.companyName.trim(),
        contactName: answers.contactName.trim(),
        contactEmail: answers.contactEmail.trim(),
        contactPhone: answers.contactPhone.trim(),
        completionMode: computedMode,
        completedSectionsCount: filledCount,
        businessProblem: answers.businessProblem,
        estimatedBudget: answers.estimatedBudget,
        idealLaunchDate: answers.idealLaunchDate,
        attachmentsCount: (answers.attachments || []).length,
        isUpdate: hasSentTelegramRef.current,
      });
      hasSentTelegramRef.current = true;

      setStep("submitted");
    } catch (err) {
      console.error("Error enviando RFI:", err);
      alert("Ocurrió un error al enviar el RFI. Por favor intenta de nuevo.");
    } finally {
      setSubmittingFinal(false);
    }
  };

  const completedSectionsCount = AI_RFI_SECTIONS.filter((s) =>
    isSectionFilled(answers, s.number)
  ).length;
  const progressPercent = Math.round((completedSectionsCount / 10) * 100);

  if (loadingInit) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
      </div>
    );
  }

  // SUBMITTED SCREEN
  if (step === "submitted") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900/90 border border-indigo-500/30 rounded-3xl p-8 md:p-10 text-center shadow-2xl space-y-6">
          <img src={LOGO_URL} alt="Interpres Digital" className="h-12 mx-auto object-contain" />
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            ¡RFI Recibido con Éxito!
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Gracias, <strong className="text-white">{answers.contactName}</strong>. Nuestro equipo de Arquitectura de IA en{" "}
            <strong className="text-indigo-400">Interpres Digital</strong> ya recibió la especificación de{" "}
            <strong className="text-white">{answers.companyName}</strong> y preparará tu propuesta técnica y económica a la medida.
          </p>
          <button
            onClick={() => {
              setStep("workspace");
              setActiveMode("manual");
            }}
            className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all"
          >
            Revisar o complementar mis respuestas
          </button>
        </div>
      </div>
    );
  }

  // STEP 0: WELCOME COVER
  if (step === "welcome") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-center px-2.5 py-4 sm:p-5 md:p-8">
        <div className="max-w-3xl w-full bg-slate-900/85 backdrop-blur-xl border border-slate-600/80 rounded-3xl p-4 sm:p-7 md:p-10 shadow-2xl space-y-4 sm:space-y-5 md:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-4">
            <img src={LOGO_URL} alt="Interpres Digital" className="h-9 sm:h-11 w-auto object-contain" />
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/50 text-indigo-200 text-[11px] font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              RFI — Automatización y Agentes de IA
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-tight">
              <span className="block">Diagnóstico Ejecutivo para</span>
              <span className="block text-indigo-300">Diseño de Agentes de IA</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Abarca tanto <strong className="text-white">automatizaciones de procesos e integraciones entre sistemas</strong> como{" "}
              <strong className="text-white">agentes autónomos de IA</strong>. Complétalo{" "}
              <strong className="text-indigo-200">conversando por voz con Nexia IA</strong> o por escrito paso a paso; tu avance se guarda automáticamente.
            </p>
          </div>

          {/* Identification Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-2xl bg-slate-800/75 border border-slate-600/80 focus-within:border-indigo-400 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Empresa solicitante *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={answers.companyName}
                  onChange={(e) => updateField("companyName", e.target.value)}
                  placeholder="Nombre de tu empresa"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/75 border border-slate-600/80 focus-within:border-indigo-400 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Nombre del contacto *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={answers.contactName}
                  onChange={(e) => updateField("contactName", e.target.value)}
                  placeholder="Tu nombre y cargo"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/75 border border-slate-600/80 focus-within:border-indigo-400 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Correo electrónico *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={answers.contactEmail}
                  onChange={(e) => updateField("contactEmail", e.target.value)}
                  placeholder="nombre@empresa.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-800/75 border border-slate-600/80 focus-within:border-indigo-400 transition-colors">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Teléfono / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  value={answers.contactPhone}
                  onChange={(e) => updateField("contactPhone", e.target.value)}
                  placeholder="+52 55 0000 0000"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Compact Mobile-First Privacy, Ethical AI & Authorization Consent */}
          <div
            className={clsx(
              "p-3 sm:p-4 rounded-2xl border transition-all space-y-2",
              answers.privacyConsentAccepted
                ? "bg-emerald-950/35 border-emerald-400/60"
                : welcomeError && !answers.privacyConsentAccepted
                ? "bg-amber-950/35 border-amber-400/80"
                : "bg-slate-800/80 border-slate-600/80"
            )}
          >
            <div
              onClick={() => {
                const nextVal = !answers.privacyConsentAccepted;
                setWelcomeError(null);
                setAnswers((prev) => ({
                  ...prev,
                  privacyConsentAccepted: nextVal,
                  privacyConsentAcceptedAt: nextVal
                    ? new Date().toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })
                    : "",
                }));
              }}
              role="checkbox"
              aria-checked={answers.privacyConsentAccepted}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  const nextVal = !answers.privacyConsentAccepted;
                  setWelcomeError(null);
                  setAnswers((prev) => ({
                    ...prev,
                    privacyConsentAccepted: nextVal,
                    privacyConsentAcceptedAt: nextVal
                      ? new Date().toLocaleString("es-MX", {
                          timeZone: "America/Mexico_City",
                        })
                      : "",
                  }));
                }
              }}
              className="flex items-center sm:items-start gap-2.5 sm:gap-3 cursor-pointer select-none"
            >
              <div
                className={clsx(
                  "w-5 h-5 sm:mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
                  answers.privacyConsentAccepted
                    ? "bg-emerald-500 border-emerald-400 text-slate-950 shadow-sm shadow-emerald-500/20"
                    : "bg-slate-900 border-slate-400 hover:border-indigo-400"
                )}
              >
                {answers.privacyConsentAccepted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>

              <p className="text-xs sm:text-[13px] text-slate-100 leading-snug">
                <strong className="text-white">Acepto el Aviso de Privacidad y Uso Ético de IA *</strong>
                <span className="hidden sm:inline text-slate-300">
                  {" "}— Confirmo autorización para compartir esta información bajo resguardo confidencial de INTERPRES DIGITAL.
                </span>
                <span className="sm:hidden text-slate-300">
                  {" "}y confirmo autorización para compartir esta información.
                </span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-700/60 text-[11px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
                <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                  <Lock className="w-3 h-3 flex-shrink-0" />
                  Cero entrenamiento IA
                </span>
                <span className="inline-flex items-center gap-1 text-indigo-300 font-medium">
                  <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                  LFPDPPP
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowLegalModal(true)}
                  className="w-full sm:w-auto justify-center px-3.5 py-2 sm:py-1.5 rounded-xl bg-indigo-500/30 hover:bg-indigo-500/45 border border-indigo-400/80 text-xs font-extrabold text-white shadow-sm shadow-indigo-500/15 inline-flex items-center gap-1.5 transition-all active:scale-[0.99]"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-200 flex-shrink-0" />
                  <span>Ver Aviso Legal y Privacidad →</span>
                </button>
                <a
                  href="https://interpresdigital.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 text-slate-400 hover:text-white"
                >
                  <span>Aviso Integral</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {welcomeError && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/70 text-amber-100 text-xs font-semibold flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-300 flex-shrink-0" />
              <span>{welcomeError}</span>
            </div>
          )}

          {/* Mode Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <button
              onClick={() => handleStartBriefing("voice")}
              disabled={savingDraft}
              className={clsx(
                "group text-left p-6 rounded-2xl border-2 transition-all",
                answers.privacyConsentAccepted
                  ? "bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 border-indigo-300/50 shadow-xl shadow-indigo-600/20 active:scale-[0.99]"
                  : "bg-gradient-to-br from-indigo-600/60 to-violet-700/60 border-indigo-400/30 opacity-75 hover:opacity-95"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
                  <Mic className="w-6 h-6 text-white" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-white/20 text-[11px] font-bold uppercase tracking-wider">
                  Recomendado • IA en Vivo
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">
                Entrevista por Voz con Nexia IA
              </h3>
              <p className="text-indigo-100 text-xs leading-relaxed">
                Platica con voz natural con Nexia IA, la inteligencia artificial de Interpres Digital, mientras ves cómo se llena tu RFI en tiempo real.
              </p>
            </button>

            <button
              onClick={() => handleStartBriefing("manual")}
              disabled={savingDraft}
              className={clsx(
                "group text-left p-6 rounded-2xl border-2 transition-all",
                answers.privacyConsentAccepted
                  ? "bg-slate-800/90 hover:bg-slate-800 border-slate-500/70 hover:border-indigo-400/70 shadow-lg active:scale-[0.99]"
                  : "bg-slate-800/60 border-slate-600/60 opacity-75 hover:opacity-95"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-slate-700 border border-slate-500/60 flex items-center justify-center">
                  <PenTool className="w-5 h-5 text-indigo-300" />
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-700 border border-slate-500/60 text-slate-200 text-[11px] font-bold uppercase tracking-wider">
                  Paso a Paso
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">
                Llenar Manualmente por Escrito
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Responde las 10 secciones a tu ritmo, comparte el enlace con tu equipo de TI y adjunta archivos.
              </p>
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-300 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Conexión cifrada • Puedes alternar entre voz y escritura o guardar avance para tu equipo técnico.</span>
          </div>
        </div>

        {/* Legal, Data Protection & Ethical AI Modal */}
        {showLegalModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-slate-900 border border-slate-600 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm md:text-base font-black text-white">
                    Aviso de Privacidad, Confidencialidad y Uso Ético de IA
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLegalModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-200 leading-relaxed">
                <p>
                  En cumplimiento con la <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong> y los Términos y Condiciones de{" "}
                  <strong>INTERPRES DIGITAL</strong> (marca comercial y plataforma tecnológica de <strong>INTERPRES S.A. de C.V.</strong>, con domicilio en San Miguel de Allende, Guanajuato, México), se informa lo siguiente respecto al presente Diagnóstico Ejecutivo (RFI):
                </p>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-600/80 space-y-1.5">
                  <h3 className="font-bold text-emerald-300 uppercase text-[11px] tracking-wider">
                    1. Garantía de Uso Ético de Inteligencia Artificial (No Entrenamiento)
                  </h3>
                  <p>
                    Este diagnóstico incorpora asistencia conversacional y procesamiento mediante Inteligencia Artificial empresarial exclusivamente para transcribir, estructurar tus requerimientos y apoyar en el pre-diagnóstico técnico.{" "}
                    <strong>Ninguna grabación de voz, respuesta escrita ni documento adjunto se utiliza para entrenar, alimentar o mejorar modelos públicos o de terceros.</strong>
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-600/80 space-y-1.5">
                  <h3 className="font-bold text-indigo-300 uppercase text-[11px] tracking-wider">
                    2. Titularidad de la Información y Confidencialidad (Cláusulas 15 y 47)
                  </h3>
                  <p>
                    La empresa solicitante conserva en todo momento la titularidad única y exclusiva sobre su información operativa, comercial, flujos de trabajo y documentos adjuntos. <strong>INTERPRES S.A. de C.V.</strong> resguarda dicha información bajo estricta confidencialidad y no vende ni comercializa datos personales o corporativos con terceros.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-600/80 space-y-1.5">
                  <h3 className="font-bold text-indigo-300 uppercase text-[11px] tracking-wider">
                    3. Finalidad del Tratamiento e Infraestructura Segura
                  </h3>
                  <p>
                    Los datos de contacto y especificaciones técnicas recabados se emplean únicamente para evaluar la viabilidad del proyecto, diseñar la arquitectura del Agente de IA y presentar la propuesta técnica y económica correspondiente, operando sobre infraestructura cifrada (Google Cloud / Firebase).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-600/80 space-y-1.5">
                  <h3 className="font-bold text-indigo-300 uppercase text-[11px] tracking-wider">
                    4. Declaración de Autorización y Licitud (Cláusula 30)
                  </h3>
                  <p>
                    Al marcar la casilla de aceptación, el usuario declara contar con la representación, facultades o autorización suficiente por parte de la empresa solicitante para compartir la información descrita y los archivos adjuntos con fines de evaluación y cotización, evitando incluir bases de datos con datos personales sensibles de terceros no anonimizados.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-600/80 space-y-1.5">
                  <h3 className="font-bold text-indigo-300 uppercase text-[11px] tracking-wider">
                    5. Derechos ARCO y Consulta Integral
                  </h3>
                  <p>
                    Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación u Oposición (ARCO) o revocar tu consentimiento escribiendo a{" "}
                    <a href="mailto:admin@interpresdigital.com" className="text-indigo-300 underline">
                      admin@interpresdigital.com
                    </a>
                    . El Aviso de Privacidad Integral y los Términos y Condiciones completos están disponibles permanentemente en el pie de página de{" "}
                    <a
                      href="https://interpresdigital.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 underline"
                    >
                      interpresdigital.com
                    </a>
                    .
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/80 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLegalModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWelcomeError(null);
                    setAnswers((prev) => ({
                      ...prev,
                      privacyConsentAccepted: true,
                      privacyConsentAcceptedAt:
                        prev.privacyConsentAcceptedAt ||
                        new Date().toLocaleString("es-MX", {
                          timeZone: "America/Mexico_City",
                        }),
                    }));
                    setShowLegalModal(false);
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-extrabold text-white flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Aceptar y Continuar</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // WORKSPACE (HYBRID VOICE + MANUAL)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col">
      {/* Top Sticky Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-700/80 px-3 sm:px-6 md:px-8 py-2.5 sm:py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <img src={LOGO_URL} alt="Interpres Digital" className="h-7 sm:h-8 w-auto object-contain flex-shrink-0" />
            <div className="hidden sm:block h-6 w-px bg-slate-600/70" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate max-w-[160px] sm:max-w-xs">
                {answers.companyName}
              </div>
              <div className="text-[11px] text-slate-300">
                Avance: {completedSectionsCount}/10 ({progressPercent}%)
                {savingDraft && " • Guardando..."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="bg-slate-800/90 p-1 rounded-xl border border-slate-600/80 flex items-center">
              <button
                onClick={() => {
                  setActiveMode("voice");
                  if (voiceStatus === "idle" || voiceStatus === "ended" || voiceStatus === "error") {
                    if (briefingId) startVoiceSession(briefingId, answersRef.current);
                  }
                }}
                className={clsx(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                  activeMode === "voice"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-300 hover:text-white"
                )}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Voz IA</span>
              </button>
              <button
                onClick={handleStopVoiceAndEdit}
                className={clsx(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                  activeMode === "manual"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-300 hover:text-white"
                )}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Formulario</span>
              </button>
            </div>

            {/* Share Draft with IT / Colleague */}
            <button
              onClick={handleCopyShareableLink}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-xs font-bold flex items-center gap-1.5 text-slate-200 transition-all"
              title="Copia este enlace para compartir el avance con tu líder de TI u otro colega"
            >
              {copiedDraftLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 text-[11px] sm:text-xs">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline">Compartir con TI</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 px-2.5 py-4 sm:p-6 md:p-8">
        {/* Left Sidebar on Desktop / Secondary List on Mobile */}
        <aside className="order-2 lg:order-1 lg:col-span-4 space-y-3">
          <div className="bg-slate-900/85 border border-slate-600/80 rounded-2xl p-3.5 sm:p-4 space-y-2 shadow-xl">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-700/80">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                Etapas del RFI (10 bloques)
              </span>
              <span className="text-xs font-bold text-indigo-300">{progressPercent}%</span>
            </div>

            <div className="space-y-1.5">
              {AI_RFI_SECTIONS.map((sec) => {
                const filled = isSectionFilled(answers, sec.number);
                const partial = isSectionPartial(answers, sec.number);
                const pending = (answers.pendingSections || []).includes(sec.number);
                const isFlashing = recentlyUpdatedSection === sec.number;
                const isCurrent = activeSection === sec.number;

                return (
                  <button
                    key={sec.number}
                    onClick={() => {
                      setActiveSection(sec.number);
                      if (activeMode === "voice") {
                        handleStopVoiceAndEdit();
                      }
                    }}
                    className={clsx(
                      "w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border",
                      isFlashing
                        ? "bg-emerald-500/25 border-emerald-400 text-white scale-[1.01]"
                        : isCurrent
                        ? "bg-indigo-600/35 border-indigo-400 text-white shadow-xs"
                        : "bg-slate-800/70 border-slate-600/70 text-slate-200 hover:bg-slate-800 hover:border-slate-500"
                    )}
                  >
                    <span className="truncate pr-2">
                      {sec.number}. {sec.shortTitle}
                    </span>
                    {filled ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : pending ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-bold flex-shrink-0">
                        Pendiente TI
                      </span>
                    ) : partial ? (
                      <span className="px-2 py-0.5 rounded bg-indigo-500/25 border border-indigo-400/50 text-indigo-200 text-[10px] font-bold flex-shrink-0">
                        En curso
                      </span>
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-indigo-950/60 border border-indigo-400/40 rounded-2xl p-3.5 sm:p-4 text-xs text-indigo-100 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-indigo-300">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>¿Te falta algún dato técnico?</span>
            </div>
            <p className="text-[11px] text-indigo-100/90 leading-relaxed">
              Si desconoces detalles de APIs o infraestructura, díselo a Nexia IA o márcalo como{" "}
              <strong>Pendiente para TI</strong> para compartirlo después con tu equipo técnico.
            </p>
          </div>
        </aside>

        {/* Right Panel (First on Mobile): Either Live Voice Consultant OR Manual Step Editor */}
        <section className="order-1 lg:order-2 lg:col-span-8">
          {activeMode === "voice" ? (
            <div className="bg-slate-900/85 border border-slate-600/80 rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col justify-between space-y-5 shadow-xl">
              {/* Top Stage Tracker + Status (Clean Mobile Distribution) */}
              <div className="space-y-3 border-b border-slate-700/70 pb-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-600/80">
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        voiceStatus === "connected" || voiceStatus === "speaking"
                          ? "bg-emerald-400 animate-pulse"
                          : voiceStatus === "paused"
                          ? "bg-amber-400"
                          : voiceStatus === "connecting" || voiceStatus === "requesting_token"
                          ? "bg-amber-400 animate-ping"
                          : "bg-rose-400"
                      )}
                    />
                    <span className="text-[11px] font-bold text-slate-200">
                      {voiceStatus === "requesting_token" && "Preparando audio seguro..."}
                      {voiceStatus === "connecting" && "Conectando con Nexia IA..."}
                      {voiceStatus === "connected" && "Tu turno • Nexia IA te escucha"}
                      {voiceStatus === "speaking" && "Nexia IA hablando..."}
                      {voiceStatus === "paused" && "Nexia IA en pausa"}
                      {voiceStatus === "error" && "Conexión en espera"}
                      {voiceStatus === "ended" && "Entrevista finalizada"}
                      {voiceStatus === "idle" && "Listo para iniciar"}
                    </span>
                  </div>

                  <span className="text-[11px] font-bold text-indigo-300">
                    Etapa {activeSection}/10: {AI_RFI_SECTIONS[activeSection - 1]?.shortTitle}
                  </span>
                </div>

                {/* Compact 10-Stage Visual Check Strip (Especially clear on Mobile) */}
                <div className="grid grid-cols-10 gap-1">
                  {AI_RFI_SECTIONS.map((sec) => {
                    const filled = isSectionFilled(answers, sec.number);
                    const partial = isSectionPartial(answers, sec.number);
                    const isCurrent = activeSection === sec.number;
                    return (
                      <button
                        key={sec.number}
                        type="button"
                        onClick={() => {
                          setActiveSection(sec.number);
                          handleStopVoiceAndEdit();
                        }}
                        title={`${sec.number}. ${sec.shortTitle}`}
                        className={clsx(
                          "h-7 rounded-lg text-[11px] font-extrabold flex items-center justify-center border transition-all",
                          filled
                            ? "bg-emerald-500/25 border-emerald-400 text-emerald-300"
                            : isCurrent
                            ? "bg-indigo-600 border-indigo-300 text-white shadow-sm"
                            : partial
                            ? "bg-indigo-500/20 border-indigo-400/50 text-indigo-200"
                            : "bg-slate-800/80 border-slate-700 text-slate-400"
                        )}
                      >
                        {filled ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : sec.number}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reactive Voice Orb */}
              <div className="flex flex-col items-center justify-center py-3 sm:py-5 space-y-5">
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full bg-indigo-500/25 blur-2xl transition-transform duration-100 pointer-events-none"
                    style={{
                      width: `${130 + audioLevel * 75}px`,
                      height: `${130 + audioLevel * 75}px`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        briefingId &&
                        (voiceStatus === "idle" || voiceStatus === "ended" || voiceStatus === "error")
                      ) {
                        startVoiceSession(briefingId, answersRef.current);
                      } else if (
                        voiceStatus === "connected" ||
                        voiceStatus === "speaking" ||
                        voiceStatus === "paused"
                      ) {
                        handleTogglePauseVoice();
                      }
                    }}
                    className={clsx(
                      "relative w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center border-2 shadow-2xl transition-all duration-200",
                      voiceStatus === "speaking"
                        ? "bg-gradient-to-tr from-indigo-600 via-violet-500 to-fuchsia-500 border-white/50 scale-105"
                        : voiceStatus === "paused"
                        ? "bg-amber-950/70 border-amber-400/80"
                        : voiceStatus === "connected"
                        ? "bg-gradient-to-tr from-slate-800 via-indigo-900 to-slate-800 border-indigo-400/60"
                        : "bg-slate-800 border-indigo-400/40 hover:scale-105 hover:border-indigo-400"
                    )}
                  >
                    {voiceStatus === "requesting_token" || voiceStatus === "connecting" ? (
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    ) : voiceStatus === "paused" ? (
                      <Play className="w-10 h-10 text-amber-300 ml-0.5" />
                    ) : isMuted ? (
                      <MicOff className="w-10 h-10 text-rose-400" />
                    ) : (
                      <Mic className="w-10 h-10 text-white" />
                    )}
                  </button>
                </div>

                <p className="text-center text-xs text-slate-300 max-w-md leading-relaxed px-2">
                  {voiceStatus === "paused"
                    ? "Conversación en pausa. Toca Reanudar IA cuando estés listo para continuar."
                    : voiceStatus === "speaking"
                    ? "Escucha la pregunta de Nexia IA (una pregunta a la vez). Puedes pausarla en cualquier momento."
                    : voiceStatus === "connected"
                    ? "Responde con naturalidad; Nexia IA irá marcando cada etapa automáticamente."
                    : "Inicia o reanuda la entrevista guiada paso a paso con Nexia IA."}
                </p>

                {(voiceStatus === "idle" || voiceStatus === "ended") && briefingId && (
                  <button
                    type="button"
                    onClick={() => startVoiceSession(briefingId, answersRef.current)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all active:scale-95"
                  >
                    <Mic className="w-4 h-4" />
                    <span>
                      {completedSectionsCount > 0 || activeSection > 1
                        ? `Reanudar Voz en Etapa ${activeSection} de 10`
                        : "Iniciar Entrevista por Voz"}
                    </span>
                  </button>
                )}

                {/* Connection Pause / Retry Notice */}
                {voiceError && (
                  <div className="max-w-lg w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <p className="font-semibold leading-snug">{voiceError}</p>
                      <div className="flex flex-wrap gap-2">
                        {briefingId && (
                          <button
                            type="button"
                            onClick={() => startVoiceSession(briefingId, answersRef.current)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/25 hover:bg-amber-500/35 text-amber-100 font-bold"
                          >
                            Reanudar en Etapa {activeSection}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleStopVoiceAndEdit}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                        >
                          Ver Formulario
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Budget Selector shown ONLY during Stage 8 so it never clutters Mobile */}
                {activeSection === 8 && (
                  <div className="w-full max-w-xl bg-slate-800/80 border border-indigo-400/40 rounded-2xl p-3.5 space-y-2">
                    <div className="text-[11px] font-bold text-indigo-200">
                      Opcional — Selecciona tu rango estimado con un toque (Etapa 8):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {BUDGET_RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const next: AiBriefingAnswers = {
                              ...answersRef.current,
                              estimatedBudget: opt,
                              lastActiveSection: 8,
                            };
                            setAnswers(next);
                            answersRef.current = next;
                            if (briefingId) persistDraft(next, briefingId, "draft");
                          }}
                          className={clsx(
                            "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all text-left",
                            answers.estimatedBudget === opt
                              ? "bg-indigo-600 border-indigo-400 text-white"
                              : "bg-slate-900/80 border-slate-600/90 text-slate-200 hover:border-indigo-400/70"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Live Observations Box shown during Stage 10 in Voice Mode so user sees/edits final comments live */}
                {activeSection === 10 && (
                  <div className="w-full max-w-xl bg-slate-800/85 border border-emerald-400/45 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-emerald-300">
                        Etapa 10/10 — Observaciones o comentarios adicionales
                      </span>
                      <span className="text-[10px] text-slate-300">
                        Díctale tu comentario a Nexia IA o escríbelo aquí
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={answers.additionalComments}
                      onChange={(e) => updateField("additionalComments", e.target.value)}
                      placeholder="Aquí aparecerá en vivo cualquier observación que le menciones a Nexia IA..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-600/90 text-xs text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none resize-y"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          handleStopVoiceAndEdit();
                          setVoiceCompletedBanner(true);
                          setActiveSection(10);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Revisar Resumen Completo y Enviar</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Transcript Preview */}
              {transcriptLog.length > 0 && (
                <div className="bg-slate-800/75 border border-slate-600/80 rounded-2xl p-3.5 max-h-36 overflow-y-auto space-y-2 text-xs">
                  {transcriptLog.slice(-3).map((entry, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "leading-snug",
                        entry.role === "agent" ? "text-indigo-200" : "text-slate-200"
                      )}
                    >
                      <strong className="uppercase text-[10px] tracking-wider mr-1.5 text-indigo-400">
                        {entry.role === "agent" ? "Nexia IA:" : "Tú:"}
                      </strong>
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Voice Controls: Pause AI, Mute Mic, Switch to Form */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2.5 pt-3 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={handleTogglePauseVoice}
                  disabled={
                    voiceStatus !== "connected" &&
                    voiceStatus !== "speaking" &&
                    voiceStatus !== "paused"
                  }
                  className={clsx(
                    "px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all disabled:opacity-40",
                    isVoicePaused
                      ? "bg-amber-500 hover:bg-amber-400 border-amber-300 text-slate-950 shadow-sm"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-600/80 text-white"
                  )}
                >
                  {isVoicePaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{isVoicePaused ? "Reanudar IA" : "Pausar IA"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  disabled={
                    voiceStatus !== "connected" &&
                    voiceStatus !== "speaking" &&
                    voiceStatus !== "paused"
                  }
                  className={clsx(
                    "px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all disabled:opacity-40",
                    isMuted
                      ? "bg-rose-600 border-rose-400/60 text-white"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-600/80 text-white"
                  )}
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{isMuted ? "Activar Mic" : "Silenciar Mic"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleStopVoiceAndEdit();
                    setActiveSection(10);
                  }}
                  className="col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Revisar Respuestas y Finalizar</span>
                </button>
              </div>
            </div>
          ) : (
            /* MANUAL / REVIEW FORM WIZARD */
            <div className="bg-slate-900/85 border border-slate-600/80 rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-4">
                <div>
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    Sección {clampSection(activeSection)} de 10
                  </span>
                  <h2 className="text-xl font-black text-white">
                    {(AI_RFI_SECTIONS[clampSection(activeSection) - 1] || AI_RFI_SECTIONS[0]).title}
                  </h2>
                </div>

                {activeSection < 10 && (
                  <button
                    onClick={() => togglePendingSection(activeSection)}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                      toNumberArray(answers.pendingSections).includes(activeSection)
                        ? "bg-amber-500/20 border-amber-400 text-amber-200"
                        : "bg-slate-800 border-slate-600/80 text-slate-200 hover:border-slate-400 hover:text-white"
                    )}
                  >
                    {toNumberArray(answers.pendingSections).includes(activeSection)
                      ? "✓ Marcado pendiente para TI"
                      : "Marcar pendiente para TI / Colega"}
                  </button>
                )}
              </div>

              {/* Section 1 */}
              {activeSection === 1 && (
                <div className="space-y-4">
                  <FieldTextarea
                    label="¿Cuál es el problema o necesidad de negocio que el agente de IA debe resolver?"
                    value={answers.businessProblem}
                    onChange={(v) => updateField("businessProblem", v)}
                    placeholder="Ej. Tardamos más de 4 horas en responder prospectos de WhatsApp y perdemos cierres fuera de horario..."
                  />
                  <FieldTextarea
                    label="¿Qué resultado esperan obtener (ahorro de tiempo, reducción de costos, mejor atención, etc.)?"
                    value={answers.expectedOutcome}
                    onChange={(v) => updateField("expectedOutcome", v)}
                    placeholder="Ej. Atender en menos de 1 minuto 24/7, calificar prospectos y liberar 60% del tiempo operativo..."
                  />
                  <FieldTextarea
                    label="¿Existen iniciativas o herramientas de IA previas en la empresa?"
                    value={answers.previousAiInitiatives}
                    onChange={(v) => updateField("previousAiInitiatives", v)}
                    placeholder="Ej. Usamos ChatGPT de forma individual, o tuvimos un chatbot básico de botones..."
                  />
                </div>
              )}

              {/* Section 2 */}
              {activeSection === 2 && (
                <div className="space-y-4">
                  <FieldTextarea
                    label="Descripción del puesto o proceso que hoy realiza una persona (o que se desea crear)"
                    value={answers.roleOrProcessDescription}
                    onChange={(v) => updateField("roleOrProcessDescription", v)}
                    placeholder="Ej. Ejecutivo de atención a clientes / Coordinador de agendamiento y cotizaciones..."
                  />
                  <FieldTextarea
                    label="Tareas diarias, semanales y mensuales que realiza esa persona"
                    value={answers.periodicTasks}
                    onChange={(v) => updateField("periodicTasks", v)}
                    placeholder="Diarias: responder dudas, cotizar, agendar. Semanales: reporte de seguimiento..."
                  />
                  <FieldInput
                    label="¿Qué porcentaje de esas tareas cree que puede manejar el agente?"
                    value={answers.automationPercentage}
                    onChange={(v) => updateField("automationPercentage", v)}
                    placeholder="Ej. 70% - 80%"
                  />
                  <FieldTextarea
                    label="¿Qué pasa hoy cuando esa persona no está disponible?"
                    value={answers.unavailabilityImpact}
                    onChange={(v) => updateField("unavailabilityImpact", v)}
                    placeholder="Ej. Se acumulan los mensajes hasta el día siguiente o nadie da seguimiento en fin de semana..."
                  />
                </div>
              )}

              {/* Section 3 */}
              {activeSection === 3 && (
                <div className="space-y-4">
                  <FieldTextarea
                    label="Liste las funciones específicas que debe ejecutar el agente"
                    value={answers.specificFunctions}
                    onChange={(v) => updateField("specificFunctions", v)}
                    placeholder="Ej. Responder correos/WhatsApp, consultar inventario, agendar citas, generar pre-cotizaciones, clasificar tickets..."
                  />
                  <FieldTextarea
                    label="¿Qué tareas quedan explícitamente fuera del alcance del agente?"
                    value={answers.outOfScopeTasks}
                    onChange={(v) => updateField("outOfScopeTasks", v)}
                    placeholder="Ej. Autorizar descuentos especiales, cancelar facturas o negociar contratos especiales..."
                  />
                  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 hover:border-slate-500 focus-within:border-indigo-400 transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-slate-200">
                      ¿El agente debe tomar decisiones autónomas o siempre escalar a un humano?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AUTONOMY_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateField("autonomyLevel", opt)}
                          className={clsx(
                            "px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left",
                            answers.autonomyLevel === opt
                              ? "bg-indigo-600 border-indigo-400 text-white shadow-xs"
                              : "bg-slate-900/80 border-slate-600/90 text-slate-200 hover:border-indigo-400/70"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={answers.autonomyLevel}
                      onChange={(e) => updateField("autonomyLevel", e.target.value)}
                      placeholder="O detalla aquí las reglas de autonomía y escalamiento..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Section 4 */}
              {activeSection === 4 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 hover:border-slate-500 transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-slate-200">
                      ¿Quiénes usarán el agente? (Selecciona todos los que apliquen)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {TARGET_USER_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleArrayOption("targetUsers", opt)}
                          className={clsx(
                            "px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all",
                            toStringArray(answers.targetUsers).includes(opt)
                              ? "bg-indigo-600 border-indigo-400 text-white shadow-xs"
                              : "bg-slate-900/80 border-slate-600/90 text-slate-200 hover:border-indigo-400/70"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FieldInput
                    label="Número aproximado de usuarios"
                    value={answers.approxUserCount}
                    onChange={(v) => updateField("approxUserCount", v)}
                    placeholder="Ej. 15 usuarios internos / ~500 clientes al mes"
                  />
                  <FieldInput
                    label="Volumen esperado de interacciones por día / semana"
                    value={answers.interactionVolume}
                    onChange={(v) => updateField("interactionVolume", v)}
                    placeholder="Ej. 80 conversaciones diarias / 500 por semana"
                  />
                  <FieldInput
                    label="Horarios de operación (24/7, horario laboral, etc.)"
                    value={answers.operatingHours}
                    onChange={(v) => updateField("operatingHours", v)}
                    placeholder="Ej. 24/7 todo el año"
                  />
                </div>
              )}

              {/* Section 5 */}
              {activeSection === 5 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 hover:border-slate-500 transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-slate-200">
                      ¿Por dónde debe operar? (Canales)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CHANNEL_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleArrayOption("channels", opt)}
                          className={clsx(
                            "px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all",
                            toStringArray(answers.channels).includes(opt)
                              ? "bg-indigo-600 border-indigo-400 text-white shadow-xs"
                              : "bg-slate-900/80 border-slate-600/90 text-slate-200 hover:border-indigo-400/70"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FieldTextarea
                    label="¿Con qué sistemas debe integrarse? (CRM, ERP, calendario, bases de datos, WhatsApp Business API, etc.)"
                    value={answers.systemsToIntegrate}
                    onChange={(v) => updateField("systemsToIntegrate", v)}
                    placeholder="Ej. HubSpot CRM, SAP / Odoo, Google Calendar, WhatsApp Business API..."
                  />
                  <FieldTextarea
                    label="¿Existen APIs o acceso técnico disponible a esos sistemas?"
                    value={answers.apiAvailability}
                    onChange={(v) => updateField("apiAvailability", v)}
                    placeholder="Ej. Sí contamos con API REST y equipo técnico / No estamos seguros, lo confirmará TI..."
                  />
                </div>
              )}

              {/* Section 6 */}
              {activeSection === 6 && (
                <div className="space-y-4">
                  <FieldTextarea
                    label="¿Qué información / documentos usará el agente como base de conocimiento?"
                    value={answers.knowledgeBaseDocs}
                    onChange={(v) => updateField("knowledgeBaseDocs", v)}
                    placeholder="Ej. Catálogo de productos y precios, políticas de garantía, preguntas frecuentes, manuales operativos..."
                  />
                  <FieldTextarea
                    label="¿Dónde están alojados esos datos y en qué formato?"
                    value={answers.dataHostingAndFormat}
                    onChange={(v) => updateField("dataHostingAndFormat", v)}
                    placeholder="Ej. Google Drive (PDFs y Google Sheets), Notion, base SQL en AWS..."
                  />
                  <FieldInput
                    label="¿Quién es el responsable de mantenerlos actualizados?"
                    value={answers.maintenanceOwner}
                    onChange={(v) => updateField("maintenanceOwner", v)}
                    placeholder="Ej. Gerencia Comercial / Área de Operaciones"
                  />
                </div>
              )}

              {/* Section 7 */}
              {activeSection === 7 && (
                <div className="space-y-4">
                  <FieldTextarea
                    label="¿Qué datos se consideran sensibles o confidenciales?"
                    value={answers.sensitiveData}
                    onChange={(v) => updateField("sensitiveData", v)}
                    placeholder="Ej. Datos fiscales, estados de cuenta, expedientes clínicos o precios mayoristas..."
                  />
                  <FieldTextarea
                    label="¿Existen políticas internas, normativas o regulaciones a cumplir (ej. Ley Federal de Protección de Datos)?"
                    value={answers.compliancePolicies}
                    onChange={(v) => updateField("compliancePolicies", v)}
                    placeholder="Ej. LFPDPPP en México, NDA corporativo, aviso de privacidad..."
                  />
                  <FieldInput
                    label="¿Requieren que los datos no salgan de cierta infraestructura o región?"
                    value={answers.dataResidency}
                    onChange={(v) => updateField("dataResidency", v)}
                    placeholder="Ej. Nube privada en EE.UU./México o sin restricción mientras esté cifrado"
                  />
                </div>
              )}

              {/* Section 8 */}
              {activeSection === 8 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 hover:border-slate-500 focus-within:border-indigo-400 transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-slate-200">
                      Presupuesto aproximado destinado al proyecto
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {BUDGET_RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateField("estimatedBudget", opt)}
                          className={clsx(
                            "px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
                            answers.estimatedBudget === opt
                              ? "bg-indigo-600 border-indigo-400 text-white shadow-xs"
                              : "bg-slate-900/80 border-slate-600/90 text-slate-200 hover:border-indigo-400/70"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={answers.estimatedBudget}
                      onChange={(e) => updateField("estimatedBudget", e.target.value)}
                      placeholder="O escribe aquí tu presupuesto estimado o esquema deseado..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <FieldInput
                    label="Fecha ideal de puesta en marcha"
                    value={answers.idealLaunchDate}
                    onChange={(v) => updateField("idealLaunchDate", v)}
                    placeholder="Ej. En 4 semanas / Próximo trimestre"
                  />
                  <FieldInput
                    label="Idioma(s) de operación"
                    value={answers.operatingLanguages}
                    onChange={(v) => updateField("operatingLanguages", v)}
                    placeholder="Ej. Español e Inglés"
                  />
                  <FieldInput
                    label="¿Quién aprobará el diseño y quién será el usuario clave (sponsor)?"
                    value={answers.approverAndSponsor}
                    onChange={(v) => updateField("approverAndSponsor", v)}
                    placeholder="Ej. Aprueba Dirección General / Sponsor: Director de Operaciones"
                  />
                </div>
              )}

              {/* Section 9 */}
              {activeSection === 9 && (
                <div className="space-y-4">
                  <FieldTextarea
                    label="¿Cómo medirán que el agente funciona bien? (KPIs)"
                    value={answers.kpis}
                    onChange={(v) => updateField("kpis", v)}
                    placeholder="Ej. Tiempo de respuesta < 30 seg, % de casos resueltos sin humano, citas agendadas, ahorro de horas..."
                  />
                  <FieldTextarea
                    label="¿Qué resultado justificaría considerar el proyecto un éxito a 3 y 6 meses?"
                    value={answers.successAt3And6Months}
                    onChange={(v) => updateField("successAt3And6Months", v)}
                    placeholder="Ej. A 3 meses automatizar 60% de atención inicial; a 6 meses incrementar conversión 25%..."
                  />
                </div>
              )}

              {/* Section 10: Observations, Full Executive Summary Review, Optional Attachments & Final Submit */}
              {activeSection === 10 && (
                <div className="space-y-5">
                  {/* Closing Guidance Banner */}
                  <div className="p-4 rounded-2xl bg-emerald-950/45 border border-emerald-400/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {voiceCompletedBanner
                            ? "Entrevista por voz finalizada — Revisa tu resumen y observaciones"
                            : "Etapa Final: Observaciones, Resumen de Respuestas y Envío"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-200 leading-relaxed">
                        Verifica tus observaciones adicionales y el resumen de tus respuestas antes de presionar{" "}
                        <strong className="text-white">Enviar RFI</strong>. La carga de archivos al final es totalmente opcional.
                      </p>
                    </div>
                    {briefingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMode("voice");
                          startVoiceSession(briefingId, answersRef.current);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 flex-shrink-0 transition-all"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Dictar algo más con Nexia IA</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Dedicated Observations & Extra Comments Box FIRST */}
                  <div className="p-4 rounded-2xl bg-slate-800/85 border border-indigo-400/50 hover:border-indigo-400/80 focus-within:border-indigo-400 transition-colors space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-extrabold text-white">
                        1. Observaciones o comentarios adicionales
                      </label>
                      <span className="text-[10px] font-semibold text-indigo-300">
                        Puedes escribir o complementar cualquier comentario final aquí
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={answers.additionalComments}
                      onChange={(e) => updateField("additionalComments", e.target.value)}
                      placeholder="Agrega aquí cualquier observación extra, contexto especial, dudas o detalles adicionales que quieras considerar en tu propuesta (o déjalo en blanco si no requieres agregar nada más)..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/85 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none resize-y"
                    />
                  </div>

                  {/* 2. Readable Executive Summary of All Stages (1 to 9) */}
                  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-2.5">
                      <div>
                        <h3 className="text-xs font-extrabold text-white">
                          2. Resumen de tus respuestas registradas (Etapas 1 a 9)
                        </h3>
                        <p className="text-[11px] text-slate-300">
                          Revisa la información capturada; si deseas ajustar algún punto, toca <strong>Editar</strong> en esa etapa.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-[11px] font-bold text-indigo-200">
                        {completedSectionsCount}/10 etapas listas
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {[
                        {
                          sec: 1,
                          title: "1. Contexto y Objetivo",
                          items: [
                            ["Problema", answers.businessProblem],
                            ["Resultado esperado", answers.expectedOutcome],
                            ["IA previa", answers.previousAiInitiatives],
                          ],
                        },
                        {
                          sec: 2,
                          title: "2. Puesto / Proceso",
                          items: [
                            ["Proceso actual", answers.roleOrProcessDescription],
                            ["Tareas frecuentes", answers.periodicTasks],
                            ["% Automatizable", answers.automationPercentage],
                          ],
                        },
                        {
                          sec: 3,
                          title: "3. Funciones y Alcance",
                          items: [
                            ["Funciones", answers.specificFunctions],
                            ["Fuera de alcance", answers.outOfScopeTasks],
                            ["Autonomía", answers.autonomyLevel],
                          ],
                        },
                        {
                          sec: 4,
                          title: "4. Usuarios y Volumen",
                          items: [
                            ["Usuarios", toStringArray(answers.targetUsers).join(", ")],
                            ["Volumen", answers.interactionVolume || answers.approxUserCount],
                            ["Horario", answers.operatingHours],
                          ],
                        },
                        {
                          sec: 5,
                          title: "5. Canales y Sistemas",
                          items: [
                            ["Canales", toStringArray(answers.channels).join(", ")],
                            ["Sistemas", answers.systemsToIntegrate],
                            ["APIs", answers.apiAvailability],
                          ],
                        },
                        {
                          sec: 6,
                          title: "6. Datos y Conocimiento",
                          items: [
                            ["Documentos base", answers.knowledgeBaseDocs],
                            ["Alojamiento", answers.dataHostingAndFormat],
                            ["Responsable", answers.maintenanceOwner],
                          ],
                        },
                        {
                          sec: 7,
                          title: "7. Seguridad y Privacidad",
                          items: [
                            ["Datos sensibles", answers.sensitiveData],
                            ["Normativas", answers.compliancePolicies],
                            ["Región / Nube", answers.dataResidency],
                          ],
                        },
                        {
                          sec: 8,
                          title: "8. Presupuesto y Tiempos",
                          items: [
                            ["Presupuesto", answers.estimatedBudget],
                            ["Lanzamiento ideal", answers.idealLaunchDate],
                            ["Aprueba / Idiomas", [answers.approverAndSponsor, answers.operatingLanguages].filter(Boolean).join(" • ")],
                          ],
                        },
                        {
                          sec: 9,
                          title: "9. Métricas de Éxito",
                          items: [
                            ["KPIs", answers.kpis],
                            ["Éxito 3 y 6 meses", answers.successAt3And6Months],
                          ],
                        },
                      ].map((card) => {
                        const isDone = isSectionFilled(answers, card.sec);
                        const isPend = toNumberArray(answers.pendingSections).includes(card.sec);
                        const populated = card.items
                          .map(([lbl, val]) => [lbl, safeStr(val).trim()] as [string, string])
                          .filter(([, val]) => val.length > 0);
                        return (
                          <div
                            key={card.sec}
                            className="p-3 rounded-xl bg-slate-900/85 border border-slate-700/90 flex flex-col justify-between space-y-2"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-extrabold text-white flex items-center gap-1.5">
                                  {isDone ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                                  )}
                                  {card.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveSection(card.sec)}
                                  className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline flex-shrink-0"
                                >
                                  Editar
                                </button>
                              </div>

                              {populated.length > 0 ? (
                                <div className="space-y-1 text-[11px] text-slate-300">
                                  {populated.map(([lbl, val], i) => (
                                    <div key={i} className="line-clamp-2 leading-snug">
                                      <strong className="text-slate-200">{lbl}:</strong> {val}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px] italic text-amber-300/90">
                                  {isPend ? "Marcado pendiente para TI" : "Sin respuesta registrada aún"}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Optional Attachments LAST */}
                  <div className="p-4 rounded-2xl bg-slate-800/65 border border-slate-600/75 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-slate-200">
                        3. Documentos adjuntos (Opcional)
                      </label>
                      <span className="text-[10px] font-semibold text-slate-400">
                        Solo si deseas anexar manuales, diagramas o ejemplos
                      </span>
                    </div>
                    <label className="flex flex-col items-center justify-center border border-dashed border-slate-500/80 hover:border-indigo-400 rounded-2xl p-4 bg-slate-900/60 hover:bg-slate-900/85 cursor-pointer transition-all text-center">
                      {uploadingFiles ? (
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mb-1.5" />
                      ) : (
                        <Upload className="w-6 h-6 text-indigo-400 mb-1.5" />
                      )}
                      <span className="text-xs font-bold text-slate-200">
                        {uploadingFiles
                          ? "Subiendo documentos..."
                          : "Adjuntar PDFs, Word, Excel o imágenes (opcional, máx. 15 MB)"}
                      </span>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        disabled={uploadingFiles}
                        className="hidden"
                      />
                    </label>

                    {toAttachmentArray(answers.attachments).length > 0 && (
                      <div className="space-y-2 pt-2">
                        {toAttachmentArray(answers.attachments).map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/85 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-300 hover:underline truncate"
                              >
                                {att.name}
                              </a>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="text-rose-400 hover:text-rose-300 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Wizard Navigation Footer (Proportional & Balanced on Mobile & Desktop) */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-5 border-t border-slate-700/80">
                <button
                  type="button"
                  disabled={activeSection === 1}
                  onClick={() => handleSaveManualStep(Math.max(1, activeSection - 1))}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 disabled:opacity-40 text-xs font-bold flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveManualStep()}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-xs font-bold text-slate-200"
                  >
                    Guardar avance
                  </button>

                  {activeSection < 10 ? (
                    <button
                      type="button"
                      onClick={() => handleSaveManualStep(activeSection + 1)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/50 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                    >
                      <span>Siguiente</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingFinal}
                      onClick={handleFinalSubmit}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                    >
                      {submittingFinal ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Enviar RFI</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const FieldInput = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 hover:border-slate-500 focus-within:border-indigo-400 transition-colors space-y-2">
    <label className="block text-xs font-bold text-slate-200">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
    />
  </div>
);

const FieldTextarea = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => (
  <div className="p-4 rounded-2xl bg-slate-800/75 border border-slate-600/85 hover:border-slate-500 focus-within:border-indigo-400 transition-colors space-y-2">
    <label className="block text-xs font-bold text-slate-200">{label}</label>
    <textarea
      rows={3}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-600/90 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none resize-y"
    />
  </div>
);

class AiBriefingErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error("Error controlado en vista de Briefing IA:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-indigo-500/40 rounded-3xl p-7 text-center space-y-4 shadow-2xl">
            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
            <h2 className="text-lg font-black">Tu avance está resguardado</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Ocurrió un ajuste visual inesperado, pero todas tus respuestas están guardadas de forma segura. Presiona continuar para retomar tu diagnóstico.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
            >
              Continuar mi diagnóstico
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SafePublicAiBriefing: React.FC = () => (
  <AiBriefingErrorBoundary>
    <PublicAiBriefing />
  </AiBriefingErrorBoundary>
);

export default SafePublicAiBriefing;
