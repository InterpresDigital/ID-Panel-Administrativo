import { Booking, CompanyInfo, EmailConfig, Agreement, Quotation } from '../types';
import { sendEmailViaGmailApi, createMimeEmailHtml, createMimeEmailWithAttachments, sendGmailApiRequest, GoogleGmailConfig, EmailAttachment } from './gmailApiService';
import { getAppBaseUrl } from '../utils/urlUtils';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyTemplate: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'confirmation',
    name: '1. Confirmación de Cita & Enlace de Zoom',
    subject: '¡Videollamada Agendada con Éxito! - {plataforma}',
    bodyTemplate: 
`Hola {nombre_cliente},

Te confirmamos que tu videollamada ha sido agendada con éxito desde {plataforma}.

📅 Fecha: {fecha}
⏰ Horario: {hora} (Hora CDMX)
💬 Tema: {tema}
🎥 Enlace de Zoom: {enlace_zoom}

Te recomendamos conectarte 5 minutos antes. ¡Nos vemos en la reunión!

Atentamente,
El equipo de Interpres Digital`
  },
  {
    id: 'reminder',
    name: '2. Recordatorio Pre-Reunión (1 hora antes)',
    subject: '⏰ Recordatorio: Tu videollamada de {plataforma} inicia en breve',
    bodyTemplate: 
`Hola {nombre_cliente},

Te recordamos que tu videollamada de {plataforma} comenzará muy pronto.

📅 Fecha: {fecha}
⏰ Horario: {hora} (Hora CDMX)
🎥 Enlace de acceso a Zoom: {enlace_zoom}

¡Estamos listos para atenderte!`
  },
  {
    id: 'followup',
    name: '3. Agradecimiento Post-Videollamada',
    subject: '✨ Gracias por tu tiempo en la videollamada de {plataforma}',
    bodyTemplate: 
`Hola {nombre_cliente},

Muchas gracias por acompañarnos hoy en la videollamada de {plataforma}.

Esperamos que la presentación haya sido de gran valor para tu proyecto. Quedamos a tus órdenes para enviarte la propuesta correspondiente.

¡Que tengas un excelente día!`
  },
  {
    id: 'cancellation',
    name: '4. Cancelación & Reprogramación',
    subject: 'Notificación de Cancelación de Cita | {plataforma}',
    bodyTemplate: 
`Hola {nombre_cliente},

Te informamos que tu videollamada programada en {plataforma} para el día {fecha} a las {hora} ha sido cancelada.

Si deseas volver a agendar una cita en el horario que mejor te convenga, puedes hacerlo haciendo clic en el siguiente enlace:
{enlace_reagendar}`
  },
  {
    id: 'agreement',
    name: '5. Envío de Contrato Digital',
    subject: 'Contrato de Prestación de Servicios - {titulo_contrato}',
    bodyTemplate: 
`Estimado/a {nombre_cliente},

Adjuntamos el contrato de prestación de servicios para tu revisión y firma digital.

Puedes revisar y firmar tu contrato en el siguiente enlace:
{enlace_contrato}

Quedamos atentos a cualquier duda.`
  },
  {
    id: 'quotation',
    name: '6. Envío de Cotización Comercial',
    subject: 'Cotización y Propuesta Comercial - {nombre_cliente}',
    bodyTemplate: 
`Estimado/a {nombre_cliente},

Es un gusto saludarte. Adjuntamos la propuesta comercial y cotización correspondiente a tu proyecto.

Puedes consultar el desglose detallado en línea en el siguiente enlace:
{enlace_cotizacion}

Quedamos a tus órdenes para resolver cualquier duda.`
  }
];

export const DEFAULT_EMAIL_SUBJECT = EMAIL_TEMPLATES[0].subject;
export const DEFAULT_EMAIL_BODY = EMAIL_TEMPLATES[0].bodyTemplate;

/**
 * Reemplaza las etiquetas {variable} por la información real de la cita.
 */
export function interpolateEmailTemplate(template: string, booking: Booking): string {
  // Limpiar posibles palabras "Cliente " antes del nombre si venía duplicado
  const cleanName = (booking.clientName || 'Estimado(a)').replace(/^Cliente\s+/i, '');

  return template
    .replace(/\{nombre_cliente\}/g, cleanName)
    .replace(/\{email_cliente\}/g, booking.clientEmail || '')
    .replace(/\{plataforma\}/g, booking.platformName || 'Interpres Digital')
    .replace(/\{fecha\}/g, booking.date || '')
    .replace(/\{hora\}/g, `${booking.startTime} - ${booking.endTime}` || '')
    .replace(/\{enlace_zoom\}/g, booking.zoomJoinUrl || 'No generado')
    .replace(/\{tema\}/g, booking.topic || 'Demostración y cotización de servicios digitales');
}

/**
 * Genera una plantilla HTML de lujo para correos electrónicos ejecutivos de Interpres Digital.
 */
export function generateExecutiveHtmlEmail(
  booking: Booking,
  subjectText: string,
  bodyText: string,
  companyInfo?: CompanyInfo
): string {
  const cleanName = booking.clientName || 'Estimado Cliente';
  const platform = booking.platformName || 'Interpres Digital';
  const zoomUrl = booking.zoomJoinUrl || 'https://zoom.us';
  const baseUrl = getAppBaseUrl(companyInfo);
  const cancelUrl = `${baseUrl}/#/cancel-booking/${booking.id}`;

  const formattedParagraphs = bodyText
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #6366f1; font-weight: 700; text-decoration: underline;">$1</a>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subjectText}</title>
</head>
<body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px 0; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Encabezado Oscuro de Lujo con Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 40px; text-align: center;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <img src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png" alt="Interpres Digital" style="max-width: 220px; height: auto; display: block; margin: 0 auto 12px auto;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 8px 0 0 0; letter-spacing: -0.5px;">${subjectText}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cuerpo Principal del Correo -->
          <tr>
            <td style="padding: 40px 40px 30px 40px;">
              <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">Hola ${cleanName},</h2>
              
              <div style="color: #334155; font-size: 15px; line-height: 1.6;">
                ${formattedParagraphs}
              </div>

              <!-- Tarjeta Resumen de la Cita -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px;">
                <tr>
                  <td>
                    <h3 style="color: #475569; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px 0;">Detalles de la Videollamada</h3>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 600; width: 110px;">📌 Plataforma:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${platform}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 600;">📅 Fecha:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${booking.date || 'Sin fecha'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 600;">⏰ Horario:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${booking.startTime} - ${booking.endTime} (Hora CDMX)</td>
                      </tr>
                      ${booking.topic ? `
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 600;">💬 Tema:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${booking.topic}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Botón Destacado de Zoom -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 30px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${zoomUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                      🎥 Unirme a la Videollamada de Zoom
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 10px;">
                Si el botón no funciona, puedes copiar y pegar este enlace en tu navegador:<br/>
                <a href="${zoomUrl}" style="color: #6366f1; text-decoration: underline; word-break: break-all;">${zoomUrl}</a>
              </p>

              <!-- Enlace de Cancelación Directa por parte del cliente -->
              <div style="margin-top: 25px; pt-20 border-t: 1px solid #e2e8f0; text-align: center;">
                <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                  ¿Necesitas modificar o cancelar esta cita? 
                  <a href="${cancelUrl}" target="_blank" style="color: #ef4444; font-weight: 700; text-decoration: underline; margin-left: 4px;">
                    Haz clic aquí para cancelar la reservación
                  </a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Pie de Página Corporativo -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px 0; color: #64748b; font-size: 13px; font-weight: 600;">Interpres Digital — Agencia de Marketing & Desarrollo</p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Este es un mensaje automático de confirmación. Por favor no respondas directamente a este correo sin previo aviso.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Envía un correo electrónico de confirmación de videollamada al cliente.
 */
export async function sendBookingConfirmationEmail(
  booking: Booking,
  emailConfig?: EmailConfig,
  googleConfig?: GoogleGmailConfig,
  companyInfo?: CompanyInfo
): Promise<{ success: boolean; message: string }> {
  try {
    const rawSubject = emailConfig?.subject || DEFAULT_EMAIL_SUBJECT;
    const rawBody = emailConfig?.bodyTemplate || DEFAULT_EMAIL_BODY;

    const subject = interpolateEmailTemplate(rawSubject, booking);
    const bodyText = interpolateEmailTemplate(rawBody, booking);
    const htmlEmail = generateExecutiveHtmlEmail(booking, subject, bodyText, companyInfo);

    if (!googleConfig?.accessToken && !googleConfig?.refreshToken) {
      return {
        success: false,
        message: "⚠️ No hay una cuenta de Google Workspace vinculada. Por favor conecta tu cuenta en Configuración."
      };
    }

    const fromEmail = googleConfig.userEmail || emailConfig?.senderEmail || 'admin@interpresdigital.com';
    const rawMessageHtml = createMimeEmailHtml(booking.clientEmail, fromEmail, subject, htmlEmail);

    return await sendGmailApiRequest(googleConfig, rawMessageHtml);
  } catch (err: any) {
    console.error("Error al enviar correo de confirmación de cita:", err);
    return { success: false, message: err.message || "Error procesando correo de confirmación." };
  }
}

/**
 * Genera el cuerpo HTML corporativo para notificar la cancelación de una cita con enlace para volver a agendar.
 */
export function generateCancellationHtmlEmail(booking: Booking, rescheduleUrl: string): string {
  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #450a0a 100%); padding: 30px 20px; text-align: center; border-bottom: 2px solid #ef4444; }
    .logo { height: 48px; width: auto; max-width: 220px; object-contain: contain; margin-bottom: 12px; }
    .content { padding: 30px 25px; }
    .greeting { font-size: 20px; font-weight: bold; color: #ffffff; margin-bottom: 16px; }
    .card { background-color: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #991b1b; }
    .field { margin-bottom: 12px; }
    .label { font-size: 11px; text-transform: uppercase; color: #fca5a5; font-weight: bold; letter-spacing: 0.5px; }
    .val { font-size: 15px; color: #ffffff; font-weight: 600; margin-top: 2px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 12px; margin-top: 15px; text-align: center; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }
    .footer { background-color: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="Interpres Digital" class="logo" />
      <div style="font-size: 13px; color: #f87171; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Notificación de Cancelación de Cita</div>
    </div>
    <div class="content">
      <div class="greeting">Hola ${booking.clientName},</div>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
        Te informamos que tu videollamada programada en <strong>${booking.platformName}</strong> ha sido cancelada.
      </p>
      
      <div class="card">
        <div class="field">
          <div class="label">📅 Fecha Cancelada</div>
          <div class="val">${booking.date}</div>
        </div>
        <div class="field" style="margin-bottom: 0;">
          <div class="label">⏰ Horario (CDMX)</div>
          <div class="val">${booking.startTime} - ${booking.endTime}</div>
        </div>
      </div>

      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; text-align: center; margin-top: 25px;">
        Si deseas volver a agendar una cita en el horario que mejor te convenga, puedes hacerlo haciendo clic en el siguiente botón:
      </p>

      <div style="text-align: center;">
        <a href="${rescheduleUrl}" target="_blank" class="btn">📅 Volver a Agendar Cita</a>
      </div>
    </div>
    <div class="footer">
      Interpres Digital &copy; 2026 — Plataforma Integral de Agendamiento
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Envía un correo electrónico automático de cancelación de cita con botón para reprogramar.
 */
export async function sendBookingCancellationEmail(
  booking: Booking,
  emailConfig?: EmailConfig,
  googleConfig?: GoogleGmailConfig,
  companyInfo?: CompanyInfo
): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = getAppBaseUrl(companyInfo);
    const subject = `Notificación de Cancelación de Cita | ${booking.platformName}`;
    const rescheduleUrl = `${baseUrl}/#/book/${booking.platformId || 'interpres-digital'}`;
    const htmlEmail = generateCancellationHtmlEmail(booking, rescheduleUrl);

    if (!googleConfig?.accessToken && !googleConfig?.refreshToken) {
      return {
        success: false,
        message: "⚠️ No hay una cuenta de Google Workspace vinculada. Por favor conecta tu cuenta en Configuración."
      };
    }

    const fromEmail = googleConfig.userEmail || emailConfig?.senderEmail || 'admin@interpresdigital.com';
    const rawMessageHtml = createMimeEmailHtml(booking.clientEmail, fromEmail, subject, htmlEmail);

    return await sendGmailApiRequest(googleConfig, rawMessageHtml);
  } catch (err: any) {
    console.error("Error al enviar correo de cancelación:", err);
    return { success: false, message: err.message || "Error procesando cancelación." };
  }
}

/**
 * Genera el cuerpo HTML corporativo para envío de Contratos
 */
export function generateAgreementHtmlEmail(agreement: Agreement, signUrl: string, customSubject?: string, customNote?: string): string {
  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 30px 20px; text-align: center; border-bottom: 2px solid #6366f1; }
    .logo { height: 48px; width: auto; max-width: 220px; object-contain: contain; margin-bottom: 12px; }
    .content { padding: 30px 25px; }
    .greeting { font-size: 20px; font-weight: bold; color: #ffffff; margin-bottom: 16px; }
    .card { background-color: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #334155; }
    .field { margin-bottom: 12px; }
    .label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: bold; letter-spacing: 0.5px; }
    .val { font-size: 15px; color: #ffffff; font-weight: 600; margin-top: 2px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 12px; margin-top: 15px; text-align: center; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }
    .footer { background-color: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="Interpres Digital" class="logo" />
      <div style="font-size: 13px; color: #818cf8; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Contrato de Prestación de Servicios</div>
    </div>
    <div class="content">
      <div class="greeting">Hola ${agreement.clientName},</div>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
        Te enviamos el contrato digital correspondiente a <strong>"${agreement.title}"</strong> para tu revisión y firma digital.
      </p>
      
      ${customNote ? `<div style="background-color: #1e1b4b; border-left: 4px solid #6366f1; padding: 14px; margin: 15px 0; border-radius: 8px; font-size: 13px; color: #e0e7ff;">${customNote}</div>` : ''}

      <div class="card">
        <div class="field">
          <div class="label">📌 Título del Contrato</div>
          <div class="val">${agreement.title}</div>
        </div>
        <div class="field">
          <div class="label">💼 Cliente / Empresa</div>
          <div class="val">${agreement.clientName} ${agreement.clientCompanyName ? `(${agreement.clientCompanyName})` : ''}</div>
        </div>
        <div class="field" style="margin-bottom: 0;">
          <div class="label">📅 Fecha de Emisión</div>
          <div class="val">${agreement.createdAt}</div>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${signUrl}" target="_blank" class="btn">✍️ Ver y Firmar Contrato Digital</a>
      </div>
    </div>
    <div class="footer">
      Interpres Digital &copy; 2026 — Plataforma Legal y Comercial
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Genera el cuerpo HTML corporativo para envío de Cotizaciones
 */
export function generateQuotationHtmlEmail(quotation: Quotation, quoteUrl: string, customSubject?: string, customNote?: string): string {
  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #065f46 100%); padding: 30px 20px; text-align: center; border-bottom: 2px solid #10b981; }
    .logo { height: 48px; width: auto; max-width: 220px; object-contain: contain; margin-bottom: 12px; }
    .content { padding: 30px 25px; }
    .greeting { font-size: 20px; font-weight: bold; color: #ffffff; margin-bottom: 16px; }
    .card { background-color: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #047857; }
    .field { margin-bottom: 12px; }
    .label { font-size: 11px; text-transform: uppercase; color: #6ee7b7; font-weight: bold; letter-spacing: 0.5px; }
    .val { font-size: 15px; color: #ffffff; font-weight: 600; margin-top: 2px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff !important; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 12px; margin-top: 15px; text-align: center; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }
    .footer { background-color: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="Interpres Digital" class="logo" />
      <div style="font-size: 13px; color: #34d399; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Propuesta Comercial & Cotización</div>
    </div>
    <div class="content">
      <div class="greeting">Hola ${quotation.clientName},</div>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
        Adjuntamos tu propuesta comercial personalizada con el detalle de inversión para tu proyecto.
      </p>
      
      ${customNote ? `<div style="background-color: #064e3b; border-left: 4px solid #10b981; padding: 14px; margin: 15px 0; border-radius: 8px; font-size: 13px; color: #a7f3d0;">${customNote}</div>` : ''}

      <div class="card">
        <div class="field">
          <div class="label">💼 Cliente / Empresa</div>
          <div class="val">${quotation.clientName} ${quotation.clientCompanyName ? `(${quotation.clientCompanyName})` : ''}</div>
        </div>
        <div class="field">
          <div class="label">💰 Inversión Total</div>
          <div class="val">$${quotation.total.toLocaleString()} MXN ${quotation.hasIva ? '(IVA incluido)' : ''}</div>
        </div>
        <div class="field" style="margin-bottom: 0;">
          <div class="label">📅 Válida hasta</div>
          <div class="val">${quotation.validUntil || 'Sin fecha de expiración'}</div>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${quoteUrl}" target="_blank" class="btn">📄 Ver Cotización Online</a>
      </div>
    </div>
    <div class="footer">
      Interpres Digital &copy; 2026 — Plataforma Comercial
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Envía un correo electrónico de Contrato vía Gmail API
 */
export async function sendAgreementEmail(
  agreement: Agreement,
  clientEmail: string,
  googleConfig?: GoogleGmailConfig,
  customSubject?: string,
  customNote?: string,
  companyInfo?: CompanyInfo
): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = getAppBaseUrl(companyInfo);
    const signUrl = `${baseUrl}/#/sign/${agreement.id}`;
    const subject = customSubject || `Contrato de Prestación de Servicios - ${agreement.title}`;
    const htmlEmail = generateAgreementHtmlEmail(agreement, signUrl, subject, customNote);

    if (!googleConfig?.accessToken && !googleConfig?.refreshToken) {
      return {
        success: false,
        message: "⚠️ No hay una cuenta de Google Workspace vinculada. Por favor conecta tu cuenta en Configuración."
      };
    }

    const fromEmail = googleConfig.userEmail || 'admin@interpresdigital.com';
    const rawMessageHtml = createMimeEmailHtml(clientEmail, fromEmail, subject, htmlEmail);

    return await sendGmailApiRequest(googleConfig, rawMessageHtml);
  } catch (err: any) {
    console.error("Error al enviar contrato por correo:", err);
    return { success: false, message: err.message || "Error procesando envío de contrato." };
  }
}

/**
 * Envía un correo electrónico de Cotización vía Gmail API
 */
export async function sendQuotationEmail(
  quotation: Quotation,
  clientEmail: string,
  googleConfig?: GoogleGmailConfig,
  customSubject?: string,
  customNote?: string,
  companyInfo?: CompanyInfo
): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = getAppBaseUrl(companyInfo);
    const quoteUrl = `${baseUrl}/#/quote/${quotation.id}`;
    const subject = customSubject || `Cotización y Propuesta Comercial - ${quotation.clientName}`;
    const htmlEmail = generateQuotationHtmlEmail(quotation, quoteUrl, subject, customNote);

    if (!googleConfig?.accessToken && !googleConfig?.refreshToken) {
      return {
        success: false,
        message: "⚠️ No hay una cuenta de Google Workspace vinculada. Por favor conecta tu cuenta en Configuración."
      };
    }

    const fromEmail = googleConfig.userEmail || 'admin@interpresdigital.com';
    const rawMessageHtml = createMimeEmailHtml(clientEmail, fromEmail, subject, htmlEmail);

    return await sendGmailApiRequest(googleConfig, rawMessageHtml);
  } catch (err: any) {
    console.error("Error al enviar cotización por correo:", err);
    return { success: false, message: err.message || "Error procesando envío de cotización." };
  }
}

/**
 * Genera el HTML corporativo para correos personalizados redactados directamente desde el panel.
 */
/**
 * Genera el HTML corporativo para correos personalizados redactados directamente desde el panel.
 */
export function generateCustomHtmlEmail(subject: string, bodyText: string, imageUrl?: string): string {
  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";
  
  let formattedBody = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg))/gi, '<div style="margin: 16px 0; text-align: center;"><img src="$1" style="max-width: 320px; max-height: 240px; object-fit: contain; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" alt="Imagen" /></div>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #6366f1; font-weight: 700; text-decoration: underline;">$1</a>')
    .replace(/\n/g, '<br/>');

  const promoBannerHtml = imageUrl ? `
    <div style="margin: 0 0 24px 0; text-align: center;">
      <img src="${imageUrl}" alt="Banner" style="max-width: 340px; max-height: 200px; object-fit: contain; border-radius: 12px; border: 1px solid #6366f1; box-shadow: 0 6px 20px rgba(99, 102, 241, 0.15); display: block; margin: 0 auto;" />
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 30px 20px; text-align: center; border-bottom: 2px solid #6366f1; }
    .logo { height: 48px; width: auto; max-width: 220px; object-contain: contain; margin-bottom: 12px; }
    .content { padding: 30px 25px; line-height: 1.7; font-size: 15px; color: #e2e8f0; }
    .footer { background-color: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${logoUrl}" alt="Interpres Digital" class="logo" />
      <div style="font-size: 13px; color: #818cf8; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Comunicación Corporativa</div>
    </div>
    <div class="content">
      ${promoBannerHtml}
      ${formattedBody}
    </div>
    <div class="footer">
      Interpres Digital &copy; 2026 — Agencia de Marketing & Desarrollo Digital
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Envía un correo personalizado redactado desde el panel vía Gmail API (con soporte de banners y archivos adjuntos).
 */
export async function sendCustomEmail(
  toEmail: string,
  subject: string,
  bodyText: string,
  googleConfig?: GoogleGmailConfig,
  imageUrl?: string,
  attachments: EmailAttachment[] = []
): Promise<{ success: boolean; message: string }> {
  try {
    const htmlEmail = generateCustomHtmlEmail(subject, bodyText, imageUrl);

    if (!googleConfig?.accessToken && !googleConfig?.refreshToken) {
      return {
        success: false,
        message: "⚠️ No hay una cuenta de Google Workspace vinculada. Por favor conecta tu cuenta en Configuración."
      };
    }

    const fromEmail = googleConfig.userEmail || 'admin@interpresdigital.com';
    const rawMessageHtml = createMimeEmailWithAttachments(toEmail, fromEmail, subject, htmlEmail, attachments);

    return await sendGmailApiRequest(googleConfig, rawMessageHtml);
  } catch (err: any) {
    console.error("Error al enviar correo personalizado:", err);
    return { success: false, message: err.message || "Error al procesar envío por correo." };
  }
}

export function interpolateEmailVars(templateStr: string, vars: Record<string, string>): string {
  if (!templateStr) return '';
  let result = templateStr;
  Object.keys(vars).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, vars[key] || '');
  });
  return result;
}

/**
 * Envía un correo de prueba (Test) para cualquier plantilla del sistema.
 */
export async function sendTestEmailTemplate(
  templateId: 'confirmation' | 'reminder' | 'followup' | 'cancellation' | 'agreement' | 'quotation',
  targetEmail: string,
  googleConfig?: GoogleGmailConfig,
  customTemplate?: { subject?: string; bodyTemplate?: string },
  companyInfo?: CompanyInfo
): Promise<{ success: boolean; message: string }> {
  const baseUrl = getAppBaseUrl(companyInfo);
  
  const dummyBooking: Booking = {
    id: 'test_booking_123',
    clientName: 'Cliente de Prueba',
    clientEmail: targetEmail,
    clientPhone: '+52 415 123 4567',
    platformId: 'interpres-digital',
    platformName: 'Interpres Digital',
    date: new Date().toISOString().split('T')[0],
    startTime: '11:00',
    endTime: '11:45',
    status: 'Programada',
    topic: 'Demostración de Plantilla de Correo Corporativo',
    zoomJoinUrl: 'https://zoom.us/j/94638453701',
    createdAt: new Date().toISOString()
  };

  const dummyAgreement: Agreement = {
    id: 'test_agree_123',
    clientId: 'c1',
    clientName: 'Cliente de Prueba',
    title: 'Contrato de Desarrollo Web & Marketing Digital',
    content: 'Contrato de prueba...',
    createdAt: new Date().toISOString().split('T')[0],
    status: 'Pendiente'
  };

  const dummyQuotation: Quotation = {
    id: 'test_quote_123',
    clientId: 'c1',
    clientName: 'Cliente de Prueba',
    items: [{ description: 'Desarrollo de Plataforma Corporativa', quantity: 1, price: 18500 }],
    subtotal: 18500,
    total: 21460,
    createdAt: new Date().toISOString().split('T')[0],
    validUntil: '2026-08-30',
    status: 'Pendiente',
    hasIva: true
  };

  const varMap: Record<string, string> = {
    nombre_cliente: dummyBooking.clientName,
    plataforma: dummyBooking.platformName,
    fecha: dummyBooking.date,
    hora: `${dummyBooking.startTime} - ${dummyBooking.endTime}`,
    tema: dummyBooking.topic || '',
    enlace_zoom: dummyBooking.zoomJoinUrl || 'https://zoom.us',
    enlace_cotizacion: `${baseUrl}/#/quote/${dummyQuotation.id}`,
    enlace_contrato: `${baseUrl}/#/sign/${dummyAgreement.id}`,
    enlace_reagendar: `${baseUrl}/#/book/${dummyBooking.platformId}`,
    titulo_contrato: dummyAgreement.title
  };

  const defaultTpl = EMAIL_TEMPLATES.find(t => t.id === templateId);
  const rawSubject = customTemplate?.subject || defaultTpl?.subject || `Prueba de plantilla | Interpres Digital`;
  const rawBody = customTemplate?.bodyTemplate || defaultTpl?.bodyTemplate || `Hola {nombre_cliente}, este es un correo de prueba.`;

  const interpolatedSubject = interpolateEmailVars(rawSubject, varMap);
  const interpolatedBody = interpolateEmailVars(rawBody, varMap);

  let htmlEmail = '';

  if (templateId === 'confirmation') {
    htmlEmail = generateExecutiveHtmlEmail(dummyBooking, interpolatedSubject, interpolatedBody, companyInfo);
  } else if (templateId === 'cancellation') {
    const rescheduleUrl = `${baseUrl}/#/book/${dummyBooking.platformId}`;
    htmlEmail = generateCancellationHtmlEmail(dummyBooking, rescheduleUrl);
  } else if (templateId === 'agreement') {
    const signUrl = `${baseUrl}/#/sign/${dummyAgreement.id}`;
    htmlEmail = generateAgreementHtmlEmail(dummyAgreement, signUrl, interpolatedSubject, interpolatedBody);
  } else if (templateId === 'quotation') {
    const quoteUrl = `${baseUrl}/#/quote/${dummyQuotation.id}`;
    htmlEmail = generateQuotationHtmlEmail(dummyQuotation, quoteUrl, interpolatedSubject, interpolatedBody);
  } else {
    htmlEmail = generateExecutiveHtmlEmail(dummyBooking, interpolatedSubject, interpolatedBody, companyInfo);
  }

  try {
    const fromEmail = googleConfig?.userEmail || 'admin@interpresdigital.com';
    const rawMessageHtml = createMimeEmailHtml(targetEmail, fromEmail, interpolatedSubject, htmlEmail);

    return await sendGmailApiRequest(googleConfig || '', rawMessageHtml);
  } catch (err: any) {
    console.error("Error al enviar test de plantilla por Gmail API:", err);
    return {
      success: false,
      message: `❌ Error al conectar con Gmail API: ${err.message || 'Ocurrió una falla de red.'}`
    };
  }
}
