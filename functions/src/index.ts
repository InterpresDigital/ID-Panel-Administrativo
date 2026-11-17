import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

// La API Key real VIVE ÚNICAMENTE en Firebase Secret Manager, jamás en el frontend.
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const TEXT_MODEL = "gemini-2.5-flash";
const MAX_VOICE_SESSIONS_PER_BRIEFING = 15;

// Trigger interno por Firestore: compatible 100% con políticas corporativas de Google Workspace
// (no requiere exponer endpoints HTTP públicos con allUsers ni lidiar con CORS).
export const onAiRequest = functions
  .region("us-central1")
  .runWith({
    secrets: [geminiApiKey],
    serviceAccount: "firebase-adminsdk-fbsvc@interpres-digital.iam.gserviceaccount.com",
    memory: "256MB",
    timeoutSeconds: 60
  })
  .firestore.document("ai_requests/{requestId}")
  .onCreate(async (snap) => {
    const reqData = snap.data() || {};
    const action = String(reqData.action || "");
    const payload = reqData.payload || {};

    const apiKey = geminiApiKey.value()?.trim();
    if (!apiKey) {
      await snap.ref.update({
        status: "error",
        error: "Secreto GEMINI_API_KEY no configurado en el servidor.",
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    try {
      if (action === "voice-session") {
        const { briefingId } = payload;
        if (!briefingId || typeof briefingId !== "string") {
          throw new Error("Se requiere un briefingId válido.");
        }

        const briefingRef = db.collection("briefings").doc(briefingId);
        const briefingSnap = await briefingRef.get();
        if (!briefingSnap.exists) {
          throw new Error("No se encontró el borrador del briefing.");
        }

        const bData = briefingSnap.data() || {};
        const usedSessions = Number(bData.voiceSessionsCount || 0);
        if (usedSessions >= MAX_VOICE_SESSIONS_PER_BRIEFING) {
          throw new Error(
            "Se alcanzó el límite de sesiones de voz para este enlace. Puedes continuar y finalizar manualmente en pantalla."
          );
        }

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { apiVersion: "v1alpha" }
        });

        const liveModel = DEFAULT_LIVE_MODEL;
        const now = Date.now();
        const expireTime = new Date(now + 20 * 60 * 1000).toISOString();
        const newSessionExpireTime = new Date(now + 3 * 60 * 1000).toISOString();

        const tokenResponse = await ai.authTokens.create({
          config: {
            uses: 1,
            expireTime,
            newSessionExpireTime
          }
        });

        await Promise.all([
          briefingRef.update({
            voiceSessionsCount: usedSessions + 1,
            lastVoiceSessionAt: new Date().toLocaleString("es-MX", {
              timeZone: "America/Mexico_City"
            })
          }),
          snap.ref.update({
            status: "completed",
            result: {
              token: tokenResponse.name,
              model: liveModel,
              expiresAt: expireTime
            },
            completedAt: admin.firestore.FieldValue.serverTimestamp()
          })
        ]);
        return;
      }

      if (action === "analyze-rfi") {
        const { briefingId, companyName, answers } = payload;
        if (!briefingId || !answers) {
          throw new Error("Faltan datos del RFI para analizar.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const prompt = `
Eres un Arquitecto Senior de Soluciones de IA y Automatización en Interpres Digital.
Analiza el siguiente RFI completado por la empresa "${companyName || "Cliente"}" para cotizarle la implementación de automatizaciones y agentes de IA.

RESPUESTAS DEL RFI:
${JSON.stringify(answers, null, 2)}

Devuelve ESTRICTAMENTE un objeto JSON válido (sin bloques markdown) con esta estructura exacta:
{
  "complexityLevel": "Baja" | "Media" | "Alta" | "Enterprise",
  "executiveSummary": "Resumen ejecutivo de 3 a 4 líneas para el cotizador.",
  "recommendedArchitecture": "Arquitectura técnica y stack recomendado (modelos, orquestación, canales, base vectorial/RAG, seguridad).",
  "criticalRisks": ["Lista de 3 a 5 riesgos técnicos, legales o de APIs faltantes detectados"],
  "mvpScope": ["3 a 5 entregables recomendados para Fase 1 (MVP rápido)"],
  "phase2Scope": ["2 a 4 entregables para Fase 2 de escalamiento"],
  "followUpQuestions": ["3 a 5 preguntas clave que faltan aclarar antes de cerrar el precio final"],
  "estimatedImplementationWeeks": "Ej. 3 a 5 semanas"
}
`;

        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        });

        const parsed = JSON.parse(response.text || "{}");
        const diagnostic = {
          ...parsed,
          generatedAt: new Date().toISOString()
        };

        await db.collection("briefings").doc(briefingId).update({
          aiPreDiagnostic: diagnostic
        });

        await snap.ref.update({
          status: "completed",
          result: { diagnostic },
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      if (action === "business-insights") {
        const { totalClients, activeClients, recentTransactions } = payload;
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: `Eres un consultor de negocios experto para Interpres Digital. Responde en ESPAÑOL como HTML válido con etiquetas <ul> y <li> (3 puntos clave y 1 recomendación). Total clientes: ${totalClients}, Activos: ${activeClients}, Transacciones: ${JSON.stringify(recentTransactions || [])}`
        });

        await snap.ref.update({
          status: "completed",
          result: { html: response.text || "" },
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      if (action === "client-email") {
        const { clientName, companyName, purpose } = payload;
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: `Redacta en ESPAÑOL solo el cuerpo de un correo cálido y ejecutivo para ${clientName} (${companyName}) sobre: "${purpose}". Sin asunto.`
        });

        await snap.ref.update({
          status: "completed",
          result: { text: response.text || "" },
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      throw new Error(`Acción desconocida: ${action}`);
    } catch (error: any) {
      console.error(`Error procesando acción de IA (${action}):`, error);
      await snap.ref.update({
        status: "error",
        error: error?.message || "Error interno al procesar la solicitud segura de IA.",
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });
