import {
  addDoc,
  collection,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Client, Transaction } from "../types";
import { AiBriefingRecord, AiPreDiagnostic } from "../utils/aiBriefingTypes";

async function callSecureAiAction<T>(
  action: "voice-session" | "analyze-rfi" | "business-insights" | "client-email",
  payload: Record<string, any>,
  timeoutMs = 55000
): Promise<T> {
  const reqRef = await addDoc(collection(db, "ai_requests"), {
    action,
    payload,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      unsubscribe();
      deleteDoc(reqRef).catch(() => {});
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Tiempo de espera agotado al contactar el motor seguro de IA."));
    }, timeoutMs);

    const unsubscribe = onSnapshot(
      reqRef,
      (snap) => {
        if (!snap.exists() || settled) return;
        const data = snap.data();
        if (data.status === "completed") {
          settled = true;
          clearTimeout(timer);
          cleanup();
          resolve(data.result as T);
        } else if (data.status === "error") {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(new Error(data.error || "Error al procesar la solicitud segura de IA."));
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        reject(err);
      }
    );
  });
}

export const generateBusinessInsights = async (
  clients: Client[],
  transactions: Transaction[]
): Promise<string> => {
  const activeClients = clients.filter(
    (c) => String(c.status) === "Active" || String(c.status) === "Activo"
  ).length;
  const recentTransactions = transactions.slice(0, 10).map((t) => ({
    date: t.date,
    type: t.type,
    amount: t.amount,
    category: t.category,
  }));

  try {
    const data = await callSecureAiAction<{ html: string }>("business-insights", {
      totalClients: clients.length,
      activeClients,
      recentTransactions,
    });
    return data.html || "No se generaron insights.";
  } catch (error) {
    console.error("Error consultando motor seguro de IA:", error);
    return "No se pudieron generar los insights en este momento.";
  }
};

export const generateClientEmail = async (
  client: Client,
  purpose: string
): Promise<string> => {
  try {
    const data = await callSecureAiAction<{ text: string }>("client-email", {
      clientName: client.name,
      companyName: client.companyName,
      purpose,
    });
    return data.text || "No se pudo generar el borrador.";
  } catch (error) {
    console.error("Error consultando motor seguro de IA:", error);
    return "No se pudo generar el borrador de correo en este momento.";
  }
};

export const requestEphemeralVoiceToken = async (
  briefingId: string
): Promise<{ token: string; model: string; expiresAt: string }> => {
  return callSecureAiAction<{ token: string; model: string; expiresAt: string }>(
    "voice-session",
    { briefingId }
  );
};

export const generateAiRfiPreDiagnostic = async (
  briefing: AiBriefingRecord,
  customGuidance?: string
): Promise<AiPreDiagnostic> => {
  const data = await callSecureAiAction<{ diagnostic: AiPreDiagnostic }>(
    "analyze-rfi",
    {
      briefingId: briefing.id,
      companyName: briefing.companyName,
      answers: briefing.answers,
      customGuidance: customGuidance ? customGuidance.trim() : "",
    },
    115000
  );
  return data.diagnostic;
};
