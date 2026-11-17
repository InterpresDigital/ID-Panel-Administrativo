import { Client, CompanyInfo, Quotation } from '../types';

export const replacePlaceholders = (
  text: string,
  client: Client | null,
  company: CompanyInfo | null,
  quoteParam?: string | Quotation | null
) => {
  if (!text) return '';
  
  let result = text;

  let rawQuoteId = '';
  if (typeof quoteParam === 'string') {
    rawQuoteId = quoteParam;
  } else if (quoteParam && typeof quoteParam === 'object' && 'id' in quoteParam) {
    rawQuoteId = (quoteParam as Quotation).id || '';
  }

  const quoteFolio = rawQuoteId 
    ? `INT-COT-${rawQuoteId.replace(/^quote_/, '').substring(0, 8).toUpperCase()}`
    : 'N/A';

  // Auto-inject client address placeholder for existing contracts that do not have it in their saved text
  if (!result.includes('{DIRECCION_CLIENTE}') && !result.toLowerCase().includes('con dirección en')) {
    if (result.includes('(en lo sucesivo "EL CLIENTE"), con RFC')) {
      result = result.replace(/\(en lo sucesivo "EL CLIENTE"\), con RFC/g, '(en lo sucesivo "EL CLIENTE"), con dirección en {DIRECCION_CLIENTE}, con RFC');
    } else if (result.includes('(en lo sucesivo "EL CLIENTE"), RFC')) {
      result = result.replace(/\(en lo sucesivo "EL CLIENTE"\), RFC/g, '(en lo sucesivo "EL CLIENTE"), con dirección en {DIRECCION_CLIENTE}, RFC');
    } else if (result.includes('con RFC {RFC_CLIENTE}')) {
      result = result.replace(/con RFC {RFC_CLIENTE}/g, 'con dirección en {DIRECCION_CLIENTE}, con RFC {RFC_CLIENTE}');
    } else if (result.includes('RFC {RFC_CLIENTE}')) {
      result = result.replace(/RFC {RFC_CLIENTE}/g, 'con dirección en {DIRECCION_CLIENTE}, RFC {RFC_CLIENTE}');
    }
  }
  
  // Replace Client Placeholders
  if (client) {
    const clientRazonSocial = client.businessName || client.name || '';

    result = result
      .replace(/{CLIENTE}/g, clientRazonSocial)
      .replace(/{RFC_CLIENTE}/g, client.rfc || 'N/A')
      .replace(/{EMPRESA_CLIENTE}/g, client.companyName || clientRazonSocial || 'N/A')
      .replace(/{RAZON_SOCIAL_CLIENTE}/g, clientRazonSocial || 'N/A')
      .replace(/{REPRESENTANTE_LEGAL_CLIENTE}/g, client.legalRepresentative || '')
      .replace(/{REPRESENTANTE_CLIENTE}/g, client.legalRepresentative || '')
      .replace(/{EMAIL_CLIENTE}/g, client.email || '')
      .replace(/{TELEFONO_CLIENTE}/g, client.phone || '')
      .replace(/{SERVICIO_CONTRATADO}/g, quoteFolio)
      .replace(/{SITIO_WEB_CLIENTE}/g, client.website || 'N/A')
      .replace(/{DIRECCION_CLIENTE}/g, client.address || 'N/A');
  }

  // Replace Quote Placeholder
  result = result.replace(/{NUMERO_COTIZACION}/g, quoteFolio);

  // Replace Company Placeholders
  if (company) {
    result = result
      .replace(/{MI_EMPRESA}/g, company.businessName || company.commercialName || '')
      .replace(/{MI_RAZON_SOCIAL}/g, company.businessName || '')
      .replace(/{MI_RFC}/g, company.rfc || 'N/A')
      .replace(/{MI_DIRECCION}/g, company.address || '')
      .replace(/{MI_EMAIL}/g, company.email || '')
      .replace(/{MI_SITIO_WEB}/g, company.website || 'N/A');
  }

  // Date Placeholder
  result = result.replace(/{FECHA_CREACION}/g, new Date().toLocaleDateString());

  return result;
};
