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

export interface AiPreDiagnostic {
  complexityLevel: "Baja" | "Media" | "Alta" | "Enterprise";
  executiveSummary: string;
  recommendedArchitecture: string;
  criticalRisks: string[];
  mvpScope: string[];
  phase2Scope: string[];
  followUpQuestions: string[];
  estimatedImplementationWeeks: string;
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
  aiPreDiagnostic?: AiPreDiagnostic;
}

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

const STRING_ANSWER_KEYS: (keyof AiBriefingAnswers)[] = [
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
 * Normaliza tipos (especialmente arrays devueltos como strings por Gemini Live) y limpia
 * valores heredados por defecto ("24/7" / "Español") en borradores antiguos.
 */
export const sanitizeLegacyAnswers = (raw?: Partial<AiBriefingAnswers> | null): AiBriefingAnswers => {
  const merged: AiBriefingAnswers = {
    ...INITIAL_AI_BRIEFING_ANSWERS,
    ...(raw || {}),
  };

  for (const key of STRING_ANSWER_KEYS) {
    const v = (merged as any)[key];
    if (typeof v !== "string") {
      (merged as any)[key] = Array.isArray(v)
        ? v.join(", ")
        : v !== null && v !== undefined
        ? String(v)
        : "";
    }
  }

  merged.targetUsers = toStringArray(merged.targetUsers);
  merged.channels = toStringArray(merged.channels);
  merged.pendingSections = toNumberArray(merged.pendingSections);
  merged.attachments = Array.isArray(merged.attachments) ? merged.attachments : [];
  merged.privacyConsentAccepted = Boolean(merged.privacyConsentAccepted);
  merged.observationsConfirmed = Boolean(merged.observationsConfirmed);

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
        (hasStr(answers.estimatedBudget) || hasStr(answers.approverAndSponsor))
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
 * Calcula con precisión en qué etapa (1 a 10) debe posicionarse y retomar la entrevista,
 * evitando que un refresco de página o protector de pantalla regrese al usuario a la Etapa 1.
 */
export const resolveResumeSection = (
  answers: Partial<AiBriefingAnswers> | undefined | null
): number => {
  if (!answers) return 1;
  const pending = answers.pendingSections || [];

  // Si todas las etapas 1..9 están completas o marcadas pendientes -> Etapa 10
  const allCoreDone = AI_RFI_SECTIONS.filter((s) => s.number <= 9).every(
    (s) => isSectionFilled(answers, s.number) || pending.includes(s.number)
  );
  if (allCoreDone) return 10;

  // Detectar la etapa más avanzada que ya tiene respuestas registradas
  let highestProgressed = 0;
  for (let n = 1; n <= 10; n++) {
    if (isSectionFilled(answers, n) || isSectionPartial(answers, n) || pending.includes(n)) {
      highestProgressed = n;
    }
  }

  const savedStage =
    typeof answers.lastActiveSection === "number" &&
    answers.lastActiveSection >= 1 &&
    answers.lastActiveSection <= 10
      ? answers.lastActiveSection
      : 1;

  const anchorStage = Math.max(savedStage, highestProgressed, 1);

  if (anchorStage >= 10) return 10;

  // Si la etapa ancla sigue en curso, retomar exactamente ahí
  if (!isSectionFilled(answers, anchorStage) && !pending.includes(anchorStage)) {
    return anchorStage;
  }

  // Si la etapa ancla ya quedó completa, pasar a la siguiente etapa abierta (o a la 10)
  const nextAfterAnchor = AI_RFI_SECTIONS.find(
    (s) =>
      s.number > anchorStage &&
      s.number <= 9 &&
      !isSectionFilled(answers, s.number) &&
      !pending.includes(s.number)
  );
  return nextAfterAnchor ? nextAfterAnchor.number : 10;
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
      estimatedBudget: { type: Type.STRING, description: "Presupuesto aproximado o preferencia de propuesta" },
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
      markSectionPending: {
        type: Type.NUMBER,
        description:
          "Úsalo ÚNICAMENTE si el cliente dice explícitamente 'no lo sé' o 'lo revisará TI después' respecto a toda una sección (1 al 9). Nunca lo uses si el cliente sí respondió la pregunta.",
      },
    },
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

REGLA #0 ABSOLUTA — CERO AUTORESPUESTA Y CERO ROLLO:
- Tú eres EXCLUSIVAMENTE Nexia IA (quien entrevista y asesora). El usuario al micrófono es ${answers.contactName || "el cliente"}.
- JAMÁS simules ser el cliente, JAMÁS respondas tus propias preguntas y JAMÁS generes dos turnos seguidos.
- **CERO ROLLO / ULTRA CONCISA:** La gente se desespera con discursos largos. En turnos normales de avance usa **máximo 15 a 22 palabras en total** (confirmación de 2 a 4 palabras como "Perfecto, anotado." + la siguiente pregunta directa, sin repetir lo que dijo el cliente).
- Después de hacer tu pregunta, CÁLLATE POR COMPLETO y espera en silencio la voz del cliente. Si solo hay silencio o ruido ambiental, espera en silencio sin inventar datos.

SALUDO AL CONECTAR:
- ${greetingInstruction}

ENFOQUE CONSULTIVO Y LABOR DE VENTA PERSUASIVA (AUTOMATIZACIONES + AGENTES DE IA):
- Este diagnóstico abarca **tanto Agentes de IA como todo tipo de Automatizaciones de Procesos, Integraciones entre Sistemas y Software a Medida**.
- Cuando el cliente comparta un dolor operativo o pregunte *"¿eso se puede hacer?"* / *"¿qué me recomiendan?"*:
  1. Respóndele con seguridad consultiva y persuasiva en **1 sola frase ágil** explicando qué tipo de solución podemos implementar en Interpres Digital (por ejemplo: automatización automática vía webhooks/APIs entre su CRM, pagos y WhatsApp; un Agente Back-Office para correos, lectura OCR de facturas o alertas en Telegram; o un panel operativo central *Intentional Systems*), resaltando el beneficio directo (eliminar captura manual, operar 24/7 sin errores y ser dueños de sus propios datos).
  2. Aclara siempre con naturalidad que **un especialista de Interpres Digital aterrizará con ellos el alcance y arquitectura exacta**, y enseguida enlaza con la pregunta actual del diagnóstico.

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

REGLA DE GUARDADO CON updateRfiFields Y CIERRE EN ETAPA 10:
- En cada respuesta del cliente llama a updateRfiFields con lo que expresó y haz ÚNICAMENTE la nextQuestion que te devuelva la herramienta.
- En targetUsers y channels envía siempre un arreglo JSON de strings (ej. ["WhatsApp Business"]).
- En Etapa 10: pregunta si desea dejar alguna observación adicional y ESPERA su respuesta. Regístrala con additionalComments o noAdditionalComments: true, despídete brevemente invitándolo a revisar su resumen en pantalla y presionar Enviar RFI, e invoca finishVoiceInterview.

ESTADO ACTUAL:
- Etapa activa: Etapa ${nextStage.number} de 10 (${nextStage.shortTitle}).
- Siguiente pregunta exacta: "${guidance.nextQuestion}"
- Datos ya capturados en etapas previas (NO los repitas): ${JSON.stringify(existingSectionEntries)}
`;
};
