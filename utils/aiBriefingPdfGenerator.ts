import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
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

export const generateAiBriefingPDF = async (briefing: AiBriefingRecord): Promise<void> => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const a = sanitizeLegacyAnswers(briefing.answers);

  // Header Banner
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, pageWidth, 38, "F");

  const logo = await loadPdfLogo("white");
  drawProportionalLogo(doc, logo, {
    x: 14,
    boxTopY: 0,
    boxHeight: 38,
    maxWidth: 52,
    maxHeight: 14,
    fallbackText: "INTERPRES DIGITAL",
    fallbackColor: [255, 255, 255],
  });

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("RFI — DISEÑO DE AGENTE DE IA Y AUTOMATIZACIÓN", pageWidth - 14, 14.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(199, 210, 254);
  doc.text(
    `Empresa: ${a.companyName || briefing.companyName || "N/A"}  |  Fecha: ${a.requestDate || "N/A"}`,
    pageWidth - 14,
    21.5,
    { align: "right" }
  );
  doc.text(
    `Modalidad: ${
      briefing.completionMode === "voice"
        ? "Entrevista IA por Voz"
        : briefing.completionMode === "hybrid"
        ? "Híbrido (Voz IA + Manual)"
        : "Formulario Manual"
    }`,
    pageWidth - 14,
    27.5,
    { align: "right" }
  );

  let currentY = 46;

  const addSectionTable = (title: string, rows: [string, string][]) => {
    autoTable(doc, {
      startY: currentY,
      head: [[title, ""]],
      body: rows.map(([label, val]) => {
        const cleanVal = safeStr(val).trim();
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

  if (briefing.aiPreDiagnostic) {
    const diag = briefing.aiPreDiagnostic;
    addSectionTable("Anexo Interno — Pre-Diagnóstico IA (Interpres Digital)", [
      ["Complejidad estimada", `${diag.complexityLevel} (${diag.estimatedImplementationWeeks || "Por definir"})`],
      ["Resumen ejecutivo", diag.executiveSummary],
      ["Arquitectura sugerida", diag.recommendedArchitecture],
      ["Riesgos críticos detectados", toStringArray(diag.criticalRisks).join(" • ")],
      ["Alcance MVP sugerido", toStringArray(diag.mvpScope).join(" • ")],
    ]);
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text(
      `RFI Diseño de Agentes de IA — Interpres Digital | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const safeName = (a.companyName || briefing.companyName || "Cliente")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  doc.save(`RFI_Agente_IA_${safeName}.pdf`);
};
