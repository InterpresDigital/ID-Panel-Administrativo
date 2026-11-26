import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPdfLogo, drawProportionalLogo } from './pdfLogoHelper';

interface BranchData {
  id: string;
  branchName: string;
  streetNum: string;
  colonia: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  mapsLink: string;
  bookingWhatsapp: string;
  publicEmail: string;
  socialInstagram: string;
  socialFacebook: string;
  socialTiktok: string;
  weeklyHours: Record<string, { type: 'hours' | 'closed' | 'appointment'; from: string; to: string }>;
}

interface BriefingData {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  email: string;
  whatsapp: string;
  createdAt: any;
  answers: {
    clientName: string;
    businessName: string;
    email: string;
    whatsapp: string;
    hasWebsite: string;
    websiteUrl: string;
    requiresInvoice: string;
    taxName: string;
    taxRfc: string;
    taxRegime: string;
    taxPostalCode: string;
    taxCfdiUse: string;
    taxEmail: string;
    establishmentType: string;
    description: string;
    operatingTime: string;
    targetAudience: string[];
    idealClient: string;
    brandPerception: string[];
    aiAvatarName: string;
    hasBrandManual: string;
    colorPrimary: string;
    colorSecondary: string;
    colorComplementary: string;
    colorsAvoid: string;
    visualStyle: string[];
    visualReferences: string;
    streetNum: string;
    colonia: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    mapsLink: string;
    socialInstagram: string;
    socialFacebook: string;
    socialTiktok: string;
    socialYoutube: string;
    socialOther: string;
    publicData: string[];
    bookingWhatsapp: string;
    publicEmail: string;
    weeklyHours: Record<string, { type: 'hours' | 'closed' | 'appointment'; from: string; to: string }>;
    hasMultipleBranches: string;
    primaryBranchName: string;
    branches: BranchData[];
  };
}

const COLORS = {
  headerBg: [7, 27, 54], // #071B36
  accent: [20, 100, 184], // #1464B8
  textDark: [16, 43, 75], // #102B4B
  textGray: [71, 95, 122], // Tinta secundaria
  border: [199, 213, 226], // #C7D5E2
  tableStripe: [246, 249, 252] // #F6F9FC
};

export const generateGeneralBriefingPDF = async (briefing: BriefingData) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);

  // Load logo with exact natural proportions
  const logo = await loadPdfLogo('white');

  // Helper for Section Titles
  const drawSectionHeader = (y: number, title: string) => {
    doc.setFillColor(COLORS.headerBg[0], COLORS.headerBg[1], COLORS.headerBg[2]);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 4, y + 5);
    return y + 11;
  };

  // Header Draw
  const drawPageHeader = () => {
    // Top colored banner
    doc.setFillColor(COLORS.headerBg[0], COLORS.headerBg[1], COLORS.headerBg[2]);
    doc.rect(0, 0, pageWidth, 38, 'F');

    // Proportional Interpres Digital Logo (3.0:1)
    drawProportionalLogo(doc, logo, {
      x: margin,
      boxTopY: 0,
      boxHeight: 38,
      maxWidth: 56,
      maxHeight: 18.5,
      fallbackText: "INTERPRES DIGITAL",
      fallbackColor: [255, 255, 255],
    });

    // Title / Client name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("BRIEFING GENERAL DE DESARROLLO", pageWidth - margin, 17.5, { align: 'right' });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(199, 210, 254); // Light indigo
    doc.text(briefing.businessName || briefing.clientName, pageWidth - margin, 24.5, { align: 'right' });
  };

  // --- PAGE 1: DATOS GENERALES & FISCALES ---
  drawPageHeader();

  let currentY = 48;

  // Sec 1: Información de Contacto
  currentY = drawSectionHeader(currentY, "1. Información General del Cliente");
  
  const contactData = [
    ["Nombre del Cliente:", briefing.clientName],
    ["Nombre Comercial:", briefing.businessName],
    ["Correo de Envío:", briefing.email],
    ["WhatsApp de Contacto:", briefing.whatsapp],
    ["¿Tiene Sitio Web?:", briefing.answers.hasWebsite || "No"],
    ["Enlace Web Actual:", briefing.answers.websiteUrl || "Ninguno"]
  ];

  autoTable(doc, {
    startY: currentY,
    body: contactData,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: COLORS.textDark },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 45, textColor: COLORS.textGray }, 
      1: { cellWidth: 'auto' } 
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Sec 2: Datos de Facturación
  currentY = drawSectionHeader(currentY, "2. Detalles Fiscales (Facturación)");

  const billingData = briefing.answers.requiresInvoice === "Sí" ? [
    ["Razón Social:", briefing.answers.taxName],
    ["RFC:", briefing.answers.taxRfc],
    ["Régimen Fiscal:", briefing.answers.taxRegime],
    ["Código Postal:", briefing.answers.taxPostalCode],
    ["Uso de CFDI:", briefing.answers.taxCfdiUse],
    ["Correo Facturación:", briefing.answers.taxEmail]
  ] : [
    ["Requiere Factura:", "No solicita factura fiscal."]
  ];

  autoTable(doc, {
    startY: currentY,
    body: billingData,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: COLORS.textDark },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 45, textColor: COLORS.textGray }, 
      1: { cellWidth: 'auto' } 
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Sec 3: Perfil y Concepto
  currentY = drawSectionHeader(currentY, "3. Perfil y Concepto del Establecimiento");

  const profileData = [
    ["Giro / Industria:", briefing.answers.establishmentType],
    ["Tiempo de Operación:", briefing.answers.operatingTime],
    ["Avatar Inteligencia Artificial:", briefing.answers.aiAvatarName || "No definido"],
    ["Descripción del Negocio:", briefing.answers.description || "Sin descripción"],
    ["Público Objetivo:", briefing.answers.targetAudience?.join(", ") || "No especificado"],
    ["Perfil Cliente Ideal:", briefing.answers.idealClient || "No especificado"]
  ];

  autoTable(doc, {
    startY: currentY,
    body: profileData,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: COLORS.textDark },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 45, textColor: COLORS.textGray }, 
      1: { cellWidth: 'auto' } 
    },
    margin: { left: margin, right: margin }
  });

  // --- PAGE 2: IDENTIDAD VISUAL & SUCURSALES ---
  doc.addPage();
  drawPageHeader();

  currentY = 48;

  // Sec 4: Paleta e Identidad Visual
  currentY = drawSectionHeader(currentY, "4. Identidad Visual y Estilos");

  const visualData = [
    ["Colores Seleccionados:", `Principal: ${briefing.answers.colorPrimary || "N/A"} | Secundario: ${briefing.answers.colorSecondary || "N/A"} | Complementario: ${briefing.answers.colorComplementary || "N/A"}`],
    ["Colores a Evitar:", briefing.answers.colorsAvoid || "Ninguno"],
    ["Manual de Identidad:", briefing.answers.hasBrandManual || "No"],
    ["Estilos Visuales:", briefing.answers.visualStyle?.join(", ") || "No especificados"],
    ["Referencias Visuales / Links:", briefing.answers.visualReferences || "Ninguna"]
  ];

  autoTable(doc, {
    startY: currentY,
    body: visualData,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: COLORS.textDark },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 45, textColor: COLORS.textGray }, 
      1: { cellWidth: 'auto' } 
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Sec 5: Sucursales y Horarios
  currentY = drawSectionHeader(currentY, "5. Presencia Física y Horarios");

  const addressLabel = briefing.answers.hasMultipleBranches === "Sí" 
    ? `Matriz: ${briefing.answers.primaryBranchName || 'Principal'}` 
    : "Dirección Principal";

  const presenceData = [
    [addressLabel, `${briefing.answers.streetNum}, Col. ${briefing.answers.colonia}, ${briefing.answers.city}, ${briefing.answers.state}, CP ${briefing.answers.postalCode}`],
    ["Ubicación Google Maps:", briefing.answers.mapsLink || "No proporcionado"],
    ["WhatsApp Reservaciones:", briefing.answers.bookingWhatsapp],
    ["Email Público:", briefing.answers.publicEmail || "N/A"],
    ["Redes Sociales:", `IG: ${briefing.answers.socialInstagram || "-"} | FB: ${briefing.answers.socialFacebook || "-"} | TT: ${briefing.answers.socialTiktok || "-"}`]
  ];

  autoTable(doc, {
    startY: currentY,
    body: presenceData,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: COLORS.textDark },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 45, textColor: COLORS.textGray }, 
      1: { cellWidth: 'auto' } 
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  // Horarios de la matriz
  const hoursRows = Object.keys(briefing.answers.weeklyHours || {}).map(day => {
    const sched = briefing.answers.weeklyHours[day];
    let schedStr = "Cerrado";
    if (sched.type === "hours") schedStr = `${sched.from} a ${sched.to}`;
    else if (sched.type === "appointment") schedStr = "Solo Cita";
    return [day, schedStr];
  });

  // Chunk hours in columns to save space
  const hoursLeft = hoursRows.slice(0, 4);
  const hoursRight = hoursRows.slice(4);
  const combinedHours: string[][] = [];
  for (let i = 0; i < 4; i++) {
    const left = hoursLeft[i] || ["", ""];
    const right = hoursRight[i] || ["", ""];
    combinedHours.push([left[0], left[1], "", right[0], right[1]]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [['Día', 'Horario', '', 'Día', 'Horario']],
    body: combinedHours,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5, textColor: COLORS.textDark },
    headStyles: { fillColor: COLORS.headerBg, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 20 },
      1: { cellWidth: 35 },
      2: { cellWidth: 10 },
      3: { fontStyle: 'bold', cellWidth: 20 },
      4: { cellWidth: 35 }
    },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Add branches if hasMultipleBranches === 'Sí'
  if (briefing.answers.hasMultipleBranches === "Sí" && briefing.answers.branches && briefing.answers.branches.length > 0) {
    // If we have branches, print them in a new page or under if fits
    briefing.answers.branches.forEach((branch, idx) => {
      // Check if space left is enough, otherwise add page
      if (currentY > pageHeight - 65) {
        doc.addPage();
        drawPageHeader();
        currentY = 48;
      }

      currentY = drawSectionHeader(currentY, `Sucursal Adicional #${idx + 2}: ${branch.branchName}`);

      const branchPresence = [
        ["Dirección:", `${branch.streetNum}, Col. ${branch.colonia}, ${branch.city}, ${branch.state}, CP ${branch.postalCode}`],
        ["Enlace Google Maps:", branch.mapsLink || "No proporcionado"],
        ["WhatsApp Sucursal:", branch.bookingWhatsapp],
        ["Email Público:", branch.publicEmail || "N/A"],
        ["Redes (Específicas):", `IG: ${branch.socialInstagram || "-"} | FB: ${branch.socialFacebook || "-"} | TT: ${branch.socialTiktok || "-"}`]
      ];

      autoTable(doc, {
        startY: currentY,
        body: branchPresence,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, textColor: COLORS.textDark },
        columnStyles: { 
          0: { fontStyle: 'bold', cellWidth: 40, textColor: COLORS.textGray }, 
          1: { cellWidth: 'auto' } 
        },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 3;

      // Draw branch hours
      const branchHoursRows = Object.keys(branch.weeklyHours || {}).map(day => {
        const sched = branch.weeklyHours[day];
        let schedStr = "Cerrado";
        if (sched.type === "hours") schedStr = `${sched.from} a ${sched.to}`;
        else if (sched.type === "appointment") schedStr = "Solo Cita";
        return [day, schedStr];
      });

      const bHoursLeft = branchHoursRows.slice(0, 4);
      const bHoursRight = branchHoursRows.slice(4);
      const bCombinedHours: string[][] = [];
      for (let i = 0; i < 4; i++) {
        const left = bHoursLeft[i] || ["", ""];
        const right = bHoursRight[i] || ["", ""];
        bCombinedHours.push([left[0], left[1], "", right[0], right[1]]);
      }

      autoTable(doc, {
        startY: currentY,
        head: [['Día', 'Horario', '', 'Día', 'Horario']],
        body: bCombinedHours,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1, textColor: COLORS.textDark },
        headStyles: { fillColor: [20, 100, 184], textColor: [255, 255, 255], fontStyle: 'bold' }, // #1464B8 table header
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 20 },
          1: { cellWidth: 35 },
          2: { cellWidth: 10 },
          3: { fontStyle: 'bold', cellWidth: 20 },
          4: { cellWidth: 35 }
        },
        margin: { left: margin, right: margin }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    });
  }

  // Footer for all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generado el ${new Date().toLocaleDateString()} | Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  const safeClientName = (briefing.answers.businessName || briefing.clientName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .substring(0, 25);
  doc.save(`briefing_${safeClientName}.pdf`);
};
