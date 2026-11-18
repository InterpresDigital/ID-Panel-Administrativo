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
const MAX_VOICE_SESSIONS_PER_BRIEFING = 40;

// Trigger interno por Firestore: compatible 100% con políticas corporativas de Google Workspace
// (no requiere exponer endpoints HTTP públicos con allUsers ni lidiar con CORS).
export const onAiRequest = functions
  .region("us-central1")
  .runWith({
    secrets: [geminiApiKey],
    serviceAccount: "firebase-adminsdk-fbsvc@interpres-digital.iam.gserviceaccount.com",
    memory: "512MB",
    timeoutSeconds: 120
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
        // 2 horas de vigencia de sesión activa para que Gemini jamás corte llamadas largas,
        // manteniendo 3 minutos de ventana de arranque único (uses: 1) por seguridad.
        const expireTime = new Date(now + 120 * 60 * 1000).toISOString();
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
        const { briefingId, companyName, answers, customGuidance } = payload;
        if (!briefingId || !answers) {
          throw new Error("Faltan datos del RFI para analizar.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const prompt = `
Eres el **Director de Arquitectura de Soluciones y Estrategia Comercial de Interpres Digital** (INTERPRES S.A. de C.V., estudio de infraestructura digital, software a medida y agentes de IA en México).
Tu misión es entregar un **Pre-Diagnóstico Técnico, Estratégico y Cotizador en Pesos Mexicanos (MXN)** exclusivo para el equipo directivo de Interpres Digital sobre el RFI llenado por "${companyName || answers.companyName || "el cliente"}".

PORTAFOLIO Y FILOSOFÍA DE INTERPRES DIGITAL (ÚSALO PARA ESTRUCTURAR QUÉ OFRECER Y CÓMO VENDERLO):
1. **Nexia IA & Automatización Inteligente:**
   - *Agentes Front-Office (WhatsApp Business API, Webchat, Voz):* Atención/ventas 24/7 en <3 seg, calificación de leads, cotización automática desde catálogos/inventarios, agendamiento y pase híbrido a humano.
   - *Agentes Back-Office & Automatización de Procesos:* Conexión vía APIs/Webhooks/Cloud Functions/n8n entre CRMs (HubSpot, GoHighLevel, etc.), ERPs, Google Sheets/Excel, Stripe, Gmail/Outlook (*Inbox AI*), alertas ejecutivas en Telegram y lectura OCR de documentos/facturas.
2. **Intentional Systems (Software / Paneles a Medida):** Sistemas centrales web/cloud propietarios cuando el cliente opera en hojas de cálculo frágiles y requiere control real de inventario, cotizaciones, clientes, comisiones o permisos.
3. **Intentional Web / Boost Apps (PWA Lealtad) / System 360:** Ecosistemas digitales completos de captación, conversión y recurrencia sin comisiones por transacción; el cliente es dueño de su infraestructura y datos.
4. **Modelo Comercial Recomendado en México (MXN, antes de IVA):**
   - Cobro de **Implementación Inicial (Pago Único / Setup)** dividido por hitos + **Póliza Mensual Recurrente (Retainer)** que cubre mantenimiento evolutivo, monitoreo, servidor/infraestructura y consumo estimado de IA/APIs.
   - Si el presupuesto declarado por el cliente es bajo o ajustado frente a todo lo que pide (ej. $5,000 - $20,000 MXN para algo grande), NO descartes la venta: diseña una **Opción 1 (MVP / Fase Semilla ultra enfocada)** ajustada cerca de su presupuesto quitando integraciones pesadas, una **Opción 2 (Solución Integral Recomendada)** con el valor real de mercado en México, y una **Opción 3 (Escalamiento / Sistema Completo)**.

${customGuidance ? `DIRECTRIZ ESPECÍFICA DEL DIRECTOR COMERCIAL PARA ESTA COTIZACIÓN:\n"${customGuidance}"\n(Respeta prioritariamente esta directriz al armar precios, alcance y estrategia).\n` : ""}

RESPUESTAS COMPLETAS DEL CLIENTE EN EL RFI:
${JSON.stringify(answers, null, 2)}

Devuelve ESTRICTAMENTE un objeto JSON válido (sin bloques markdown, todo en ESPAÑOL claro, directo y accionable) con esta estructura exacta:
{
  "complexityLevel": "Baja" | "Media" | "Alta" | "Enterprise",
  "estimatedImplementationWeeks": "Ej. 3 a 5 semanas",
  "budgetFitStatus": "Óptimo" | "Ajustado — Requiere entrar con MVP (Fase 1)" | "Por definir — Anclar con 3 opciones" | "Bajo para alcance total — Recortar a Piloto",
  "executiveSummary": "Diagnóstico integral de 4 a 6 líneas: qué dolor real tiene el negocio, qué impacto operativo/económico está sufriendo hoy y cuál es la verdadera solución que necesita.",
  "budgetVsNeedsAnalysis": "Análisis franco del presupuesto declarado vs. la complejidad técnica solicitada: explica si su presupuesto alcanza, qué sí cubriría, qué conviene separar a Fase 2 y cómo manejar la conversación de precio sin perder el cierre.",
  "whatCanBeDone": [
    "4 a 6 puntos concretos y aterrizados de lo que SÍ se puede construir y automatizar con su operación y datos actuales"
  ],
  "recommendedInterpresLines": [
    "Líneas de Interpres Digital que encajan (ej. 'Nexia IA Front-Office + Automatización API', 'Intentional Systems (Panel Web Central)', etc.)"
  ],
  "commercialPitchAndHowToOffer": "Guía práctica de cómo ofrecerlo y venderlo en la reunión de cierre: qué ángulo persuasivo usar con el tomador de decisión, cómo justificar la inversión y por qué empezar por la opción recomendada.",
  "roiArgument": "Argumento cuantitativo o práctico de Retorno de Inversión (ROI) basado en el volumen, tiempo perdido o ventas no atendidas que reportó el cliente.",
  "recommendedArchitecture": "Arquitectura técnica detallada: canales (ej. WhatsApp Cloud API / Web), motor de orquestación (Cloud Functions / Webhooks / n8n), modelo LLM y consulta de conocimiento (RAG / lectura estructurada de Sheets o BD SQL/Firestore), panel de supervisión humana y medidas de seguridad/privacidad LFPDPPP.",
  "stepByStepIntegrationPlan": [
    "Paso 1: ...",
    "Paso 2: ...",
    "Paso 3: ...",
    "Paso 4: ...",
    "Paso 5: ..."
  ],
  "pricingPackagesMxn": [
    {
      "tierName": "Opción 1 — MVP / Piloto de Entrada",
      "subtitle": "Arranque rápido enfocado en el dolor #1 y adaptado al presupuesto inicial",
      "setupPriceMxn": 18000,
      "monthlyRetainerMxn": 2500,
      "estimatedWeeks": "2 a 3 semanas",
      "idealFor": "Validar resultados rápidos con mínima fricción presupuestal",
      "deliverables": ["Entregable concreto 1", "Entregable concreto 2", "Entregable concreto 3"]
    },
    {
      "tierName": "Opción 2 — Solución Integral Recomendada",
      "subtitle": "Automatización y agente completo para su operación actual",
      "setupPriceMxn": 38000,
      "monthlyRetainerMxn": 4200,
      "estimatedWeeks": "4 a 5 semanas",
      "idealFor": "Resolver de raíz el proceso completo con supervisión híbrida e integraciones clave",
      "deliverables": ["Entregable concreto 1", "Entregable concreto 2", "Entregable concreto 3", "Entregable concreto 4"]
    },
    {
      "tierName": "Opción 3 — Ecosistema Completo / Escalamiento",
      "subtitle": "Infraestructura propia + Panel central + Automatización total",
      "setupPriceMxn": 68000,
      "monthlyRetainerMxn": 6500,
      "estimatedWeeks": "6 a 8 semanas",
      "idealFor": "Sustituir hojas de cálculo por un sistema propio escalable y control ejecutivo total",
      "deliverables": ["Entregable concreto 1", "Entregable concreto 2", "Entregable concreto 3", "Entregable concreto 4"]
    }
  ],
  "suggestedQuoteItems": [
    {
      "concept": "Concepto de partida para cotización (Opción Recomendada)",
      "details": "Descripción clara y comercial del entregable para el documento de cotización del cliente",
      "priceMxn": 20000,
      "billingType": "once"
    },
    {
      "concept": "Póliza Mensual de Infraestructura, Soporte y Consumo IA",
      "details": "Monitoreo operativo, servidor seguro, ajustes continuos de prompt/reglas y bolsa base de procesamiento IA",
      "priceMxn": 4200,
      "billingType": "monthly"
    }
  ],
  "paymentStructureRecommendation": "Esquema de cobro recomendado (ej. 50% anticipo al firmar acuerdo, 50% contra entrega y pruebas en vivo + inicio de póliza mensual al salir a producción; precios más IVA).",
  "criticalRisks": [
    "3 a 5 riesgos técnicos, operativos, de calidad de datos (ej. Excel desordenado) o falta de APIs a cuidar en el contrato"
  ],
  "mvpScope": [
    "3 a 5 entregables exactos sugeridos para Fase 1"
  ],
  "phase2Scope": [
    "2 a 4 módulos de crecimiento para vender después en Fase 2"
  ],
  "followUpQuestions": [
    "4 a 6 preguntas estratégicas y técnicas que el especialista de Interpres Digital debe hacerle al cliente en la videollamada de cierre"
  ]
}
(IMPORTANTE: Los montos numéricos de ejemplo arriba son solo ilustrativos de formato JSON; calcula montos REALISTAS en pesos mexicanos MXN acordes al tamaño, volumen, integraciones y presupuesto específico de este cliente).
`;

        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        });

        let rawText = (response.text || "{}").trim();
        rawText = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(rawText);
        const diagnostic = {
          ...parsed,
          customNotesUsed: customGuidance ? String(customGuidance).trim() : "",
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
