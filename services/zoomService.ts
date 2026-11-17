import { ZoomConfig } from '../types';

export interface ZoomMeetingResult {
  joinUrl: string;
  startUrl: string;
  meetingId: string;
  password?: string;
  isRealZoom: boolean;
}

/**
 * Genera una reunión de Zoom utilizando la API oficial de Zoom (Server-to-Server OAuth).
 * Si las credenciales no existen o la API falla, retorna un enlace de respaldo limpio sin romper la experiencia del usuario.
 */
export async function createZoomMeeting(
  zoomConfig: ZoomConfig | undefined,
  params: {
    topic: string;
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    durationMinutes: number;
    agenda?: string;
  }
): Promise<ZoomMeetingResult> {
  const { topic, date, startTime, durationMinutes, agenda } = params;

  // Fallback helper si Zoom no está configurado o falla la conexión
  const getFallbackResult = (): ZoomMeetingResult => {
    const randomMeetingId = Math.floor(10000000000 + Math.random() * 90000000000).toString();
    const randomPassword = Math.random().toString(36).substring(2, 8);
    return {
      joinUrl: `https://zoom.us/j/${randomMeetingId}?pwd=${randomPassword}`,
      startUrl: `https://zoom.us/s/${randomMeetingId}?pwd=${randomPassword}`,
      meetingId: randomMeetingId,
      password: randomPassword,
      isRealZoom: false
    };
  };

  if (!zoomConfig || !zoomConfig.enabled || !zoomConfig.accountId || !zoomConfig.clientId || !zoomConfig.clientSecret) {
    console.warn("Zoom API no está configurada o está deshabilitada. Generando enlace de prueba de reunión.");
    return getFallbackResult();
  }

  try {
    // 1. Obtener Access Token de OAuth Server-to-Server
    const credentials = btoa(`${zoomConfig.clientId.trim()}:${zoomConfig.clientSecret.trim()}`);
    const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(zoomConfig.accountId.trim())}`;
    
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Error al autenticar con la API de Zoom:", errText);
      return getFallbackResult();
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("Zoom OAuth no retornó un access_token válido.");
      return getFallbackResult();
    }

    // 2. Formatear la fecha y hora para la API de Zoom (ISO 8601 en la zona horaria dada)
    const startIso = `${date}T${startTime}:00`;

    // 3. Crear la reunión en Zoom API
    const createMeetingUrl = 'https://api.zoom.us/v2/users/me/meetings';
    const meetingRes = await fetch(createMeetingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: topic || 'Videollamada de Asesoría Comercial',
        type: 2, // Scheduled Meeting
        start_time: startIso,
        duration: durationMinutes || 30,
        timezone: 'America/Mexico_City',
        agenda: agenda || 'Cita agendada automáticamente desde la plataforma de agendamiento.',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          mute_upon_entry: false,
          watermark: false,
          use_pmi: false,
          approval_type: 2, // Automatically approve
          audio: 'both',
          auto_recording: 'none'
        }
      })
    });

    if (!meetingRes.ok) {
      const meetingErr = await meetingRes.text();
      console.error("Error al crear la reunión en la API de Zoom:", meetingErr);
      return getFallbackResult();
    }

    const meetingData = await meetingRes.json();

    return {
      joinUrl: meetingData.join_url || getFallbackResult().joinUrl,
      startUrl: meetingData.start_url || meetingData.join_url || getFallbackResult().startUrl,
      meetingId: meetingData.id ? meetingData.id.toString() : getFallbackResult().meetingId,
      password: meetingData.password || '',
      isRealZoom: true
    };
  } catch (err) {
    console.error("Excepción durante la integración con Zoom API:", err);
    return getFallbackResult();
  }
}
