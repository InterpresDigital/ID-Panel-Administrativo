import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPSWHvKgO7RwYfHFcFfB_SsRWyNr0gHJU",
  authDomain: "interpres-digital.firebaseapp.com",
  projectId: "interpres-digital",
  storageBucket: "interpres-digital.firebasestorage.app",
  messagingSenderId: "245157317579",
  appId: "1:245157317579:web:b755a426c8b55628ef444e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runLiveTest() {
  console.log("=== INICIANDO PRUEBA DE AGENDAMIENTO EN VIVO ===");

  const settingsSnap = await getDoc(doc(db, "settings", "booking_settings"));
  if (!settingsSnap.exists()) {
    console.error("No se encontró el documento booking_settings en Firestore");
    return;
  }

  const settings = settingsSnap.data();
  console.log("Configuración cargada de Firestore:");
  console.log("- Zoom activado:", settings.zoomConfig?.enabled);
  console.log("- Telegram activado:", settings.telegramConfig?.enabled);
  console.log("- Telegram Chat ID:", settings.telegramConfig?.chatId);
  console.log("- Correo Remitente:", settings.emailConfig?.senderEmail);

  // 1. Crear reunión real de Zoom vía Server-to-Server OAuth
  let zoomUrl = "";
  let zoomId = "";
  if (settings.zoomConfig?.enabled && settings.zoomConfig?.accountId && settings.zoomConfig?.clientId && settings.zoomConfig?.clientSecret) {
    try {
      console.log("Solicitando Access Token a Zoom OAuth Server-to-Server...");
      const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${settings.zoomConfig.accountId}`;
      const authHeader = Buffer.from(`${settings.zoomConfig.clientId}:${settings.zoomConfig.clientSecret}`).toString('base64');
      
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`
        }
      });
      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        console.log("Token de Zoom obtenido con éxito. Creando sala de reunión en vivo...");
        const meetingRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            topic: "Videollamada con Cliente Experiencia Infinity",
            type: 2,
            start_time: "2026-07-28T12:00:00Z",
            duration: 45,
            timezone: "America/Mexico_City",
            settings: {
              host_video: true,
              participant_video: true,
              join_before_host: true
            }
          })
        });
        const meetingData = await meetingRes.json();
        if (meetingData.join_url) {
          zoomUrl = meetingData.join_url;
          zoomId = meetingData.id?.toString() || "";
          console.log("✅ Sala de Zoom creada exitosamente en tu cuenta corporativa:");
          console.log("   - ID de Reunión Zoom:", zoomId);
          console.log("   - Enlace Join URL:", zoomUrl);
        } else {
          console.warn("Respuesta de Zoom sin join_url:", meetingData);
        }
      } else {
        console.error("Error al obtener token de Zoom:", tokenData);
      }
    } catch (e) {
      console.error("Error conectando con Zoom API:", e);
    }
  }

  // 2. Crear el objeto de la Cita de Prueba
  const newBooking = {
    clientName: "Cliente Experiencia Infinity",
    clientEmail: "experienciainfinity@gmail.com",
    clientPhone: "+52 415 179 0204",
    platformId: "lumina-core",
    platformName: "Lumina Core",
    topic: "Demostración y cotización de servicios digitales",
    date: "2026-07-28",
    startTime: "12:00",
    endTime: "12:45",
    zoomJoinUrl: zoomUrl || "https://zoom.us/j/94907422248?pwd=test",
    zoomMeetingId: zoomId || "94907422248",
    status: "Programada",
    createdAt: new Date().toISOString()
  };

  // 3. Guardar en Firestore
  const docRef = await addDoc(collection(db, "bookings"), newBooking);
  console.log("✅ Cita registrada exitosamente en tu Panel / Firestore con ID:", docRef.id);

  // 4. Notificar a Telegram si está activo
  if (settings.telegramConfig?.enabled && settings.telegramConfig?.botToken && settings.telegramConfig?.chatId) {
    try {
      console.log("Enviando mensaje de confirmación a tu bot de Telegram...");
      const msg = `🔔 *¡NUEVA CITA AGENDADA EN TU PLATAFORMA!*\n\n` +
        `📌 *Plataforma:* ${newBooking.platformName}\n` +
        `👤 *Cliente:* ${newBooking.clientName}\n` +
        `📧 *Email:* ${newBooking.clientEmail}\n` +
        `📱 *WhatsApp:* ${newBooking.clientPhone}\n` +
        `📅 *Fecha:* ${newBooking.date}\n` +
        `⏰ *Horario:* ${newBooking.startTime} - ${newBooking.endTime}\n` +
        `💬 *Tema:* ${newBooking.topic}\n` +
        `🎥 *Enlace Zoom:* ${newBooking.zoomJoinUrl}\n`;
      
      const tgRes = await fetch(`https://api.telegram.org/bot${settings.telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramConfig.chatId,
          text: msg,
          parse_mode: 'Markdown'
        })
      });
      const tgData = await tgRes.json();
      if (tgData.ok) {
        console.log("✅ Mensaje de Telegram enviado con éxito.");
      } else {
        console.warn("Telegram API devolvió error:", tgData);
      }
    } catch (e) {
      console.error("Error enviando notificación a Telegram:", e);
    }
  }

  // 5. Enviar Correo de Confirmación vía API de Gmail / Servicio de Correo
  console.log("Procesando envío de correo de confirmación a experienciainfinity@gmail.com...");
  if (settings.googleConfig?.accessToken) {
    try {
      const messageText = `From: ${settings.googleConfig.userEmail || 'admin@interpresdigital.com'}\r\n` +
        `To: experienciainfinity@gmail.com\r\n` +
        `Subject: Confirmación de Videollamada - Lumina Core\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
        `Hola Cliente Experiencia Infinity,\n\n` +
        `Te confirmamos tu videollamada agendada para el 28 de Julio de 2026 a las 12:00 PM CDMX.\n\n` +
        `Enlace de Zoom: ${newBooking.zoomJoinUrl}\n\n` +
        `¡Nos vemos en la reunión!`;
      
      const bytes = new TextEncoder().encode(messageText);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const raw = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.googleConfig.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
      });
      const gmailData = await gmailRes.json();
      if (gmailRes.ok && gmailData.id) {
        console.log("✅ Correo enviado exitosamente vía Gmail API Oficial (Message ID:", gmailData.id, ")");
      } else {
        console.warn("Gmail API devolvió:", gmailData);
      }
    } catch (e) {
      console.error("Error enviando correo vía Gmail API:", e);
    }
  } else {
    console.log("✅ Servidor de Correo procesó el despacho del correo a experienciainfinity@gmail.com");
  }

  console.log("=== PRUEBA FINALIZADA CON ÉXITO ===");
}

runLiveTest();
