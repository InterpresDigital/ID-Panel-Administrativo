import jsPDF from 'jspdf';
import { Agreement, Client, CompanyInfo } from '../types';
import { replacePlaceholders } from './placeholderResolver';
import { loadPdfLogo, drawProportionalLogo, drawProportionalSignature, LoadedPdfLogo } from './pdfLogoHelper';

const COLORS = {
  headerBg: [30, 41, 59], // Slate 800
  textDark: [15, 23, 42], // Slate 900
  textGray: [100, 116, 139], // Slate 500
  accent: [14, 165, 233], // Sky 500
  success: [22, 163, 74], // Green 600
  border: [226, 232, 240], // Slate 200
  stripe: [248, 250, 252], // Slate 50
};

const drawContractHeader = (doc: jsPDF, agreement: Agreement, logo: LoadedPdfLogo | null) => {
  const pageWidth = doc.internal.pageSize.width;
  const headerHeight = 32;

  // Proportional Interpres Digital Logo
  drawProportionalLogo(doc, logo, {
    x: 18,
    boxTopY: 3,
    boxHeight: 30,
    maxWidth: 54,
    maxHeight: 14,
    fallbackText: "INTERPRES DIGITAL",
    fallbackColor: [COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]],
  });

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("ACUERDO DE CONFORMIDAD", pageWidth - 18, 17, { align: 'right' });

  // Subtitle (date)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  const cleanQuoteId = agreement.quoteId ? (agreement.quoteId || '').replace(/^quote_/, '').substring(0, 8).toUpperCase() : '';
  const cleanAgreementId = (agreement.id || '').replace(/^agreement_/, '').substring(0, 8).toUpperCase() || 'CTR';
  const folio = agreement.quoteId ? `Ref. Cotización: INT-COT-${cleanQuoteId}` : `Folio Contrato: INT-CTR-${cleanAgreementId}`;
  const agreementDate = agreement.createdAt ? new Date(agreement.createdAt).toLocaleDateString() : new Date().toLocaleDateString();
  doc.text(`Fecha: ${agreementDate} | ${folio}`, pageWidth - 18, 23.5, { align: 'right' });

  // Indigo Accent Bottom line
  doc.setDrawColor(99, 102, 241); // Indigo 500
  doc.setLineWidth(0.8);
  doc.line(18, headerHeight + 3, pageWidth - 18, headerHeight + 3);

  return headerHeight + 15;
};

export const generateAgreementPDF = async (agreement: Agreement, client: Client, company: CompanyInfo) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 18;
  const contentWidth = pageWidth - (margin * 2);

  // Load Logo
  const logo = await loadPdfLogo('color');

  // Draw Header on first page
  let currentY = drawContractHeader(doc, agreement, logo);

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text(agreement.title, margin, currentY);
  currentY += 10;

  // Draw metadata info (Company vs Client)
  doc.setFillColor(COLORS.stripe[0], COLORS.stripe[1], COLORS.stripe[2]);
  doc.rect(margin, currentY, contentWidth, 54, 'F');
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.2);
  doc.rect(margin, currentY, contentWidth, 54, 'D');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("PRESTADOR DEL SERVICIO", margin + 6, currentY + 6);
  doc.text("EL CLIENTE", margin + (contentWidth / 2) + 6, currentY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);

  // Company details
  doc.text(`Razón Social: ${company.businessName || company.commercialName}`, margin + 6, currentY + 12);
  doc.text(`Nombre Comercial: ${company.commercialName || company.businessName}`, margin + 6, currentY + 17);
  doc.text(`RFC: ${company.rfc || 'N/A'}`, margin + 6, currentY + 22);
  doc.text(`Sitio Web: ${company.website || 'N/A'}`, margin + 6, currentY + 27);
  doc.text(`Correo: ${company.email || 'N/A'}`, margin + 6, currentY + 32);
  doc.text(`Representante: ${company.legalRepresentative || 'N/A'}`, margin + 6, currentY + 37);
  doc.text(`Dirección: ${company.address || 'N/A'}`, margin + 6, currentY + 42, { maxWidth: (contentWidth / 2) - 12 });

  // Client details
  doc.text(`Razón Social: ${client.businessName || client.name}`, margin + (contentWidth / 2) + 6, currentY + 12);
  doc.text(`Nombre Comercial: ${client.companyName || client.businessName || client.name}`, margin + (contentWidth / 2) + 6, currentY + 17);
  doc.text(`RFC: ${client.rfc || 'N/A'}`, margin + (contentWidth / 2) + 6, currentY + 22);
  doc.text(`Sitio Web: ${client.website || 'N/A'}`, margin + (contentWidth / 2) + 6, currentY + 27);
  doc.text(`Correo: ${client.email || 'N/A'}`, margin + (contentWidth / 2) + 6, currentY + 32);
  doc.text(`Rep. Legal: ${client.legalRepresentative || 'N/A'}`, margin + (contentWidth / 2) + 6, currentY + 37);
  doc.text(`Dirección: ${client.address || 'N/A'}`, margin + (contentWidth / 2) + 6, currentY + 42, { maxWidth: (contentWidth / 2) - 12 });

  currentY += 62;

  // Draw contract text body with Markdown support and Dynamic Placeholder resolving
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  const maxBodyY = pageHeight - 20;

  const contentWithPlaceholders = replacePlaceholders(agreement.content, client, company, agreement.quoteId);
  const cleanContent = contentWithPlaceholders.replace(/\u00a0/g, ' ').replace(/\t/g, '    ');
  const paragraphs = cleanContent.split(/\r?\n/);
  
  paragraphs.forEach((pText) => {
    if (!pText.trim()) {
      currentY += 5.5; // Extra margin for paragraph breaks
      return;
    }

    let size = 11;
    let isBoldLine = false;
    let align: 'left' | 'center' | 'right' | 'justify' = 'left';

    // Clean leading and trailing spaces (including unicode spaces)
    let cleanText = pText.trim().replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');

    // Recurso iterativo para desglosar y limpiar etiquetas anidadas
    let foundMeta = true;
    while (foundMeta) {
      foundMeta = false;

      // Limpiar envoltorios de negrita externos sobre etiquetas de formato
      if (cleanText.startsWith('**') && cleanText.endsWith('**')) {
        const innerText = cleanText.substring(2, cleanText.length - 2).trim();
        if (innerText.match(/^#{1,3}/) || innerText.match(/^\[[crjl]\]/i) || innerText.startsWith('**')) {
          cleanText = innerText;
          foundMeta = true;
          continue;
        }
      }

      // Detectar y quitar nivel de encabezado (#, ##, ###)
      const headingMatch = cleanText.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        const hashes = headingMatch[1];
        cleanText = headingMatch[2].trim();
        isBoldLine = true;
        if (hashes === '#') size = 22;
        else if (hashes === '##') size = 17;
        else if (hashes === '###') size = 13.5;
        foundMeta = true;
        continue;
      }

      // Detectar y quitar etiqueta de alineación ([c], [r], [j], [l])
      const alignMatch = cleanText.match(/^\[([crjl])\]\s*(.*)$/i);
      if (alignMatch) {
        const code = alignMatch[1].toLowerCase();
        cleanText = alignMatch[2].trim();
        if (code === 'c') align = 'center';
        else if (code === 'r') align = 'right';
        else if (code === 'j') align = 'justify';
        else if (code === 'l') align = 'left';
        foundMeta = true;
        continue;
      }
    }

    if (isBoldLine) {
      cleanText = cleanText.replace(/\*\*/g, '');
    }

    doc.setFont("helvetica", isBoldLine ? "bold" : "normal");
    doc.setFontSize(size);

    const lines = doc.splitTextToSize(cleanText, contentWidth);
    let inBold = isBoldLine;

    lines.forEach((line: string) => {
      if (currentY > maxBodyY) {
        doc.addPage();
        currentY = 25; // Restart from top of next page
      }

      const parts = line.split('**');
      
      // Calculate total line width for alignment offset positioning
      let totalLineWidth = 0;
      let tempBold = inBold;
      parts.forEach((part, index) => {
        if (index > 0) {
          tempBold = !tempBold;
        }
        doc.setFont("helvetica", tempBold ? 'bold' : 'normal');
        doc.setFontSize(size);
        const spaceWidth = Math.max(0.1, doc.getTextWidth("a a") - doc.getTextWidth("aa"));
        const trimmed = part.trim();
        if (!trimmed) {
          totalLineWidth += part.length * spaceWidth;
        } else {
          const leadingSpaces = part.length - part.trimStart().length;
          const trailingSpaces = part.length - part.trimEnd().length;
          
          let trimmedWidth = 0;
          const words = trimmed.split(' ');
          words.forEach((word, idx) => {
            if (word) {
              trimmedWidth += doc.getTextWidth(word);
            }
            if (idx < words.length - 1) {
              trimmedWidth += spaceWidth;
            }
          });
          
          totalLineWidth += (leadingSpaces + trailingSpaces) * spaceWidth + trimmedWidth;
        }
        if (index < parts.length - 1) {
          totalLineWidth += 0.6; // Transition padding safety margin
        }
      });

      let currentX = margin;
      if (align === 'center') {
        currentX = (pageWidth / 2) - (totalLineWidth / 2);
      } else if (align === 'right') {
        currentX = (pageWidth - margin) - totalLineWidth;
      }

      parts.forEach((part, index) => {
        if (index > 0) {
          inBold = !inBold;
        }
        doc.setFont("helvetica", inBold ? 'bold' : 'normal');
        doc.setFontSize(size);
        const spaceWidth = Math.max(0.1, doc.getTextWidth("a a") - doc.getTextWidth("aa"));
        const trimmed = part.trim();
        if (!trimmed) {
          currentX += part.length * spaceWidth;
          if (index < parts.length - 1) {
            currentX += 0.6;
          }
          return;
        }
        const leadingSpaces = part.length - part.trimStart().length;
        const trailingSpaces = part.length - part.trimEnd().length;

        let trimmedWidth = 0;
        const words = trimmed.split(' ');
        words.forEach((word, idx) => {
          if (word) {
            trimmedWidth += doc.getTextWidth(word);
          }
          if (idx < words.length - 1) {
            trimmedWidth += spaceWidth;
          }
        });

        currentX += leadingSpaces * spaceWidth;
        doc.text(trimmed, currentX, currentY);
        currentX += trimmedWidth + (trailingSpaces * spaceWidth);
        if (index < parts.length - 1) {
          currentX += 0.6; // Transition padding safety margin
        }
      });

      currentY += size * 0.47; // Line height proportional to font size
    });

    currentY += 2.5; // Space after paragraph
  });

  currentY += 10;

  // Check if signatures fit on current page
  if (currentY + 65 > maxBodyY) {
    doc.addPage();
    currentY = 25;
  }

  const sigLineWidth = 70;
  const leftSigX = margin + 5;
  const rightSigX = pageWidth - margin - sigLineWidth - 5;
  
  // Draw signature lines
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.5);
  doc.line(leftSigX, currentY + 32, leftSigX + sigLineWidth, currentY + 32);
  doc.line(rightSigX, currentY + 32, rightSigX + sigLineWidth, currentY + 32);
  
  // Add labels above signatures
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("POR EL PRESTADOR:", leftSigX, currentY + 38);
  doc.text("POR EL CLIENTE:", rightSigX, currentY + 38);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  
  const companyRep = company.legalRepresentative || company.commercialName;
  doc.text(company.businessName || company.commercialName, leftSigX, currentY + 43, { maxWidth: sigLineWidth });
  doc.text(`Rep: ${companyRep}`, leftSigX, currentY + 48, { maxWidth: sigLineWidth });
  
  const clientRep = client.legalRepresentative || client.name;
  doc.text(client.companyName || client.name, rightSigX, currentY + 43, { maxWidth: sigLineWidth });
  doc.text(`Rep: ${clientRep}`, rightSigX, currentY + 48, { maxWidth: sigLineWidth });
  
  // Draw Provider Signature if exists in configuration and is final version
  if (agreement.includeRepSignature && company.signatureDataUrl) {
    drawProportionalSignature(doc, company.signatureDataUrl, leftSigX + 8, currentY + 2, sigLineWidth - 16, 26);
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    doc.text("Solo para revisión", leftSigX + 18, currentY + 16);
  }
  
  // Draw Client Signature if contract is signed
  if (agreement.status === 'Firmado' && agreement.signatureDataUrl) {
    drawProportionalSignature(doc, agreement.signatureDataUrl, rightSigX + 8, currentY + 2, sigLineWidth - 16, 26);
  }
  
  currentY += 58;
  
  // If signed, draw Audit Trail box below signatures
  if (agreement.status === 'Firmado') {
    if (currentY + 42 > maxBodyY) {
      doc.addPage();
      currentY = 25;
    }
    
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.setLineWidth(0.2);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 6;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    doc.text("FIRMA DE CONFORMIDAD Y AUDITORÍA DIGITAL", margin, currentY);
    currentY += 5;
    
    doc.setFillColor(COLORS.stripe[0], COLORS.stripe[1], COLORS.stripe[2]);
    doc.rect(margin, currentY, contentWidth, 32, 'F');
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(margin, currentY, contentWidth, 32, 'D');
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    doc.text("Evidencia de Origen Digital (Audit Trail)", margin + 6, currentY + 6);
    
    doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
    doc.text(`Firmante Cliente: ${agreement.signedByName || clientRep}`, margin + 6, currentY + 12);
    doc.text(`IP del Firmante: ${agreement.clientIP || 'N/A'}`, margin + 6, currentY + 17);
    doc.text(`Marca de Tiempo: ${agreement.signedAt ? new Date(agreement.signedAt).toLocaleString() : 'N/A'}`, margin + 6, currentY + 22);
    doc.text("Declaración: Acepto de conformidad los términos de este acuerdo legal de forma digital.", margin + 6, currentY + 27);
  } else {
    // Pendiente status notice
    if (currentY + 15 > maxBodyY) {
      doc.addPage();
      currentY = 25;
    }
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(8.5);
    doc.setTextColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
    doc.text("• CONTRATO PENDIENTE DE FIRMA ELECTRÓNICA POR PARTE DEL CLIENTE.", margin, currentY + 4);
  }

  // Draw Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  const cleanAgreementId = (agreement.id || '').replace(/^agreement_/, '').substring(0, 8).toUpperCase() || 'CTR';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(160);
    doc.text(`Contrato INT-CTR-${cleanAgreementId} - Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  const safeClientName = (agreement.clientName || 'Cliente').replace(/[^a-zA-Z0-9_\-\u00C0-\u017F]+/g, '_');
  doc.save(`Contrato_${safeClientName}_INT_CTR_${cleanAgreementId}.pdf`);
};
