import jsPDF from 'jspdf';
import { LegalDocument, CompanyInfo } from '../types';
import { loadPdfLogo, drawProportionalLogo, drawProportionalSignature, LoadedPdfLogo } from './pdfLogoHelper';

const COLORS = {
  headerBg: [7, 27, 54], // #071B36
  textDark: [16, 43, 75], // #102B4B
  textGray: [71, 95, 122], // Tinta secundaria editorial
  accent: [20, 100, 184], // #1464B8
  success: [0, 169, 183], // #00A9B7
  pending: [217, 119, 6], // Amber 600
  border: [199, 213, 226], // #C7D5E2
  stripe: [246, 249, 252], // #F6F9FC
};

const drawDocHeader = (doc: jsPDF, legalDoc: LegalDocument, logo: LoadedPdfLogo | null) => {
  const pageWidth = doc.internal.pageSize.width;
  const headerHeight = 32;

  // Proportional Interpres Digital Logo (3.0:1)
  drawProportionalLogo(doc, logo, {
    x: 18,
    boxTopY: 3,
    boxHeight: 30,
    maxWidth: 54,
    maxHeight: 17.5,
    fallbackText: "INTERPRES DIGITAL",
    fallbackColor: [COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]],
  });

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("DOCUMENTO LEGAL MULTILATERAL", pageWidth - 18, 17, { align: 'right' });

  // Subtitle (date)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  const rawDocId = legalDoc?.id || '';
  const cleanDocId = rawDocId ? rawDocId.replace(/^doc_/, '').substring(0, 8).toUpperCase() : 'DOC';
  const docDate = legalDoc?.createdAt ? new Date(legalDoc.createdAt).toLocaleDateString() : new Date().toLocaleDateString();
  doc.text(`Fecha: ${docDate} | Folio: INT-LEG-${cleanDocId}`, pageWidth - 18, 23.5, { align: 'right' });

  // Indigo Accent Bottom line
  doc.setDrawColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
  doc.setLineWidth(0.8);
  doc.line(18, headerHeight + 3, pageWidth - 18, headerHeight + 3);

  return headerHeight + 15;
};

export const generateLegalDocumentPDF = async (legalDoc: LegalDocument, options?: { preview?: boolean }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const logo = await loadPdfLogo('color');

  const margin = 18;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const contentWidth = pageWidth - (margin * 2);
  const maxBodyY = pageHeight - margin - 15;

  let currentY = drawDocHeader(doc, legalDoc, logo);

  // Parse and render Content line by line (supporting headers and inline bold)
  const rawContent = legalDoc?.content || '';
  const lines = rawContent.split(/\r?\n/);

  lines.forEach(line => {
    let cleanLine = line.trim();
    if (!cleanLine) {
      currentY += 4.5;
      return;
    }

    let size = 9.5;
    let isBoldLine = false;

    // Detect heading sizes
    if (cleanLine.startsWith('# ')) {
      size = 18;
      isBoldLine = true;
      cleanLine = cleanLine.substring(2).trim();
    } else if (cleanLine.startsWith('## ')) {
      size = 14;
      isBoldLine = true;
      cleanLine = cleanLine.substring(3).trim();
    } else if (cleanLine.startsWith('### ')) {
      size = 11.5;
      isBoldLine = true;
      cleanLine = cleanLine.substring(4).trim();
    }

    if (isBoldLine) {
      cleanLine = cleanLine.replace(/\*\*/g, '');
    }

    doc.setFont("helvetica", isBoldLine ? "bold" : "normal");
    doc.setFontSize(size);

    const subLines = doc.splitTextToSize(cleanLine, contentWidth);
    let inBold = isBoldLine;

    subLines.forEach((subLine: string) => {
      if (currentY + 6 > maxBodyY) {
        doc.addPage();
        currentY = drawDocHeader(doc, legalDoc, logo);
      }

      const parts = subLine.split('**');
      let currentX = margin;

      parts.forEach((part, index) => {
        if (index > 0) {
          inBold = !inBold;
        }

        doc.setFont("helvetica", inBold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);

        doc.text(part, currentX, currentY);
        currentX += doc.getTextWidth(part);
      });

      currentY += size * 0.47 + 1.2;
    });

    currentY += 1.8;
  });

  // Attachments
  if (legalDoc.attachments && legalDoc.attachments.length > 0) {
    if (currentY + 25 > maxBodyY) {
      doc.addPage();
      currentY = drawDocHeader(doc, legalDoc, logo);
    }
    
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    doc.text("DOCUMENTOS ANEXOS:", margin, currentY);
    currentY += 5;

    legalDoc.attachments.forEach(att => {
      if (currentY + 15 > maxBodyY) {
        doc.addPage();
        currentY = drawDocHeader(doc, legalDoc, logo);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
      doc.text(`• ${att.name}`, margin + 4, currentY);
      currentY += 4.5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
      
      const linkLabel = "  [ Clic aquí para abrir documento anexo ]";
      doc.text(linkLabel, margin + 4, currentY);
      const textWidth = doc.getTextWidth(linkLabel);
      
      // Registrar enlace interactivo clickable en el PDF
      doc.link(margin + 4, currentY - 3, textWidth, 4, { url: att.url });
      
      currentY += 6.5;
    });
  }

  // --- SIGNATURES APPENDIX PAGE ---
  doc.addPage();
  currentY = drawDocHeader(doc, legalDoc, logo);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("HOJA DE CONFORMIDAD Y AUDITORÍA DIGITAL", margin, currentY);
  currentY += 8;

  // Grid / Blocks layout for signers
  const blockWidth = contentWidth;
  const blockHeight = 45;

  const signersList = legalDoc.signers || [];

  signersList.forEach((signer, index) => {
    // Add page if needed
    if (currentY + blockHeight > maxBodyY) {
      doc.addPage();
      currentY = drawDocHeader(doc, legalDoc, logo);
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
      doc.text("HOJA DE CONFORMIDAD Y AUDITORÍA DIGITAL (CONTINUACIÓN)", margin, currentY);
      currentY += 8;
    }

    // Outer card boundary
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.setLineWidth(0.3);
    doc.setFillColor(COLORS.stripe[0], COLORS.stripe[1], COLORS.stripe[2]);
    doc.rect(margin, currentY, blockWidth, blockHeight, 'FD');

    // Signer meta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    const signerRole = (signer.role || 'Firmante').toUpperCase();
    const signerName = signer.name || 'Sin Nombre';
    doc.text(`${signerRole}: ${signerName}`, margin + 5, currentY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
    doc.text(`Correo electrónico: ${signer.email || 'N/A'}`, margin + 5, currentY + 12);
    
    // Status Badge text
    if (signer.hasSigned) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(COLORS.success[0], COLORS.success[1], COLORS.success[2]);
      doc.text("✓ FIRMADO ELECTRÓNICAMENTE", margin + 5, currentY + 18);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
      doc.text(`IP del Firmante: ${signer.ipAddress || 'N/A'}`, margin + 5, currentY + 23);
      doc.text(`Fecha/Hora: ${signer.signedAt ? new Date(signer.signedAt).toLocaleString() : 'N/A'}`, margin + 5, currentY + 28);
      doc.text("Evidencia: Firma estampada electrónicamente de conformidad legal.", margin + 5, currentY + 33);
      
      // Draw signature image safely preserving aspect ratio
      if (signer.signatureDataUrl && typeof signer.signatureDataUrl === 'string' && signer.signatureDataUrl.startsWith('data:image/')) {
        drawProportionalSignature(doc, signer.signatureDataUrl, margin + blockWidth - 55, currentY + 8, 45, 28);
      }
    } else {
      doc.setFont("helvetica", "bolditalic");
      doc.setTextColor(COLORS.pending[0], COLORS.pending[1], COLORS.pending[2]);
      doc.text("• PENDIENTE DE FIRMA", margin + 5, currentY + 18);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
      doc.text("Esperando a que la parte acceda a su enlace y estampe su firma digital.", margin + 5, currentY + 23);
    }

    currentY += blockHeight + 6;
  });

  // Footer / Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  const rawId = legalDoc?.id || '';
  const cleanId = rawId ? rawId.replace(/^doc_/, '').substring(0, 8).toUpperCase() : 'DOC';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(160);
    doc.text(`Documento INT-LEG-${cleanId} - Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  if (options?.preview) {
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
    return;
  }

  const safeTitle = (legalDoc?.title || 'Documento_Legal').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]+/g, '_');
  doc.save(`DocLegal_${safeTitle}_INT_LEG_${cleanId}.pdf`);
};
