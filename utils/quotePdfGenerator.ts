import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation, Client, CompanyInfo } from '../types';
import { loadPdfLogo, drawProportionalLogo, LoadedPdfLogo } from './pdfLogoHelper';

const COLORS = {
  headerBg: [30, 41, 59], // Slate 800
  textDark: [15, 23, 42], // Slate 900
  textGray: [100, 116, 139], // Slate 500
  accent: [14, 165, 233], // Sky 500
  success: [22, 163, 74], // Green 600
  border: [226, 232, 240], // Slate 200
  stripe: [248, 250, 252], // Slate 50
};

const formatLocalDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day).toLocaleDateString();
  }
  return new Date(dateStr).toLocaleDateString();
};

const drawQuoteHeader = (doc: jsPDF, quotation: Quotation, logo: LoadedPdfLogo | null) => {
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
  doc.text("COTIZACIÓN COMERCIAL", pageWidth - 18, 17, { align: 'right' });

  // Subtitle (date)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  const cleanFolio = quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase();
  doc.text(`Fecha: ${new Date(quotation.createdAt).toLocaleDateString()} | Folio: INT-COT-${cleanFolio}`, pageWidth - 18, 23.5, { align: 'right' });

  // Indigo Accent Bottom line
  doc.setDrawColor(99, 102, 241); // Indigo 500
  doc.setLineWidth(0.8);
  doc.line(18, headerHeight + 3, pageWidth - 18, headerHeight + 3);

  return headerHeight + 15;
};

export const generateQuotationPDF = async (quotation: Quotation, client: Client, company: CompanyInfo) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 18;
  const contentWidth = pageWidth - (margin * 2);

  // Load Logo
  const logo = await loadPdfLogo('color');

  // Draw Header
  let currentY = drawQuoteHeader(doc, quotation, logo);

  // Draw metadata info (Company vs Client)
  doc.setFillColor(COLORS.stripe[0], COLORS.stripe[1], COLORS.stripe[2]);
  doc.rect(margin, currentY, contentWidth, 54, 'F');
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.2);
  doc.rect(margin, currentY, contentWidth, 54, 'D');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("DATOS DEL PROVEEDOR", margin + 6, currentY + 6);
  doc.text("PROPUESTA PREPARADA PARA", margin + (contentWidth / 2) + 6, currentY + 6);

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

  // Render proposal / intro text at the beginning (before the table) with Markdown support
  if (quotation.notes) {
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    const maxBodyY = pageHeight - 20;

    const cleanNotes = quotation.notes.replace(/\u00a0/g, ' ').replace(/\t/g, '    ');
    const paragraphs = cleanNotes.split(/\r?\n/);
    paragraphs.forEach((para) => {
      if (!para.trim()) {
        currentY += 5.5;
        return;
      }

      let size = 11;
      let isBoldLine = false;
      let align: 'left' | 'center' | 'right' | 'justify' = 'left';

      // Clean leading and trailing spaces (including unicode spaces)
      let cleanText = para.trim().replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');

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
          currentY = 25;
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
      currentY += 2.5;
    });
    currentY += 6;
  }

  // Title of Section
  if (currentY > pageHeight - 20) {
    doc.addPage();
    currentY = 25;
  }
  doc.setFontSize(12);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.setFont("helvetica", "bold");
  doc.text("DESGLOSE DE SERVICIOS Y PLATAFORMAS", margin, currentY);
  currentY += 4;

  // Table of Items
  const tableData = quotation.items.map((item, idx) => {
    const hasPromo = item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
    const activePrice = hasPromo ? Number(item.promoPrice) : item.price;
    const priceText = hasPromo
      ? `$${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n$${Number(item.promoPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const isMonthly = item.billingType === 'monthly';
    const baseDescription = isMonthly ? `${item.description} (Mensual/Recurrente)` : item.description;
    const descriptionText = item.details
      ? `${baseDescription}\n   Incluye: ${item.details}`
      : baseDescription;

    const amountText = isMonthly
      ? `$${(item.quantity * activePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mes`
      : `$${(item.quantity * activePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return [
      idx + 1,
      descriptionText,
      item.quantity,
      priceText,
      amountText
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Descripción de Concepto', 'Cant.', 'Precio Unit.', 'Importe']],
    body: tableData,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 4,
      textColor: COLORS.textDark,
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
      valign: 'middle'
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' }
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data) => {
      if (data.column.index === 3 && data.cell.section === 'body') {
        const itemIndex = data.row.index;
        const item = quotation.items[itemIndex];
        const hasPromo = item && item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
        if (hasPromo) {
          const cell = data.cell;
          const paddingX = 4;
          // Calculate strike-through position on the first line
          const lineY = cell.y + (cell.height / 2) - 1.6;
          
          const priceStr = `$${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const textWidth = doc.getTextWidth(priceStr);
          const startX = cell.x + cell.width - paddingX - textWidth;
          const endX = cell.x + cell.width - paddingX;
          
          doc.setDrawColor(225, 29, 72); // Rose
          doc.setLineWidth(0.4);
          doc.line(startX, lineY, endX, lineY);
        }
      }
    }
  });

  // Calculate coordinates after table
  const finalY = (doc as any).lastAutoTable.finalY;
  currentY = finalY + 8;

  // Split calculations
  const oneTimeItems = quotation.items.filter(item => item.billingType !== 'monthly');
  const monthlyItems = quotation.items.filter(item => item.billingType === 'monthly');

  const subtotalBase = oneTimeItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const subtotalPromo = quotation.subtotal;
  const hasPromos = subtotalBase > subtotalPromo;

  const subtotalMonthlyBase = monthlyItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const subtotalMonthlyPromo = monthlyItems.reduce((sum, item) => {
    const hasPromo = item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
    return sum + (item.quantity * (hasPromo ? Number(item.promoPrice) : item.price));
  }, 0);
  const hasMonthlyPromos = subtotalMonthlyBase > subtotalMonthlyPromo;

  const hasMonthlyItems = monthlyItems.length > 0;
  const subtotalMonthlyVal = quotation.subtotalMonthly !== undefined ? quotation.subtotalMonthly : subtotalMonthlyPromo;
  const totalMonthlyVal = quotation.totalMonthly !== undefined ? quotation.totalMonthly : (subtotalMonthlyPromo * (quotation.hasIva ? 1.16 : 1));

  // Summaries Block (aligned to the right)
  const summaryWidth = 72;
  const summaryX = pageWidth - margin - summaryWidth;

          const estimatedHeight = 10 + (hasPromos ? 11 : 6) + (quotation.discount ? 6 : 0) + (quotation.hasIva ? 6 : 0) + 10 
    + (hasMonthlyItems ? (12 + 6 + (quotation.hasIva ? 6 : 0) + 10) : 0);

  if (currentY + estimatedHeight > pageHeight - 15) {
    doc.addPage();
    currentY = 25;
  }

  // Draw One-Time Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("INVERSIÓN PROYECTO", summaryX, currentY);
  currentY += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);

  if (hasPromos) {
    doc.text("Subtotal Proyecto:", summaryX, currentY);
    const baseText = `$${subtotalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.text(baseText, pageWidth - margin, currentY, { align: 'right' });
    const textWidth = doc.getTextWidth(baseText);
    const lineY = currentY - 1.2;
    doc.setDrawColor(225, 29, 72); // Rose
    doc.setLineWidth(0.4);
    doc.line(pageWidth - margin - textWidth, lineY, pageWidth - margin, lineY);

    currentY += 4.5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.success[0], COLORS.success[1], COLORS.success[2]);
    doc.text("Subtotal Promo:", summaryX, currentY);
    doc.text(`$${subtotalPromo.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  } else {
    doc.text("Subtotal Proyecto:", summaryX, currentY);
    doc.text(`$${subtotalPromo.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });
  }
  currentY += 4.5;

  // Discount
  let subtotalAfterDiscount = subtotalPromo;
  if (quotation.discount && quotation.discount > 0) {
    doc.text(`Descuento (${quotation.discount}%):`, summaryX, currentY);
    const discountAmount = (subtotalPromo * quotation.discount) / 100;
    subtotalAfterDiscount = subtotalPromo - discountAmount;
    doc.text(`-$${discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });
    currentY += 4.5;
  }

  // IVA
  if (quotation.hasIva) {
    doc.text("IVA (16%):", summaryX, currentY);
    const ivaAmount = subtotalAfterDiscount * 0.16;
    doc.text(`$${ivaAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });
    currentY += 4.5;
  }

  // Divider line
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.3);
  doc.line(summaryX, currentY - 1.5, pageWidth - margin, currentY - 1.5);

  // Total One-Time
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("TOTAL PROYECTO:", summaryX, currentY + 1.5);
  doc.text(`$${quotation.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY + 1.5, { align: 'right' });
  currentY += 7.5;

  // Section Monthly Recurring
  if (hasMonthlyItems) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(COLORS.success[0], COLORS.success[1], COLORS.success[2]);
    doc.text("RECURRENTE MENSUAL", summaryX, currentY);
    currentY += 4.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);

    if (hasMonthlyPromos) {
       doc.text("Subtotal Mensual:", summaryX, currentY);
       const baseText = `$${subtotalMonthlyBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
       doc.text(baseText, pageWidth - margin, currentY, { align: 'right' });
       const textWidth = doc.getTextWidth(baseText);
       const lineY = currentY - 1.2;
       doc.setDrawColor(225, 29, 72); // Rose
       doc.setLineWidth(0.4);
       doc.line(pageWidth - margin - textWidth, lineY, pageWidth - margin, lineY);

       currentY += 4.5;
       doc.setFont("helvetica", "bold");
       doc.setTextColor(COLORS.success[0], COLORS.success[1], COLORS.success[2]);
       doc.text("Subtotal Promo:", summaryX, currentY);
       doc.text(`$${subtotalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });

       doc.setFont("helvetica", "normal");
       doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
    } else {
       doc.text("Subtotal Mensual:", summaryX, currentY);
       doc.text(`$${subtotalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });
    }
    currentY += 4.5;

    if (quotation.hasIva) {
       doc.text("IVA Mensual (16%):", summaryX, currentY);
       const ivaAmount = subtotalMonthlyVal * 0.16;
       doc.text(`$${ivaAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin, currentY, { align: 'right' });
       currentY += 4.5;
    }

    // Divider line
    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.setLineWidth(0.3);
    doc.line(summaryX, currentY - 1.5, pageWidth - margin, currentY - 1.5);

    // Total Monthly
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(COLORS.success[0], COLORS.success[1], COLORS.success[2]);
    doc.text("TOTAL MENSUAL:", summaryX, currentY + 1.5);
    doc.text(`$${totalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mes`, pageWidth - margin, currentY + 1.5, { align: 'right' });
    currentY += 7.5;
  }
  currentY += 14;

  // Validity and Notes
  if (currentY + 30 > pageHeight) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.text("CONDICIONES COMERCIALES Y VIGENCIA", margin, currentY);
  currentY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  
  if (quotation.validUntil) {
    doc.text(`* Vigencia de la Propuesta: Válida hasta el ${formatLocalDate(quotation.validUntil)}`, margin, currentY);
    currentY += 5.5;
  }
  
  doc.text("* Moneda: Pesos Mexicanos (MXN).", margin, currentY);
  currentY += 5.5;

  if (quotation.deliveryTime) {
    doc.text(`* Tiempo de Entrega: ${quotation.deliveryTime}`, margin, currentY);
    currentY += 5.5;
  }
  
  currentY += 0.5;

  // Hitos de pago / Condiciones de pago
  if (quotation.paymentMilestones && quotation.paymentMilestones.length > 0) {
    currentY += 2;
    if (currentY + 28 > pageHeight) {
      doc.addPage();
      currentY = 25;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    doc.text("CONDICIONES DE PAGO (HITOS DE FACTURACIÓN)", margin, currentY);
    currentY += 4;
    
    const milestoneHeaders = [['Hito', 'Concepto / Descripción', '% Proyecto', 'Monto ($)', 'Plazo / Vencimiento']];
    const milestoneBody = quotation.paymentMilestones.map((m, idx) => [
      `Pago ${idx + 1}`,
      m.concept,
      `${m.percentage}%`,
      `$${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      m.timeframe || 'N/A'
    ]);
    
    autoTable(doc, {
      startY: currentY,
      head: milestoneHeaders,
      body: milestoneBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 3,
        textColor: COLORS.textDark,
        lineColor: [241, 245, 249],
        lineWidth: 0.1,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [71, 85, 105], // Slate 600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 'auto', halign: 'left' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 35, halign: 'left' }
      },
      margin: { left: margin, right: margin }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Render Status watermark/notice
  if (currentY + 15 > pageHeight) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(11);
  if (quotation.status === 'Aceptada') {
    doc.setTextColor(COLORS.success[0], COLORS.success[1], COLORS.success[2]);
    doc.text(`PROPUESTA ACEPTADA DIGITALMENTE EL ${quotation.acceptedAt ? new Date(quotation.acceptedAt).toLocaleDateString() : 'N/A'}`, margin, currentY);
  } else if (quotation.status === 'Rechazada') {
    doc.setTextColor(225, 29, 72); // Rose
    doc.text(`PROPUESTA RECHAZADA / CON CAMBIOS EL ${quotation.rejectedAt ? new Date(quotation.rejectedAt).toLocaleDateString() : 'N/A'}`, margin, currentY);
    if (quotation.feedback) {
      currentY += 5.5;
      doc.setFont("helvetica", "normalitalic");
      doc.setFontSize(9.5);
      doc.setTextColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
      const feedbackLines = doc.splitTextToSize(`Comentarios del Cliente: "${quotation.feedback}"`, contentWidth);
      feedbackLines.forEach((fLine: string) => {
        if (currentY > pageHeight - 15) {
          doc.addPage();
          currentY = 25;
        }
        doc.text(fLine, margin, currentY);
        currentY += 4;
      });
    }
  } else {
    doc.setTextColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
    doc.text("• PROPUESTA PENDIENTE DE REVISIÓN Y ACEPTACIÓN POR EL CLIENTE.", margin, currentY);
  }

  // Draw Page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(160);
    const cleanFolio = quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase();
    doc.text(`Cotización INT-COT-${cleanFolio} - Página ${i} de ${pageCount} - Interpres Digital`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  const cleanFileFolio = quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase();
  doc.save(`Cotizacion_${client.name.replace(/\s+/g, '_')}_INT_COT_${cleanFileFolio}.pdf`);
};
