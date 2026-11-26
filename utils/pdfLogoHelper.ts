import jsPDF from 'jspdf';
import { LOGO_COLOR_URL, LOGO_BLANCO_URL } from './brandAssets';

export type PdfLogoVariant = 'color' | 'white' | 'lumina';

export interface LoadedPdfLogo {
  dataUrl: string;
  width: number;
  height: number;
}

const LOCAL_LOGO_PATHS: Record<PdfLogoVariant, string> = {
  color: '/logos/interpres-color.png?v=20261126',
  white: '/logos/interpres-white.png?v=20261126',
  lumina: '/logos/lumina-core.png?v=20261112',
};

const FALLBACK_REMOTE_URLS: Record<PdfLogoVariant, string> = {
  color: LOGO_COLOR_URL,
  white: LOGO_BLANCO_URL,
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

let cachedRobotoRegularB64: string | null = null;
let cachedRobotoBoldB64: string | null = null;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const fetchFontBase64 = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 1000) return null;
    return arrayBufferToBase64(buf);
  } catch {
    return null;
  }
};

/**
 * Registra tipografía TrueType con hinting nativo (Roboto) en jsPDF para evitar trazos tenues
 * o efecto "sin tinta" en monitores Windows y soportar caracteres UTF-8 completos.
 * Devuelve el nombre de la fuente activa ('Roboto' o 'helvetica' como respaldo).
 */
export const registerCrispPdfFont = async (doc: jsPDF): Promise<string> => {
  try {
    if (!cachedRobotoRegularB64 || !cachedRobotoBoldB64) {
      const [reg, bold] = await Promise.all([
        cachedRobotoRegularB64
          ? Promise.resolve(cachedRobotoRegularB64)
          : fetchFontBase64('/fonts/Roboto-Regular.ttf?v=20261124'),
        cachedRobotoBoldB64
          ? Promise.resolve(cachedRobotoBoldB64)
          : fetchFontBase64('/fonts/Roboto-Bold.ttf?v=20261124'),
      ]);
      if (reg) cachedRobotoRegularB64 = reg;
      if (bold) cachedRobotoBoldB64 = bold;
    }

    if (cachedRobotoRegularB64 && cachedRobotoBoldB64) {
      doc.addFileToVFS('Roboto-Regular.ttf', cachedRobotoRegularB64);
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
      doc.addFileToVFS('Roboto-Bold.ttf', cachedRobotoBoldB64);
      doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
      doc.setFont('Roboto', 'normal');
      return 'Roboto';
    }
  } catch (err) {
    console.warn('Usando helvetica de respaldo en PDF:', err);
  }
  doc.setFont('helvetica', 'normal');
  return 'helvetica';
};
