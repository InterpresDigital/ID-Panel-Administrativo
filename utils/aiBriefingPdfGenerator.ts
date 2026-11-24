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
import {
  loadPdfLogo,
  drawProportionalLogo,
  registerCrispPdfFont,
  LoadedPdfLogo,
} from "./pdfLogoHelper";

const COLORS = {
  inkBlack: [10, 15, 25] as [number, number, number], // Tinta negra profunda de máxima legibilidad
  titleNavy: [15, 23, 42] as [number, number, number], // Slate 900
  labelSlate: [51, 65, 85] as [number, number, number], // Slate 700 nítido (nunca gris pálido)
  accent: [79, 70, 229] as [number, number, number], // Indigo 600
  darkHeaderFill: [30, 41, 59] as [number, number, number], // Slate 800 para encabezados de tabla comparativa
  cardBg: [248, 250, 252] as [number, number, number], // Fondo suave de tarjeta resumen
  stripe: [249, 250, 252] as [number, number, number], // Cebra muy sutil para no restar contraste a la tinta
  border: [203, 213, 225] as [number, number, number], // Borde limpio Slate 300
};

/**
 * Limpia marcas crudas de Markdown (**negritas**, encabezados ###), espacios especiales
 * y normaliza guiones/viñetas para una lectura uniforme y nítida en el PDF.
 */
const cleanPdfText = (raw?: unknown): string => {
  const txt = safeStr(raw);
  if (!txt) return "";
  return txt
    .replace(/\u00a0/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

/**
 * Garantiza que ninguna línea del encabezado derecho invada jamás el espacio del logotipo.
 */
const fitHeaderLine = (doc: jsPDF, text: string, maxWidthMm = 118): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (doc.getTextWidth(clean) <= maxWidthMm) return clean;
  let clipped = clean;
  while (clipped.length > 4 && doc.getTextWidth(`${clipped}...`) > maxWidthMm) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}...`;
};

/**
 * Encabezado corporativo limpio sobre fondo blanco (alineado con Cotizaciones y Contratos):
 * - Cero líneas blancas fantasma en bordes de página
 * - Logotipo oficial a color en proporción exacta 4.96:1
 * - Línea divisoria Índigo corporativa de margen a margen
 */
const drawCleanExecutiveHeader = (
  doc: jsPDF,
  logo: LoadedPdfLogo | null,
  fontName: string,
  title: string,
  subtitle: string,
  badgeText?: string
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxRightWidth = pageWidth - margin - 76;

  drawProportionalLogo(doc, logo, {
    x: margin,
    boxTopY: 6,
    boxHeight: 24,
    maxWidth: 52,
    maxHeight: 13.5,
    fallbackText: "INTERPRES DIGITAL",
    fallbackColor: COLORS.titleNavy,
  });

  doc.setFont(fontName, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.titleNavy);
  doc.text(fitHeaderLine(doc, title, maxRightWidth), pageWidth - margin, 14.5, {
    align: "right",
  });

  doc.setFont(fontName, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.labelSlate);
  doc.text(fitHeaderLine(doc, subtitle, maxRightWidth), pageWidth - margin, 20.5, {
    align: "right",
  });

  if (badgeText) {
    doc.setFont(fontName, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.accent);
    doc.text(fitHeaderLine(doc, badgeText, maxRightWidth), pageWidth - margin, 26, {
      align: "right",
    });
  }

  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(0.7);
  doc.line(margin, 32, pageWidth - margin, 32);

  return 38;
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
  const fontName = await registerCrispPdfFont(doc);
  const logo = await loadPdfLogo("color");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const a = sanitizeLegacyAnswers(options?.answersOverride || briefing.answers);
  const isEsTranslated = Boolean(options?.isTranslatedSpanish);

  const modeLabel =
    briefing.completionMode === "voice"
      ? "Entrevista IA por Voz"
      : briefing.completionMode === "hybrid"
      ? "Híbrido (Voz IA + Manual)"
      : "Formulario Manual";

  let currentY = drawCleanExecutiveHeader(
    doc,
    logo,
    fontName,
    "RFI — DISEÑO DE AGENTES DE IA Y AUTOMATIZACIÓN",
    `Empresa: ${a.companyName || briefing.companyName || "N/A"}  •  Fecha: ${a.requestDate || "N/A"}`,
    isEsTranslated
      ? `Modalidad: ${modeLabel}  •  EDICIÓN EN ESPAÑOL TÉCNICO (IA)`
      : `Modalidad: ${modeLabel}`
  );

  const addSectionTable = (title: string, rows: [string, string][]) => {
    autoTable(doc, {
      startY: currentY,
      head: [[{ content: title.toUpperCase(), colSpan: 2 }]],
      body: rows.map(([label, val]) => {
        const cleanVal = cleanPdfText(val);
        return [label, cleanVal ? cleanVal : "No especificado / Pendiente"];
      }),
      theme: "grid",
      styles: {
        font: fontName,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        font: fontName,
        fillColor: COLORS.accent,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9.5,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      bodyStyles: {
        font: fontName,
        textColor: COLORS.inkBlack,
        fontSize: 9.5,
        cellPadding: 3.5,
      },
      alternateRowStyles: {
        fillColor: COLORS.stripe,
      },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: "bold", textColor: COLORS.titleNavy },
        1: { cellWidth: pageWidth - margin * 2 - 60 },
      },
      margin: { left: margin, right: margin, bottom: 16 },
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
        ? toAttachmentArray(a.attachments)
            .map((att) => `${att.name} (${att.url})`)
            .join("\n")
        : "Sin archivos adjuntos",
    ],
  ]);

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontName, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.labelSlate);
    doc.text(
      `RFI Diseño de Agentes de IA${
        isEsTranslated ? " (Traducción Técnica Español)" : ""
      } — Interpres Digital  •  Página ${i} de ${totalPages}`,
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
  const fontName = await registerCrispPdfFont(doc);
  const logo = await loadPdfLogo("color");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let currentY = drawCleanExecutiveHeader(
    doc,
    logo,
    fontName,
    "PRE-DIAGNÓSTICO ESTRATÉGICO Y COTIZADOR IA",
    `Prospecto: ${a.companyName || briefing.companyName || "N/A"}  •  Contacto: ${
      a.contactName || briefing.clientName || "N/A"
    }`,
    `DOCUMENTO CONFIDENCIAL INTERNO  •  Complejidad: ${
      safeStr(diag.complexityLevel) || "Evaluada"
    }  •  Tiempo est.: ${safeStr(diag.estimatedImplementationWeeks) || "Por definir"}`
  );

  // Ficha resumen ejecutiva autoajustable debajo del encabezado (envuelve correos largos sin desbordes ni recortes)
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: {
      font: fontName,
      fontSize: 8.8,
      textColor: COLORS.inkBlack,
      fillColor: COLORS.cardBg,
      lineColor: COLORS.border,
      lineWidth: 0.25,
      cellPadding: 2.8,
    },
    columnStyles: {
      0: { cellWidth: contentWidth / 2 },
      1: { cellWidth: contentWidth / 2 },
    },
    body: [
      [
        `Empresa / Contacto: ${a.companyName || briefing.companyName || "N/A"} (${
          a.contactName || briefing.clientName || "Sin contacto"
        })`,
        `Correo / WhatsApp: ${
          [a.contactEmail || briefing.email, a.contactPhone || briefing.whatsapp]
            .filter(Boolean)
            .join("  •  ") || "No especificado"
        }`,
      ],
      [
        `Ajuste Presupuestal: ${safeStr(diag.budgetFitStatus || "Evaluado")}`,
        `Fecha de Solicitud RFI: ${safeStr(a.requestDate || "Registrada")}`,
      ],
    ],
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  const addBlockTable = (title: string, rows: [string, string][]) => {
    if (currentY > pageHeight - 36) {
      doc.addPage();
      currentY = 18;
    }

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin, bottom: 16 },
      theme: "grid",
      head: [[{ content: title.toUpperCase(), colSpan: 2 }]],
      styles: {
        font: fontName,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        font: fontName,
        fillColor: COLORS.accent,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9.5,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      bodyStyles: {
        font: fontName,
        fontSize: 9.5,
        textColor: COLORS.inkBlack,
        cellPadding: 3.5,
      },
      alternateRowStyles: {
        fillColor: COLORS.stripe,
      },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: "bold", textColor: COLORS.titleNavy },
        1: { cellWidth: contentWidth - 52 },
      },
      body: rows.map(([k, v]) => [k, cleanPdfText(v) || "—"]),
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  };

  const block1Rows: [string, string][] = [];
  if (diag.solutionArchetype) {
    block1Rows.push(["Tipo / Arquetipo de solución", safeStr(diag.solutionArchetype)]);
  }
  block1Rows.push(
    ["Diagnóstico ejecutivo", safeStr(diag.executiveSummary)],
    ["Presupuesto declarado por cliente", safeStr(a.estimatedBudget || "Por definir")],
    ["Ajuste presupuestal", safeStr(diag.budgetFitStatus || "Evaluado")],
    ["Análisis de presupuesto vs. necesidades", safeStr(diag.budgetVsNeedsAnalysis)]
  );
  if (diag.pricingRationale) {
    block1Rows.push(["Economía unitaria y congruencia de costos", safeStr(diag.pricingRationale)]);
  }
  block1Rows.push([
    "Qué se puede hacer",
    toStringArray(diag.whatCanBeDone)
      .map((x) => `• ${cleanPdfText(x)}`)
      .join("\n"),
  ]);

  addBlockTable("1. Diagnóstico e Interpretación Presupuesto vs. Alcance", block1Rows);

  addBlockTable("2. Qué Ofrecer y Estrategia Comercial de Cierre", [
    ["Líneas Interpres recomendadas", toStringArray(diag.recommendedInterpresLines).join("  •  ")],
    ["Cómo presentarlo y venderlo", safeStr(diag.commercialPitchAndHowToOffer)],
    ["Argumento de ROI para el cliente", safeStr(diag.roiArgument)],
    ["Esquema de cobro sugerido", safeStr(diag.paymentStructureRecommendation)],
  ]);

  if (Array.isArray(diag.pricingPackagesMxn) && diag.pricingPackagesMxn.length > 0) {
    // Asegurar espacio suficiente para el encabezado + la primera opción completa sin dejar cabecera huérfana
    if (currentY > pageHeight - 95) {
      doc.addPage();
      currentY = 18;
    }

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin, bottom: 16 },
      theme: "grid",
      rowPageBreak: "avoid",
      styles: {
        font: fontName,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      head: [
        [
          {
            content: "3. ESCENARIOS DE COTIZACIÓN SUGERIDOS (MXN + IVA)",
            colSpan: 5,
            styles: {
              fillColor: COLORS.accent,
              textColor: [255, 255, 255],
              fontSize: 9.5,
              fontStyle: "bold",
            },
          },
        ],
        [
          "Opción / Paquete",
          "Pago Único\n(Setup)",
          "Póliza\nMensual",
          "Tiempo\nEst.",
          "Entregables y Desglose Mensual",
        ],
      ],
      headStyles: {
        font: fontName,
        fillColor: COLORS.darkHeaderFill,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.8,
        lineColor: [51, 65, 85],
        lineWidth: 0.2,
        cellPadding: 3,
      },
      bodyStyles: {
        font: fontName,
        fontSize: 9,
        textColor: COLORS.inkBlack,
        cellPadding: 3.2,
      },
      alternateRowStyles: {
        fillColor: COLORS.stripe,
      },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: "bold", textColor: COLORS.titleNavy },
        1: { cellWidth: 29, fontStyle: "bold" },
        2: { cellWidth: 27, fontStyle: "bold" },
        3: { cellWidth: 20 },
        4: { cellWidth: contentWidth - 118 },
      },
      body: diag.pricingPackagesMxn.map((pkg) => {
        const delivText = toStringArray(pkg.deliverables)
          .map((d) => `• ${cleanPdfText(d)}`)
          .join("\n");
        const breakdownText = safeStr(pkg.monthlyRetainerBreakdown).trim()
          ? `\n\nDesglose póliza mensual:\n${cleanPdfText(pkg.monthlyRetainerBreakdown)}`
          : "";
        return [
          `${cleanPdfText(pkg.tierName)}\n(${cleanPdfText(pkg.subtitle)})`,
          formatMxnPdf(pkg.setupPriceMxn),
          `${formatMxnPdf(pkg.monthlyRetainerMxn)}/mes`,
          cleanPdfText(pkg.estimatedWeeks),
          `${delivText}${breakdownText}`,
        ];
      }),
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  const block4Rows: [string, string][] = [
    ["Arquitectura recomendada", safeStr(diag.recommendedArchitecture)],
  ];
  if (diag.deterministicVsAiSplit) {
    block4Rows.push(
      [
        "Motor determinista / reglas exactas",
        safeStr(diag.deterministicVsAiSplit.deterministicScope),
      ],
      [
        "Capa cognitiva IA (Google Gemini)",
        safeStr(diag.deterministicVsAiSplit.aiCognitiveScope),
      ]
    );
  }
  block4Rows.push(
    ["Ruta de integración paso a paso", toStringArray(diag.stepByStepIntegrationPlan).join("\n")],
    [
      "Alcance Fase 1 (PoC / MVP)",
      toStringArray(diag.mvpScope)
        .map((x) => `• ${cleanPdfText(x)}`)
        .join("\n"),
    ],
    [
      "Alcance Fase 2 (Escalamiento)",
      toStringArray(diag.phase2Scope)
        .map((x) => `• ${cleanPdfText(x)}`)
        .join("\n"),
    ]
  );

  addBlockTable("4. Arquitectura Técnica y Cómo Integrarlo", block4Rows);

  if (diag.securityArchitecture) {
    addBlockTable("5. Arquitectura de Ciberseguridad y Gobernanza de Datos", [
      ["Nivel de criticidad / blindaje", safeStr(diag.securityArchitecture.riskTier)],
      [
        "Capas de seguridad recomendadas",
        toStringArray(diag.securityArchitecture.recommendedLayers)
          .map((l) => `• ${cleanPdfText(l)}`)
          .join("\n"),
      ],
      [
        "Gobernanza, residencia y retención",
        safeStr(diag.securityArchitecture.dataGovernanceAndRetention),
      ],
    ]);
  }

  const block6Rows: [string, string][] = [];
  if (Array.isArray(diag.clientQuestionsResponses) && diag.clientQuestionsResponses.length > 0) {
    block6Rows.push([
      "Respuestas a preguntas directas del cliente",
      diag.clientQuestionsResponses
        .map(
          (qa, idx) =>
            `${idx + 1}. ${cleanPdfText(qa?.question)}\nRespuesta: ${cleanPdfText(
              qa?.strategicAnswer
            )}`
        )
        .join("\n\n"),
    ]);
  }
  block6Rows.push(
    [
      "Riesgos y dependencias a cuidar",
      toStringArray(diag.criticalRisks)
        .map((x) => `• ${cleanPdfText(x)}`)
        .join("\n"),
    ],
    [
      "Preguntas clave para el cliente",
      toStringArray(diag.followUpQuestions)
        .map((x) => `• ${cleanPdfText(x)}`)
        .join("\n"),
    ]
  );

  addBlockTable(
    diag.securityArchitecture
      ? "6. Respuestas al Cliente, Riesgos y Preguntas de Descubrimiento"
      : "5. Riesgos Críticos y Preguntas para Reunión de Cierre",
    block6Rows
  );

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontName, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.labelSlate);
    doc.text(
      `CONFIDENCIAL INTERNO — Interpres Digital  •  Estrategia y Cotizador IA  •  Página ${i} de ${totalPages}`,
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
