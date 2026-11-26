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
  isPlaceholderScreenSelection,
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
import { LOGO_COLOR_URL, LOGO_BLANCO_URL, NEXIA_URL } from "../utils/brandAssets";

/**
 * Valida que el registro cuente obligatoriamente con datos de identificación y
 * aceptación expresa del Aviso de Privacidad, Confidencialidad y Uso Ético de IA.
 */
const hasValidCoverIdentity = (a?: Partial<AiBriefingAnswers> | null): boolean => {
  if (!a) return false;
  return Boolean(
    safeStr(a.companyName).trim() &&
      safeStr(a.contactName).trim() &&
      safeStr(a.contactEmail).trim() &&
      a.privacyConsentAccepted === true
  );
};

/**
 * Combina estado remoto y local sin permitir JAMÁS que cadenas vacías ("") o booleanos
 * falsos de una pestaña recién abierta sobrescriban datos de portada, consentimiento o respuestas previas.
 */
const mergeAnswersPreservingIdentity = (
  base: Partial<AiBriefingAnswers> | null | undefined,
  incoming: Partial<AiBriefingAnswers> | null | undefined,
  topLevelFallback?: {
    companyName?: string;
    clientName?: string;
    email?: string;
    whatsapp?: string;
  }
): AiBriefingAnswers => {
  const cleanBase = sanitizeLegacyAnswers(base);
  const rawIncoming = incoming && typeof incoming === "object" ? incoming : {};
  const mergedRaw: Record<string, any> = { ...cleanBase };

  for (const [k, v] of Object.entries(rawIncoming)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (!v.trim() && safeStr((cleanBase as any)[k]).trim()) {
        continue;
      }
      mergedRaw[k] = v;
    } else if (k === "privacyConsentAccepted") {
      mergedRaw[k] = Boolean(cleanBase.privacyConsentAccepted || v);
    } else if (k === "observationsConfirmed") {
      mergedRaw[k] = Boolean(cleanBase.observationsConfirmed || v);
    } else if (Array.isArray(v)) {
      if (v.length === 0 && Array.isArray((cleanBase as any)[k]) && (cleanBase as any)[k].length > 0) {
        continue;
      }
      mergedRaw[k] = v;
    } else {
      mergedRaw[k] = v;
    }
  }

  if (topLevelFallback) {
    if (!safeStr(mergedRaw.companyName).trim() && safeStr(topLevelFallback.companyName).trim()) {
      mergedRaw.companyName = safeStr(topLevelFallback.companyName).trim();
    }
    if (!safeStr(mergedRaw.contactName).trim() && safeStr(topLevelFallback.clientName).trim()) {
      mergedRaw.contactName = safeStr(topLevelFallback.clientName).trim();
    }
    if (!safeStr(mergedRaw.contactEmail).trim() && safeStr(topLevelFallback.email).trim()) {
      mergedRaw.contactEmail = safeStr(topLevelFallback.email).trim();
    }
    if (!safeStr(mergedRaw.contactPhone).trim() && safeStr(topLevelFallback.whatsapp).trim()) {
      mergedRaw.contactPhone = safeStr(topLevelFallback.whatsapp).trim();
    }
  }

  return sanitizeLegacyAnswers(mergedRaw);
};

const PublicAiBriefing: React.FC = () => {
  const { clientId } = useParams<{ clientId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftParam = searchParams.get("draft");

  const [loadingInit, setLoadingInit] = useState(true);
  // No asignar draftParam antes de cargar Firestore para evitar que visibilitychange sobrescriba con respuestas vacías
  const [briefingId, setBriefingId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AiBriefingAnswers>(INITIAL_AI_BRIEFING_ANSWERS);
  const [step, setStep] = useState<"intro" | "welcome" | "workspace" | "submitted">("intro");
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

  // Telemetría interna de duración de voz y resguardo anti-borrado de portada
  const loadingInitRef = useRef<boolean>(true);
  const stepRef = useRef<"intro" | "welcome" | "workspace" | "submitted">("intro");
  const briefingIdRef = useRef<string | null>(null);
  const preUploadFolderRef = useRef<string>(
    `pre_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const linkedClientIdRef = useRef<string>(clientId || "");
  const answersRef = useRef<AiBriefingAnswers>(INITIAL_AI_BRIEFING_ANSWERS);
  const verifiedCoverRef = useRef<{
    companyName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    privacyConsentAccepted: boolean;
    privacyConsentAcceptedAt: string;
  } | null>(null);
  const activeSectionRef = useRef<number>(1);
  const wakeLockRef = useRef<any>(null);
  const manualDebounceRef = useRef<number | null>(null);
  const accumulatedVoiceSecondsRef = useRef<number>(0);
  const activeCallStartMsRef = useRef<number | null>(null);
  const flushedInCurrentCallRef = useRef<number>(0);
  const lastVoiceSessionAtRef = useRef<string>("");
  const hasSentTelegramRef = useRef<boolean>(false);

  useEffect(() => {
    loadingInitRef.current = loadingInit;
  }, [loadingInit]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    briefingIdRef.current = briefingId;
  }, [briefingId]);

  useEffect(() => {
    answersRef.current = answers;
    if (hasValidCoverIdentity(answers)) {
      verifiedCoverRef.current = {
        companyName: answers.companyName.trim(),
        contactName: answers.contactName.trim(),
        contactEmail: answers.contactEmail.trim(),
        contactPhone: answers.contactPhone.trim(),
        privacyConsentAccepted: true,
        privacyConsentAcceptedAt:
          answers.privacyConsentAcceptedAt ||
          verifiedCoverRef.current?.privacyConsentAcceptedAt ||
          "",
      };
    }
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
      // PROHIBIDO guardar mientras carga Firestore, si aún está en portada ('welcome') o sin identidad/consentimiento válido
      if (
        document.visibilityState === "hidden" &&
        !loadingInitRef.current &&
        stepRef.current === "workspace" &&
        briefingIdRef.current &&
        hasValidCoverIdentity(answersRef.current)
      ) {
        const snapshotAns: AiBriefingAnswers = {
          ...answersRef.current,
          lastActiveSection: activeSectionRef.current,
        };
        saveLocalSnapshot(briefingIdRef.current, snapshotAns);
        syncVoiceTelemetryToFirestore(briefingIdRef.current, false);
        setDoc(
          doc(db, "briefings", briefingIdRef.current),
          {
            companyName: snapshotAns.companyName.trim(),
            clientName: snapshotAns.contactName.trim(),
            email: snapshotAns.contactEmail.trim(),
            whatsapp: snapshotAns.contactPhone.trim(),
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

    const applyLoadedDraft = async (id: string, data: Record<string, any>) => {
      setBriefingId(id);
      briefingIdRef.current = id;
      const effectiveClientId =
        typeof data.clientId === "string" && data.clientId.trim()
          ? data.clientId.trim()
          : clientId || "";
      if (effectiveClientId) {
        linkedClientIdRef.current = effectiveClientId;
      }
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

      const topLevelFallback = {
        companyName: safeStr(data.companyName),
        clientName: safeStr(data.clientName),
        email: safeStr(data.email),
        whatsapp: safeStr(data.whatsapp),
      };

      let cleaned = mergeAnswersPreservingIdentity(data.answers, null, topLevelFallback);

      // Si el navegador guardó un snapshot local más reciente antes de entrar en suspensión, fusionarlo sin borrar campos existentes
      try {
        const rawSnap = localStorage.getItem(`interpres_ai_rfi_snapshot_${id}`);
        if (rawSnap) {
          const parsedSnap = JSON.parse(rawSnap);
          const firestoreMs = (data.updatedAt?.seconds || data.createdAt?.seconds || 0) * 1000;
          if (parsedSnap?.answers && Number(parsedSnap.updatedAtMs || 0) > firestoreMs) {
            cleaned = mergeAnswersPreservingIdentity(cleaned, parsedSnap.answers, topLevelFallback);
          }
        }
      } catch {}

      // Si faltan datos de contacto pero existe un clientId vinculado, recuperarlos de 'clients'
      if (
        effectiveClientId &&
        (!cleaned.companyName.trim() || !cleaned.contactName.trim() || !cleaned.contactEmail.trim())
      ) {
        try {
          const clientSnap = await getDoc(doc(db, "clients", effectiveClientId));
          if (clientSnap.exists()) {
            const c = clientSnap.data();
            cleaned = mergeAnswersPreservingIdentity(cleaned, null, {
              companyName: safeStr(c.companyName),
              clientName: safeStr(c.name),
              email: safeStr(c.email),
              whatsapp: safeStr(c.phone || c.whatsapp),
            });
          }
        } catch {}
      }

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

      if (hasValidCoverIdentity(syncedAnswers)) {
        verifiedCoverRef.current = {
          companyName: syncedAnswers.companyName.trim(),
          contactName: syncedAnswers.contactName.trim(),
          contactEmail: syncedAnswers.contactEmail.trim(),
          contactPhone: syncedAnswers.contactPhone.trim(),
          privacyConsentAccepted: true,
          privacyConsentAcceptedAt: syncedAnswers.privacyConsentAcceptedAt || "",
        };
      }

      if (
        hasValidCoverIdentity(syncedAnswers) &&
        (cleaned.operatingHours !== (data.answers?.operatingHours || "") ||
          cleaned.operatingLanguages !== (data.answers?.operatingLanguages || "") ||
          !Array.isArray(data.answers?.targetUsers) ||
          !Array.isArray(data.answers?.channels))
      ) {
        setDoc(doc(db, "briefings", id), { answers: syncedAnswers }, { merge: true }).catch(() => {});
      }

      // CANDADO OBLIGATORIO DE PORTADA: Nadie entra al workspace ni da por enviado sin Identidad + Privacidad aceptada
      if (!hasValidCoverIdentity(syncedAnswers)) {
        localStorage.setItem(storageDraftKey, id);
        setStep("welcome");
        setWelcomeError(
          "Por seguridad y trazabilidad, confirma Empresa, Nombre del contacto, Correo electrónico y el Aviso de Privacidad para continuar con este diagnóstico."
        );
        return;
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
            await applyLoadedDraft(snap.id, snap.data());
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
            await applyLoadedDraft(clientDrafts[0].id, clientDrafts[0].data);
            setLoadingInit(false);
            return;
          }
        }

        // 3. Revisar memoria local del navegador (cuando el usuario vuelve a abrir /#/briefing/ia)
        const rememberedId = localStorage.getItem(storageDraftKey);
        if (rememberedId) {
          const remSnap = await getDoc(doc(db, "briefings", rememberedId));
          if (remSnap.exists() && remSnap.data()?.status === "draft") {
            await applyLoadedDraft(remSnap.id, remSnap.data());
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
              contactPhone: c.phone || c.whatsapp || prev.contactPhone,
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

  // Crea o vincula automáticamente al prospecto en la colección 'clients' sin duplicar registros
  const syncAiProspectToClients = useCallback(
    async (ans: AiBriefingAnswers): Promise<string> => {
      try {
        const cleanName = ans.contactName.trim();
        const cleanCompany = ans.companyName.trim();
        const cleanEmail = ans.contactEmail.trim().toLowerCase();
        const cleanPhone = ans.contactPhone.trim();

        if (!cleanName && !cleanCompany && !cleanEmail) {
          return linkedClientIdRef.current || clientId || "";
        }

        let targetClientId = linkedClientIdRef.current || clientId || "";

        // 1. Si aún no hay clientId vinculado, buscar en 'clients' por correo para no duplicar
        if (!targetClientId && cleanEmail) {
          const allClientsSnap = await getDocs(collection(db, "clients"));
          allClientsSnap.forEach((cDoc) => {
            if (targetClientId) return;
            const cData = cDoc.data();
            if (String(cData.email || "").trim().toLowerCase() === cleanEmail) {
              targetClientId = cDoc.id;
            }
          });
        }

        // 2. Si ya existe el cliente, enriquecer datos faltantes sin sobrescribir su estatus Activo
        if (targetClientId) {
          const existingSnap = await getDoc(doc(db, "clients", targetClientId));
          if (existingSnap.exists()) {
            const ex = existingSnap.data();
            const patch: Record<string, any> = { id: targetClientId };
            if (!ex.companyName && cleanCompany) patch.companyName = cleanCompany;
            if (!ex.phone && cleanPhone) patch.phone = cleanPhone;
            if (!ex.whatsapp && cleanPhone) patch.whatsapp = cleanPhone;
            if (!ex.email && cleanEmail) patch.email = cleanEmail;
            if (ans.businessProblem.trim() && !String(ex.notes || "").includes(ans.businessProblem.trim().slice(0, 30))) {
              patch.notes = ex.notes
                ? `${ex.notes}\n• RFI IA: ${ans.businessProblem.trim()}`
                : `RFI IA: ${ans.businessProblem.trim()}`;
            }
            await setDoc(doc(db, "clients", targetClientId), patch, { merge: true });
            linkedClientIdRef.current = targetClientId;
            return targetClientId;
          }
        }

        // 3. Crear nuevo registro de Prospecto en el módulo de Clientes
        const newClientPayload: Record<string, any> = {
          name: cleanName || cleanCompany || "Prospecto IA",
          companyName: cleanCompany || cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          whatsapp: cleanPhone,
          serviceType: "Automatización y Agentes de IA",
          responsiblePerson: "Interpres Digital",
          contactMethod: cleanPhone ? "WhatsApp" : "Email",
          acquisitionSource: "Briefing IA (RFI)",
          contractStartDate: new Date().toISOString().split("T")[0],
          status: "Prospecto",
          notes: ans.businessProblem.trim()
            ? `RFI IA: ${ans.businessProblem.trim()}`
            : "Registrado automáticamente desde el Diagnóstico Ejecutivo de Agentes de IA.",
        };

        const createdClient = await addDoc(collection(db, "clients"), newClientPayload);
        await setDoc(doc(db, "clients", createdClient.id), { id: createdClient.id }, { merge: true });
        linkedClientIdRef.current = createdClient.id;
        return createdClient.id;
      } catch (err) {
        console.warn("Error sincronizando cliente desde Briefing IA:", err);
        return linkedClientIdRef.current || clientId || "";
      }
    },
    [clientId]
  );

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
        // Blindaje anti-borrado: jamás permitir que campos de portada ya verificados se sobrescriban en blanco
        const coverGuard = verifiedCoverRef.current;
        const protectedAnswers: AiBriefingAnswers = {
          ...nextAnswers,
          companyName: nextAnswers.companyName.trim() || coverGuard?.companyName || "",
          contactName: nextAnswers.contactName.trim() || coverGuard?.contactName || "",
          contactEmail: nextAnswers.contactEmail.trim() || coverGuard?.contactEmail || "",
          contactPhone: nextAnswers.contactPhone.trim() || coverGuard?.contactPhone || "",
          privacyConsentAccepted: Boolean(
            nextAnswers.privacyConsentAccepted || coverGuard?.privacyConsentAccepted
          ),
          privacyConsentAcceptedAt:
            nextAnswers.privacyConsentAcceptedAt || coverGuard?.privacyConsentAcceptedAt || "",
        };

        if (hasValidCoverIdentity(protectedAnswers)) {
          verifiedCoverRef.current = {
            companyName: protectedAnswers.companyName.trim(),
            contactName: protectedAnswers.contactName.trim(),
            contactEmail: protectedAnswers.contactEmail.trim(),
            contactPhone: protectedAnswers.contactPhone.trim(),
            privacyConsentAccepted: true,
            privacyConsentAcceptedAt: protectedAnswers.privacyConsentAcceptedAt || "",
          };
        }

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
          clientId: linkedClientIdRef.current || clientId || "",
          companyName: protectedAnswers.companyName.trim(),
          clientName: protectedAnswers.contactName.trim(),
          email: protectedAnswers.contactEmail.trim(),
          whatsapp: protectedAnswers.contactPhone.trim(),
          voiceDurationSeconds: currentVoiceSecs,
          answers: protectedAnswers,
          updatedAt: serverTimestamp(),
        };

        if (lastVoiceSessionAtRef.current) {
          payload.lastVoiceSessionAt = lastVoiceSessionAtRef.current;
        }

        if (statusOverride === "completed") {
          payload.completedAt = serverTimestamp();
        }

        if (currentId) {
          saveLocalSnapshot(currentId, protectedAnswers);
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
          saveLocalSnapshot(created.id, protectedAnswers);
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

    // Crear o vincular automáticamente el prospecto en el módulo de Clientes antes de guardar el briefing
    await syncAiProspectToClients(stampedAnswers);

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

    // Combinar memoria en vivo con el borrador remoto más reciente sin sobrescribir campos de portada ya guardados
    let freshAnswers: AiBriefingAnswers = mergeAnswersPreservingIdentity(
      answersRef.current,
      currentAns || null
    );
    try {
      const latestSnap = await getDoc(doc(db, "briefings", targetBriefingId));
      if (latestSnap.exists()) {
        const snapData = latestSnap.data();
        freshAnswers = mergeAnswersPreservingIdentity(snapData?.answers, freshAnswers, {
          companyName: safeStr(snapData?.companyName),
          clientName: safeStr(snapData?.clientName),
          email: safeStr(snapData?.email),
          whatsapp: safeStr(snapData?.whatsapp),
        });
      }
    } catch {
      // Si hay latencia momentánea, continuar con freshAnswers
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
          // Impedir que frases comodín de voz sobrescriban un rango de presupuesto elegido con botón en pantalla
          if (
            typeof nextPartial.estimatedBudget === "string" &&
            isPlaceholderScreenSelection(nextPartial.estimatedBudget)
          ) {
            delete nextPartial.estimatedBudget;
          }
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
      voiceRef.current?.syncExternalAnswers(next);
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
      voiceRef.current?.syncExternalAnswers(next);
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

  // File Upload (disponible tanto en la Página Previa de Bienvenida como en la Etapa 10)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    try {
      // Solo crear/actualizar documento en Firestore si ya existe briefingId o ya hay identidad de portada completa;
      // si el cliente adjunta archivos desde la página previa de bienvenida, subirlos a Storage y conservarlos en memoria hasta iniciar.
      let targetFolder = briefingId || preUploadFolderRef.current;
      let activeDraftId = briefingId;
      if (!activeDraftId && hasValidCoverIdentity(answers)) {
        activeDraftId = await persistDraft(answers, null, "draft");
        targetFolder = activeDraftId;
      }

      const uploaded: AiBriefingAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 15 * 1024 * 1024) {
          alert(`El archivo "${file.name}" supera el límite de 15 MB.`);
          continue;
        }
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const storageRef = ref(storage, `ai_briefing_attachments/${targetFolder}/${safeName}`);
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
        const next: AiBriefingAnswers = {
          ...answersRef.current,
          ...answers,
          attachments: [...toAttachmentArray(answers.attachments), ...uploaded],
        };
        setAnswers(next);
        answersRef.current = next;
        if (activeDraftId) {
          await persistDraft(next, activeDraftId, "draft");
        }
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
    const next: AiBriefingAnswers = {
      ...answersRef.current,
      ...answers,
      attachments: toAttachmentArray(answers.attachments).filter((_, i) => i !== idx),
    };
    setAnswers(next);
    answersRef.current = next;
    if (briefingId) await persistDraft(next, briefingId, "draft");
  };

  const handleFinalSubmit = async () => {
    const coverGuard = verifiedCoverRef.current;
    const effectiveAnswers: AiBriefingAnswers = {
      ...answersRef.current,
      ...answers,
      companyName: answers.companyName.trim() || coverGuard?.companyName || "",
      contactName: answers.contactName.trim() || coverGuard?.contactName || "",
      contactEmail: answers.contactEmail.trim() || coverGuard?.contactEmail || "",
      contactPhone: answers.contactPhone.trim() || coverGuard?.contactPhone || "",
      privacyConsentAccepted: Boolean(
        answers.privacyConsentAccepted || coverGuard?.privacyConsentAccepted
      ),
      privacyConsentAcceptedAt:
        answers.privacyConsentAcceptedAt || coverGuard?.privacyConsentAcceptedAt || "",
    };

    // Validación final inquebrantable antes de enviar el RFI
    if (!hasValidCoverIdentity(effectiveAnswers)) {
      setAnswers(effectiveAnswers);
      answersRef.current = effectiveAnswers;
      setWelcomeError(
        "Antes de enviar tu diagnóstico, por favor completa Empresa solicitante, Nombre del contacto, Correo electrónico y acepta el Aviso de Privacidad. Todas tus respuestas de las 10 etapas están resguardadas."
      );
      setStep("welcome");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setAnswers(effectiveAnswers);
    answersRef.current = effectiveAnswers;
    captureElapsedVoiceSeconds(true);
    voiceRef.current?.stop();
    setSubmittingFinal(true);
    try {
      await syncAiProspectToClients(effectiveAnswers);
      await persistDraft(effectiveAnswers, briefingId, "completed");

      const computedMode: "voice" | "manual" | "hybrid" =
        usedVoiceOnce && usedManualOnce
          ? "hybrid"
          : usedVoiceOnce
          ? "voice"
          : "manual";
      const filledCount = AI_RFI_SECTIONS.filter((s) =>
        isSectionFilled(effectiveAnswers, s.number)
      ).length;

      await sendTelegramAiBriefingNotification({
        companyName: effectiveAnswers.companyName.trim(),
        contactName: effectiveAnswers.contactName.trim(),
        contactEmail: effectiveAnswers.contactEmail.trim(),
        contactPhone: effectiveAnswers.contactPhone.trim(),
        completionMode: computedMode,
        completedSectionsCount: filledCount,
        businessProblem: effectiveAnswers.businessProblem,
        estimatedBudget: effectiveAnswers.estimatedBudget,
        idealLaunchDate: effectiveAnswers.idealLaunchDate,
        attachmentsCount: (effectiveAnswers.attachments || []).length,
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
      <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#1464B8] animate-spin" />
      </div>
    );
  }

  // SUBMITTED SCREEN
  if (step === "submitted") {
    return (
      <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white border border-[#C7D5E2] rounded-3xl p-8 md:p-10 text-center shadow-[0_24px_60px_-15px_rgba(16,43,75,0.10)] space-y-6">
          <img src={LOGO_COLOR_URL} alt="Interpres Digital Labs" className="h-14 mx-auto object-contain" />
          <div className="w-16 h-16 rounded-2xl bg-[#00A9B7]/12 border border-[#00A9B7]/35 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-[#00A9B7]" />
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-[#102B4B]">
            ¡RFI Recibido con Éxito!
          </h1>
          <p className="text-[#102B4B]/75 text-sm leading-relaxed">
            Gracias, <strong className="text-[#102B4B]">{answers.contactName}</strong>. Nuestro equipo de Arquitectura de IA en{" "}
            <strong className="text-[#1464B8]">Interpres Digital</strong> ya recibió la especificación de{" "}
            <strong className="text-[#102B4B]">{answers.companyName}</strong> y preparará tu propuesta técnica y económica a la medida.
          </p>
          <button
            onClick={() => {
              setStep("workspace");
              setActiveMode("manual");
            }}
            className="px-6 py-3 rounded-xl bg-[#F6F9FC] hover:bg-[#EBF2F8] border border-[#C7D5E2] text-xs font-bold text-[#102B4B] transition-all"
          >
            Revisar o complementar mis respuestas
          </button>
        </div>
      </div>
    );
  }

  const renderLegalModal = () =>
    showLegalModal ? (
      <div className="fixed inset-0 z-50 bg-[#071B36]/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white border border-[#C7D5E2] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-[#102B4B]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#C7D5E2]/80 bg-[#071B36] text-white">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#5FD9E4]" />
              <h2 className="font-display text-sm md:text-base font-extrabold text-white">
                Aviso de Privacidad, Confidencialidad y Uso Ético de IA
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowLegalModal(false)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-4 text-xs text-[#102B4B]/85 leading-relaxed">
            <p>
              En cumplimiento con la <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong> y los Términos y Condiciones de{" "}
              <strong>INTERPRES DIGITAL</strong> (marca comercial y plataforma tecnológica de <strong>INTERPRES S.A. de C.V.</strong>, con domicilio en San Miguel de Allende, Guanajuato, México), se informa lo siguiente respecto al presente Diagnóstico Ejecutivo (RFI):
            </p>

            <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1.5">
              <h3 className="font-extrabold text-[#008995] uppercase text-[11px] tracking-wider">
                1. Garantía de Uso Ético de Inteligencia Artificial (No Entrenamiento)
              </h3>
              <p>
                Este diagnóstico incorpora asistencia conversacional y procesamiento mediante Inteligencia Artificial empresarial exclusivamente para transcribir, estructurar tus requerimientos y apoyar en el pre-diagnóstico técnico.{" "}
                <strong>Ninguna grabación de voz, respuesta escrita ni documento adjunto se utiliza para entrenar, alimentar o mejorar modelos públicos o de terceros.</strong>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1.5">
              <h3 className="font-extrabold text-[#1464B8] uppercase text-[11px] tracking-wider">
                2. Titularidad de la Información y Confidencialidad (Cláusulas 15 y 47)
              </h3>
              <p>
                La empresa solicitante conserva en todo momento la titularidad única y exclusiva sobre su información operativa, comercial, flujos de trabajo y documentos adjuntos. <strong>INTERPRES S.A. de C.V.</strong> resguarda dicha información bajo estricta confidencialidad y no vende ni comercializa datos personales o corporativos con terceros.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1.5">
              <h3 className="font-extrabold text-[#1464B8] uppercase text-[11px] tracking-wider">
                3. Finalidad del Tratamiento e Infraestructura Segura
              </h3>
              <p>
                Los datos de contacto y especificaciones técnicas recabados se emplean únicamente para evaluar la viabilidad del proyecto, diseñar la arquitectura del Agente de IA y presentar la propuesta técnica y económica correspondiente, operando sobre infraestructura cifrada (Google Cloud / Firebase).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1.5">
              <h3 className="font-extrabold text-[#1464B8] uppercase text-[11px] tracking-wider">
                4. Declaración de Autorización y Licitud (Cláusula 30)
              </h3>
              <p>
                Al marcar la casilla de aceptación, el usuario declara contar con la representación, facultades o autorización suficiente por parte de la empresa solicitante para compartir la información descrita y los archivos adjuntos con fines de evaluación y cotización, evitando incluir bases de datos con datos personales sensibles de terceros no anonimizados.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1.5">
              <h3 className="font-extrabold text-[#1464B8] uppercase text-[11px] tracking-wider">
                5. Derechos ARCO y Consulta Integral
              </h3>
              <p>
                Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación u Oposición (ARCO) o revocar tu consentimiento escribiendo a{" "}
                <a href="mailto:admin@interpresdigital.com" className="text-[#1464B8] font-bold underline">
                  admin@interpresdigital.com
                </a>
                . El Aviso de Privacidad Integral y los Términos y Condiciones completos están disponibles permanentemente en el pie de página de{" "}
                <a
                  href="https://interpresdigital.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1464B8] font-bold underline"
                >
                  interpresdigital.com
                </a>
                .
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-[#C7D5E2]/80 bg-[#F6F9FC] flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowLegalModal(false)}
              className="px-4 py-2 rounded-xl bg-white hover:bg-[#EBF2F8] border border-[#C7D5E2] text-xs font-bold text-[#102B4B] cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => {
                setWelcomeError(null);
                setAnswers((prev) => {
                  const next = {
                    ...prev,
                    privacyConsentAccepted: true,
                    privacyConsentAcceptedAt:
                      prev.privacyConsentAcceptedAt ||
                      new Date().toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      }),
                  };
                  answersRef.current = next;
                  return next;
                });
                setShowLegalModal(false);
              }}
              className="px-5 py-2 rounded-xl bg-[#1464B8] hover:bg-[#10539A] text-xs font-extrabold text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Aceptar Aviso y Continuar</span>
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // STEP PRE-0: PÁGINA PREVIA INFORMATIVA DE BIENVENIDA Y ACCESO CON NEXIA IA
  if (step === "intro") {
    const attachedList = toAttachmentArray(answers.attachments);

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#EAF1F8] via-[#F6F9FC] to-[#E5F2F6] text-[#102B4B] flex flex-col">
        {/* Top Corporate Bar (alineada en una sola fila limpia en móvil y escritorio) */}
        <header className="bg-white/95 backdrop-blur-md border-b border-[#C7D5E2] px-3.5 sm:px-8 py-2.5 sm:py-3.5 sticky top-0 z-30">
          <div className="max-w-[1140px] mx-auto flex items-center justify-between gap-2.5">
            <img
              src={LOGO_COLOR_URL}
              alt="Interpres Digital Labs"
              className="h-8 sm:h-11 w-auto max-w-[146px] sm:max-w-none object-contain flex-shrink-0"
            />
            <div className="inline-flex items-center gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-[#00A9B7] flex-shrink-0" />
              <div className="flex flex-col text-left leading-[1.15]">
                <span className="text-[10px] sm:text-[11px] font-extrabold text-[#071B36]">
                  Diagnóstico Confidencial
                </span>
                <span className="text-[9.5px] sm:text-[10.5px] font-semibold text-[#1464B8]">
                  Interpres Digital Labs
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[1140px] w-full mx-auto px-3.5 py-6 sm:px-6 sm:py-10 space-y-7">
          {/* 1. HERO CON NEXIA IA: ¿QUÉ ES EL BRIEFING DE IA Y CUÁL ES SU OBJETIVO? */}
          <section className="bg-gradient-to-br from-[#071B36] via-[#0B2850] to-[#11396E] text-white rounded-[28px] border border-[#1B3C68] shadow-[0_28px_70px_-18px_rgba(7,27,54,0.28)] overflow-hidden relative">
            <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#00A9B7]/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-[#1464B8]/25 blur-3xl" />

            <div className="relative z-10 p-6 sm:p-9 md:p-11 grid grid-cols-1 lg:grid-cols-12 gap-7 items-center">
              {/* Nexia IA Portrait Column */}
              <div className="lg:col-span-4 flex flex-col items-center text-center space-y-3.5">
                <div className="relative">
                  <div className="absolute -inset-2 rounded-[28px] bg-gradient-to-tr from-[#1464B8]/40 via-[#00A9B7]/45 to-transparent blur-xl pointer-events-none" />
                  <img
                    src={NEXIA_URL}
                    alt="Nexia IA — Consultora de Inteligencia Artificial"
                    className="relative w-44 h-44 sm:w-56 sm:h-56 rounded-[26px] object-cover border-2 border-[#5FD9E4]/65 shadow-2xl"
                  />
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap px-3.5 py-1 rounded-full bg-[#071B36] border border-[#00A9B7]/70 text-[11px] font-extrabold text-[#7CE8F0] shadow-md flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#00A9B7] animate-pulse" />
                    Nexia IA • Consultora Activa
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 pt-2 max-w-[260px] leading-snug">
                  Especialista conversacional de <strong>Interpres Digital Labs</strong> para levantamiento arquitectónico de IA.
                </p>
              </div>

              {/* Welcome & Objective Explanation */}
              <div className="lg:col-span-8 space-y-5">
                <div className="flex justify-center">
                  <div className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00A9B7]/20 border border-[#00A9B7]/45 text-[#8FF0F7] text-[10.5px] sm:text-[11px] font-extrabold uppercase tracking-wider text-center">
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Guía Previa e Instrucciones de Acceso</span>
                  </div>
                </div>

                <h1 className="font-display text-2xl sm:text-3xl md:text-[38px] font-extrabold tracking-tight leading-[1.14] text-white text-center lg:text-left">
                  Bienvenido al Diagnóstico Ejecutivo para{" "}
                  <span className="text-[#5FD9E4]">Diseño de Agentes de IA y Automatizaciones</span>
                </h1>

                <p className="text-slate-200 text-sm sm:text-[15px] leading-relaxed text-center lg:text-left">
                  Hola, soy <strong className="text-white">Nexia IA</strong>. Antes de iniciar, te comparto cómo funciona este{" "}
                  <strong className="text-white">Briefing Ejecutivo (RFI)</strong> para que aproveches al máximo la herramienta y conozcas cómo protegemos tu información.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="p-4 rounded-2xl bg-[#0C2548]/90 border border-white/15 space-y-1.5">
                    <h2 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#7CE8F0]">
                      ¿Qué es este Briefing de IA?
                    </h2>
                    <p className="text-xs text-slate-200/95 leading-relaxed">
                      Es un levantamiento consultivo estructurado en <strong>10 etapas clave</strong> para comprender cómo opera hoy tu negocio, qué tareas consumen tiempo operativo, con qué sistemas trabajas y bajo qué reglas de seguridad debe actuar la tecnología.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0C2548]/90 border border-white/15 space-y-1.5">
                    <h2 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#7CE8F0]">
                      ¿Cuál es el objetivo?
                    </h2>
                    <p className="text-xs text-slate-200/95 leading-relaxed">
                      Obtener los criterios reales de negocio y de TI para diseñar una <strong>arquitectura a la medida</strong> —desde flujos automatizados e integraciones API/CRM/ERP hasta agentes autónomos— y entregarte una <strong>propuesta técnica y económica precisa</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2. MODALIDADES DE PARTICIPACIÓN */}
          <section className="bg-white rounded-3xl border border-[#C7D5E2] p-6 sm:p-8 shadow-xs space-y-5">
            <div className="space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1464B8]">
                Cómo puedes responderlo
              </span>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#071B36]">
                3 Modalidades Flexibles (Tú eliges en todo momento)
              </h2>
              <p className="text-xs sm:text-sm text-[#102B4B]/75">
                No estás atado a un solo formato: puedes empezar hablando con Nexia IA, cambiar al formulario escrito o compartir el avance con tu equipo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#071B36] text-[#5FD9E4] flex items-center justify-center">
                    <Mic className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#00A9B7]/15 text-[#007B86] text-[10px] font-extrabold uppercase">
                    Recomendada
                  </span>
                </div>
                <h3 className="font-display text-base font-extrabold text-[#071B36]">
                  1. Entrevista por Voz con Nexia IA
                </h3>
                <p className="text-xs text-[#102B4B]/75 leading-relaxed">
                  Conversa con voz natural como en una videollamada consultiva. Nexia te hace <strong>una sola pregunta breve por turno</strong>, sintetiza tus respuestas y llena cada bloque automáticamente en pantalla.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#1464B8]/12 text-[#1464B8] flex items-center justify-center">
                  <PenTool className="w-5 h-5" />
                </div>
                <h3 className="font-display text-base font-extrabold text-[#071B36]">
                  2. Formulario Ejecutivo por Escrito
                </h3>
                <p className="text-xs text-[#102B4B]/75 leading-relaxed">
                  Avanza paso a paso escribiendo tus respuestas directamente en los 10 bloques, con botones de selección rápida para canales, usuarios, autonomía y rangos de inversión.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#00A9B7]/15 text-[#008995] flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <h3 className="font-display text-base font-extrabold text-[#071B36]">
                  3. Híbrida y Colaborativa con TI
                </h3>
                <p className="text-xs text-[#102B4B]/75 leading-relaxed">
                  Alterna entre voz y texto cuando gustes. Si desconoces detalles técnicos (APIs, bases de datos o normativas), márcalos como <strong>&ldquo;Pendiente para TI&rdquo;</strong> y comparte el link único con tu equipo técnico.
                </p>
              </div>
            </div>
          </section>

          {/* 3. INSTRUCCIONES PRÁCTICAS Y MAPA DE LAS 10 ETAPAS */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Practical Instructions */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-[#C7D5E2] p-6 sm:p-7 shadow-xs space-y-4">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#008995]">
                  Instrucciones de uso
                </span>
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#071B36]">
                  Recomendaciones para tu sesión
                </h2>
              </div>

              <ul className="space-y-3 text-xs text-[#102B4B]/80 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#1464B8] text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    <strong className="text-[#071B36]">Duración y autoguardado:</strong> Toma entre <strong>8 y 12 minutos</strong>. Cada respuesta se guarda al instante; si cierras la ventana o se bloquea tu pantalla, retomarás exactamente en la etapa donde te quedaste.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#1464B8] text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    <strong className="text-[#071B36]">Habla en términos de tu negocio:</strong> No necesitas vocabulario técnico de programación; describe tus procesos actuales y el resultado que buscas lograr.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#1464B8] text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    <strong className="text-[#071B36]">Control total del micrófono:</strong> En modo Voz contarás con botones para <strong>Pausar a Nexia IA</strong>, <strong>Silenciar tu micrófono</strong> o pasar al formulario escrito en cualquier instante.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#1464B8] text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">
                    4
                  </span>
                  <span>
                    <strong className="text-[#071B36]">Revisión previa al envío:</strong> En la Etapa 10 verás un resumen ejecutivo editable de todas tus respuestas antes de enviar formalmente tu diagnóstico.
                  </span>
                </li>
              </ul>
            </div>

            {/* 10 Stages Overview */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-[#C7D5E2] p-6 sm:p-7 shadow-xs space-y-4">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1464B8]">
                  Estructura completa del RFI
                </span>
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#071B36]">
                  ¿Qué temas revisaremos en las 10 etapas?
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {[
                  ["1. Contexto y Objetivo", "Problema operativo a resolver, resultado esperado e iniciativas previas."],
                  ["2. Proceso Actual", "Rol o flujo que hoy ejecuta una persona, frecuencia e impacto."],
                  ["3. Funciones y Autonomía", "Acciones exactas del agente, límites fuera de alcance y escalamiento humano."],
                  ["4. Usuarios y Volumen", "Quién interactuará, cantidad estimada de mensajes/operaciones y horarios."],
                  ["5. Canales y Sistemas", "WhatsApp, Web, Correo, CRM, ERP, bases de datos y disponibilidad de APIs."],
                  ["6. Base de Conocimiento", "Manuales, catálogos, reglas de negocio y formato donde residen hoy."],
                  ["7. Seguridad y Privacidad", "Datos confidenciales, normativas (LFPDPPP) y residencia en la nube."],
                  ["8. Presupuesto y Tiempos", "Rango estimado de inversión, fecha meta de arranque, idiomas y sponsor."],
                  ["9. Métricas de Éxito (KPIs)", "Indicadores para medir retorno e impacto esperado a 3 y 6 meses."],
                  ["10. Observaciones y Cierre", "Comentarios finales, validación del resumen completo y envío."],
                ].map(([title, desc], i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2]/85 space-y-0.5"
                  >
                    <div className="font-display font-extrabold text-[#071B36] text-xs">{title}</div>
                    <p className="text-[11px] text-[#102B4B]/70 leading-snug">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 4. CARGA OPCIONAL DE DOCUMENTOS O ARCHIVOS DE APOYO DESDE EL INICIO */}
          <section className="bg-white rounded-3xl border border-[#C7D5E2] p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#008995]">
                  Documentación de apoyo (Opcional)
                </span>
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#071B36]">
                  ¿Deseas compartir archivos o documentos que ayuden al diagnóstico?
                </h2>
                <p className="text-xs text-[#102B4B]/75">
                  Puedes subir desde aquí diagramas de proceso, presentaciones, requerimientos técnicos, formatos actuales o manuales (también podrás adjuntar más archivos en la Etapa 10).
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-[#F6F9FC] border border-[#C7D5E2] text-[11px] font-bold text-[#102B4B]/70 self-start sm:self-center flex-shrink-0">
                Máx. 15 MB por archivo
              </span>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#96B4D2] hover:border-[#1464B8] rounded-2xl p-5 sm:p-6 bg-[#F6F9FC] hover:bg-[#EDF4FB] cursor-pointer transition-all text-center">
              {uploadingFiles ? (
                <Loader2 className="w-7 h-7 text-[#1464B8] animate-spin mb-2" />
              ) : (
                <Upload className="w-7 h-7 text-[#1464B8] mb-2" />
              )}
              <span className="text-xs sm:text-sm font-extrabold text-[#071B36]">
                {uploadingFiles
                  ? "Subiendo tus documentos de forma cifrada..."
                  : "Haz clic aquí para seleccionar PDF, Word, Excel, PowerPoint o imágenes"}
              </span>
              <span className="text-[11px] text-[#102B4B]/60 mt-1">
                Tus documentos quedan protegidos bajo confidencialidad y se vincularán automáticamente a tu expediente.
              </span>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                disabled={uploadingFiles}
                className="hidden"
              />
            </label>

            {attachedList.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-extrabold text-[#007B86] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#00A9B7]" />
                  <span>{attachedList.length} documento(s) listo(s) para incluirse en tu Briefing:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {attachedList.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F6F9FC] border border-[#C7D5E2] text-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileText className="w-4 h-4 text-[#1464B8] flex-shrink-0" />
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1464B8] font-bold hover:underline truncate"
                        >
                          {att.name}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer"
                        title="Quitar archivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 5. CANDADO OBLIGATORIO DE AVISO DE PRIVACIDAD, USO ÉTICO DE IA Y BOTÓN DE ACCESO */}
          <section
            className={clsx(
              "rounded-3xl border-2 p-6 sm:p-8 shadow-md transition-all space-y-5",
              answers.privacyConsentAccepted
                ? "bg-white border-[#00A9B7]"
                : "bg-white border-[#1464B8]/45"
            )}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#C7D5E2]/80 pb-4">
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1464B8] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#00A9B7]" />
                  Paso Requerido para Desbloquear el Acceso
                </span>
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-[#071B36]">
                  Privacidad, Confidencialidad y Uso Ético de Inteligencia Artificial
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowLegalModal(true)}
                className="px-4 py-2.5 rounded-xl bg-[#F6F9FC] hover:bg-[#EAF3FC] border border-[#1464B8]/40 text-xs font-extrabold text-[#1464B8] inline-flex items-center justify-center gap-2 transition-all cursor-pointer flex-shrink-0"
              >
                <FileText className="w-4 h-4" />
                <span>Leer Aviso Legal y Ético Completo</span>
              </button>
            </div>

            {/* Key Ethical & Legal Guarantees */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1">
                <div className="font-extrabold text-[#007B86] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#00A9B7]" />
                  <span>Cero Entrenamiento de IA</span>
                </div>
                <p className="text-[11px] text-[#102B4B]/75 leading-snug">
                  Tus respuestas de voz, textos y documentos adjuntos <strong>jamás</strong> se usan para entrenar modelos públicos o de terceros.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1">
                <div className="font-extrabold text-[#1464B8] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1464B8]" />
                  <span>Confidencialidad y LFPDPPP</span>
                </div>
                <p className="text-[11px] text-[#102B4B]/75 leading-snug">
                  Tu empresa conserva la titularidad exclusiva de su información bajo resguardo confidencial de <strong>INTERPRES S.A. de C.V.</strong>
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-1">
                <div className="font-extrabold text-[#071B36] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00A9B7]" />
                  <span>Uso Exclusivo de Propuesta</span>
                </div>
                <p className="text-[11px] text-[#102B4B]/75 leading-snug">
                  La información se utiliza únicamente para estructurar tu diagnóstico arquitectónico y cotización comercial.
                </p>
              </div>
            </div>

            {/* Mandatory Checkbox */}
            <div
              onClick={() => {
                const nextVal = !answers.privacyConsentAccepted;
                setWelcomeError(null);
                setAnswers((prev) => {
                  const next = {
                    ...prev,
                    privacyConsentAccepted: nextVal,
                    privacyConsentAcceptedAt: nextVal
                      ? new Date().toLocaleString("es-MX", {
                          timeZone: "America/Mexico_City",
                        })
                      : "",
                  };
                  answersRef.current = next;
                  return next;
                });
              }}
              role="checkbox"
              aria-checked={answers.privacyConsentAccepted}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  const nextVal = !answers.privacyConsentAccepted;
                  setWelcomeError(null);
                  setAnswers((prev) => {
                    const next = {
                      ...prev,
                      privacyConsentAccepted: nextVal,
                      privacyConsentAcceptedAt: nextVal
                        ? new Date().toLocaleString("es-MX", {
                            timeZone: "America/Mexico_City",
                          })
                        : "",
                    };
                    answersRef.current = next;
                    return next;
                  });
                }
              }}
              className={clsx(
                "p-4 rounded-2xl border-2 flex items-start gap-3.5 cursor-pointer select-none transition-all",
                answers.privacyConsentAccepted
                  ? "bg-[#00A9B7]/10 border-[#00A9B7]"
                  : "bg-[#F6F9FC] border-[#B8CCE0] hover:border-[#1464B8]"
              )}
            >
              <div
                className={clsx(
                  "w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all",
                  answers.privacyConsentAccepted
                    ? "bg-[#00A9B7] border-[#00A9B7] text-white shadow-sm"
                    : "bg-white border-[#7E97B3]"
                )}
              >
                {answers.privacyConsentAccepted && <Check className="w-4 h-4 stroke-[3]" />}
              </div>

              <div className="space-y-1 text-xs sm:text-sm text-[#102B4B]">
                <span className="font-extrabold block text-[#071B36]">
                  He leído y acepto el Aviso de Privacidad, Confidencialidad, Uso Ético de IA y Autorización de Información *
                </span>
                <span className="text-xs text-[#102B4B]/75 block leading-relaxed">
                  Confirmo que cuento con autorización para compartir la información y documentos ingresados con <strong>INTERPRES DIGITAL (INTERPRES S.A. de C.V.)</strong> para fines de diagnóstico técnico y elaboración de propuesta.
                </span>
              </div>
            </div>

            {/* Gate Action Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
              <div className="text-xs text-[#102B4B]/70 flex items-center gap-2">
                {answers.privacyConsentAccepted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#00A9B7] flex-shrink-0" />
                    <span className="font-bold text-[#007B86]">
                      Consentimiento verificado. Ya puedes ingresar al Briefing de IA.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span>
                      Marca la casilla de aceptación superior para habilitar el botón de ingreso al Briefing.
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={!answers.privacyConsentAccepted}
                onClick={() => {
                  setStep("welcome");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={clsx(
                  "w-full sm:w-auto px-7 py-3.5 rounded-2xl font-display flex items-center justify-center gap-3 transition-all",
                  answers.privacyConsentAccepted
                    ? "bg-gradient-to-r from-[#071B36] via-[#1464B8] to-[#00A9B7] hover:from-[#0A254A] hover:to-[#008C99] text-white shadow-lg shadow-[#1464B8]/25 cursor-pointer active:scale-[0.99]"
                    : "bg-[#DCE6F1] text-[#102B4B]/45 cursor-not-allowed"
                )}
              >
                <span className="flex flex-col items-center leading-[1.12] text-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                    Ingresar al
                  </span>
                  <span className="text-sm sm:text-[15px] font-extrabold">
                    Briefing de IA
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
              </button>
            </div>
          </section>
        </main>

        {renderLegalModal()}
      </div>
    );
  }

  // STEP 0: REGISTRO DEL SOLICITANTE Y ELECCIÓN DE MODALIDAD (UNA VEZ ACEPTADA LA BIENVENIDA)
  if (step === "welcome") {
    const attachedCount = toAttachmentArray(answers.attachments).length;

    return (
      <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center px-3 py-6 sm:p-6 md:p-10">
        <div className="max-w-[920px] w-full bg-white border border-[#C7D5E2] rounded-3xl overflow-hidden shadow-[0_28px_70px_-18px_rgba(16,43,75,0.12)]">
          {/* Immersive Deep Blue Header Banner */}
          <div className="bg-[#071B36] text-white px-5 py-6 sm:px-8 sm:py-8 md:px-10 relative overflow-hidden">
            <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-[#1464B8]/25 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 left-10 w-56 h-56 rounded-full bg-[#00A9B7]/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-5">
              <div className="flex items-center justify-between gap-2.5 border-b border-white/12 pb-4">
                <img src={LOGO_BLANCO_URL} alt="Interpres Digital Labs" className="h-8 sm:h-12 w-auto max-w-[148px] sm:max-w-none object-contain flex-shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    setStep("intro");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-slate-100 text-[10.5px] sm:text-[11px] font-bold transition-colors cursor-pointer flex-shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#7CE8F0] flex-shrink-0" />
                  <span className="sm:hidden">Guía previa</span>
                  <span className="hidden sm:inline">Volver a guía e instrucciones</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="space-y-2 max-w-[62ch]">
                  <h1 className="font-display text-xl sm:text-3xl md:text-[34px] font-extrabold tracking-tight leading-[1.15] text-white">
                    <span className="block">Diagnóstico Ejecutivo para</span>
                    <span className="block text-[#5FD9E4]">Diseño de Agentes de IA y Automatizaciones</span>
                  </h1>
                  <p className="text-slate-200/90 text-xs sm:text-[15px] leading-relaxed">
                    Ingresa tus datos corporativos para vincular tu expediente y elige si deseas iniciar conversando por voz con <strong className="text-[#7CE8F0]">Nexia IA</strong> o por escrito paso a paso.
                  </p>
                </div>

                {/* Official Nexia Portrait Badge */}
                <div className="hidden sm:flex items-center gap-3 bg-[#0C2548]/90 border border-white/15 rounded-2xl p-2.5 pr-4 flex-shrink-0 shadow-lg">
                  <img
                    src={NEXIA_URL}
                    alt="Nexia IA"
                    className="w-14 h-14 rounded-xl object-cover border border-[#00A9B7]/50"
                  />
                  <div>
                    <div className="text-xs font-extrabold text-white">Nexia IA</div>
                    <div className="text-[11px] text-[#7CE8F0] font-semibold">Lista para iniciar</div>
                    <div className="text-[10px] text-slate-300 mt-0.5">Voz en vivo • Formulario</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

            {/* Editorial Light Body */}
          <div className="p-4 sm:p-8 md:p-10 space-y-6">
            {attachedCount > 0 && (
              <div className="px-4 py-2.5 rounded-2xl bg-[#00A9B7]/10 border border-[#00A9B7]/40 text-xs text-[#007B86] font-bold flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#00A9B7] flex-shrink-0" />
                  <span>{attachedCount} documento(s) de apoyo adjuntado(s) y listos para tu expediente.</span>
                </span>
                <button
                  type="button"
                  onClick={() => setStep("intro")}
                  className="text-[11px] text-[#1464B8] underline font-extrabold cursor-pointer"
                >
                  Gestionar archivos
                </button>
              </div>
            )}
            {/* Identification Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] focus-within:bg-white transition-colors">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[#102B4B]/80 mb-1.5">
                  Empresa solicitante *
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={answers.companyName}
                    onChange={(e) => updateField("companyName", e.target.value)}
                    placeholder="Nombre de tu empresa"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] focus-within:bg-white transition-colors">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[#102B4B]/80 mb-1.5">
                  Nombre del contacto *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={answers.contactName}
                    onChange={(e) => updateField("contactName", e.target.value)}
                    placeholder="Tu nombre y cargo"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] focus-within:bg-white transition-colors">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[#102B4B]/80 mb-1.5">
                  Correo electrónico *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={answers.contactEmail}
                    onChange={(e) => updateField("contactEmail", e.target.value)}
                    placeholder="nombre@empresa.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] focus-within:bg-white transition-colors">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[#102B4B]/80 mb-1.5">
                  Teléfono / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    value={answers.contactPhone}
                    onChange={(e) => updateField("contactPhone", e.target.value)}
                    placeholder="+52 55 0000 0000"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Compact Mobile-First Privacy, Ethical AI & Authorization Consent */}
            <div
              className={clsx(
                "p-3.5 sm:p-4 rounded-2xl border transition-all space-y-2.5",
                answers.privacyConsentAccepted
                  ? "bg-[#00A9B7]/8 border-[#00A9B7]"
                  : welcomeError && !answers.privacyConsentAccepted
                  ? "bg-amber-50 border-amber-400"
                  : "bg-[#F6F9FC] border-[#C7D5E2]"
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
                      ? "bg-[#00A9B7] border-[#00A9B7] text-white shadow-sm"
                      : "bg-white border-[#8DA4BE] hover:border-[#1464B8]"
                  )}
                >
                  {answers.privacyConsentAccepted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                <p className="text-xs sm:text-[13px] text-[#102B4B] leading-snug">
                  <strong className="font-extrabold">Acepto el Aviso de Privacidad y Uso Ético de IA *</strong>
                  <span className="hidden sm:inline text-[#102B4B]/75">
                    {" "}— Confirmo autorización para compartir esta información bajo resguardo confidencial de INTERPRES DIGITAL.
                  </span>
                  <span className="sm:hidden text-[#102B4B]/75">
                    {" "}y confirmo autorización para compartir esta información.
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-[#C7D5E2]/70 text-[11px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1 text-[#008995] font-bold">
                    <Lock className="w-3 h-3 flex-shrink-0" />
                    Cero entrenamiento IA
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#1464B8] font-bold">
                    <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                    LFPDPPP
                  </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setShowLegalModal(true)}
                    className="w-full sm:w-auto justify-center px-3.5 py-2 sm:py-1.5 rounded-xl bg-white hover:bg-[#EBF2F8] border border-[#1464B8]/40 text-xs font-extrabold text-[#1464B8] shadow-xs inline-flex items-center gap-1.5 transition-all active:scale-[0.99]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#1464B8] flex-shrink-0" />
                    <span>Ver Aviso Legal y Privacidad →</span>
                  </button>
                  <a
                    href="https://interpresdigital.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:inline-flex items-center gap-1 text-[#102B4B]/60 hover:text-[#1464B8] font-semibold"
                  >
                    <span>Aviso Integral</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {welcomeError && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>{welcomeError}</span>
              </div>
            )}

            {/* Mode Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <button
                onClick={() => handleStartBriefing("voice")}
                disabled={savingDraft}
                className={clsx(
                  "group text-left p-4 sm:p-6 rounded-2xl border-2 transition-all text-white relative overflow-hidden",
                  answers.privacyConsentAccepted
                    ? "bg-gradient-to-br from-[#071B36] via-[#0E3A73] to-[#1464B8] hover:from-[#0A254B] hover:to-[#00A9B7] border-[#00A9B7]/60 shadow-xl shadow-[#1464B8]/20 active:scale-[0.99]"
                    : "bg-[#071B36]/85 border-[#C7D5E2] opacity-85 hover:opacity-100"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <img
                      src={NEXIA_URL}
                      alt="Nexia IA"
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover border border-[#00A9B7]/70 shadow-sm flex-shrink-0"
                    />
                    <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/15 flex items-center justify-center flex-shrink-0">
                      <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-[#7CE8F0]" />
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#00A9B7]/25 border border-[#00A9B7]/50 text-[#8FF0F7] text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap flex-shrink-0">
                    Recomendado • IA en Vivo
                  </span>
                </div>
                <h3 className="font-display text-lg font-extrabold text-white mb-1">
                  Entrevista por Voz con Nexia IA
                </h3>
                <p className="text-slate-200 text-xs leading-relaxed">
                  Platica con voz natural con Nexia IA, la inteligencia artificial de Interpres Digital, mientras ves cómo se llena tu RFI en tiempo real.
                </p>
              </button>

              <button
                onClick={() => handleStartBriefing("manual")}
                disabled={savingDraft}
                className={clsx(
                  "group text-left p-4 sm:p-6 rounded-2xl border-2 transition-all",
                  answers.privacyConsentAccepted
                    ? "bg-[#F6F9FC] hover:bg-white border-[#C7D5E2] hover:border-[#1464B8] shadow-sm active:scale-[0.99]"
                    : "bg-[#F6F9FC]/75 border-[#C7D5E2] opacity-85 hover:opacity-100"
                )}
              >
                <div className="flex items-center justify-between mb-3.5">
                  <div className="w-11 h-11 rounded-xl bg-white border border-[#C7D5E2] flex items-center justify-center shadow-xs">
                    <PenTool className="w-5 h-5 text-[#1464B8]" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-[#C7D5E2] text-[#102B4B]/80 text-[11px] font-bold uppercase tracking-wider">
                    Paso a Paso
                  </span>
                </div>
                <h3 className="font-display text-lg font-extrabold text-[#102B4B] mb-1">
                  Llenar Manualmente por Escrito
                </h3>
                <p className="text-[#102B4B]/70 text-xs leading-relaxed">
                  Responde las 10 secciones a tu ritmo, comparte el enlace con tu equipo de TI y adjunta archivos.
                </p>
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-[#102B4B]/65 pt-1">
              <ShieldCheck className="w-4 h-4 text-[#00A9B7]" />
              <span>Conexión cifrada • Puedes alternar entre voz y escritura o guardar avance para tu equipo técnico.</span>
            </div>
          </div>
        </div>

        {renderLegalModal()}
      </div>
    );
  }

  // WORKSPACE (HYBRID VOICE + MANUAL)
  return (
    <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex flex-col">
      {/* Top Sticky Light Editorial Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#C7D5E2] px-3 sm:px-6 md:px-8 py-2.5 sm:py-3.5 shadow-xs">
        <div className="max-w-[1240px] mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <img src={LOGO_COLOR_URL} alt="Interpres Digital Labs" className="h-8 sm:h-10 w-auto object-contain flex-shrink-0" />
            <div className="hidden sm:block h-6 w-px bg-[#C7D5E2]" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#102B4B] truncate max-w-[160px] sm:max-w-xs">
                {answers.companyName}
              </div>
              <div className="text-[11px] text-[#102B4B]/65 font-medium">
                Avance: {completedSectionsCount}/10 ({progressPercent}%)
                {savingDraft && " • Guardando..."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="bg-[#F6F9FC] p-1 rounded-xl border border-[#C7D5E2] flex items-center">
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
                    ? "bg-[#1464B8] text-white shadow-sm"
                    : "text-[#102B4B]/70 hover:text-[#102B4B]"
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
                    ? "bg-[#1464B8] text-white shadow-sm"
                    : "text-[#102B4B]/70 hover:text-[#102B4B]"
                )}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Formulario</span>
              </button>
            </div>

            {/* Share Draft with IT / Colleague */}
            <button
              onClick={handleCopyShareableLink}
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-white hover:bg-[#F6F9FC] border border-[#C7D5E2] text-xs font-bold flex items-center gap-1.5 text-[#102B4B] transition-all shadow-xs"
              title="Copia este enlace para compartir el avance con tu líder de TI u otro colega"
            >
              {copiedDraftLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00A9B7]" />
                  <span className="text-[#008995] text-[11px] sm:text-xs">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-[#1464B8]" />
                  <span className="hidden md:inline">Compartir con TI</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="max-w-[1240px] w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 px-3 py-4 sm:p-6 md:p-8">
        {/* Left Sidebar on Desktop / Secondary List on Mobile */}
        <aside className="order-2 lg:order-1 lg:col-span-4 space-y-3">
          <div className="bg-white border border-[#C7D5E2] rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-sm">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-[#C7D5E2]/70">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#102B4B]/75">
                Etapas del RFI (10 bloques)
              </span>
              <span className="text-xs font-extrabold text-[#1464B8]">{progressPercent}%</span>
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
                        ? "bg-[#00A9B7]/15 border-[#00A9B7] text-[#102B4B] scale-[1.01]"
                        : isCurrent
                        ? "bg-[#1464B8]/10 border-[#1464B8] text-[#102B4B] font-bold shadow-xs"
                        : "bg-[#F6F9FC] border-[#C7D5E2]/80 text-[#102B4B]/80 hover:bg-white hover:border-[#1464B8]/60"
                    )}
                  >
                    <span className="truncate pr-2">
                      {sec.number}. {sec.shortTitle}
                    </span>
                    {filled ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00A9B7] flex-shrink-0" />
                    ) : pending ? (
                      <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold flex-shrink-0">
                        Pendiente TI
                      </span>
                    ) : partial ? (
                      <span className="px-2 py-0.5 rounded bg-[#1464B8]/12 border border-[#1464B8]/35 text-[#1464B8] text-[10px] font-bold flex-shrink-0">
                        En curso
                      </span>
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-[#9EB2C8] flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#071B36] border border-[#1B3C68] rounded-2xl p-4 text-xs text-slate-200 space-y-1.5 shadow-sm">
            <div className="font-bold flex items-center gap-1.5 text-[#5FD9E4]">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span>¿Te falta algún dato técnico?</span>
            </div>
            <p className="text-[11px] text-slate-200/90 leading-relaxed">
              Si desconoces detalles de APIs o infraestructura, díselo a Nexia IA o márcalo como{" "}
              <strong className="text-white">Pendiente para TI</strong> para compartirlo después con tu equipo técnico.
            </p>
          </div>
        </aside>

        {/* Right Panel (First on Mobile): Immersive #071B36 Live Voice Consultant OR Crisp Editorial Form */}
        <section className="order-1 lg:order-2 lg:col-span-8">
          {activeMode === "voice" ? (
            <div className="bg-[#071B36] border border-[#1B3C68] text-white rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col justify-between space-y-5 shadow-[0_24px_60px_-15px_rgba(7,27,54,0.35)]">
              {/* Top Stage Tracker + Nexia Identity */}
              <div className="space-y-3 border-b border-white/12 pb-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="inline-flex items-center gap-2.5 pr-3.5 pl-1.5 py-1 rounded-full bg-[#0C2548] border border-white/15">
                    <img
                      src={NEXIA_URL}
                      alt="Nexia IA"
                      className="w-6 h-6 rounded-full object-cover border border-[#00A9B7]/70 flex-shrink-0"
                    />
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        voiceStatus === "connected" || voiceStatus === "speaking"
                          ? "bg-[#00A9B7] animate-pulse"
                          : voiceStatus === "paused"
                          ? "bg-amber-400"
                          : voiceStatus === "connecting" || voiceStatus === "requesting_token"
                          ? "bg-amber-400 animate-ping"
                          : "bg-rose-400"
                      )}
                    />
                    <span className="text-[11px] font-bold text-slate-100">
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

                  <span className="text-[11px] font-bold text-[#7CE8F0]">
                    Etapa {activeSection}/10: {AI_RFI_SECTIONS[activeSection - 1]?.shortTitle}
                  </span>
                </div>

                {/* Compact 10-Stage Visual Check Strip */}
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
                            ? "bg-[#00A9B7]/25 border-[#00A9B7] text-[#8FF0F7]"
                            : isCurrent
                            ? "bg-[#1464B8] border-[#7CE8F0] text-white shadow-sm"
                            : partial
                            ? "bg-[#1464B8]/25 border-[#1464B8]/60 text-slate-100"
                            : "bg-[#0C2548] border-[#1B3C68] text-slate-400"
                        )}
                      >
                        {filled ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : sec.number}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reactive Voice Orb with Official Nexia Portrait */}
              <div className="flex flex-col items-center justify-center py-3 sm:py-5 space-y-5">
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full bg-[#00A9B7]/30 blur-2xl transition-transform duration-100 pointer-events-none"
                    style={{
                      width: `${138 + audioLevel * 80}px`,
                      height: `${138 + audioLevel * 80}px`,
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
                      "relative w-32 h-32 sm:w-36 sm:h-36 rounded-full flex items-center justify-center border-2 shadow-2xl transition-all duration-200 overflow-hidden",
                      voiceStatus === "speaking"
                        ? "border-[#5FD9E4] scale-105 ring-4 ring-[#00A9B7]/35"
                        : voiceStatus === "paused"
                        ? "border-amber-400/90"
                        : voiceStatus === "connected"
                        ? "border-[#1464B8] ring-2 ring-[#1464B8]/40"
                        : "border-white/30 hover:scale-105 hover:border-[#5FD9E4]"
                    )}
                  >
                    <img
                      src={NEXIA_URL}
                      alt="Nexia IA"
                      className={clsx(
                        "absolute inset-0 w-full h-full object-cover transition-all duration-300",
                        voiceStatus === "paused" || isMuted ? "opacity-45 grayscale-[30%]" : "opacity-90"
                      )}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#071B36]/80 via-[#071B36]/20 to-transparent" />
                    <div className="relative z-10 mt-14 px-2.5 py-1 rounded-full bg-[#071B36]/85 border border-white/20 flex items-center gap-1.5 shadow-md">
                      {voiceStatus === "requesting_token" || voiceStatus === "connecting" ? (
                        <Loader2 className="w-4 h-4 text-[#7CE8F0] animate-spin" />
                      ) : voiceStatus === "paused" ? (
                        <Play className="w-4 h-4 text-amber-300" />
                      ) : isMuted ? (
                        <MicOff className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Mic className="w-4 h-4 text-[#7CE8F0]" />
                      )}
                      <span className="text-[10px] font-extrabold tracking-wide text-white">
                        {voiceStatus === "speaking"
                          ? "Hablando"
                          : voiceStatus === "connected"
                          ? "Escuchando"
                          : voiceStatus === "paused"
                          ? "En pausa"
                          : "Nexia IA"}
                      </span>
                    </div>
                  </button>
                </div>

                <p className="text-center text-xs text-slate-200 max-w-md leading-relaxed px-2">
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
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#00A9B7]/20 transition-all active:scale-95"
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
                  <div className="max-w-lg w-full bg-amber-500/15 border border-amber-400/40 rounded-2xl p-3.5 text-xs text-amber-100 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
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
                          className="px-3 py-1.5 rounded-lg bg-[#1464B8] hover:bg-[#10539A] text-white font-bold"
                        >
                          Ver Formulario
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Budget Selector shown ONLY during Stage 8 */}
                {activeSection === 8 && (
                  <div className="w-full max-w-xl bg-[#0C2548] border border-[#00A9B7]/45 rounded-2xl p-3.5 space-y-2.5">
                    <div className="text-[11px] font-bold text-[#8FF0F7]">
                      Opcional — Selecciona tu rango estimado con un toque (Etapa 8):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {BUDGET_RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setUsedManualOnce(true);
                            const next: AiBriefingAnswers = {
                              ...answersRef.current,
                              estimatedBudget: opt,
                              lastActiveSection: 8,
                            };
                            setAnswers(next);
                            answersRef.current = next;
                            voiceRef.current?.syncExternalAnswers(next);
                            if (briefingId) persistDraft(next, briefingId, "draft");
                          }}
                          className={clsx(
                            "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all text-left",
                            answers.estimatedBudget === opt
                              ? "bg-[#00A9B7] border-[#7CE8F0] text-white shadow-sm"
                              : "bg-[#071B36] border-[#1B3C68] text-slate-200 hover:border-[#00A9B7]"
                          )}
                        >
                          {answers.estimatedBudget === opt ? `✓ ${opt}` : opt}
                        </button>
                      ))}
                    </div>
                    {answers.estimatedBudget &&
                      !isPlaceholderScreenSelection(answers.estimatedBudget) && (
                        <div className="text-[11px] font-semibold text-[#7CE8F0] flex items-center gap-1.5 pt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            Rango guardado: <strong>{answers.estimatedBudget}</strong> — Confírmale &quot;Listo&quot; a Nexia IA para continuar.
                          </span>
                        </div>
                      )}
                  </div>
                )}

                {/* Live Observations Box shown during Stage 10 in Voice Mode */}
                {activeSection === 10 && (
                  <div className="w-full max-w-xl bg-[#0C2548] border border-[#00A9B7]/55 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-[#7CE8F0]">
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
                      className="w-full px-3.5 py-2 rounded-xl bg-[#071B36] border border-[#1B3C68] text-xs text-white placeholder:text-slate-400 focus:border-[#00A9B7] focus:outline-none resize-y"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          handleStopVoiceAndEdit();
                          setVoiceCompletedBanner(true);
                          setActiveSection(10);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-[#00A9B7] hover:bg-[#008C99] text-white text-[11px] font-bold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Revisar Resumen Completo y Enviar</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Transcript Preview with Nexia Avatar */}
              {transcriptLog.length > 0 && (
                <div className="bg-[#0C2548] border border-[#1B3C68] rounded-2xl p-3.5 max-h-40 overflow-y-auto space-y-2.5 text-xs">
                  {transcriptLog.slice(-3).map((entry, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "flex items-start gap-2.5 leading-snug",
                        entry.role === "agent" ? "text-[#B8F2F7]" : "text-slate-200"
                      )}
                    >
                      {entry.role === "agent" ? (
                        <img
                          src={NEXIA_URL}
                          alt="Nexia IA"
                          className="w-6 h-6 rounded-full object-cover border border-[#00A9B7]/60 flex-shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#1464B8]/40 border border-[#1464B8] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5">
                          Tú
                        </div>
                      )}
                      <div>
                        <strong className="uppercase text-[10px] tracking-wider mr-1.5 text-[#5FD9E4]">
                          {entry.role === "agent" ? "Nexia IA:" : "Tú:"}
                        </strong>
                        {entry.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Voice Controls */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2.5 pt-3 border-t border-white/12">
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
                      ? "bg-amber-400 hover:bg-amber-300 border-amber-200 text-[#071B36] shadow-sm"
                      : "bg-[#0C2548] hover:bg-[#123361] border-[#1B3C68] text-white"
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
                      : "bg-[#0C2548] hover:bg-[#123361] border-[#1B3C68] text-white"
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
                  className="col-span-2 sm:col-span-1 px-4 py-2.5 rounded-xl bg-[#1464B8] hover:bg-[#10539A] border border-[#5BA4EE]/40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Revisar Respuestas y Finalizar</span>
                </button>
              </div>
            </div>
          ) : (
            /* MANUAL / REVIEW EDITORIAL FORM WIZARD */
            <div className="bg-white border border-[#C7D5E2] rounded-3xl p-4 sm:p-6 md:p-8 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C7D5E2]/80 pb-4">
                <div>
                  <span className="text-xs font-extrabold text-[#1464B8] uppercase tracking-wider">
                    Sección {clampSection(activeSection)} de 10
                  </span>
                  <h2 className="font-display text-xl font-extrabold text-[#102B4B]">
                    {(AI_RFI_SECTIONS[clampSection(activeSection) - 1] || AI_RFI_SECTIONS[0]).title}
                  </h2>
                </div>

                {activeSection < 10 && (
                  <button
                    onClick={() => togglePendingSection(activeSection)}
                    className={clsx(
                      "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                      toNumberArray(answers.pendingSections).includes(activeSection)
                        ? "bg-amber-50 border-amber-400 text-amber-800"
                        : "bg-[#F6F9FC] border-[#C7D5E2] text-[#102B4B]/80 hover:border-[#1464B8] hover:text-[#1464B8]"
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
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-[#102B4B]">
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
                              ? "bg-[#1464B8] border-[#1464B8] text-white shadow-xs"
                              : "bg-white border-[#C7D5E2] text-[#102B4B] hover:border-[#1464B8]"
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
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Section 4 */}
              {activeSection === 4 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-[#102B4B]">
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
                              ? "bg-[#1464B8] border-[#1464B8] text-white shadow-xs"
                              : "bg-white border-[#C7D5E2] text-[#102B4B] hover:border-[#1464B8]"
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
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-[#102B4B]">
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
                              ? "bg-[#1464B8] border-[#1464B8] text-white shadow-xs"
                              : "bg-white border-[#C7D5E2] text-[#102B4B] hover:border-[#1464B8]"
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
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] transition-colors space-y-2.5">
                    <label className="block text-xs font-bold text-[#102B4B]">
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
                              ? "bg-[#1464B8] border-[#1464B8] text-white shadow-xs"
                              : "bg-white border-[#C7D5E2] text-[#102B4B] hover:border-[#1464B8]"
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
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
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
                  <div className="p-4 rounded-2xl bg-[#00A9B7]/10 border border-[#00A9B7]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-extrabold text-[#007B86] flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>
                          {voiceCompletedBanner
                            ? "Entrevista por voz finalizada — Revisa tu resumen y observaciones"
                            : "Etapa Final: Observaciones, Resumen de Respuestas y Envío"}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#102B4B]/80 leading-relaxed">
                        Verifica tus observaciones adicionales y el resumen de tus respuestas antes de presionar{" "}
                        <strong className="text-[#102B4B]">Enviar RFI</strong>. La carga de archivos al final es totalmente opcional.
                      </p>
                    </div>
                    {briefingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMode("voice");
                          startVoiceSession(briefingId, answersRef.current);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#071B36] hover:bg-[#1464B8] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 flex-shrink-0 transition-all"
                      >
                        <Mic className="w-3.5 h-3.5 text-[#5FD9E4]" />
                        <span>Dictar algo más con Nexia IA</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Dedicated Observations & Extra Comments Box FIRST */}
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] transition-colors space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-extrabold text-[#102B4B]">
                        1. Observaciones o comentarios adicionales
                      </label>
                      <span className="text-[10px] font-semibold text-[#1464B8]">
                        Puedes escribir o complementar cualquier comentario final aquí
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={answers.additionalComments}
                      onChange={(e) => updateField("additionalComments", e.target.value)}
                      placeholder="Agrega aquí cualquier observación extra, contexto especial, dudas o detalles adicionales que quieras considerar en tu propuesta (o déjalo en blanco si no requieres agregar nada más)..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none resize-y"
                    />
                  </div>

                  {/* 2. Readable Executive Summary of All Stages (1 to 9) */}
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C7D5E2]/80 pb-2.5">
                      <div>
                        <h3 className="text-xs font-extrabold text-[#102B4B]">
                          2. Resumen de tus respuestas registradas (Etapas 1 a 9)
                        </h3>
                        <p className="text-[11px] text-[#102B4B]/70">
                          Revisa la información capturada; si deseas ajustar algún punto, toca <strong>Editar</strong> en esa etapa.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#1464B8]/10 border border-[#1464B8]/30 text-[11px] font-bold text-[#1464B8]">
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
                            className="p-3 rounded-xl bg-white border border-[#C7D5E2] flex flex-col justify-between space-y-2"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-extrabold text-[#102B4B] flex items-center gap-1.5">
                                  {isDone ? (
                                    <Check className="w-3.5 h-3.5 text-[#00A9B7] flex-shrink-0" />
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                                  )}
                                  {card.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveSection(card.sec)}
                                  className="text-[10px] font-bold text-[#1464B8] hover:text-[#10539A] underline flex-shrink-0"
                                >
                                  Editar
                                </button>
                              </div>

                              {populated.length > 0 ? (
                                <div className="space-y-1 text-[11px] text-[#102B4B]/80">
                                  {populated.map(([lbl, val], i) => (
                                    <div key={i} className="line-clamp-2 leading-snug">
                                      <strong className="text-[#102B4B]">{lbl}:</strong> {val}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px] italic text-amber-700">
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
                  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[#102B4B]">
                        3. Documentos adjuntos (Opcional)
                      </label>
                      <span className="text-[10px] font-semibold text-[#102B4B]/60">
                        Solo si deseas anexar manuales, diagramas o ejemplos
                      </span>
                    </div>
                    <label className="flex flex-col items-center justify-center border border-dashed border-[#8DA4BE] hover:border-[#1464B8] rounded-2xl p-4 bg-white hover:bg-[#F6F9FC] cursor-pointer transition-all text-center">
                      {uploadingFiles ? (
                        <Loader2 className="w-6 h-6 text-[#1464B8] animate-spin mb-1.5" />
                      ) : (
                        <Upload className="w-6 h-6 text-[#1464B8] mb-1.5" />
                      )}
                      <span className="text-xs font-bold text-[#102B4B]">
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
                            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText className="w-4 h-4 text-[#1464B8] flex-shrink-0" />
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#1464B8] font-semibold hover:underline truncate"
                              >
                                {att.name}
                              </a>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="text-rose-500 hover:text-rose-600 p-1"
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

              {/* Wizard Navigation Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-5 border-t border-[#C7D5E2]/80">
                <button
                  type="button"
                  disabled={activeSection === 1}
                  onClick={() => handleSaveManualStep(Math.max(1, activeSection - 1))}
                  className="px-3.5 py-2 rounded-xl bg-[#F6F9FC] hover:bg-[#EBF2F8] border border-[#C7D5E2] disabled:opacity-40 text-xs font-bold text-[#102B4B] flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveManualStep()}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F6F9FC] border border-[#C7D5E2] text-xs font-bold text-[#102B4B]"
                  >
                    Guardar avance
                  </button>

                  {activeSection < 10 ? (
                    <button
                      type="button"
                      onClick={() => handleSaveManualStep(activeSection + 1)}
                      className="px-4 py-2 rounded-xl bg-[#1464B8] hover:bg-[#10539A] text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-[#1464B8]/20"
                    >
                      <span>Siguiente</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingFinal}
                      onClick={handleFinalSubmit}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-[#00A9B7]/20 transition-all active:scale-95"
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
  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] focus-within:bg-white transition-colors space-y-2">
    <label className="block text-xs font-bold text-[#102B4B]">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none"
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
  <div className="p-4 rounded-2xl bg-[#F6F9FC] border border-[#C7D5E2] focus-within:border-[#1464B8] focus-within:bg-white transition-colors space-y-2">
    <label className="block text-xs font-bold text-[#102B4B]">{label}</label>
    <textarea
      rows={3}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#C7D5E2] text-sm text-[#102B4B] placeholder:text-[#102B4B]/40 focus:border-[#1464B8] focus:outline-none resize-y"
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
        <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#C7D5E2] rounded-3xl p-7 text-center space-y-4 shadow-xl">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <h2 className="font-display text-lg font-extrabold text-[#102B4B]">Tu avance está resguardado</h2>
            <p className="text-xs text-[#102B4B]/75 leading-relaxed">
              Ocurrió un ajuste visual inesperado, pero todas tus respuestas están guardadas de forma segura. Presiona continuar para retomar tu diagnóstico.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-xl bg-[#1464B8] hover:bg-[#10539A] text-xs font-bold text-white"
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
