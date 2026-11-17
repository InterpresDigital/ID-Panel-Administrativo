import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

export interface GoogleGmailConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  userEmail?: string;
  connected?: boolean;
  enabled?: boolean;
  tokenObtainedAt?: number;
  connectedAt?: string;
  customSpreadsheetId?: string;
  customSpreadsheetUrl?: string;
}

export const GOOGLE_WORKSPACE_SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

/**
 * Conecta directamente mediante ventana emergente oficial de Google OAuth 2.0 (sin depender de restricciones de dominio de Firebase).
 */
export async function connectGoogleAccount1Click(overrideClientId?: string): Promise<{ accessToken: string; userEmail: string; tokenObtainedAt: number }> {
  return new Promise((resolve, reject) => {
    const cleanId = (overrideClientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com').trim();
    const redirectUri = window.location.origin;
    const scopes = GOOGLE_WORKSPACE_SCOPES;
    
    const width = 520;
    const height = 660;
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(cleanId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&prompt=consent`;

    const popup = window.open(authUrl, 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,resizable=yes`);

    if (!popup) {
      reject(new Error("La ventana emergente fue bloqueada por el navegador. Por favor permite las ventanas emergentes en tu navegador."));
      return;
    }

    let isResolved = false;

    const cleanup = () => {
      clearInterval(checkTimer);
      window.removeEventListener('message', handleMessage);
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_RESPONSE' && event.data?.hash && !isResolved) {
        const hashParams = new URLSearchParams(event.data.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        if (accessToken) {
          isResolved = true;
          cleanup();
          if (popup && !popup.closed) popup.close();

          let userEmail = 'admin@interpresdigital.com';
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            const userData = await userRes.json();
            if (userData.email) userEmail = userData.email;
          } catch (err) {
            console.warn("No se pudo obtener el email del perfil, usando valor por defecto:", err);
          }
          resolve({ accessToken, userEmail, tokenObtainedAt: Date.now() });
        }
      }
    };

    window.addEventListener('message', handleMessage);

    const checkTimer = setInterval(async () => {
      if (popup.closed) {
        cleanup();
        if (!isResolved) {
          reject(new Error("La ventana emergente de autorización de Google fue cerrada."));
        }
        return;
      }

      try {
        if (popup.location && popup.location.href.includes(redirectUri) && popup.location.hash.includes('access_token=')) {
          const hashParams = new URLSearchParams(popup.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          if (accessToken && !isResolved) {
            isResolved = true;
            cleanup();
            popup.close();

            let userEmail = 'admin@interpresdigital.com';
            try {
              const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
              });
              const userData = await userRes.json();
              if (userData.email) userEmail = userData.email;
            } catch (err) {
              console.warn("No se pudo obtener el email del perfil, usando valor por defecto:", err);
            }
            resolve({ accessToken, userEmail, tokenObtainedAt: Date.now() });
          }
        }
      } catch (e) {
        // Ignorar excepciones de origen cruzado mientras navega en accounts.google.com
      }
    }, 500);
  });
}

/**
 * Verifica si el token de Google/Gmail ha expirado (más de 50 minutos) o si requiere renovación.
 */
export function isGoogleTokenExpired(config?: GoogleGmailConfig): boolean {
  if (!config?.accessToken) return true;

  if (config.tokenObtainedAt && typeof config.tokenObtainedAt === 'number') {
    const elapsedMs = Date.now() - config.tokenObtainedAt;
    const fiftyMinutesMs = 50 * 60 * 1000;
    return elapsedMs > fiftyMinutesMs;
  }

  if (config.connectedAt) {
    const connectedTime = new Date(config.connectedAt).getTime();
    if (!isNaN(connectedTime)) {
      const elapsedMs = Date.now() - connectedTime;
      const fiftyMinutesMs = 50 * 60 * 1000;
      return elapsedMs > fiftyMinutesMs;
    }
  }

  return true;
}

/**
 * Intenta refrescar programáticamente un token de acceso de Google usando un refreshToken guardado.
 */
export async function refreshGoogleAccessToken(config: GoogleGmailConfig): Promise<{ accessToken: string; tokenObtainedAt: number } | null> {
  const cleanId = config.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com';
  const cleanSecret = config.clientSecret || import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
  if (!config.refreshToken || !cleanId) {
    return null;
  }
  try {
    const bodyParams: Record<string, string> = {
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
      console.warn("⚠️ Falló la renovación automática del token de Google:", data);
    }
  } catch (err) {
    console.error("Error al refrescar token de Google con Refresh Token:", err);
  }
  return null;
}

/**
 * Garantiza que exista un token de acceso válido de Google Workspace.
 * Si el token actual ha expirado (o expira en menos de 5 minutos), lo renueva de forma transparente
 * en segundo plano usando el refreshToken guardado en la configuración.
 */
export async function ensureValidGoogleToken(
  config?: GoogleGmailConfig
): Promise<{ accessToken: string; tokenObtainedAt: number; refreshed: boolean } | null> {
  if (!config) return null;

  let accessToken = config.accessToken || '';
  let tokenObtainedAt = config.tokenObtainedAt || 0;

  if (accessToken && !isGoogleTokenExpired(config)) {
    return { accessToken, tokenObtainedAt, refreshed: false };
  }

  if (config.refreshToken) {
    console.log("🔄 Renovando token de acceso de Google Workspace automáticamente en segundo plano...");
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

function generatePkceVerifier(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generatePkceChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Abre una ventana emergente para obtener un código de autorización y lo intercambia por access_token y refresh_token con soporte PKCE.
 */
export async function connectGoogleAccountOffline(clientId: string, clientSecret?: string): Promise<{ accessToken: string; refreshToken: string; userEmail: string }> {
  const cleanId = clientId ? clientId.trim() : '';
  const cleanSecret = clientSecret ? clientSecret.trim() : '';
  if (!cleanId) {
    throw new Error("Se requiere un ID de Cliente de Google validado.");
  }

  const verifier = generatePkceVerifier();
  const challenge = await generatePkceChallenge(verifier);

  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin;
    const width = 520;
    const height = 660;
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));

    const scopes = GOOGLE_WORKSPACE_SCOPES;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(cleanId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=S256`;

    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,resizable=yes`
    );

    if (!popup) {
      reject(new Error("La ventana emergente fue bloqueada por el navegador. Por favor permite las ventanas emergentes."));
      return;
    }

    let isResolved = false;

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_CODE' && event.data?.code) {
        isResolved = true;
        cleanup();
        if (popup && !popup.closed) popup.close();
        try {
          const tokens = await exchangeCodeForTokens(event.data.code, cleanId, cleanSecret, verifier, redirectUri);
          resolve(tokens);
        } catch (err: any) {
          reject(err);
        }
      }
    };

    const cleanup = () => {
      clearInterval(checkTimer);
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);

    const checkTimer = setInterval(async () => {
      if (popup.closed) {
        cleanup();
        if (!isResolved) {
          reject(new Error("La ventana emergente de autorización de Google fue cerrada."));
        }
        return;
      }

      try {
        if (popup.location && popup.location.href.includes(redirectUri) && popup.location.search.includes('code=')) {
          const searchParams = new URLSearchParams(popup.location.search);
          const code = searchParams.get('code');
          isResolved = true;
          cleanup();
          popup.close();

          if (code) {
            try {
              const tokens = await exchangeCodeForTokens(code, cleanId, cleanSecret, verifier, redirectUri);
              resolve(tokens);
            } catch (err: any) {
              reject(err);
            }
          } else {
            reject(new Error("No se obtuvo el código de autorización de Google."));
          }
        }
      } catch (e) {
        // Ignorar excepciones de origen cruzado mientras navega en accounts.google.com
      }
    }, 500);
  });
}

async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; userEmail: string }> {
  const bodyParams: Record<string, string> = {
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier
  };

  if (clientSecret) {
    bodyParams.client_secret = clientSecret;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(bodyParams)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en el intercambio de token: ${errText}`);
  }
  
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No se obtuvo el token de acceso de Google.");
  }
  if (!data.refresh_token) {
    throw new Error("No se obtuvo el token de actualización (refresh_token). Asegúrate de conceder todos los permisos en la pantalla de consentimiento de Google.");
  }
  
  // Obtener correo
  let userEmail = '';
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` }
    });
    const userData = await userRes.json();
    userEmail = userData.email || '';
  } catch (err) {
    console.error("Error al obtener info del usuario:", err);
  }
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userEmail
  };
}

/**
 * Abre una ventana emergente (Pop-up) para autenticación directa OAuth 2.0 de Google sin recargar la página principal.
 */
export function openGoogleOAuthPopup(clientId: string): Promise<{ accessToken: string; userEmail: string }> {
  return new Promise((resolve, reject) => {
    const cleanId = clientId ? clientId.trim() : '';
    if (!cleanId) {
      reject(new Error("Por favor ingresa un ID de cliente de Google OAuth válido antes de conectar."));
      return;
    }

    const redirectUri = window.location.origin;
    const width = 520;
    const height = 660;
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(cleanId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(GOOGLE_WORKSPACE_SCOPES)}` +
      `&prompt=select_account`;

    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,resizable=yes`
    );

    if (!popup) {
      reject(new Error("La ventana emergente fue bloqueada por el navegador. Por favor permite las ventanas emergentes para este sitio."));
      return;
    }

    let isResolved = false;

    // Escuchar postMessage enviado por el popup al redirigir al origen
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS' && event.data?.accessToken) {
        isResolved = true;
        cleanup();
        if (popup && !popup.closed) popup.close();
        resolve({
          accessToken: event.data.accessToken,
          userEmail: event.data.userEmail || ''
        });
      }
    };

    const cleanup = () => {
      clearInterval(checkTimer);
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);

    const checkTimer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        if (!isResolved) {
          reject(new Error("La ventana emergente de autorización de Google fue cerrada."));
        }
        return;
      }

      try {
        if (popup.location && popup.location.href.includes(redirectUri) && popup.location.hash.includes('access_token=')) {
          const hash = popup.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          isResolved = true;
          cleanup();
          popup.close();

          if (accessToken) {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            })
            .then(res => res.json())
            .then(userInfo => {
              resolve({ accessToken, userEmail: userInfo.email || '' });
            })
            .catch(() => resolve({ accessToken, userEmail: '' }));
          } else {
            reject(new Error("No se obtuvo el token de acceso en la respuesta de Google."));
          }
        }
      } catch (e) {
        // Ignorar excepciones de origen cruzado mientras el popup está navegando en accounts.google.com
      }
    }, 500);
  });
}

/**
 * Codifica una cadena de texto a Base64 de forma limpia con UTF-8.
 */
function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Codifica una cadena de texto a Base64URL según los requerimientos de la API de Gmail.
 */
function base64UrlEncode(str: string): string {
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

/**
 * Genera un mensaje MIME RFC 2822 de texto plano para la API de Gmail.
 */
export function createMimeEmail(to: string, from: string, subject: string, bodyText: string): string {
  const subjectEncoded = `=?UTF-8?B?${encodeUtf8Base64(subject)}?=`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    bodyText
  ].join('\r\n');

  return base64UrlEncode(message);
}

export interface EmailAttachment {
  name: string;
  type: string;
  base64: string;
  size: number;
}

/**
 * Genera un mensaje MIME RFC 2822 en formato HTML para la API de Gmail.
 */
export function createMimeEmailHtml(to: string, from: string, subject: string, htmlBody: string): string {
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

/**
 * Genera un mensaje MIME RFC 2822 en formato HTML con archivos adjuntos (PDFs, imágenes, docs) para la API de Gmail.
 */
export function createMimeEmailWithAttachments(
  to: string,
  from: string,
  subject: string,
  htmlBody: string,
  attachments: EmailAttachment[] = []
): string {
  const subjectEncoded = `=?UTF-8?B?${encodeUtf8Base64(subject)}?=`;

  if (!attachments || attachments.length === 0) {
    return createMimeEmailHtml(to, from, subject, htmlBody);
  }

  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const messageParts: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    htmlBody,
    ``
  ];

  for (const att of attachments) {
    let rawBase64 = att.base64 || '';
    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }

    messageParts.push(`--${boundary}`);
    messageParts.push(`Content-Type: ${att.type || 'application/octet-stream'}; name="${att.name}"`);
    messageParts.push(`Content-Disposition: attachment; filename="${att.name}"`);
    messageParts.push(`Content-Transfer-Encoding: base64`);
    messageParts.push(``);
    messageParts.push(rawBase64);
    messageParts.push(``);
  }

  messageParts.push(`--${boundary}--`);

  const fullMessage = messageParts.join('\r\n');
  return base64UrlEncode(fullMessage);
}

async function saveRefreshedToken(accessToken: string, tokenObtainedAt: number) {
  try {
    const bookingRef = doc(db, 'settings', 'booking_settings');
    await updateDoc(bookingRef, {
      'googleConfig.accessToken': accessToken,
      'googleConfig.tokenObtainedAt': tokenObtainedAt
    });
    console.log("✓ Token de acceso de Google refrescado y guardado en Firestore automáticamente.");
  } catch (err) {
    console.error("Error al guardar token refrescado en Firestore:", err);
  }
}

/**
 * Realiza el envío de correos vía Gmail API reconectando automáticamente si el token de 1 hora expiró o devolvió 401.
 */
export async function sendGmailApiRequest(
  accessTokenOrConfig: string | GoogleGmailConfig,
  rawMimeMessage: string
): Promise<{ success: boolean; message: string; freshToken?: string; messageId?: string }> {
  try {
    let config: GoogleGmailConfig | undefined = typeof accessTokenOrConfig === 'object' ? accessTokenOrConfig : undefined;
    let currentToken = typeof accessTokenOrConfig === 'string'
      ? accessTokenOrConfig
      : accessTokenOrConfig?.accessToken || '';

    if (config) {
      const validTokenObj = await ensureValidGoogleToken(config);
      if (validTokenObj?.accessToken) {
        currentToken = validTokenObj.accessToken;
      }
    }

    if (!currentToken) {
      return {
        success: false,
        message: "⚠️ La cuenta de Google Workspace no está vinculada. Por favor haz clic en 🔑 Vincular Cuenta de Google en Configuración."
      };
    }

    let response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: rawMimeMessage })
    });

    let data = await response.json();

    // Si el token expiró (401), intentamos refrescarlo en segundo plano si hay refreshToken
    if (response.status === 401 && config?.refreshToken) {
      console.warn("⚠️ Token de Google expirado (401). Renovando token en segundo plano...");
      
      const refreshed = await refreshGoogleAccessToken(config);
      if (refreshed?.accessToken) {
        currentToken = refreshed.accessToken;
        saveRefreshedToken(refreshed.accessToken, refreshed.tokenObtainedAt);

        const retryRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: rawMimeMessage })
        });
        const retryData = await retryRes.json();
        if (retryRes.ok && retryData.id) {
          return {
            success: true,
            message: `✓ Correo enviado exitosamente vía Gmail API (ID: ${retryData.id})`,
            freshToken: currentToken,
            messageId: retryData.id
          };
        }
      }

      return {
        success: false,
        message: "⚠️ No se pudo renovar la sesión de Google Workspace. Por favor vuelve a vincular tu cuenta en Configuración."
      };
    }

    if (response.ok && data.id) {
      return {
        success: true,
        message: `✓ Correo enviado exitosamente vía Gmail API (ID: ${data.id})`,
        freshToken: currentToken,
        messageId: data.id
      };
    } else {
      return {
        success: false,
        message: `❌ Error de Gmail API (${response.status}): ${data.error?.message || 'Token de acceso expirado o permisos insuficientes.'}`
      };
    }
  } catch (err: any) {
    console.error("Excepción en Gmail API:", err);
    return {
      success: false,
      message: err.message || "Error al conectar con la API de Gmail."
    };
  }
}

/**
 * Envía un correo directamente desde la API oficial de Gmail (Google Workspace)
 */
export async function sendEmailViaGmailApi(
  accessTokenOrConfig: string | GoogleGmailConfig,
  toEmail: string,
  fromEmail: string,
  subject: string,
  bodyText: string
): Promise<{ success: boolean; message: string }> {
  const rawMessage = createMimeEmail(toEmail, fromEmail, subject, bodyText);
  return sendGmailApiRequest(accessTokenOrConfig, rawMessage);
}
