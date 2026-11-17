import { TelegramConfig, Booking } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Obtiene la configuración de Telegram guardada en Firestore.
 */
export async function getTelegramConfigFromDb(): Promise<TelegramConfig | undefined> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'booking_settings'));
    if (snap.exists()) {
      return snap.data().telegramConfig as TelegramConfig;
    }
  } catch (e) {
    console.error("Error al obtener telegramConfig:", e);
  }
  return undefined;
}

/**
 * Envía una notificación instantánea a Telegram cuando un cliente agenda una nueva cita.
 */
export async function sendTelegramBookingNotification(
  telegramConfig: TelegramConfig | undefined,
  booking: Booking
): Promise<boolean> {
  if (!telegramConfig || !telegramConfig.enabled || !telegramConfig.botToken || !telegramConfig.chatId) {
    console.warn("Telegram Bot no está configurado o está deshabilitado. Omitiendo notificación.");
    return false;
  }

  try {
    const token = telegramConfig.botToken.trim();
    const chatId = telegramConfig.chatId.trim();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const messageHtml = `
🎥 <b>¡NUEVA VIDEOLLAMADA AGENDADA!</b>

🌐 <b>Plataforma:</b> ${escapeHtml(booking.platformName)}
👤 <b>Cliente:</b> ${escapeHtml(booking.clientName)}
📧 <b>Email:</b> ${escapeHtml(booking.clientEmail)}
📱 <b>Teléfono:</b> ${escapeHtml(booking.clientPhone)}
📅 <b>Fecha:</b> <code>${booking.date}</code>
⏰ <b>Horario:</b> <code>${booking.startTime} - ${booking.endTime}</code> (Hora CDMX)
💬 <b>Tema:</b> ${escapeHtml(booking.topic || 'Sin especificar')}

🔗 <b>Enlace de Zoom:</b> <a href="${booking.zoomJoinUrl || '#'}">${booking.zoomJoinUrl || 'No generado'}</a>
`.trim();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });

    if (!response.ok) {
      const errRes = await response.text();
      console.error("Error al enviar notificación a Telegram:", errRes);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Excepción enviando notificación a Telegram:", err);
    return false;
  }
}

/**
 * Envía una notificación instantánea a Telegram cuando se firma un contrato o documento legal.
 */
export async function sendTelegramDocumentSignedNotification(
  docTitle: string,
  signerName: string,
  signerRole: string,
  signerEmail: string,
  signedAt: string,
  ipAddress: string,
  isFullySigned: boolean,
  signedCount: number,
  totalSigners: number,
  telegramConfigParam?: TelegramConfig
): Promise<boolean> {
  try {
    const config = telegramConfigParam || await getTelegramConfigFromDb();
    if (!config || !config.enabled || !config.botToken || !config.chatId) {
      return false;
    }

    const token = config.botToken.trim();
    const chatId = config.chatId.trim();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const statusBadge = isFullySigned 
      ? '🟢 <b>ESTATUS: COMPLETAMENTE FIRMADO (100%)</b>' 
      : `🟡 <b>ESTATUS: PARCIALMENTE FIRMADO (${signedCount}/${totalSigners} partes)</b>`;

    const messageHtml = `
✍️ <b>¡FIRMA ELECTRÓNICA REGISTRADA!</b>

📄 <b>Documento:</b> ${escapeHtml(docTitle)}
👤 <b>Firmante:</b> ${escapeHtml(signerName)} (${escapeHtml(signerRole)})
📧 <b>Correo:</b> ${escapeHtml(signerEmail)}
📅 <b>Fecha y Hora:</b> <code>${new Date(signedAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</code>
🌐 <b>IP / Origen:</b> <code>${escapeHtml(ipAddress || 'Panel')}</code>

${statusBadge}
`.trim();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    return response.ok;
  } catch (err) {
    console.error("Excepción enviando notificación de firma a Telegram:", err);
    return false;
  }
}

/**
 * Función de prueba para validar la conexión del Bot de Telegram desde la pantalla de configuración.
 */
export async function sendTelegramTestNotification(
  botToken: string,
  chatId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const token = botToken.trim();
    const chat = chatId.trim();
    if (!token || !chat) {
      return { success: false, message: "Por favor proporciona el Bot Token y el Chat ID." };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const messageHtml = `
🤖 <b>¡PRUEBA DE CONEXIÓN CON TELEGRAM EXITOSA!</b>

El Bot se ha vinculado correctamente a <b>Interpres Digital - Gestor de Negocios</b>.
Recibirás aquí las notificaciones de videollamadas agendadas en tiempo real.
`.trim();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chat,
        text: messageHtml,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();
    if (data.ok) {
      return { success: true, message: "Mensaje de prueba enviado con éxito a Telegram." };
    } else {
      return { success: false, message: data.description || "No se pudo conectar con el Chat ID indicado." };
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Error de red al conectar con Telegram API." };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Envía una notificación instantánea a Telegram cuando un cliente completa el Briefing de IA (RFI).
 */
export async function sendTelegramAiBriefingNotification(params: {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  completionMode: "voice" | "manual" | "hybrid";
  completedSectionsCount: number;
  businessProblem?: string;
  estimatedBudget?: string;
  idealLaunchDate?: string;
  attachmentsCount?: number;
  isUpdate?: boolean;
}): Promise<boolean> {
  try {
    const config = await getTelegramConfigFromDb();
    if (!config || !config.enabled || !config.botToken || !config.chatId) {
      console.warn("Telegram Bot no está configurado o está deshabilitado. Omitiendo alerta de Briefing IA.");
      return false;
    }

    const token = config.botToken.trim();
    const chatId = config.chatId.trim();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const modeLabel =
      params.completionMode === "voice"
        ? "Entrevista IA por Voz"
        : params.completionMode === "hybrid"
        ? "Híbrido (Voz IA + Manual)"
        : "Formulario Manual";

    const headerTitle = params.isUpdate
      ? "🔄 <b>¡BRIEFING DE IA ACTUALIZADO!</b>"
      : "🤖 <b>¡NUEVO BRIEFING DE IA COMPLETADO!</b>";

    const rawProblem = (params.businessProblem || "").trim();
    const problemSnippet = rawProblem
      ? rawProblem.length > 200
        ? `${rawProblem.slice(0, 197)}...`
        : rawProblem
      : "No especificado";

    const messageHtml = `
${headerTitle}

🏢 <b>Empresa:</b> ${escapeHtml(params.companyName || "Sin especificar")}
👤 <b>Contacto:</b> ${escapeHtml(params.contactName || "Sin especificar")}
📧 <b>Correo:</b> ${escapeHtml(params.contactEmail || "Sin especificar")}
📱 <b>WhatsApp / Tel:</b> ${escapeHtml(params.contactPhone || "No especificado")}
🎙️ <b>Modalidad:</b> ${escapeHtml(modeLabel)}
📊 <b>Avance RFI:</b> <code>${params.completedSectionsCount}/10 secciones</code>${
      params.attachmentsCount && params.attachmentsCount > 0
        ? ` (${params.attachmentsCount} adjunto${params.attachmentsCount === 1 ? "" : "s"})`
        : ""
    }
💰 <b>Presupuesto:</b> ${escapeHtml(params.estimatedBudget || "Por definir")}
🚀 <b>Puesta en marcha:</b> ${escapeHtml(params.idealLaunchDate || "Por definir")}

🎯 <b>Objetivo / Necesidad:</b>
<i>${escapeHtml(problemSnippet)}</i>

📋 Revisa el expediente completo, descarga el PDF o genera el Pre-Diagnóstico IA desde el Panel Administrativo.
`.trim();

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errRes = await response.text();
      console.error("Error enviando alerta de Briefing IA a Telegram:", errRes);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Excepción enviando alerta de Briefing IA a Telegram:", err);
    return false;
  }
}

/**
 * Detecta automáticamente el Chat ID del último canal o grupo donde el Bot recibió actividad.
 */
export async function detectTelegramChatId(botToken: string): Promise<{ success: boolean; chatId?: string; chatTitle?: string; message: string }> {
  try {
    const token = botToken.trim();
    if (!token) {
      return { success: false, message: "Por favor ingresa primero el Bot Token." };
    }

    // 1. Verificar si el token es válido
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) {
      return { success: false, message: "El Bot Token ingresado no es válido. Verifica que lo hayas copiado completo de @BotFather." };
    }
    const botUsername = meData.result?.username ? `@${meData.result.username}` : "tu bot";

    // 2. Consultar getUpdates
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=-20`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) {
      return { success: false, message: data.description || "Error al conectar con la API de Telegram." };
    }

    const results = data.result || [];
    if (results.length === 0) {
      return { 
        success: false, 
        message: `Bot ${botUsername} verificado correctamente. Para detectar el ID, ve a tu canal de Telegram, escribe cualquier mensaje (ej. "Hola") y presiona de nuevo este botón.` 
      };
    }

    // Buscar desde el más reciente hacia el más antiguo
    for (let i = results.length - 1; i >= 0; i--) {
      const item = results[i];
      const chat = item.channel_post?.chat || item.message?.chat || item.my_chat_member?.chat || item.edited_channel_post?.chat;
      if (chat && chat.id) {
        return {
          success: true,
          chatId: String(chat.id),
          chatTitle: chat.title || chat.username || chat.first_name || "Canal encontrado",
          message: `¡Canal detectado con éxito con ${botUsername}! Canal: "${chat.title || chat.username || 'Canal'}" (ID: ${chat.id})`
        };
      }
    }

    return { 
      success: false, 
      message: `Bot ${botUsername} verificado. Escribe un mensaje en tu canal y vuelve a presionar este botón.` 
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Error al conectar con Telegram." };
  }
}
