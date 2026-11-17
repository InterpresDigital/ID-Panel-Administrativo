import { Transaction, Client, TaxRecord } from "../types";
import { GoogleGmailConfig, ensureValidGoogleToken } from "./gmailApiService";

const GOOGLE_SCRIPT_URL: string = 'https://script.google.com/macros/s/AKfycbx7eiFBwLHt2Xbf_9v0AhejKL6B44QQJse2cYyutZZzfXZIlu3QOyWWomzSXrG_oZvs/exec'; 
const API_SECRET = 'INTERPRES_SECURE_2026';

export const syncTransactionToSheet = async (transaction: Transaction, action: 'add_transaction' | 'update_transaction' | 'delete_transaction' = 'add_transaction'): Promise<boolean> => {
  if (!GOOGLE_SCRIPT_URL) {
    console.warn("Google Sheets Sync: Script URL not configured.");
    return false;
  }

  try {
    const payload = JSON.stringify({
      action: action,
      key: API_SECRET,
      data: transaction
    });

    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: payload,
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    console.log(`Transaction ${action} synced to Google Sheets`);
    return true;
  } catch (error) {
    console.error(`Error syncing transaction (${action}) to Google Sheets:`, error);
    return false;
  }
};

export const syncClientToSheet = async (client: Client, action: 'sync_client' | 'delete_client' = 'sync_client'): Promise<boolean> => {
  if (!GOOGLE_SCRIPT_URL) {
    console.warn("Google Sheets Sync: Script URL not configured.");
    return false;
  }

  try {
    const payload = JSON.stringify({
      action: action,
      key: API_SECRET,
      data: client
    });

    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: payload,
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    console.log(`Client ${action} synced to Google Sheets`);
    return true;
  } catch (error) {
    console.error(`Error syncing client (${action}) to Google Sheets:`, error);
    return false;
  }
};

export const bulkSyncTransactionsToSheet = async (transactions: Transaction[]): Promise<{ success: number, failed: number }> => {
  if (!GOOGLE_SCRIPT_URL) {
    return { success: 0, failed: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  for (const transaction of transactions) {
    const success = await syncTransactionToSheet(transaction, 'update_transaction');
    if (success) successCount++;
    else failedCount++;
  }

  return { success: successCount, failed: failedCount };
};

export const bulkSyncClientsToSheet = async (clients: Client[]): Promise<{ success: number, failed: number }> => {
  if (!GOOGLE_SCRIPT_URL) {
    return { success: 0, failed: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  for (const client of clients) {
    const success = await syncClientToSheet(client, 'sync_client');
    if (success) successCount++;
    else failedCount++;
  }

  return { success: successCount, failed: failedCount };
};

export const fetchDataFromSheet = async (): Promise<{ clients: Client[], transactions: Transaction[] } | null> => {
  if (!GOOGLE_SCRIPT_URL) {
    return null;
  }

  try {
    const payload = JSON.stringify({
      action: 'get_data',
      key: API_SECRET
    });

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: payload,
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    const result = await response.json();
    if (result && result.status === 'success') {
      return {
        clients: result.clients || [],
        transactions: result.transactions || []
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching historical data from Google Sheets:", error);
    return null;
  }
};

export const DEFAULT_SPREADSHEET_ID = '1Yptl3rHzrFBdaULdmbc9r-N-4x1ZwOgZy4kITqyiHGU';

/**
 * Sincronización directa vía Google Sheets REST API usando el token de Google Workspace.
 */
export async function createOrGetWorkspaceSpreadsheet(
  token: string, 
  googleConfig?: GoogleGmailConfig, 
  title: string = 'Interpres Digital - Finanzas e Impuestos'
): Promise<string | null> {
  if (googleConfig?.customSpreadsheetId) {
    return googleConfig.customSpreadsheetId;
  }
  return DEFAULT_SPREADSHEET_ID;
}

const SPANISH_MONTHS: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
};

export function getSpanishMonthName(dateStr: string): string {
  if (!dateStr || dateStr.length < 7) return 'Finanzas';
  const monthNum = dateStr.substring(5, 7);
  return SPANISH_MONTHS[monthNum] || 'Finanzas';
}

/**
 * Sincroniza todas las transacciones financieras y declaraciones de impuestos directamente en Google Sheets.
 * Agrupa las transacciones por mes (Julio -> Hoja de Julio, Agosto -> Hoja de Agosto).
 */
export async function syncFinancesAndTaxesToGoogleSheets(
  googleConfig: GoogleGmailConfig,
  transactions: Transaction[],
  taxes: TaxRecord[]
): Promise<{ success: boolean; message: string; spreadsheetUrl?: string }> {
  try {
    const validToken = await ensureValidGoogleToken(googleConfig);
    if (!validToken?.accessToken) {
      return {
        success: false,
        message: "⚠️ No hay una cuenta de Google Workspace vinculada. Por favor vincula tu cuenta en Configuración."
      };
    }

    const token = validToken.accessToken;
    const spreadsheetId = await createOrGetWorkspaceSpreadsheet(token, googleConfig);

    if (!spreadsheetId) {
      return {
        success: false,
        message: "⚠️ No se encontró el ID de la hoja de cálculo de Google Sheets."
      };
    }

    // 1. Leer las pestañas existentes en tu libro de Google Sheets
    let existingSheetTitles: string[] = [];
    try {
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        existingSheetTitles = (metaData.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
      }
    } catch (e: any) {
      console.warn("No se pudieron consultar los nombres de pestañas existentes:", e.message);
    }

    // 2. Agrupar las transacciones por mes (Julio, Agosto, etc.)
    const groupedByMonth = transactions.reduce((acc, t) => {
      const monthName = getSpanishMonthName(t.date);
      if (!acc[monthName]) acc[monthName] = [];
      acc[monthName].push(t);
      return acc;
    }, {} as Record<string, Transaction[]>);

    const updatedMonths: string[] = [];
    const financeHeaders = ['ID', 'Fecha', 'Tipo', 'Categoría', 'Monto (MXN)', 'Persona / Empresa', 'Medio de Pago', 'Ubicación', 'Descripción'];

    // 3. Procesar y escribir cada grupo de transacciones en su pestaña de mes correspondiente
    for (const [monthName, txList] of Object.entries(groupedByMonth)) {
      // Buscar si ya existe una pestaña que contenga el nombre del mes (ej. "Julio", "Julio 2026", "AGOSTO")
      let targetTab = existingSheetTitles.find(title => 
        title.toLowerCase().includes(monthName.toLowerCase()) || 
        monthName.toLowerCase().includes(title.toLowerCase())
      );

      // Si no existe la pestaña del mes en Google Sheets, crearla automáticamente vía API
      if (!targetTab) {
        try {
          const createRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              requests: [{ addSheet: { properties: { title: monthName } } }]
            })
          });

          if (createRes.ok) {
            targetTab = monthName;
            existingSheetTitles.push(monthName);
          }
        } catch (err) {
          console.warn(`No se pudo crear la pestaña de ${monthName}:`, err);
        }
      }

      // Usar la pestaña encontrada/creada o fallback a la primera pestaña del libro
      const finalTabName = targetTab || existingSheetTitles[0] || 'Finanzas';
      const encodedTab = encodeURIComponent(finalTabName);

      const financeRows = txList.map(t => [
        t.id,
        t.date,
        t.type,
        t.category,
        t.amount,
        t.entity || 'General',
        t.paymentMethod || 'Transferencia',
        t.locationType || 'Nacional',
        t.description
      ]);

      const putRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodedTab}'!A1:I${financeRows.length + 1}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [financeHeaders, ...financeRows]
        })
      });

      if (putRes.ok) {
        updatedMonths.push(`${finalTabName} (${txList.length} reg.)`);
      } else {
        const errData = await putRes.json().catch(() => ({}));
        console.error(`Error al escribir en pestaña '${finalTabName}':`, errData);
      }
    }

    // 4. Escribir pestaña de Impuestos si existen declaraciones
    const taxHeaders = ['ID', 'Categoría Impuesto', 'Periodo', 'Tipo Periodo', 'Monto Declarado (MXN)', 'Estado', 'Fecha de Pago', 'Notas'];
    const taxRows = (taxes || []).map(tx => [
      tx.id,
      tx.category,
      tx.periodLabel,
      tx.type,
      tx.amount,
      tx.status,
      tx.paymentDate || 'Pendiente',
      tx.notes || ''
    ]);

    if (taxRows.length > 0) {
      let taxTab = existingSheetTitles.find(t => t.toLowerCase().includes('impuesto') || t.toLowerCase().includes('declaracion'));
      if (!taxTab) {
        taxTab = 'Declaraciones e Impuestos';
        try {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              requests: [{ addSheet: { properties: { title: taxTab } } }]
            })
          });
        } catch (e) {}
      }

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(taxTab)}'!A1:H${taxRows.length + 1}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [taxHeaders, ...taxRows]
        })
      }).catch(() => {});
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return {
      success: true,
      message: `✓ Sincronización mensual completada exitosamente en Google Sheets:\n${updatedMonths.join(', ')}`,
      spreadsheetUrl: url
    };

  } catch (err: any) {
    console.error("Error al sincronizar con Google Sheets:", err);
    return {
      success: false,
      message: err.message || "Error al actualizar Google Sheets."
    };
  }
}
