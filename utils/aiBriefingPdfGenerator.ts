import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AiBriefingAnswers,
  AiBriefingRecord,
  safeStr,
  sanitizeLegacyAnswers,
  toAttachmentArray,
  toStringArray,
} from "./aiBriefingTypes";
import { loadPdfLogo, drawProportionalLogo } from "./pdfLogoHelper";

const COLORS = {
  headerBg: [15, 23, 42] as [number, number, number],
  accent: [79, 70, 229] as [number, number, number],
  textDark: [30, 41, 59] as [number, number, number],
  textGray: [100, 116, 139] as [number, number, number],
  stripe: [248, 250, 252] as [number, number, number],
};

/**
 * Limpia marcas crudas de Markdown (**negritas**, encabezados ###) y normaliza viñetas
 * para que las celdas de los PDFs ejecutivos luzcan limpias y editoriales.
 */
const cleanPdfText = (raw?: unknown): string => {
  const txt = safeStr(raw);
  if (!txt) return "";
  return txt
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*-\s+/gm, "• ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

/**
 * Garantiza que ninguna línea del encabezado oscuro invada jamás la zona izquierda del logotipo (máx. 122 mm).
 */
const fitHeaderLine = (doc: jsPDF, text: string, maxWidthMm = 122): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (doc.getTextWidth(clean) <= maxWidthMm) return clean;
  let clipped = clean;
  while (clipped.length > 4 && doc.getTextWidth(`${clipped}…`) > maxWidthMm) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}…`;
};

export interface GenerateAiBriefingPdfOptions {
  answersOverride?: Partial<AiBriefingAnswers> | null;
  isTranslatedSpanish?: boolean;
}

export const generateAiBriefingPDF = async (
  briefing: AiBriefingRecord,
  options?: GenerateAiBriefingPdfOptions
): Promise<void> => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const a = sanitizeLegacyAnswers(options?.answersOverride || briefing.answers);
  const isEsTranslated = Boolean(options?.isTranslatedSpanish);

  const headerHeight = 40;
  const maxRightTextWidth = pageWidth - 14 - 74; // 122mm libres a la derecha del logotipo

  // Header Banner
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  const logo = await loadPdfLogo("white");
  drawProportionalLogo(doc, logo, {
    x: 14,
    boxTopY: 0,
    boxHeight: headerHeight,
    maxWidth: 48,
    maxHeight: 13,
    fallbackText: "INTERPRES DIGITAL",
    fallbackColor: [255, 255, 255],
  });

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(
    fitHeaderLine(doc, "RFI — DISEÑO DE AGENTES DE IA Y AUTOMATIZACIÓN", maxRightTextWidth),
    pageWidth - 14,
    14,
    { align: "right" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(199, 210, 254);
  const companyLine = `Empresa: ${a.companyName || briefing.companyName || "N/A"}  |  Fecha: ${a.requestDate || "N/A"}`;
  doc.text(fitHeaderLine(doc, companyLine, maxRightTextWidth), pageWidth - 14, 21, {
    align: "right",
  });

  const modeLabel =
    briefing.completionMode === "voice"
      ? "Entrevista IA por Voz"
      : briefing.completionMode === "hybrid"
      ? "Híbrido (Voz IA + Manual)"
      : "Formulario Manual";
  const thirdLine = isEsTranslated
    ? `Modalidad: ${modeLabel}  |  Edición: Español Técnico (IA)`
    : `Modalidad: ${modeLabel}`;
  doc.setFontSize(8);
  doc.setTextColor(isEsTranslated ? 167 : 199, isEsTranslated ? 243 : 210, isEsTranslated ? 208 : 254);
  doc.text(fitHeaderLine(doc, thirdLine, maxRightTextWidth), pageWidth - 14, 27.5, {
    align: "right",
  });

  let currentY = 47;

  const addSectionTable = (title: string, rows: [string, string][]) => {
    autoTable(doc, {
      startY: currentY,
      head: [[title, ""]],
      body: rows.map(([label, val]) => {
        const cleanVal = cleanPdfText(val);
        return [label, cleanVal ? cleanVal : "No especificado / Pendiente"];
      }),
      theme: "grid",
      headStyles: {
        fillColor: COLORS.accent,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 10,
      },
      bodyStyles: {
        textColor: COLORS.textDark,
        fontSize: 9,
        cellPadding: 3.5,
      },
      alternateRowStyles: {
        fillColor: COLORS.stripe,
      },
      columnStyles: {
        0: { cellWidth: 62, fontStyle: "bold" },
        1: { cellWidth: pageWidth - 90 },
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 6;
  };

  addSectionTable("Datos Generales de la Solicitud", [
    ["Empresa solicitante", a.companyName || briefing.companyName],
    ["Contacto principal", a.contactName || briefing.clientName],
    ["Correo electrónico", a.contactEmail || briefing.email],
    ["Teléfono / WhatsApp", a.contactPhone || briefing.whatsapp],
    [
      "Consentimiento Privacidad, IA y Autorización",
      a.privacyConsentAccepted
        ? `Aceptado (${a.privacyConsentAcceptedAt || "Registrado"})`
        : "Pendiente",
    ],
  ]);

  addSectionTable("1. Contexto y Objetivo General", [
    ["Problema o necesidad de negocio", a.businessProblem],
    ["Resultado esperado", a.expectedOutcome],
    ["Iniciativas o herramientas de IA previas", a.previousAiInitiatives],
  ]);

  addSectionTable("2. Descripción del Puesto / Proceso a Automatizar", [
    ["Descripción del puesto o proceso actual", a.roleOrProcessDescription],
    ["Tareas diarias, semanales y mensuales", a.periodicTasks],
    ["% estimado automatizable", a.automationPercentage],
    ["Impacto cuando la persona no está disponible", a.unavailabilityImpact],
  ]);

  addSectionTable("3. Funciones y Tareas del Agente", [
    ["Funciones específicas a ejecutar", a.specificFunctions],
    ["Tareas fuera del alcance", a.outOfScopeTasks],
    ["Autonomía vs. escalamiento a humano", a.autonomyLevel],
  ]);

  addSectionTable("4. Usuarios y Volumen", [
    ["Quiénes usarán el agente", toStringArray(a.targetUsers).join(", ")],
    ["Número aproximado de usuarios", a.approxUserCount],
    ["Volumen esperado de interacciones", a.interactionVolume],
    ["Horarios de operación", a.operatingHours],
  ]);

  addSectionTable("5. Canales e Integraciones", [
    ["Canales de operación", toStringArray(a.channels).join(", ")],
    ["Sistemas a integrar (CRM, ERP, BD, etc.)", a.systemsToIntegrate],
    ["Disponibilidad de APIs o acceso técnico", a.apiAvailability],
  ]);

  addSectionTable("6. Datos y Conocimiento", [
    ["Documentos / base de conocimiento", a.knowledgeBaseDocs],
    ["Alojamiento y formato de datos", a.dataHostingAndFormat],
    ["Responsable de actualización", a.maintenanceOwner],
  ]);

  addSectionTable("7. Seguridad, Privacidad y Cumplimiento", [
    ["Datos sensibles o confidenciales", a.sensitiveData],
    ["Normativas o políticas a cumplir", a.compliancePolicies],
    ["Restricciones de región / infraestructura", a.dataResidency],
  ]);

  addSectionTable("8. Restricciones y Expectativas", [
    ["Presupuesto aproximado", a.estimatedBudget],
    ["Fecha ideal de puesta en marcha", a.idealLaunchDate],
    ["Idioma(s) de operación", a.operatingLanguages],
    ["Aprobador y Sponsor clave", a.approverAndSponsor],
  ]);

  addSectionTable("9. Métricas de Éxito", [
    ["KPIs de medición", a.kpis],
    ["Éxito esperado a 3 y 6 meses", a.successAt3And6Months],
  ]);

  addSectionTable("10. Observaciones, Comentarios Extra y Adjuntos", [
    ["Observaciones y comentarios adicionales", a.additionalComments],
    [
      "Documentos adjuntos",
      toAttachmentArray(a.attachments).length > 0
        ? toAttachmentArray(a.attachments).map((att) => `${att.name} (${att.url})`).join("\n")
        : "Sin archivos adjuntos",
    ],
  ]);

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text(
      `RFI Diseño de Agentes de IA${isEsTranslated ? " (Traducción Técnica Español)" : ""} — Interpres Digital | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const safeName = (a.companyName || briefing.companyName || "Cliente")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  doc.save(`RFI_Agente_IA_${safeName}${isEsTranslated ? "_ES" : ""}.pdf`);
};

const formatMxnPdf = (amount?: number): string => {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MXN`;
};

export const generateAiDiagnosticInternalPDF = async (briefing: AiBriefingRecord): Promise<void> => {
  if (!briefing.aiPreDiagnostic) return;
  const diag = briefing.aiPreDiagnostic;
  const a = sanitizeLegacyAnswers(briefing.answersTranslatedEs || briefing.answers);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const headerHeight = 40;
  const maxRightTextWidth = pageWidth - 14 - 74; // 122mm libres sin tocar jamás el logotipo

  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, headerHeight, "F");

  const logo = await loadPdfLogo("white");
  drawProportionalLogo(doc, logo, {
    x: 14,
    boxTopY: 0,
    boxHeight: headerHeight,
    maxWidth: 48,
    maxHeight: 13,
    fallbackText: "INTERPRES DIGITAL",
    fallbackColor: [255, 255, 255],
  });

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    fitHeaderLine(doc, "PRE-DIAGNÓSTICO ESTRATÉGICO Y COTIZADOR IA", maxRightTextWidth),
    pageWidth - 14,
    13.5,
    { align: "right" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(199, 210, 254);
  const prospectLine = `Prospecto: ${a.companyName || briefing.companyName || "N/A"}  |  Contacto: ${
    a.contactName || briefing.clientName || "N/A"
  }`;
  doc.text(fitHeaderLine(doc, prospectLine, maxRightTextWidth), pageWidth - 14, 21, {
    align: "right",
  });

  doc.setFontSize(8);
  doc.setTextColor(165, 180, 252);
  const metaLine = `CONFIDENCIAL INTERNO  •  Complejidad: ${
    safeStr(diag.complexityLevel) || "Evaluada"
  }  •  Tiempo est.: ${safeStr(diag.estimatedImplementationWeeks) || "Por definir"}`;
  doc.text(fitHeaderLine(doc, metaLine, maxRightTextWidth), pageWidth - 14, 28, {
    align: "right",
  });

  let currentY = 47;

  const addBlockTable = (title: string, rows: [string, string][]) => {
    if (currentY > pageHeight - 36) {
      doc.addPage();
      currentY = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.accent);
    doc.text(title.toUpperCase(), 14, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      theme: "grid",
      headStyles: { fillColor: COLORS.accent, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: COLORS.textDark, cellPadding: 3 },
      alternateRowStyles: { fillColor: COLORS.stripe },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: "bold" },
        1: { cellWidth: pageWidth - 78 },
      },
      body: rows.map(([k, v]) => [k, cleanPdfText(v) || "—"]),
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  };

  addBlockTable("1. Diagnóstico e Interpretación Presupuesto vs. Alcance", [
    ["Diagnóstico ejecutivo", safeStr(diag.executiveSummary)],
    ["Presupuesto declarado por cliente", safeStr(a.estimatedBudget || "Por definir")],
    ["Ajuste presupuestal", safeStr(diag.budgetFitStatus || "Evaluado")],
    ["Análisis de presupuesto vs. necesidades", safeStr(diag.budgetVsNeedsAnalysis)],
    ["Qué se puede hacer", toStringArray(diag.whatCanBeDone).map((x) => `• ${cleanPdfText(x)}`).join("\n")],
  ]);

  addBlockTable("2. Qué Ofrecer y Estrategia Comercial de Cierre", [
    ["Líneas Interpres recomendadas", toStringArray(diag.recommendedInterpresLines).join("  |  ")],
    ["Cómo presentarlo y venderlo", safeStr(diag.commercialPitchAndHowToOffer)],
    ["Argumento de ROI para el cliente", safeStr(diag.roiArgument)],
    ["Esquema de cobro sugerido", safeStr(diag.paymentStructureRecommendation)],
  ]);

  if (Array.isArray(diag.pricingPackagesMxn) && diag.pricingPackagesMxn.length > 0) {
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.accent);
    doc.text("3. ESCENARIOS DE COTIZACIÓN SUGERIDOS (MXN + IVA)", 14, currentY);
    currentY += 3;

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      theme: "grid",
      head: [["Opción / Paquete", "Implementación (Único)", "Póliza Mensual", "Tiempo", "Entregables Clave"]],
      headStyles: { fillColor: COLORS.headerBg, textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: COLORS.textDark, cellPadding: 2.8 },
      alternateRowStyles: { fillColor: COLORS.stripe },
      body: diag.pricingPackagesMxn.map((pkg) => [
        `${safeStr(pkg.tierName)}\n(${safeStr(pkg.subtitle)})`,
        formatMxnPdf(pkg.setupPriceMxn),
        `${formatMxnPdf(pkg.monthlyRetainerMxn)}/mes`,
        safeStr(pkg.estimatedWeeks),
        toStringArray(pkg.deliverables).map((d) => `• ${d}`).join("\n"),
      ]),
    });

    currentY = (doc as any).lastAutoTable.finalY + 7;
  }

  addBlockTable("4. Arquitectura Técnica y Cómo Integrarlo", [
    ["Arquitectura recomendada", safeStr(diag.recommendedArchitecture)],
    ["Ruta de integración paso a paso", toStringArray(diag.stepByStepIntegrationPlan).join("\n")],
    ["Alcance Fase 1 (MVP)", toStringArray(diag.mvpScope).map((x) => `• ${x}`).join("\n")],
    ["Alcance Fase 2 (Escalamiento)", toStringArray(diag.phase2Scope).map((x) => `• ${x}`).join("\n")],
  ]);

  addBlockTable("5. Riesgos Críticos y Preguntas para Reunión de Cierre", [
    ["Riesgos y dependencias a cuidar", toStringArray(diag.criticalRisks).map((x) => `• ${x}`).join("\n")],
    ["Preguntas clave para el cliente", toStringArray(diag.followUpQuestions).map((x) => `• ${x}`).join("\n")],
  ]);

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text(
      `CONFIDENCIAL INTERNO — Interpres Digital | Estrategia y Cotizador IA | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const safeName = (a.companyName || briefing.companyName || "Cliente")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  doc.save(`Prediagnostico_Cotizador_IA_${safeName}.pdf`);
};
