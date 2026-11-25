import { FunctionDeclaration, Type } from "@google/genai";

export interface AiBriefingAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface AiBriefingAnswers {
  // Encabezado
  requestDate: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  responseDeadline: string;
  privacyConsentAccepted: boolean;
  privacyConsentAcceptedAt: string;

  // 1. Contexto y objetivo general
  businessProblem: string;
  expectedOutcome: string;
  previousAiInitiatives: string;

  // 2. Descripción del puesto / proceso a automatizar
  roleOrProcessDescription: string;
  periodicTasks: string;
  automationPercentage: string;
  unavailabilityImpact: string;

  // 3. Funciones y tareas del agente
  specificFunctions: string;
  outOfScopeTasks: string;
  autonomyLevel: string;

  // 4. Usuarios y volumen
  targetUsers: string[];
  approxUserCount: string;
  interactionVolume: string;
  operatingHours: string;

  // 5. Canales e integraciones
  channels: string[];
  systemsToIntegrate: string;
  apiAvailability: string;

  // 6. Datos y conocimiento
  knowledgeBaseDocs: string;
  dataHostingAndFormat: string;
  maintenanceOwner: string;

  // 7. Seguridad, privacidad y cumplimiento
  sensitiveData: string;
  compliancePolicies: string;
  dataResidency: string;

  // 8. Restricciones y expectativas
  estimatedBudget: string;
  idealLaunchDate: string;
  operatingLanguages: string;
  approverAndSponsor: string;

  // 9. Métricas de éxito
  kpis: string;
  successAt3And6Months: string;

  // 10. Información adicional
  attachments: AiBriefingAttachment[];
  additionalComments: string;
  observationsConfirmed?: boolean;

  // Control de etapa activa y campos pendientes (para retomar tras bloqueo de pantalla y colaboración con TI)
  lastActiveSection?: number;
  pendingSections: number[];
}

export interface AiPricingPackageOption {
  tierName: string;
  subtitle: string;
  estimatedEngineeringHours?: number;
  setupPriceMxn: number;
  monthlyRetainerMxn: number;
  monthlyRetainerBreakdown?: string;
  estimatedWeeks: string;
  idealFor: string;
  deliverables: string[];
}

export interface AiSuggestedQuoteItem {
  concept: string;
  details: string;
  priceMxn: number;
  billingType: "once" | "monthly";
}

export interface AiClientQuestionResponse {
  question: string;
  strategicAnswer: string;
}

export interface AiSecurityArchitectureSpec {
  riskTier: string;
  recommendedLayers: string[];
  dataGovernanceAndRetention: string;
}

export interface AiDeterministicVsAiSplit {
  deterministicScope: string;
  aiCognitiveScope: string;
}

export interface AiPreDiagnostic {
  complexityLevel: "Baja" | "Media" | "Alta" | "Enterprise";
  solutionArchetype?: string;
  executiveSummary: string;
  budgetFitStatus?: string;
  budgetVsNeedsAnalysis?: string;
  pricingRationale?: string;
  whatCanBeDone?: string[];
  deterministicVsAiSplit?: AiDeterministicVsAiSplit;
  recommendedInterpresLines?: string[];
  commercialPitchAndHowToOffer?: string;
  roiArgument?: string;
  recommendedArchitecture: string;
  securityArchitecture?: AiSecurityArchitectureSpec;
  stepByStepIntegrationPlan?: string[];
  pricingPackagesMxn?: AiPricingPackageOption[];
  suggestedQuoteItems?: AiSuggestedQuoteItem[];
  paymentStructureRecommendation?: string;
  criticalRisks: string[];
  mvpScope: string[];
  phase2Scope: string[];
  clientQuestionsResponses?: AiClientQuestionResponse[];
  followUpQuestions: string[];
  estimatedImplementationWeeks: string;
  customNotesUsed?: string;
  generatedAt: string;
}

export interface AiBriefingRecord {
  id: string;
  briefingType: "ai-agent";
  status: "draft" | "completed";
  completionMode: "voice" | "manual" | "hybrid";
  clientId?: string;
  companyName: string;
  clientName: string;
  email: string;
  whatsapp: string;
  voiceSessionsCount?: number;
  voiceDurationSeconds?: number;
  lastVoiceSessionAt?: string;
  createdAt: any;
  updatedAt?: any;
  completedAt?: any;
  answers: AiBriefingAnswers;
  answersTranslatedEs?: AiBriefingAnswers;
  translatedEsAt?: string;
  aiPreDiagnostic?: AiPreDiagnostic;
}

/**
 * Detecta si las respuestas del RFI fueron redactadas principalmente en inglés (u otro idioma distinto al español)
 * para ofrecer descarga directa del PDF Ejecutivo con traducción técnica especializada.
 */
export const isLikelyNonSpanishBriefing = (answers?: Partial<AiBriefingAnswers> | null): boolean => {
  if (!answers) return false;
  const sample = [
    answers.businessProblem,
    answers.expectedOutcome,
    answers.roleOrProcessDescription,
    answers.specificFunctions,
    answers.systemsToIntegrate,
    answers.additionalComments,
  ]
    .map((s) => (typeof s === "string" ? s : ""))
    .join(" ");

  if (sample.trim().length < 25) return false;

  const enMatches =
    sample.match(
      /\b(the|and|with|for|our|we|want|would|should|currently|workflow|customer|customers|business|requirements|system|files|provide|provides|using|allow|without)\b/gi
    ) || [];
  const esMatches =
    sample.match(
      /\b(para|con|los|las|del|una|nuestro|nuestra|queremos|proceso|clientes|empresa|sistema|actualmente|mediante|cuando|porque|también)\b/gi
    ) || [];

  return enMatches.length >= 4 && enMatches.length > esMatches.length;
};

export const formatVoiceDuration = (seconds?: number): string => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total <= 0) return "0 seg";
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs} h ${String(mins).padStart(2, "0")} min`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins} min ${secs} seg` : `${mins} min`;
  }
  return `${secs} seg`;
};

export const getTodayFormatted = (): string => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export const INITIAL_AI_BRIEFING_ANSWERS: AiBriefingAnswers = {
  requestDate: getTodayFormatted(),
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  responseDeadline: "",
  privacyConsentAccepted: false,
  privacyConsentAcceptedAt: "",

  businessProblem: "",
  expectedOutcome: "",
  previousAiInitiatives: "",

  roleOrProcessDescription: "",
  periodicTasks: "",
  automationPercentage: "",
  unavailabilityImpact: "",

  specificFunctions: "",
  outOfScopeTasks: "",
  autonomyLevel: "",

  targetUsers: [],
  approxUserCount: "",
  interactionVolume: "",
  operatingHours: "",

  channels: [],
  systemsToIntegrate: "",
  apiAvailability: "",

  knowledgeBaseDocs: "",
  dataHostingAndFormat: "",
  maintenanceOwner: "",

  sensitiveData: "",
  compliancePolicies: "",
  dataResidency: "",

  estimatedBudget: "",
  idealLaunchDate: "",
  operatingLanguages: "",
  approverAndSponsor: "",

  kpis: "",
  successAt3And6Months: "",

  attachments: [],
  additionalComments: "",
  observationsConfirmed: false,
  lastActiveSection: 1,
  pendingSections: [],
};

export const CHANNEL_OPTIONS = [
  "WhatsApp Business",
  "Sitio Web / Webchat",
  "Correo Electrónico",
  "Teléfono / Voz",
  "Microsoft Teams",
  "Slack",
  "Instagram / Redes",
  "Panel Interno",
];

export const TARGET_USER_OPTIONS = [
  "Clientes finales",
  "Equipo interno / Colaboradores",
  "Proveedores / Distribuidores",
  "Directivos / Gerencia",
];

export const BUDGET_RANGE_OPTIONS = [
  "Menos de $2,500 USD ($50,000 MXN)",
  "$2,500 – $5,000 USD ($50k – $100k MXN)",
  "$5,000 – $12,000 USD ($100k – $240k MXN)",
  "Más de $12,000 USD (+$240k MXN)",
  "Abierto a propuesta según alcance / ROI",
];

export const AUTONOMY_OPTIONS = [
  "100% Autónomo dentro de reglas definidas",
  "Híbrido: resuelve casos estándar y escala excepciones a humano",
  "Copiloto / Asistido: propone borradores y un humano aprueba",
];

export interface RfiSectionMeta {
  number: number;
  title: string;
  shortTitle: string;
  fields: (keyof AiBriefingAnswers)[];
}

export const AI_RFI_SECTIONS: RfiSectionMeta[] = [
  {
    number: 1,
    title: "1. Contexto y objetivo general",
    shortTitle: "Contexto y Objetivo",
    fields: ["businessProblem", "expectedOutcome", "previousAiInitiatives"],
  },
  {
    number: 2,
    title: "2. Descripción del puesto / proceso a automatizar",
    shortTitle: "Puesto / Proceso",
    fields: [
      "roleOrProcessDescription",
      "periodicTasks",
      "automationPercentage",
      "unavailabilityImpact",
    ],
  },
  {
    number: 3,
    title: "3. Funciones y tareas del agente",
    shortTitle: "Funciones y Alcance",
    fields: ["specificFunctions", "outOfScopeTasks", "autonomyLevel"],
  },
  {
    number: 4,
    title: "4. Usuarios y volumen",
    shortTitle: "Usuarios y Volumen",
    fields: ["targetUsers", "approxUserCount", "interactionVolume", "operatingHours"],
  },
  {
    number: 5,
    title: "5. Canales e integraciones",
    shortTitle: "Canales y Sistemas",
    fields: ["channels", "systemsToIntegrate", "apiAvailability"],
  },
  {
    number: 6,
    title: "6. Datos y conocimiento",
    shortTitle: "Datos y Conocimiento",
    fields: ["knowledgeBaseDocs", "dataHostingAndFormat", "maintenanceOwner"],
  },
  {
    number: 7,
    title: "7. Seguridad, privacidad y cumplimiento",
    shortTitle: "Seguridad y Privacidad",
    fields: ["sensitiveData", "compliancePolicies", "dataResidency"],
  },
  {
    number: 8,
    title: "8. Restricciones y expectativas",
    shortTitle: "Presupuesto y Tiempos",
    fields: ["estimatedBudget", "idealLaunchDate", "operatingLanguages", "approverAndSponsor"],
  },
  {
    number: 9,
    title: "9. Métricas de éxito",
    shortTitle: "Métricas de Éxito",
    fields: ["kpis", "successAt3And6Months"],
  },
  {
    number: 10,
    title: "10. Observaciones, comentarios extra y adjuntos",
    shortTitle: "Observaciones y Adjuntos",
    fields: ["additionalComments"],
  },
];

const hasStr = (val?: unknown): boolean => typeof val === "string" && val.trim().length > 0;

/**
 * Convierte de forma segura cualquier valor (arreglo, string estilo "[A, B]", texto simple o null)
 * en un arreglo limpio de strings, evitando errores `.join is not a function` cuando el modelo de voz
 * serializa listas como cadenas de texto.
 */
export const toStringArray = (val: unknown): string[] => {
  if (Array.isArray(val)) {
    return val
      .flatMap((item) => {
        if (typeof item === "string") return [item.trim()];
        if (item !== null && item !== undefined) return [String(item).trim()];
        return [];
      })
      .map((s) => s.replace(/^["'\s]+|["'\s.]+$/g, "").trim())
      .filter(Boolean);
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return toStringArray(parsed);
        }
      } catch {
        // Fallback: quitar corchetes y separar por coma
      }
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(/[,;\n]+/)
        .map((s) => s.replace(/^["'\s]+|["'\s.]+$/g, "").trim())
        .filter(Boolean);
    }

    return trimmed
      .split(/[,;\n]+/)
      .map((s) => s.replace(/^["'\s]+|["'\s.]+$/g, "").trim())
      .filter(Boolean);
  }

  return [];
};

export const clampSection = (val: unknown, fallback = 1): number => {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, Math.round(n)));
};

export const safeStr = (val: unknown): string => {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  if (val !== null && val !== undefined && typeof val !== "object") return String(val);
  return "";
};

export const toAttachmentArray = (val: unknown): AiBriefingAttachment[] => {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item) => item && typeof item === "object" && typeof (item as any).url === "string")
    .map((item: any) => ({
      name: safeStr(item.name || "Documento adjunto"),
      url: safeStr(item.url),
      size: Number(item.size) || 0,
      type: safeStr(item.type || "application/octet-stream"),
      uploadedAt: safeStr(item.uploadedAt || ""),
    }));
};

export const toNumberArray = (val: unknown): number[] => {
  const rawList = Array.isArray(val)
    ? val
    : typeof val === "string"
    ? val.replace(/^\[|\]$/g, "").split(/[,;\s]+/)
    : [];
  const nums = rawList
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 10)
    .map((n) => Math.round(n));
  return Array.from(new Set(nums));
};

const hasArr = (val?: unknown): boolean => toStringArray(val).length > 0;

export const ALLOWED_STRING_RFI_FIELDS: (keyof AiBriefingAnswers)[] = [
  "requestDate",
  "companyName",
  "contactName",
  "contactEmail",
  "contactPhone",
  "responseDeadline",
  "privacyConsentAcceptedAt",
  "businessProblem",
  "expectedOutcome",
  "previousAiInitiatives",
  "roleOrProcessDescription",
  "periodicTasks",
  "automationPercentage",
  "unavailabilityImpact",
  "specificFunctions",
  "outOfScopeTasks",
  "autonomyLevel",
  "approxUserCount",
  "interactionVolume",
  "operatingHours",
  "systemsToIntegrate",
  "apiAvailability",
  "knowledgeBaseDocs",
  "dataHostingAndFormat",
  "maintenanceOwner",
  "sensitiveData",
  "compliancePolicies",
  "dataResidency",
  "estimatedBudget",
  "idealLaunchDate",
  "operatingLanguages",
  "approverAndSponsor",
  "kpis",
  "successAt3And6Months",
  "additionalComments",
];

/**
 * Normaliza todos los tipos (strings, arrays, números y adjuntos) para blindar al 100% la interfaz
 * y los PDFs contra cualquier formato inesperado devuelto por el modelo de voz o datos heredados.
 */
export const sanitizeLegacyAnswers = (raw?: Partial<AiBriefingAnswers> | null): AiBriefingAnswers => {
  const safeRaw = raw && typeof raw === "object" ? raw : {};
  const merged: AiBriefingAnswers = {
    ...INITIAL_AI_BRIEFING_ANSWERS,
    ...safeRaw,
  };

  for (const key of ALLOWED_STRING_RFI_FIELDS) {
    (merged as any)[key] = safeStr((merged as any)[key]);
  }

  merged.targetUsers = toStringArray(merged.targetUsers);
  merged.channels = toStringArray(merged.channels);
  merged.pendingSections = toNumberArray(merged.pendingSections);
  merged.attachments = toAttachmentArray(merged.attachments);
  merged.privacyConsentAccepted = Boolean(merged.privacyConsentAccepted);
  merged.observationsConfirmed = Boolean(merged.observationsConfirmed);
  merged.lastActiveSection = clampSection(merged.lastActiveSection, 1);

  // Si una sección ya quedó contestada, quitarla de pendingSections para no confundir el avance
  merged.pendingSections = merged.pendingSections.filter((secNum) => !isSectionFilled(merged, secNum));

  if (
    merged.operatingHours === "24/7" &&
    !hasArr(merged.targetUsers) &&
    !hasStr(merged.approxUserCount) &&
    !hasStr(merged.interactionVolume)
  ) {
    merged.operatingHours = "";
  }

  if (
    merged.operatingLanguages === "Español" &&
    !hasStr(merged.estimatedBudget) &&
    !hasStr(merged.idealLaunchDate) &&
    !hasStr(merged.approverAndSponsor)
  ) {
    merged.operatingLanguages = "";
  }

  return merged;
};

/**
 * Detecta frases comodín cuando el cliente dice verbalmente "ya lo seleccioné en pantalla"
 * sin mencionar el monto, evitando que la IA sobrescriba el botón real elegido en la interfaz.
 */
export const isPlaceholderScreenSelection = (val?: unknown): boolean => {
  const s = safeStr(val).trim();
  if (!s) return false;
  return (
    /(rango\s+seleccionad|seleccionad[oa]\s+en\s+pantalla|elegir[aé]?\s+en\s+pantalla|elegid[oa]\s+en\s+pantalla|toque\s+en\s+pantalla|marcad[oa]\s+en\s+pantalla|bot[oó]n\s+en\s+pantalla|^en\s+pantalla\.?$)/i.test(
      s
    ) && !/(\$|usd|mxn|pesos|d[oó]lares|\d|abierto\s+a\s+propuesta)/i.test(s)
  );
};

export const formatBudgetDisplay = (val?: unknown): string => {
  const s = safeStr(val).trim();
  if (!s) return "";
  if (isPlaceholderScreenSelection(s)) {
    return "Por confirmar con el cliente (indicó selección en pantalla)";
  }
  return s;
};

/**
 * Marca una etapa con check verde (✓) ÚNICAMENTE cuando sus campos esenciales ya fueron respondidos,
 * para que el progreso avance fielmente etapa por etapa conforme ocurre la conversación.
 */
export const isSectionFilled = (
  answers: Partial<AiBriefingAnswers> | undefined | null,
  sectionNumber: number
): boolean => {
  if (!answers) return false;
  switch (sectionNumber) {
    case 1:
      return hasStr(answers.businessProblem) && hasStr(answers.expectedOutcome);
    case 2:
      return hasStr(answers.roleOrProcessDescription) && hasStr(answers.periodicTasks);
    case 3:
      return hasStr(answers.specificFunctions) && hasStr(answers.autonomyLevel);
    case 4:
      return (
        hasArr(answers.targetUsers) &&
        (hasStr(answers.interactionVolume) || hasStr(answers.approxUserCount)) &&
        hasStr(answers.operatingHours)
      );
    case 5:
      return hasArr(answers.channels) && hasStr(answers.systemsToIntegrate);
    case 6:
      return (
        hasStr(answers.knowledgeBaseDocs) &&
        (hasStr(answers.dataHostingAndFormat) || hasStr(answers.maintenanceOwner))
      );
    case 7:
      return hasStr(answers.sensitiveData);
    case 8:
      return (
        hasStr(answers.idealLaunchDate) &&
        hasStr(answers.estimatedBudget) &&
        !isPlaceholderScreenSelection(answers.estimatedBudget)
      );
    case 9:
      return hasStr(answers.kpis) || hasStr(answers.successAt3And6Months);
    case 10:
      return (
        hasStr(answers.additionalComments) ||
        Boolean(answers.observationsConfirmed) ||
        (answers.attachments || []).length > 0
      );
    default:
      return false;
  }
};

/**
 * Devuelve SIEMPRE la primera etapa pendiente de completar en estricto orden secuencial (1 → 9, y al final 10).
 * Aunque la IA capture de forma anticipada algún dato mencionado de paso (ej. canales o formatos de archivo),
 * jamás se brinca las etapas intermedias que aún tengan preguntas pendientes.
 */
export const getFirstIncompleteSection = (
  rawAnswers: Partial<AiBriefingAnswers> | undefined | null
): number => {
  if (!rawAnswers) return 1;
  const pending = toNumberArray(rawAnswers.pendingSections);
  const firstOpen = AI_RFI_SECTIONS.find(
    (s) => s.number <= 9 && !isSectionFilled(rawAnswers, s.number) && !pending.includes(s.number)
  );
  return firstOpen ? firstOpen.number : 10;
};

/**
 * Calcula con precisión en qué etapa (1 a 10) debe posicionarse y retomar la entrevista,
 * garantizando avance secuencial 1 → 10 sin saltos accidentales ni reinicios a la Etapa 1.
 */
export const resolveResumeSection = (
  answers: Partial<AiBriefingAnswers> | undefined | null
): number => {
  return getFirstIncompleteSection(answers);
};

export const isSectionPartial = (
  answers: Partial<AiBriefingAnswers> | undefined | null,
  sectionNumber: number
): boolean => {
  if (!answers) return false;
  if (isSectionFilled(answers, sectionNumber)) return false;
  const sec = AI_RFI_SECTIONS.find((s) => s.number === sectionNumber);
  if (!sec) return false;
  if (sectionNumber === 10) return false;
  return sec.fields.some((f) => {
    const val = answers[f];
    if (f === "targetUsers" || f === "channels") return toStringArray(val).length > 0;
    if (Array.isArray(val)) return val.length > 0;
    return typeof val === "string" && val.trim().length > 0;
  });
};

/**
 * Guía determinista de siguiente pregunta para mantener a Nexia IA siempre enfocada
 * en el hilo exacto de la entrevista sin saltar etapas ni repetir preguntas.
 */
export const getNextQuestionGuidance = (
  rawAnswers: Partial<AiBriefingAnswers> | undefined | null
): {
  stage: number;
  stageTitle: string;
  nextQuestion: string;
  stage10ReadyToClose: boolean;
} => {
  const answers = sanitizeLegacyAnswers(rawAnswers);
  const stage = resolveResumeSection(answers);
  const stageMeta = AI_RFI_SECTIONS[stage - 1] || AI_RFI_SECTIONS[0];

  switch (stage) {
    case 1:
      if (!hasStr(answers.businessProblem)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Qué proceso o problema principal de tu operación buscas automatizar o resolver con IA?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Qué resultado concreto esperas lograr, como ahorrar tiempo operativo, atender 24/7 o vender más?",
        stage10ReadyToClose: false,
      };

    case 2:
      if (!hasStr(answers.roleOrProcessDescription)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Cómo llevan a cabo hoy ese proceso o puesto de forma manual?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Cuáles son las tareas repetitivas o frecuentes que más tiempo les consumen hoy?",
        stage10ReadyToClose: false,
      };

    case 3:
      if (!hasStr(answers.specificFunctions)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Qué acciones específicas te gustaría que ejecute la automatización o el agente, y qué quedaría fuera?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Prefieres que opere 100% autónomo, híbrido escalando casos complejos a tu equipo, o como copiloto?",
        stage10ReadyToClose: false,
      };

    case 4:
      if (!hasArr(answers.targetUsers)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Quiénes usarán o se beneficiarán de esta solución: tus clientes finales, tu equipo interno o proveedores?",
          stage10ReadyToClose: false,
        };
      }
      if (!hasStr(answers.interactionVolume) && !hasStr(answers.approxUserCount)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Qué volumen aproximado de operaciones, registros o mensajes manejan al día o por semana?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿En qué horario necesita operar esta solución, 24/7 o en horario laboral?",
        stage10ReadyToClose: false,
      };

    case 5:
      if (!hasArr(answers.channels)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿En qué canales operará, por ejemplo WhatsApp, web, correo, Telegram o panel interno?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Con qué herramientas necesita conectarse (CRM, Stripe, Excel, ERP, calendario) y saben si tienen API?",
        stage10ReadyToClose: false,
      };

    case 6:
      if (!hasStr(answers.knowledgeBaseDocs)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Qué información, catálogos, reglas o documentos necesita consultar el sistema para operar?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Dónde tienen guardada hoy esa información y quién se encargará de actualizarla?",
        stage10ReadyToClose: false,
      };

    case 7:
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Manejará datos sensibles o financieros que requieran algún cuidado especial de privacidad?",
        stage10ReadyToClose: false,
      };

    case 8:
      if (!hasStr(answers.idealLaunchDate)) {
        return {
          stage,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "¿Para cuándo te gustaría tenerlo operando y quién aprueba el proyecto?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Tienen algún rango estimado de inversión, o prefieres seleccionarlo con un toque en pantalla?",
        stage10ReadyToClose: false,
      };

    case 9:
      return {
        stage,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "¿Qué resultado concreto a los 3 y 6 meses te haría decir que esta automatización fue un éxito?",
        stage10ReadyToClose: false,
      };

    case 10:
    default: {
      const done10 = Boolean(answers.observationsConfirmed) || hasStr(answers.additionalComments);
      if (!done10) {
        return {
          stage: 10,
          stageTitle: stageMeta.shortTitle,
          nextQuestion: "Para cerrar, ¿quieres dejar alguna observación adicional antes de revisar tu resumen?",
          stage10ReadyToClose: false,
        };
      }
      return {
        stage: 10,
        stageTitle: stageMeta.shortTitle,
        nextQuestion: "Agradece brevemente de parte de Interpres Digital, invítalo a revisar su resumen en pantalla y presionar Enviar RFI, e invoca finishVoiceInterview.",
        stage10ReadyToClose: true,
      };
    }
  }
};

export const updateRfiFieldsTool: FunctionDeclaration = {
  name: "updateRfiFields",
  description:
    "Guarda y actualiza en vivo las respuestas del cliente en el formulario RFI mientras avanza la entrevista por voz. Invócala inmediatamente cada vez que el cliente proporcione información útil o indique que un punto queda pendiente.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      businessProblem: { type: Type.STRING, description: "Problema o necesidad de negocio a resolver" },
      expectedOutcome: { type: Type.STRING, description: "Resultado esperado (ahorro de tiempo, costos, atención)" },
      previousAiInitiatives: { type: Type.STRING, description: "Iniciativas o herramientas de IA previas" },
      roleOrProcessDescription: { type: Type.STRING, description: "Descripción del puesto o proceso actual" },
      periodicTasks: { type: Type.STRING, description: "Tareas diarias, semanales y mensuales" },
      automationPercentage: { type: Type.STRING, description: "Porcentaje estimado automatizable" },
      unavailabilityImpact: { type: Type.STRING, description: "Qué pasa hoy cuando la persona no está disponible" },
      specificFunctions: { type: Type.STRING, description: "Funciones específicas que ejecutará el agente" },
      outOfScopeTasks: { type: Type.STRING, description: "Tareas explícitamente fuera del alcance" },
      autonomyLevel: { type: Type.STRING, description: "Decisiones autónomas vs escalamiento a humano" },
      targetUsers: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Quiénes usarán el agente (Clientes finales, Equipo interno / Colaboradores, Proveedores / Distribuidores)",
      },
      approxUserCount: { type: Type.STRING, description: "Número aproximado de usuarios" },
      interactionVolume: { type: Type.STRING, description: "Volumen esperado de interacciones por día o semana" },
      operatingHours: { type: Type.STRING, description: "Horarios de operación (ej. 24/7, horario laboral)" },
      channels: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Canales de operación (WhatsApp Business, Sitio Web / Webchat, Correo Electrónico, Teléfono / Voz, Microsoft Teams, Slack)",
      },
      systemsToIntegrate: { type: Type.STRING, description: "Sistemas a integrar (CRM, ERP, calendario, BD, WhatsApp API)" },
      apiAvailability: { type: Type.STRING, description: "Disponibilidad de APIs o acceso técnico" },
      knowledgeBaseDocs: { type: Type.STRING, description: "Documentos o información base de conocimiento" },
      dataHostingAndFormat: { type: Type.STRING, description: "Dónde están alojados los datos y en qué formato" },
      maintenanceOwner: { type: Type.STRING, description: "Responsable de mantener los datos actualizados" },
      sensitiveData: { type: Type.STRING, description: "Datos sensibles o confidenciales que manejará" },
      compliancePolicies: { type: Type.STRING, description: "Normativas o políticas a cumplir (ej. LFPDPPP)" },
      dataResidency: { type: Type.STRING, description: "Restricciones de infraestructura o región de datos" },
      estimatedBudget: {
        type: Type.STRING,
        description:
          "Presupuesto aproximado real o preferencia de propuesta (ej. '$5,000 – $12,000 USD ($100k – $240k MXN)', '50,000 pesos' o 'Abierto a propuesta según alcance / ROI'). PROHIBIDO enviar frases comodín como 'Rango seleccionado en pantalla'; si el cliente elige un botón en pantalla, el sistema ya lo registra automáticamente.",
      },
      idealLaunchDate: { type: Type.STRING, description: "Fecha ideal de puesta en marcha" },
      operatingLanguages: { type: Type.STRING, description: "Idiomas de operación" },
      approverAndSponsor: { type: Type.STRING, description: "Quién aprueba el diseño y quién es el sponsor" },
      kpis: { type: Type.STRING, description: "Cómo medirán que el agente funciona bien" },
      successAt3And6Months: { type: Type.STRING, description: "Qué resultado considerarían un éxito a 3 y 6 meses" },
      additionalComments: {
        type: Type.STRING,
        description:
          "Observaciones, comentarios extra o notas adicionales que el cliente mencione al final o durante la entrevista para el apartado de Observaciones",
      },
      noAdditionalComments: {
        type: Type.BOOLEAN,
        description:
          "En la Etapa 10, ponlo en true únicamente cuando el cliente confirme explícitamente que NO tiene observaciones ni comentarios adicionales que agregar.",
      },
      appendMode: {
        type: Type.BOOLEAN,
        description:
          "Ponlo en true cuando el cliente esté agregando o profundizando detalles adicionales sobre una etapa ya contestada, para sumar la información nueva sin borrar lo que ya había dicho antes.",
      },
      markSectionPending: {
        type: Type.NUMBER,
        description:
          "Úsalo ÚNICAMENTE si el cliente dice explícitamente 'no lo sé' o 'lo revisará TI después' respecto a una sección (1 al 9).",
      },
    },
  },
};

export const navigateToStageTool: FunctionDeclaration = {
  name: "navigateToStage",
  description:
    "Invócala ÚNICAMENTE cuando el cliente pida explícitamente con sus propias palabras regresar, revisar o profundizar en un número de pregunta/etapa específico (ej. 'regresemos a la pregunta 4'). PROHIBIDO usarla durante el avance normal de la entrevista.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      stageNumber: {
        type: Type.NUMBER,
        description: "Número de etapa (1 al 10) a la que el cliente solicitó ir.",
      },
    },
    required: ["stageNumber"],
  },
};

export const finishVoiceInterviewTool: FunctionDeclaration = {
  name: "finishVoiceInterview",
  description:
    "Invócala ÚNICAMENTE al final de la Etapa 10, DESPUÉS de haberle preguntado al cliente si desea dejar alguna observación o comentario adicional, haber esperado su respuesta y haber registrado su comentario (o noAdditionalComments=true) mediante updateRfiFields.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summaryMessage: {
        type: Type.STRING,
        description: "Breve mensaje de cierre para mostrar en pantalla.",
      },
    },
  },
};

export const hasAnySectionProgress = (rawAnswers?: Partial<AiBriefingAnswers> | null): boolean => {
  if (!rawAnswers) return false;
  const answers = sanitizeLegacyAnswers(rawAnswers);
  return AI_RFI_SECTIONS.some(
    (s) =>
      isSectionFilled(answers, s.number) ||
      isSectionPartial(answers, s.number) ||
      (answers.pendingSections || []).includes(s.number)
  );
};

export const buildVoiceConsultantSystemPrompt = (rawAnswers: AiBriefingAnswers): string => {
  const answers = sanitizeLegacyAnswers(rawAnswers);
  const guidance = getNextQuestionGuidance(answers);
  const resumeStageNumber = guidance.stage;
  const nextStage = AI_RFI_SECTIONS[resumeStageNumber - 1] || AI_RFI_SECTIONS[0];

  // Excluir campos de portada (companyName, contactName, etc.) para detectar con 100% de exactitud si es PRIMERA VEZ
  const existingSectionEntries = Object.fromEntries(
    Object.entries(answers).filter(
      ([k, v]) =>
        ![
          "requestDate",
          "companyName",
          "contactName",
          "contactEmail",
          "contactPhone",
          "responseDeadline",
          "privacyConsentAccepted",
          "privacyConsentAcceptedAt",
          "attachments",
          "pendingSections",
          "lastActiveSection",
          "observationsConfirmed",
        ].includes(k) &&
        ((typeof v === "string" && v.trim() !== "") || (Array.isArray(v) && v.length > 0))
    )
  );

  const isResumingExistingSession =
    resumeStageNumber > 1 || Object.keys(existingSectionEntries).length > 0;
  const firstName = (answers.contactName || "").trim().split(/\s+/)[0] || "";

  const greetingInstruction =
    resumeStageNumber === 10 && isResumingExistingSession
      ? `ES UNA REANUDACIÓN en la Etapa 10. Di únicamente: "Hola de nuevo${firstName ? ` ${firstName}` : ""}, retomamos en la Etapa 10. ${guidance.nextQuestion}" y espera en silencio.`
      : isResumingExistingSession
      ? `ES UNA REANUDACIÓN en la Etapa ${nextStage.number}. Di únicamente: "Hola de nuevo${firstName ? ` ${firstName}` : ""}, retomamos en la Etapa ${nextStage.number}. ${guidance.nextQuestion}" y espera en silencio.`
      : `ES LA PRIMERA VEZ que hablas con este cliente (PROHIBIDO decir "Hola de nuevo"). Di únicamente: "Hola${firstName ? ` ${firstName}` : ""}, soy Nexia IA de Interpres Digital. ${guidance.nextQuestion}" y espera en silencio.`;

  return `
Te llamas **Nexia IA**, Consultora Ejecutiva de Automatización e Inteligencia Artificial de **Interpres Digital** (INTERPRES S.A. de C.V.).
Conversas por VOZ en español mexicano con ${answers.contactName || "el cliente"} de "${answers.companyName || "su empresa"}".

REGLA #0 ABSOLUTA — CERO AUTORESPUESTA Y CERO ROLLO (BREVEDAD EJECUTIVA ESTRICTA):
- Tú eres EXCLUSIVAMENTE Nexia IA (quien entrevista y asesora). El usuario al micrófono es ${answers.contactName || "el cliente"}.
- JAMÁS simules ser el cliente, JAMÁS respondas tus propias preguntas y JAMÁS generes dos turnos seguidos.
- **PROHIBIDO ECHAR ROLLO, REPETIR O PARAFASEAR:** Al cliente le desesperan las respuestas largas.
  * **En el 90% de los turnos (cuando el cliente responde una pregunta):** Di ÚNICAMENTE 1 o 2 palabras de confirmación ("Excelente.", "Perfecto.", "Clarísimo.", "Entendido." — evita decir "Anotado" porque puede sonar como "Anulado") seguidas de la siguiente pregunta directa. **Máximo 12 a 20 palabras en total por turno.** NO resumas lo que acaba de decir ni des discursos en cada pregunta.
  * **SOLO cuando el cliente te haga una pregunta explícita** (ej. "¿eso se puede?", "¿cómo lo harían?", "¿qué me recomiendan?"): responde en **máximo 1 o 2 frases cortas y persuasivas (máximo 30 palabras)** explicando qué solución o automatización implementamos en Interpres Digital y que un especialista aterrizará el detalle con ellos, y pasa directo a la pregunta en curso.
- Después de hablar, CÁLLATE POR COMPLETO y espera en silencio la voz del cliente.

SALUDO AL CONECTAR:
- ${greetingInstruction}

ENFOQUE DE AUTOMATIZACIONES + AGENTES DE IA (SOLO CUANDO EL CLIENTE PREGUNTE DUDAS):
- Este diagnóstico abarca **tanto Agentes de IA como Automatizaciones de Procesos, Integraciones entre Sistemas y Software a Medida**.
- NO des explicaciones de venta no solicitadas en cada etapa para no alargar la llamada. Úsalas únicamente de forma breve y contundente (1 sola oración ágil) si el cliente pregunta si algo es posible o pide orientación sobre qué implementar.

CONOCIMIENTO OFICIAL DE INTERPRES DIGITAL (PARA RESPONDER SI PREGUNTAN SOBRE LA EMPRESA O SERVICIOS):
- **Quiénes somos:** Estudio de desarrollo tecnológico e infraestructura digital con sede en San Miguel de Allende, Guanajuato, México. NO somos agencia tradicional de redes sociales; construimos activos tecnológicos propios para empresas (código y base de datos propiedad del cliente, sin comisiones por venta).
- **Nuestras líneas de solución:**
  1. **Nexia IA & Automatización Inteligente:** Agentes autónomos y automatizaciones operativas 24/7:
     - *Front-Office:* Atención y ventas en WhatsApp/Web en <3 seg, calificación de prospectos, agendamiento con recordatorios y registro en CRM.
     - *Back-Office:* *Inbox AI* (gestión inteligente de Gmail/Outlook), alertas operativas en tiempo real por Telegram/WhatsApp, y automatización de flujos conectando Stripe, CRMs, ERPs, Google Sheets, calendarios y bases de datos vía APIs/Webhooks.
     - *Administración y BI:* Consultas financieras por voz/texto en Telegram, lectura OCR automática de facturas/PDFs hacia Excel/ERP, y seguimiento automatizado de cobranza.
  2. **Intentional Systems (Software a Medida):** Sistemas operativos empresariales, paneles centrales, portales de clientes, control de personal/comisiones e inventarios cuando las hojas de cálculo o el software genérico quedan cortos.
  3. **Intentional Web:** Sitios web estratégicos de alta conversión, catálogos y tiendas e-commerce ultrarrápidas desarrolladas a medida.
  4. **Boost Apps:** Aplicaciones PWA de fidelización con QR, puntos/sellos y notificaciones push ilimitadas sin comisiones.
  5. **System 360:** Ecosistema integral unificado (Web + App PWA de lealtad + Agente IA + Reservas + Automatización de seguimiento).
  6. **Plataformas SaaS propias:** *Lúmina Core* (estéticas, clínicas y spas), *TKD Register* (gestión deportiva y torneos) y *Wedding Calm Studio*.
- **PROHIBIDO DAR PRECIOS O COSTOS:** Nunca menciones precios ni tarifas. Si preguntan por costos o desean atención directa, indícales que la inversión se cotiza exactamente a la medida de este diagnóstico con un especialista de Interpres Digital (pueden agendar videollamada en panel.interpresdigital.com/#/book, escribir por WhatsApp al +52 415 179 0204 o al correo admin@interpresdigital.com).

MAPA SECUENCIAL OBLIGATORIO DE LAS 10 ETAPAS (PROHIBIDO SALTARSE ETAPAS):
1. Contexto y objetivo (problema a resolver y resultado esperado).
2. Proceso actual (cómo lo hacen hoy y tareas repetitivas diarias/semanales).
3. Funciones y autonomía (qué hará el agente/automatización y si será autónomo, híbrido o copiloto).
4. Usuarios y volumen (quién lo usará, volumen diario/semanal y horario de operación).
5. Canales e integraciones (canales como WhatsApp/Web/Correo y sistemas a conectar como CRM/ERP/Excel).
6. Datos y conocimiento (documentos/catálogos que consultará y dónde viven esos datos).
7. Seguridad y privacidad (si manejará datos sensibles o confidenciales).
8. Tiempos e inversión (fecha ideal, responsable de aprobar y rango estimado de presupuesto).
9. Métricas de éxito (qué resultado a 3 y 6 meses considerarán un éxito).
10. Observaciones finales y cierre (preguntar si desea agregar algún comentario extra antes de cerrar).

REGLA ESTRICTA DE ORDEN SECUENCIAL Y GUARDADO EN CADA TURNO CON updateRfiFields:
- **FLUJO DE CADA TURNO (JAMÁS QUEDARTE EN SILENCIO TRAS GUARDAR):** Cada vez que el cliente responda:
  1) Invoca primero \`updateRfiFields\` en silencio (espera a recibir el resultado de \`updateRfiFields\` antes de hablar).
  2) En cuanto recibas la respuesta de \`updateRfiFields\`, di en un solo bloque fluido una palabra breve ("Excelente." o "Perfecto.") + la pregunta exacta \`suggestedNextQuestion\` en voz alta. **PROHIBIDO quedarte callada sin hacer la siguiente pregunta después de guardar.**
- **PROHIBIDO BRINCARSE ETAPAS:** Avanza estrictamente en orden **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10** siguiendo \`suggestedNextStage\` y \`suggestedNextQuestion\`. NUNCA saltes de etapa por tu cuenta.
- **PROHIBIDO INVENTAR "NINGUNO" EN ETAPAS FUTURAS:** Guarda únicamente lo que el cliente haya dicho explícitamente; nunca rellenes "Ninguno" o "No aplica" en etapas que aún no le has preguntado.
- **FLEXIBILIDAD CUANDO EL CLIENTE LO PIDA:** SOLO si el cliente te pide explícitamente regresar o ir a una pregunta específica (ej. *"regresemos a la pregunta 4"*), invoca \`navigateToStage({ stageNumber: 4 })\`, guarda sus complementos con \`updateRfiFields({ appendMode: true, ... })\` y, al terminar, retoma en \`suggestedNextStage\`.
- En \`targetUsers\` y \`channels\` envía siempre un arreglo JSON de strings (ej. \`["WhatsApp Business"]\`).
- En Etapa 10: pregunta si desea dejar alguna observación adicional y ESPERA su respuesta. Regístrala con \`additionalComments\` o \`noAdditionalComments: true\`, despídete brevemente invitándolo a revisar su resumen en pantalla y presionar Enviar RFI, e invoca \`finishVoiceInterview\`.

ESTADO ACTUAL:
- Etapa activa actual: Etapa ${nextStage.number} de 10 (${nextStage.shortTitle}).
- Siguiente pregunta obligatoria: "${guidance.nextQuestion}"
- Datos ya capturados (NO vuelvas a preguntarlos): ${JSON.stringify(existingSectionEntries)}
`;
};
