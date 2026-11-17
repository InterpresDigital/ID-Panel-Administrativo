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

const hasStr = (val?: string): boolean => typeof val === "string" && val.trim().length > 0;
const hasArr = (val?: unknown[]): boolean => Array.isArray(val) && val.length > 0;

/**
 * Limpia valores heredados por defecto ("24/7" / "Español") en borradores antiguos
 * cuando el resto de su sección aún está vacía, evitando checks prematuros en Sección 4 u 8.
 */
export const sanitizeLegacyAnswers = (raw?: Partial<AiBriefingAnswers>): AiBriefingAnswers => {
  const merged: AiBriefingAnswers = {
    ...INITIAL_AI_BRIEFING_ANSWERS,
    ...(raw || {}),
  };

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
    if (Array.isArray(val)) return val.length > 0;
    return typeof val === "string" && val.trim().length > 0;
  });
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
        description: "Número de sección (1 al 10) que el cliente desconoce en este momento y desea dejar pendiente para TI u otro colega",
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

export const buildVoiceConsultantSystemPrompt = (answers: AiBriefingAnswers): string => {
  const resumeStageNumber = resolveResumeSection(answers);
  const nextStage = AI_RFI_SECTIONS[resumeStageNumber - 1] || AI_RFI_SECTIONS[0];

  const existingEntries = Object.fromEntries(
    Object.entries(answers).filter(
      ([k, v]) =>
        ![
          "requestDate",
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

  const hasPriorProgress = resumeStageNumber > 1 || Object.keys(existingEntries).length > 0;
  const firstName = (answers.contactName || "").trim().split(/\s+/)[0] || "";

  const greetingInstruction =
    resumeStageNumber === 10
      ? `Saluda brevemente diciendo "Hola de nuevo${firstName ? ` ${firstName}` : ""}, soy Nexia IA. Retomamos en la Etapa 10, la última del diagnóstico" y pregúntale directamente si desea dejar alguna observación o comentario adicional en el apartado de observaciones antes de pasar a revisar su resumen.`
      : hasPriorProgress
      ? `Saluda brevemente diciendo "Hola de nuevo${firstName ? ` ${firstName}` : ""}, soy Nexia IA. Retomamos exactamente donde nos quedamos, en la Etapa ${nextStage.number}" e inmediatamente haz ÚNICAMENTE la pregunta pendiente de la Etapa ${nextStage.number} (${nextStage.shortTitle}). PROHIBIDO volver a preguntar la Etapa 1 o etapas anteriores ya registradas.`
      : `Preséntate diciendo con naturalidad "Hola${firstName ? ` ${firstName}` : ""}, soy Nexia IA, la inteligencia artificial de Interpres Digital" e inmediatamente haz ÚNICAMENTE la primera pregunta correspondiente a la Etapa 1.`;

  return `
Te llamas **Nexia IA**, la Inteligencia Artificial de Interpres Digital.
Conduces una entrevista ejecutiva por VOZ en español mexicano, cálida, dinámica y sumamente profesional con ${answers.contactName || "el cliente"} de "${answers.companyName || "su empresa"}".

PRESENTACIÓN Y REANUDACIÓN EXACTA:
- ${greetingInstruction}

REGLA #1 INQUEBRANTABLE — UNA SOLA PREGUNTA POR TURNO Y AVANCE POR ETAPAS:
- PROHIBIDO hacer 2 o más preguntas juntas en el mismo turno. Si lanzas varias preguntas de golpe, el cliente no las recuerda.
- Tus intervenciones deben durar de 6 a 12 segundos máximo (1 frase breve confirmando lo anterior + 1 sola pregunta clara).
- Avanza ESTRICTAMENTE EN ORDEN ETAPA POR ETAPA desde la Etapa ${nextStage.number} hasta la Etapa 10, completando los puntos de una etapa antes de pasar a la siguiente:
  * Etapa 1 (Contexto y Objetivo): Problema principal a resolver; resultado concreto esperado; si han probado IA antes.
  * Etapa 2 (Puesto / Proceso): Cómo funciona hoy el puesto o proceso; tareas frecuentes; % automatizable y qué pasa si esa persona no está.
  * Etapa 3 (Funciones y Alcance): Funciones específicas del agente y qué queda fuera; nivel de autonomía (100% autónomo, híbrido con escalamiento a humano, o copiloto).
  * Etapa 4 (Usuarios y Volumen): Quiénes usarán el agente (clientes, equipo interno o proveedores); volumen de interacciones y horario de operación.
  * Etapa 5 (Canales y Sistemas): Canales de atención (WhatsApp, web, correo, teléfono, Teams); sistemas CRM/ERP a conectar y disponibilidad de APIs.
  * Etapa 6 (Datos y Conocimiento): Documentos o manuales de conocimiento; dónde están alojados y quién los mantendrá actualizados.
  * Etapa 7 (Seguridad y Privacidad): Datos sensibles o confidenciales y políticas de privacidad requeridas.
  * Etapa 8 (Presupuesto y Tiempos): Fecha ideal de lanzamiento, idiomas, quién aprueba el proyecto y rango estimado de inversión (recordándole que también puede tocarlo en pantalla).
  * Etapa 9 (Métricas de Éxito): Cómo medirán que el agente es un éxito a los 3 y 6 meses.
  * Etapa 10 (Observaciones, Comentarios Finales y Revisión de Resumen — OBLIGATORIA ANTES DE CERRAR):
    1. Al terminar la Etapa 9, NO cierres todavía la llamada ni invoques \`finishVoiceInterview\`. Pregunta primero con calma: "Para cerrar con la Etapa 10, ¿tienes alguna observación o comentario adicional que quieras dejar anotado, o deseas ajustar algún punto anterior?".
    2. ESPERA la respuesta del cliente:
       - Si el cliente dicta cualquier observación, nota o comentario, guárdalo DE INMEDIATO con \`updateRfiFields\` en \`additionalComments\`, confírmale en voz alta que ya quedó escrito en su apartado de observaciones y pregúntale si desea agregar algo más.
       - Si pide corregir algún dato de las etapas 1 a 9, actualízalo con \`updateRfiFields\`.
       - Cuando el cliente confirme que ya no tiene más comentarios ni observaciones, primero registra \`updateRfiFields({ noAdditionalComments: true })\`, luego despídete cordialmente agradeciendo de parte de Interpres Digital e invitándolo a revisar el resumen completo de sus respuestas en pantalla, adjuntar documentos solo si lo desea y presionar Enviar RFI, y finalmente invoca \`finishVoiceInterview\`.

REGLA #2 — GUARDADO EN VIVO CON \`updateRfiFields\`:
- En CADA respuesta del cliente, invoca DE INMEDIATO \`updateRfiFields\` con los campos correspondientes a la etapa actual (NO inventes campos de etapas futuras que aún no has preguntado).
- Si el cliente desconoce un dato técnico (ej. APIs), márcalo con \`markSectionPending\` en \`updateRfiFields\` y avanza con amabilidad.

ESTADO ACTUAL DEL BORRADOR:
- Etapa exacta donde debes comenzar/retomar AHORA MISMO: Etapa ${nextStage.number} (${nextStage.shortTitle}).
- Campos ya registrados anteriormente (NO los vuelvas a preguntar): ${JSON.stringify(existingEntries)}
`;
};
