import { GoogleGmailConfig, ensureValidGoogleToken } from './gmailApiService';

export interface DriveUploadResult {
  success: boolean;
  message: string;
  fileId?: string;
  webViewLink?: string;
  webContentLink?: string;
}

/**
 * Busca o crea una carpeta en Google Drive por su nombre.
 */
export async function getOrCreateDriveFolder(token: string, folderName: string = 'Interpres Digital Documentos'): Promise<string | null> {
  try {
    // 1. Buscar si ya existe la carpeta
    const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name)`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }
    }

    // 2. Si no existe, crear la carpeta
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (createRes.ok) {
      const folderData = await createRes.json();
      return folderData.id || null;
    }
  } catch (err) {
    console.error("Error al buscar/crear carpeta en Google Drive:", err);
  }
  return null;
}

/**
 * Sube un archivo a Google Drive (en formato base64 o Blob/ArrayBuffer).
 */
export async function uploadFileToGoogleDrive(
  googleConfig: GoogleGmailConfig,
  fileName: string,
  mimeType: string,
  base64DataUrl: string,
  folderName: string = 'Interpres Digital Documentos'
): Promise<DriveUploadResult> {
  try {
    const validToken = await ensureValidGoogleToken(googleConfig);
    if (!validToken?.accessToken) {
      return {
        success: false,
        message: "⚠️ Sesión de Google Workspace no iniciada o expirada. Por favor vincula tu cuenta en Configuración."
      };
    }

    const token = validToken.accessToken;
    const folderId = await getOrCreateDriveFolder(token, folderName);

    // Extraer base64 puro
    let base64Pure = base64DataUrl;
    if (base64Pure.includes(',')) {
      base64Pure = base64Pure.split(',')[1];
    }

    // Convertir Base64 a Uint8Array
    const binaryStr = atob(base64Pure);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const metadata: Record<string, any> = {
      name: fileName,
      mimeType: mimeType
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelimiter = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Pure +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartRequestBody
      }
    );

    const data = await response.json();

    if (response.ok && data.id) {
      return {
        success: true,
        message: `✓ Archivo "${fileName}" subido exitosamente a Google Drive`,
        fileId: data.id,
        webViewLink: data.webViewLink,
        webContentLink: data.webContentLink
      };
    } else {
      return {
        success: false,
        message: `❌ Error de Google Drive API (${response.status}): ${data.error?.message || 'Error al guardar archivo en Google Drive.'}`
      };
    }
  } catch (err: any) {
    console.error("Excepción en Google Drive API:", err);
    return {
      success: false,
      message: err.message || "Error al conectar con Google Drive API."
    };
  }
}
