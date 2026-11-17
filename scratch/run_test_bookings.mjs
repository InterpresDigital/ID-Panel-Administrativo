import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fetch from "node-fetch";

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

// Helper UTF-8 base64
function encodeUtf8Base64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Base64URL encode helper
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Email templates helper
function interpolateEmailTemplate(template, booking) {
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

function generateExecutiveHtmlEmail(booking, subjectText, bodyText) {
  const cleanName = booking.clientName || 'Estimado Cliente';
  const platform = booking.platformName || 'Interpres Digital';
  const zoomUrl = booking.zoomJoinUrl || 'https://zoom.us';
  const baseUrl = "https://interpres-panel.web.app";
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
<body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px 0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 40px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 8px 0 0 0;">${subjectText}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 30px 40px;">
              <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">Hola ${cleanName},</h2>
              <div style="color: #334155; font-size: 15px; line-height: 1.6;">
                ${formattedParagraphs}
              </div>
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
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${booking.date}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px; font-weight: 600;">⏰ Horario:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 14px; font-weight: 700;">${booking.startTime} - ${booking.endTime} (Hora CDMX)</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
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

function createMimeEmailHtml(to, from, subject, htmlBody) {
  const subjectEncoded = `=?UTF-8?B?${encodeUtf8Base64(subject)}?=`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    htmlBody
  ].join('\r\n');

  return base64UrlEncode(message);
}

// Token validation helpers
function isGoogleTokenExpired(config) {
  if (!config?.accessToken) return true;
  if (config.tokenObtainedAt && typeof config.tokenObtainedAt === 'number') {
    const elapsedMs = Date.now() - config.tokenObtainedAt;
    const fiftyMinutesMs = 50 * 60 * 1000;
    return elapsedMs > fiftyMinutesMs;
  }
  return true;
}

async function saveRefreshedToken(accessToken, tokenObtainedAt) {
  try {
    const bookingRef = doc(db, 'settings', 'booking_settings');
    await setDoc(bookingRef, {
      googleConfig: {
        accessToken,
        tokenObtainedAt,
        connected: true,
        enabled: true
      }
    }, { merge: true });
    console.log("✓ Refreshed access token saved to Firestore successfully.");
  } catch (err) {
    console.error("Error saving token to Firestore:", err);
  }
}

async function refreshGoogleAccessToken(config) {
  const cleanId = config.clientId || '526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com';
  const cleanSecret = config.clientSecret || '';
  if (!config.refreshToken || !cleanId) {
    throw new Error("Missing refresh token or Client ID for refresh flow.");
  }
  try {
    const bodyParams = {
      client_id: cleanId,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    };
    if (cleanSecret) {
      bodyParams.client_secret = cleanSecret;
    }
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams)
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      return {
        accessToken: data.access_token,
        tokenObtainedAt: Date.now()
      };
    } else {
      throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error("Error refreshing Google access token:", err);
    throw err;
  }
}

async function ensureValidGoogleToken(config) {
  if (!config) return null;
  let accessToken = config.accessToken || '';
  let tokenObtainedAt = config.tokenObtainedAt || 0;

  if (accessToken && !isGoogleTokenExpired(config)) {
    return { accessToken, tokenObtainedAt, refreshed: false };
  }

  if (config.refreshToken) {
    console.log("🔄 Access token expired. Refreshing token via Google OAuth token endpoint...");
    const refreshedResult = await refreshGoogleAccessToken(config);
    if (refreshedResult?.accessToken) {
      await saveRefreshedToken(refreshedResult.accessToken, refreshedResult.tokenObtainedAt);
      config.accessToken = refreshedResult.accessToken;
      config.tokenObtainedAt = refreshedResult.tokenObtainedAt;
      return {
        accessToken: refreshedResult.accessToken,
        tokenObtainedAt: refreshedResult.tokenObtainedAt,
        refreshed: true
      };
    }
  }

  if (accessToken) {
    return { accessToken, tokenObtainedAt, refreshed: false };
  }
  return null;
}

// Main booking simulation function
async function runTestBooking(clientName, clientEmail, settings) {
  console.log(`\n======================================================`);
  console.log(`Starting Test Booking for: ${clientName} (${clientEmail})`);
  console.log(`======================================================`);

  const platform = settings.platforms[0] || { id: "p1", name: "Interpres Digital" };
  const date = new Date().toISOString().split('T')[0];
  const startTime = "18:00";
  const endTime = "18:45";

  // 1. Zoom Meeting
  console.log("1. Creating Zoom Meeting link...");
  let zoomJoinUrl = "https://zoom.us/j/fallback-link";
  let zoomMeetingId = "1234567890";
  const zoomConfig = settings.zoomConfig;
  if (zoomConfig && zoomConfig.enabled && zoomConfig.accountId && zoomConfig.clientId && zoomConfig.clientSecret) {
    try {
      const credentials = btoa(`${zoomConfig.clientId.trim()}:${zoomConfig.clientSecret.trim()}`);
      const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(zoomConfig.accountId.trim())}`;
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const meetingRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            topic: `Videollamada con ${clientName}`,
            type: 2,
            start_time: `${date}T${startTime}:00`,
            duration: 45,
            timezone: 'America/Mexico_City'
          })
        });
        if (meetingRes.ok) {
          const meetingData = await meetingRes.json();
          zoomJoinUrl = meetingData.join_url;
          zoomMeetingId = meetingData.id.toString();
          console.log(`✓ Zoom Meeting Created successfully: ${zoomJoinUrl}`);
        } else {
          console.log("⚠️ Zoom Meeting API failed. Using fallback link.");
        }
      } else {
        console.log("⚠️ Zoom Token API failed. Using fallback link.");
      }
    } catch (e) {
      console.warn("Exception generating Zoom meeting:", e.message);
    }
  } else {
    console.log("ℹ Zoom API disabled or not fully configured. Using fallback link.");
  }

  // 2. Booking Object
  const bookingId = `test_book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const booking = {
    id: bookingId,
    clientName,
    clientEmail,
    clientPhone: "+52 5512345678",
    platformId: platform.id,
    platformName: platform.name,
    topic: "Prueba de Integración Completa",
    date,
    startTime,
    endTime,
    zoomJoinUrl,
    zoomMeetingId,
    status: 'Programada',
    createdAt: new Date().toISOString()
  };

  // 3. Save to Firestore
  console.log("2. Saving booking to Firestore...");
  await setDoc(doc(db, "bookings", bookingId), booking);
  console.log(`✓ Saved to Firestore under document ID: ${bookingId}`);

  // 4. Telegram Notification
  const telegramConfig = settings.telegramConfig;
  if (telegramConfig && telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
    console.log("3. Sending Telegram notification...");
    try {
      const msg = `🎥 <b>¡NUEVA CITA DE PRUEBA!</b>\n\n👤 <b>Cliente:</b> ${clientName}\n📧 <b>Email:</b> ${clientEmail}\n📅 <b>Fecha:</b> ${date}\n⏰ <b>Hora:</b> ${startTime}-${endTime}\n🔗 <b>Enlace:</b> ${zoomJoinUrl}`;
      const tRes = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: msg,
          parse_mode: 'HTML'
        })
      });
      console.log(`✓ Telegram response status: ${tRes.status}`);
    } catch (e) {
      console.error("Failed sending Telegram:", e);
    }
  }

  // 5. Send Gmail API Confirmation
  console.log("4. Sending Gmail confirmation email...");
  const googleConfig = settings.googleConfig;
  if (!googleConfig || (!googleConfig.accessToken && !googleConfig.refreshToken)) {
    console.error("❌ Google Workspace integration is NOT connected!");
    return;
  }

  const rawSubject = settings.emailConfig?.subject || "Confirmación de cita";
  const rawBody = settings.emailConfig?.bodyTemplate || "Tu cita está programada.";
  const subject = interpolateEmailTemplate(rawSubject, booking);
  const bodyText = interpolateEmailTemplate(rawBody, booking);
  const htmlEmail = generateExecutiveHtmlEmail(booking, subject, bodyText);

  const fromEmail = googleConfig.userEmail || "admin@interpresdigital.com";
  const rawMessageHtml = createMimeEmailHtml(clientEmail, fromEmail, subject, htmlEmail);

  // Validate/Refresh Token
  const tokenObj = await ensureValidGoogleToken(googleConfig);
  let currentToken = tokenObj?.accessToken || googleConfig.accessToken;

  if (!currentToken) {
    console.error("❌ No valid Google Access Token found!");
    return;
  }

  let response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${currentToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: rawMessageHtml })
  });

  let data = await response.json();
  console.log(`Gmail API response code: ${response.status}`);
  console.log(`Gmail API response content:`, data);

  if (response.ok && data.id) {
    console.log(`✓ Gmail confirmation sent successfully! Message ID: ${data.id}`);
  } else {
    console.error(`❌ Gmail API error: ${data.error?.message || 'Unknown error'}`);
  }

  // 6. Sync Google Contacts
  if (googleConfig.enabled && googleConfig.connected) {
    console.log("5. Syncing contact to Google Contacts...");
    try {
      const contactUrl = `https://people.googleapis.com/v1/people:createContact`;
      const contactRes = await fetch(contactUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          names: [{ givenName: clientName, familyName: "Test" }],
          emailAddresses: [{ value: clientEmail, type: "work" }],
          phoneNumbers: [{ value: "+52 5512345678", type: "mobile" }],
          biographies: [{ value: `Cita de Prueba agendada el ${date}` }]
        })
      });
      const cData = await contactRes.json();
      console.log(`Google Contacts sync response status: ${contactRes.status}`);
      if (contactRes.ok && cData.resourceName) {
        console.log(`✓ Google Contacts Sync Successful! Resource: ${cData.resourceName}`);
      } else {
        console.error(`❌ Contacts Sync failed: ${cData.error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      console.error("Contacts sync exception:", e);
    }
  }
}

async function startTests() {
  const docRef = doc(db, "settings", "booking_settings");
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    console.error("Settings document not found!");
    return;
  }
  const settings = docSnap.data();

  // Test 1
  await runTestBooking("Juan Carlos Pérez (Test Gmail)", "experienciainfinity@gmail.com", settings);

  // Test 2
  await runTestBooking("Emi Mares Yahoo (Test Yahoo)", "emimares@yahoo.com", settings);

  console.log("\nTests Completed.");
  process.exit(0);
}

startTests();
