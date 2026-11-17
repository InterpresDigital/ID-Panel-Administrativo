import jsPDF from 'jspdf';

export type PdfLogoVariant = 'color' | 'white' | 'lumina';

export interface LoadedPdfLogo {
  dataUrl: string;
  width: number;
  height: number;
}

const LOCAL_LOGO_PATHS: Record<PdfLogoVariant, string> = {
  color: '/logos/interpres-color.png?v=20261112',
  white: '/logos/interpres-white.png?v=20261112',
  lumina: '/logos/lumina-core.png?v=20261112',
};

const FALLBACK_REMOTE_URLS: Record<PdfLogoVariant, string> = {
  color: 'https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/1.png',
  white: 'https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png',
  lumina: 'https://pub-de208707a70b434880056475d98329db.r2.dev/L%C3%9AMINA%20CORE/l%C3%BAmina-core-logo-2.png',
};

const logoCache: Partial<Record<PdfLogoVariant, LoadedPdfLogo>> = {};

const loadSingleImageUrl = (url: string, timeoutMs = 3500): Promise<LoadedPdfLogo | null> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      clearTimeout(timeout);
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      if (!naturalW || !naturalH) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = naturalW;
      canvas.height = naturalH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.clearRect(0, 0, naturalW, naturalH);
      ctx.drawImage(img, 0, 0, naturalW, naturalH);
      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl, width: naturalW, height: naturalH });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    img.src = url;
  });
};

export const loadPdfLogo = async (variant: PdfLogoVariant): Promise<LoadedPdfLogo | null> => {
  if (logoCache[variant]) {
    return logoCache[variant]!;
  }

  // 1. Carga prioritaria local desde el mismo dominio (instantánea, alta definición, sin CORS)
  const localLoaded = await loadSingleImageUrl(LOCAL_LOGO_PATHS[variant], 3000);
  if (localLoaded) {
    logoCache[variant] = localLoaded;
    return localLoaded;
  }

  // 2. Respaldo remoto en caso de entorno aislado
  const remoteUrl = `https://images.weserv.nl/?url=${encodeURIComponent(FALLBACK_REMOTE_URLS[variant])}&w=1200&output=png`;
  const remoteLoaded = await loadSingleImageUrl(remoteUrl, 3500);
  if (remoteLoaded) {
    logoCache[variant] = remoteLoaded;
    return remoteLoaded;
  }

  return null;
};

export interface DrawLogoOptions {
  x: number;
  boxTopY: number;
  boxHeight: number;
  maxWidth: number;
  maxHeight: number;
  fallbackText?: string;
  fallbackColor?: [number, number, number];
}

/**
 * Dibuja el logotipo manteniendo estrictamente su proporción original (width / height)
 * y centrándolo verticalmente dentro de la franja del encabezado indicada.
 */
export const drawProportionalLogo = (
  doc: jsPDF,
  logo: LoadedPdfLogo | null,
  options: DrawLogoOptions
): void => {
  const {
    x,
    boxTopY,
    boxHeight,
    maxWidth,
    maxHeight,
    fallbackText = 'INTERPRES DIGITAL',
    fallbackColor = [255, 255, 255],
  } = options;

  if (logo && logo.width > 0 && logo.height > 0) {
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const finalWidth = logo.width * scale;
    const finalHeight = logo.height * scale;
    const drawY = boxTopY + (boxHeight - finalHeight) / 2;

    try {
      doc.addImage(logo.dataUrl, 'PNG', x, drawY, finalWidth, finalHeight);
      return;
    } catch (err) {
      console.error('Error renderizando logotipo en PDF:', err);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(fallbackColor[0], fallbackColor[1], fallbackColor[2]);
  doc.text(fallbackText, x, boxTopY + boxHeight / 2 + 2);
};

/**
 * Dibuja una imagen de firma electrónica centrada y sin distorsión dentro de su recuadro.
 */
export const drawProportionalSignature = (
  doc: jsPDF,
  signatureDataUrl: string,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number
): void => {
  if (!signatureDataUrl || typeof signatureDataUrl !== 'string' || !signatureDataUrl.startsWith('data:image/')) {
    return;
  }

  const isJpeg = signatureDataUrl.includes('image/jpeg') || signatureDataUrl.includes('image/jpg');
  const format = isJpeg ? 'JPEG' : 'PNG';

  try {
    const props = doc.getImageProperties(signatureDataUrl);
    if (props.width > 0 && props.height > 0) {
      const scale = Math.min(boxWidth / props.width, boxHeight / props.height);
      const finalW = props.width * scale;
      const finalH = props.height * scale;
      const drawX = boxX + (boxWidth - finalW) / 2;
      const drawY = boxY + (boxHeight - finalH) / 2;
      doc.addImage(signatureDataUrl, format, drawX, drawY, finalW, finalH);
      return;
    }
  } catch {
    // Fallback conservador con proporción estándar horizontal 2.2:1
  }

  try {
    const fallbackH = Math.min(boxHeight, boxWidth / 2.2);
    const fallbackW = fallbackH * 2.2;
    const drawX = boxX + (boxWidth - fallbackW) / 2;
    const drawY = boxY + (boxHeight - fallbackH) / 2;
    doc.addImage(signatureDataUrl, format, drawX, drawY, fallbackW, fallbackH);
  } catch (err) {
    console.error('Error renderizando firma en PDF:', err);
  }
};
