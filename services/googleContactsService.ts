import { GoogleGmailConfig, ensureValidGoogleToken } from './gmailApiService';
import { Client, ClientStatus, Booking } from '../types';

export interface SyncResult {
  success: boolean;
  message: string;
  resourceName?: string;
  freshToken?: string;
}

/**
 * Verifica y retorna un token de acceso válido de Google Workspace.
 */
export async function getValidAccessToken(googleConfig: GoogleGmailConfig): Promise<{ token: string; freshToken?: string } | null> {
  const result = await ensureValidGoogleToken(googleConfig);
  if (!result?.accessToken) return null;
  return {
    token: result.accessToken,
    freshToken: result.refreshed ? result.accessToken : undefined
  };
}

/**
 * Busca un contacto en Google Contacts por su correo electrónico.
 * Retorna su resourceName y etag si es encontrado.
 */
export async function searchContactByEmail(token: string, email: string): Promise<{ resourceName: string; etag: string } | null> {
  if (!email) return null;
  try {
    const response = await fetch(
      `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(email)}&readMask=names,emailAddresses`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const results = data.results || [];
    for (const result of results) {
      const person = result.person;
      const emails = person.emailAddresses || [];
      if (emails.some((e: any) => e.value?.toLowerCase() === email.toLowerCase())) {
        return {
          resourceName: person.resourceName,
          etag: person.etag
        };
      }
    }
  } catch (error) {
    console.error("Error al buscar contacto por email en Google Contacts:", error);
  }
  return null;
}

/**
 * Obtiene un contacto de Google People API para recuperar su etag más reciente.
 */
export async function getContact(token: string, resourceName: string): Promise<{ resourceName: string; etag: string } | null> {
  try {
    const response = await fetch(
      `https://people.googleapis.com/v1/${resourceName}?personFields=names,emailAddresses`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return {
      resourceName: data.resourceName,
      etag: data.etag
    };
  } catch (error) {
    console.error("Error al recuperar contacto de Google:", error);
  }
  return null;
}

/**
 * Sincroniza un cliente individual con Google Contacts.
 * Si el contacto ya existe (según googleContactResourceName o búsqueda por email), lo actualiza.
 * Si no existe, crea uno nuevo.
 */
export async function syncClientToGoogleContacts(
  client: Client,
  googleConfig: GoogleGmailConfig
): Promise<SyncResult> {
  if (!googleConfig?.enabled || !googleConfig?.connected) {
    return { success: false, message: "Google Workspace no está configurado o conectado." };
  }

  const tokenObj = await getValidAccessToken(googleConfig);
  if (!tokenObj) {
    return { success: false, message: "⚠️ Sesión de Google Workspace expirada o no vinculada. Por favor reconecta tu cuenta." };
  }
  const { token, freshToken } = tokenObj;

  // Separar nombre y apellido para mejor presentación en Google Contacts
  const nameParts = (client.name || '').trim().split(/\s+/);
  let givenName = client.name || '';
  let familyName = '';
  if (nameParts.length > 1) {
    givenName = nameParts[0];
    familyName = nameParts.slice(1).join(' ');
  }

  const contactData = {
    names: [
      {
        givenName: givenName,
        familyName: familyName
      }
    ],
    emailAddresses: client.email ? [
      {
        value: client.email,
        type: 'work'
      }
    ] : [],
    phoneNumbers: client.phone ? [
      {
        value: client.phone,
        type: 'mobile'
      }
    ] : [],
    organizations: client.companyName ? [
      {
        name: client.companyName,
        title: client.serviceType || 'Cliente',
        type: 'work'
      }
    ] : [],
    biographies: [
      {
        value: `Sincronizado desde Panel Administrativo ID\nEstado: ${client.status || 'Prospecto'}\nNotas: ${client.notes || ''}`
      }
    ]
  };

  let resourceName = client.googleContactResourceName || '';
  let etag = '';

  // Buscar por email si no tenemos el resourceName
  if (!resourceName && client.email) {
    const found = await searchContactByEmail(token, client.email);
    if (found) {
      resourceName = found.resourceName;
      etag = found.etag;
    }
  }

  // Si tenemos el resourceName pero no la etag, obtenerla para evitar error 412
  if (resourceName && !etag) {
    const found = await getContact(token, resourceName);
    if (found) {
      etag = found.etag;
    } else {
      // Si el contacto ya no existe en Google, limpiamos el ID para crearlo de nuevo
      resourceName = '';
    }
  }

  try {
    let response;
    if (resourceName) {
      // Actualizar contacto existente
      const url = `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers,organizations,biographies`;
      response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...contactData,
          etag: etag
        })
      });
    } else {
      // Crear nuevo contacto
      const url = `https://people.googleapis.com/v1/people:createContact`;
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contactData)
      });
    }

    const data = await response.json();
    if (response.ok && data.resourceName) {
      return {
        success: true,
        message: resourceName ? "Contacto actualizado con éxito en Google Workspace" : "Contacto creado con éxito en Google Workspace",
        resourceName: data.resourceName,
        freshToken: freshToken
      };
    } else {
      return {
        success: false,
        message: `Error de Google People API (${response.status}): ${data.error?.message || 'Permisos insuficientes o token expirado.'}`,
        freshToken: freshToken
      };
    }
  } catch (error: any) {
    console.error("Excepción al sincronizar contacto:", error);
    return {
      success: false,
      message: error.message || "Error al conectar con la API de Google Contacts.",
      freshToken: freshToken
    };
  }
}

/**
 * Sincroniza un Booking (agendamiento de cita) con Google Contacts.
 */
export async function syncBookingToGoogleContacts(
  booking: Booking,
  googleConfig: GoogleGmailConfig
): Promise<SyncResult> {
  const dummyClient: Client = {
    id: booking.id,
    name: booking.clientName,
    email: booking.clientEmail,
    phone: booking.clientPhone,
    companyName: booking.platformName || 'Plataforma de Agendamiento',
    serviceType: booking.topic || 'Videollamada',
    responsiblePerson: 'Automático',
    contactMethod: 'Email',
    contractStartDate: booking.date,
    status: ClientStatus.Lead,
    notes: `Cita Agendada: ${booking.date} de ${booking.startTime} a ${booking.endTime}.\nZoom Link: ${booking.zoomJoinUrl || 'No generado'}`
  };

  return syncClientToGoogleContacts(dummyClient, googleConfig);
}

/**
 * Sincroniza en lote (Bulk) una lista de clientes con Google Contacts.
 */
export async function bulkSyncClientsToGoogleContacts(
  clients: Client[],
  googleConfig: GoogleGmailConfig,
  onProgress?: (index: number, total: number, clientName: string, success: boolean, errorMsg?: string) => void
): Promise<{ success: number; failed: number; freshToken?: string }> {
  let successCount = 0;
  let failedCount = 0;
  let currentGoogleConfig = { ...googleConfig };

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const res = await syncClientToGoogleContacts(client, currentGoogleConfig);
    
    // Si se obtuvo un token fresco, actualizar la config para llamadas posteriores
    if (res.freshToken) {
      currentGoogleConfig.accessToken = res.freshToken;
      currentGoogleConfig.tokenObtainedAt = Date.now();
    }

    if (res.success) {
      successCount++;
      if (onProgress) onProgress(i + 1, clients.length, client.name, true);
      // Guardar el resourceName en Firestore si es nuevo
      if (res.resourceName && res.resourceName !== client.googleContactResourceName) {
        client.googleContactResourceName = res.resourceName;
      }
    } else {
      failedCount++;
      if (onProgress) onProgress(i + 1, clients.length, client.name, false, res.message);
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    freshToken: currentGoogleConfig.accessToken !== googleConfig.accessToken ? currentGoogleConfig.accessToken : undefined
  };
}
