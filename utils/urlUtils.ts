import { CompanyInfo } from '../types';

export const OFFICIAL_PANEL_DOMAIN = 'https://panel.interpresdigital.com';

/**
 * Retorna la URL base oficial de la aplicación para enlaces públicos (briefings, firmas, cotizaciones y agendamiento).
 * En producción utiliza siempre el dominio corporativo https://panel.interpresdigital.com
 * (incluso si el administrador entró temporalmente desde interpres-panel.web.app).
 */
export function getAppBaseUrl(companyInfo?: CompanyInfo): string {
  // 1. Si existe un subdominio corporativo explícito configurado en Ajustes (distinto de la landing principal y distinto de *.web.app)
  if (companyInfo?.signatureBaseUrl && companyInfo.signatureBaseUrl.trim() !== '') {
    let customUrl = companyInfo.signatureBaseUrl.trim();
    if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
      customUrl = 'https://' + customUrl;
    }
    customUrl = customUrl.replace(/\/index\.html$/, '').replace(/\/$/, '');

    const isMainLandingSite = /^https?:\/\/(www\.)?interpresdigital\.com\/?$/i.test(customUrl);
    const isFirebaseDefaultDomain = /\.(web\.app|firebaseapp\.com)$/i.test(customUrl);
    if (!isMainLandingSite && !isFirebaseDefaultDomain) {
      return customUrl;
    }
  }

  // 2. En desarrollo local (localhost / 127.0.0.1) respetar el puerto local para pruebas
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      let pathname = window.location.pathname || '';
      pathname = pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
      return `${window.location.origin}${pathname}`;
    }
  }

  // 3. Dominio oficial de producción del panel
  return OFFICIAL_PANEL_DOMAIN;
}

/**
 * Formatea inteligentemente el enlace o texto de Google Maps ingresado por el cliente.
 */
export function formatGoogleMapsUrl(input?: string | null): string {
  if (!input) return '#';
  const trimmed = input.trim();
  if (!trimmed || trimmed === '#') return '#';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(www\.)?(maps\.app\.goo\.gl|goo\.gl|google\.com\/maps|maps\.google\.com)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

/**
 * Garantiza que cualquier enlace externo (sitio web, redes sociales)
 * tenga el protocolo 'https://'.
 */
export function ensureAbsoluteUrl(url?: string | null): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#') return '#';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return `https://${trimmed}`;
}
