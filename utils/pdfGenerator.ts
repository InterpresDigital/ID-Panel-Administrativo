import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, TransactionType, TaxRecord, TaxPeriodType, TaxStatus } from '../types';
import { loadPdfLogo, drawProportionalLogo, LoadedPdfLogo } from './pdfLogoHelper';

interface PDFData {
  transactions: Transaction[];
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  periodLabel: string;
}

interface TaxPDFData {
    taxes: TaxRecord[];
    totalPaid: number;
    totalPending: number;
    periodLabel: string;
}

// --- CONFIGURACIÓN DE ESTILO PREMIUM ---
const COLORS = {
    headerBg: [7, 27, 54], // #071B36
    headerText: [255, 255, 255], // White
    textDark: [16, 43, 75], // #102B4B
    textGray: [71, 95, 122], // Tinta secundaria
    accent: [20, 100, 184], // #1464B8
    success: [0, 169, 183], // #00A9B7
    danger: [225, 29, 72], // Rose 600
    warning: [234, 88, 12], // Orange 600
    tableStripe: [246, 249, 252], // #F6F9FC
};

// --- COMPONENTES DE DISEÑO ---

const drawPremiumHeader = (doc: jsPDF, title: string, subtitle: string, logo: LoadedPdfLogo | null) => {
    const pageWidth = doc.internal.pageSize.width;
    const headerHeight = 45;

    // 1. Fondo Corporativo Oscuro
    doc.setFillColor(COLORS.headerBg[0], COLORS.headerBg[1], COLORS.headerBg[2]);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    // 2. Logotipo Proporcional (Sobre fondo oscuro, 3.0:1)
    drawProportionalLogo(doc, logo, {
        x: 14,
        boxTopY: 0,
        boxHeight: headerHeight,
        maxWidth: 62,
        maxHeight: 20,
        fallbackText: "INTERPRES DIGITAL",
        fallbackColor: [255, 255, 255],
    });

    // 3. Título del Reporte (Alineado derecha)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), pageWidth - 14, 21, { align: 'right' });

    // 4. Subtítulo / Fecha
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text(subtitle, pageWidth - 14, 30, { align: 'right' });

    return headerHeight + 15; // Retorna Y inicial para el contenido
};

const drawSummaryCard = (
    doc: jsPDF, 
    x: number, 
    y: number, 
    width: number, 
    label: string, 
    value: string, 
    accentColor: number[]
) => {
    const height = 28;

    // Sombra sutil (Gris claro desplazado)
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(x + 0.5, y + 0.5, width, height, 2, 2, 'F');

    // Fondo Blanco
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240); // Borde gris muy suave
    doc.roundedRect(x, y, width, height, 2, 2, 'FD');

    // Barra de Acento Superior
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.rect(x, y, width, 1.5, 'F');

    // Etiqueta
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139); // Gray
    doc.text(label.toUpperCase(), x + 4, y + 10);

    // Valor
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59); // Dark
    doc.text(value, x + 4, y + 21);
};

// --- GENERADORES EXPORTADOS ---

export const generateFinancialPDF = async ({
  transactions,
  totalIncome,
  totalExpenses,
  netBalance,
  periodLabel
}: PDFData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // Carga Logo (rápido)
  const logo = await loadPdfLogo('white');
  
  // Dibujar Header
  const startY = drawPremiumHeader(
      doc, 
      "Reporte Financiero", 
      `Periodo: ${periodLabel} | ${new Date().toLocaleDateString()}`, 
      logo
  );

  // --- CARDS DE RESUMEN ---
  const margin = 14;
  const gap = 6;
  const availableWidth = pageWidth - (margin * 2);
  const cardWidth = (availableWidth - (gap * 2)) / 3;

  drawSummaryCard(doc, margin, startY, cardWidth, "Ingresos Totales", `$${totalIncome.toLocaleString()}`, COLORS.success);
  drawSummaryCard(doc, margin + cardWidth + gap, startY, cardWidth, "Gastos Totales", `$${totalExpenses.toLocaleString()}`, COLORS.danger);
  
  // Color del balance según sea positivo o negativo
  const netColor = netBalance >= 0 ? COLORS.accent : COLORS.warning;
  drawSummaryCard(doc, margin + (cardWidth + gap) * 2, startY, cardWidth, "Beneficio Neto", `$${netBalance.toLocaleString()}`, netColor);

  const tableStartY = startY + 40;

  // --- TABLA ---
  const tableData = transactions
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(t => [
          t.date,
          t.description,
          t.category,
          { 
            content: `$${t.amount.toLocaleString()}`, 
            styles: { 
                halign: 'right', 
                textColor: t.type === TransactionType.Income ? COLORS.success : COLORS.danger,
                fontStyle: 'bold' 
            } 
          }
      ]);

  // Título de Sección
  doc.setFontSize(11);
  doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
  doc.setFont("helvetica", "bold");
  doc.text("DETALLE DE MOVIMIENTOS", margin, tableStartY - 4);

  // Línea decorativa
  doc.setDrawColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
  doc.setLineWidth(0.1);
  doc.line(margin, tableStartY - 2, pageWidth - margin, tableStartY - 2);

  autoTable(doc, {
      startY: tableStartY,
      head: [['Fecha', 'Descripción', 'Concepto', 'Monto']],
      body: tableData,
      theme: 'grid',
      styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 5,
          textColor: COLORS.textDark,
          lineColor: [241, 245, 249],
          lineWidth: 0.1,
      },
      headStyles: {
          fillColor: COLORS.headerBg,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'left',
          fontSize: 9
      },
      alternateRowStyles: {
          fillColor: COLORS.tableStripe
      },
      columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 45 },
          3: { cellWidth: 35, halign: 'right' }
      },
      margin: { left: margin, right: margin }
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`InterpresDigital Manager - Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
  }

  doc.save(`reporte_financiero_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateTaxPDF = async ({
    taxes,
    totalPaid,
    totalPending,
    periodLabel
  }: TaxPDFData) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    const logo = await loadPdfLogo('white');

    const startY = drawPremiumHeader(
        doc, 
        "Reporte Fiscal", 
        `Filtro: ${periodLabel}`,
        logo
    );

    const margin = 14;
    const gap = 10;
    const availableWidth = pageWidth - (margin * 2);
    const cardWidth = (availableWidth - gap) / 2;

    drawSummaryCard(doc, margin, startY, cardWidth, "Total Pagado", `$${totalPaid.toLocaleString()}`, COLORS.success);
    drawSummaryCard(doc, margin + cardWidth + gap, startY, cardWidth, "Pendiente de Pago", `$${totalPending.toLocaleString()}`, COLORS.warning);

    const tableStartY = startY + 40;

    doc.setFontSize(11);
    doc.setTextColor(COLORS.textDark[0], COLORS.textDark[1], COLORS.textDark[2]);
    doc.setFont("helvetica", "bold");
    doc.text("OBLIGACIONES FISCALES", margin, tableStartY - 4);
    doc.setDrawColor(COLORS.textGray[0], COLORS.textGray[1], COLORS.textGray[2]);
    doc.setLineWidth(0.1);
    doc.line(margin, tableStartY - 2, pageWidth - margin, tableStartY - 2);

    const tableData = taxes.map(t => [
        t.type === TaxPeriodType.Monthly ? t.periodLabel : `Anual ${t.periodLabel}`,
        t.category,
        t.status === TaxStatus.Paid ? 'PAGADO' : 'PENDIENTE',
        t.paymentDate || '-',
        { content: `$${t.amount.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
        startY: tableStartY,
        head: [['Periodo', 'Impuesto', 'Estado', 'Fecha Pago', 'Importe']],
        body: tableData,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 5,
            textColor: COLORS.textDark,
            lineColor: [241, 245, 249],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: COLORS.headerBg,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'left',
            fontSize: 9
        },
        alternateRowStyles: {
            fillColor: COLORS.tableStripe
        },
        columnStyles: {
            4: { halign: 'right' }
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
                if (data.cell.raw === 'PAGADO') {
                    data.cell.styles.textColor = COLORS.success;
                } else {
                    data.cell.styles.textColor = COLORS.warning;
                }
                data.cell.styles.fontStyle = 'bold';
            }
        },
        margin: { left: margin, right: margin }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`InterpresDigital Manager - Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }
  
    doc.save(`reporte_impuestos_${new Date().toISOString().split('T')[0]}.pdf`);
};

