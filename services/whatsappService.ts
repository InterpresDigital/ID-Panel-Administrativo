import { Booking, Agreement, Quotation, CompanyInfo } from '../types';
import { getAppBaseUrl } from '../utils/urlUtils';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  getMessage: (b: Booking) => string;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'confirmation',
    name: '1. Confirmación de Cita & Enlace de Zoom',
    getMessage: (b: Booking) => 
`Hola ${b.clientName}, ¡espero que te encuentres muy bien!

Te confirmo nuestra videollamada de *${b.platformName}* programada para:
• *Fecha:* ${b.date}
• *Horario:* ${b.startTime} - ${b.endTime} (Hora CDMX)
${b.topic ? `• *Tema:* ${b.topic}\n` : ''}• *Enlace de Zoom:* ${b.zoomJoinUrl || 'Te lo compartimos en breve'}

Por favor confírmame si el horario te queda excelente. ¡Nos vemos en la reunión!`
  },
  {
    id: 'reminder',
    name: '2. Recordatorio Pre-Reunión (1 hora antes)',
    getMessage: (b: Booking) => 
`Hola ${b.clientName}, te recuerdo que nuestra videollamada de *${b.platformName}* inicia en breve (a las ${b.startTime} CDMX).

• *Enlace de acceso a Zoom:* ${b.zoomJoinUrl || 'No generado'}

¡Quedo al pendiente para reunirnos!`
  },
  {
    id: 'reschedule',
    name: '3. Solicitud de Reprogramación',
    getMessage: (b: Booking) => 
`Hola ${b.clientName}, te escribo con respecto a nuestra videollamada de *${b.platformName}* agendada para el ${b.date} a las ${b.startTime}.

¿Crees que sea posible ajustar o mover el horario para atenderte con toda la calma? Quedo atento a tus comentarios.`
  },
  {
    id: 'followup',
    name: '4. Seguimiento Post-Videollamada',
    getMessage: (b: Booking) => 
`Hola ${b.clientName}, muchas gracias por acompañarnos hoy en la videollamada de *${b.platformName}*.

Quedo a tus órdenes para cualquier duda o para enviarte la propuesta correspondiente. ¡Que tengas un excelente día!`
  }
];

/**
 * Limpia el número telefónico y genera la URL directa de wa.me
 */
export function getWhatsAppUrl(phone: string, text: string): string {
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `52${cleanPhone}`;
  }
  const encodedText = encodeURIComponent(text);
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
}

export function getAgreementWhatsAppText(agreement: Agreement, companyInfo?: CompanyInfo): string {
  const baseUrl = getAppBaseUrl(companyInfo);
  const signUrl = `${baseUrl}/#/sign/${agreement.id}`;
  return `Hola ${agreement.clientName}, ¡espero que te encuentres muy bien!

Te compartimos el enlace para revisar y firmar digitalmente el contrato: *${agreement.title}*

• *Cliente:* ${agreement.clientName}
• *Fecha de Emisión:* ${agreement.createdAt}
• *Enlace para Firmar:* ${signUrl}

Quedamos a tus órdenes para cualquier duda. ¡Saludos!`;
}

export function getQuotationWhatsAppText(quotation: Quotation, companyInfo?: CompanyInfo): string {
  const baseUrl = getAppBaseUrl(companyInfo);
  const quoteUrl = `${baseUrl}/#/quote/${quotation.id}`;
  return `Hola ${quotation.clientName}, ¡espero que te encuentres muy bien!

Te compartimos la cotización corporativa preparada para tu proyecto:

• *Cliente:* ${quotation.clientName}
• *Inversión Total:* $${quotation.total.toLocaleString()} MXN
• *Enlace de Cotización:* ${quoteUrl}

Quedamos a tus órdenes para revisar cualquier detalle. ¡Saludos!`;
}
