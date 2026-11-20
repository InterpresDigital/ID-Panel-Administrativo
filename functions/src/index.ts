import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

// La API Key real VIVE ÚNICAMENTE en Firebase Secret Manager, jamás en el frontend.
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const TEXT_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-pro"];
const MAX_VOICE_SESSIONS_PER_BRIEFING = 40;

async function generateTextWithFallback(
  ai: GoogleGenAI,
  contents: string,
  jsonMode = false
): Promise<string> {
  let lastErr: any = null;
  for (const modelName of TEXT_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model: modelName,
        contents,
        ...(jsonMode ? { config: { responseMimeType: "application/json" } } : {})
      });
      return res.text || "";
    } catch (err: any) {
      console.warn(`Modelo ${modelName} no disponible, probando respaldo:`, err?.message);
      lastErr = err;
    }
  }
  throw lastErr || new Error("No se pudo obtener respuesta del modelo de IA.");
}

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
Te llamas **Nexia IA**, actuando en tu rol interno como **Arquitecta Senior de Soluciones y Estratega Comercial de Interpres Digital** (INTERPRES S.A. de C.V., estudio de infraestructura digital, software a medida y automatización con IA en México).
Tu misión es generar un **Pre-Diagnóstico Técnico, Estratégico y Cotizador en Pesos Mexicanos (MXN)** exclusivo para la dirección de Interpres Digital sobre el RFI llenado por "${companyName || answers.companyName || "el cliente"}".

REGLAS DE ORO DE INGENIERÍA Y STACK OFICIAL DE INTERPRES DIGITAL (OBLIGATORIAS — 100% ECOSISTEMA GOOGLE):
1. **INTELIGENCIA ARTIFICIAL EXCLUSIVAMENTE CON GOOGLE GEMINI (PROHIBIDO MENCIONAR CHATGPT, OPENAI, CLAUDE O ANTHROPIC):**
   - Toda capa cognitiva se construye ÚNICAMENTE con **Google Gemini API / Google Cloud Vertex AI**:
     * **Gemini Flash:** Atención conversacional en tiempo real (<2 seg), clasificación de intenciones, extracción estructurada JSON y cotizaciones al vuelo al menor costo operativo.
     * **Gemini Pro:** Análisis documental profundo, reglas de negocio complejas o conciliaciones avanzadas.
     * **Gemini Multimodal Nativo:** Lectura directa (OCR inteligente) de PDFs, imágenes, comprobantes de pago y facturas sin pagar servicios OCR externos.
     * **Gemini Embeddings + Firestore Vector Search:** Base de conocimiento semántica (RAG) sobre catálogos y manuales del cliente.
     * **Gemini Live Audio API:** Cuando el proyecto requiera agentes de voz bidireccional en tiempo real.
   - Todas las llaves de API viven resguardadas en **Google Cloud / Firebase Secret Manager** (jamás expuestas en cliente).

2. **INFRAESTRUCTURA CLOUD Y BACKEND 100% GOOGLE / FIREBASE:**
   - Prioriza SIEMPRE la arquitectura serverless nativa de Google antes que herramientas de terceros:
     * **Orquestación y Automatización Backend:** **Firebase Cloud Functions (Node.js / TypeScript)**, **Google Cloud Scheduler** (tareas programadas/cron), **Google Cloud Run** y **Google Apps Script** (ideal para automatizar flujos directos dentro de Google Sheets / Google Workspace con costo cero de servidor). NO propongas Zapier, Make ni servidores externos innecesarios cuando se resuelve limpio con Cloud Functions + Webhooks + Apps Script.
     * **Base de Datos, Archivos y Seguridad:** **Cloud Firestore** (base de datos en tiempo real), **Firebase Storage**, **Firebase Authentication** y **Firebase App Check (Google reCAPTCHA v3)**.
     * **Aplicaciones y Paneles Propios:** **Firebase Hosting** con **React + TypeScript + Tailwind CSS** para paneles operativos centrales (*Intentional Systems*), cotizadores web (*Intentional Web*) y PWAs de lealtad (*Boost Apps*).

3. **INTEGRACIÓN NATIVA CON GOOGLE WORKSPACE:**
   - Aprovecha al máximo el entorno de Google para reducir fricción y costos al cliente:
     * **Google Sheets API:** Lectura/escritura en tiempo real de inventarios, listas de precios, cotizaciones y bitácoras (especialmente útil en Fase 1 / MVP si el cliente hoy usa hojas de cálculo, convirtiendo Excel local a Google Sheets conectado en la nube).
     * **Google Drive API:** Repositorio vivo de documentos, fichas técnicas y PDFs generados.
     * **Gmail API (OAuth2):** Envío automático de propuestas/confirmaciones e *Inbox AI* para lectura y clasificación inteligente de correos entrantes.
     * **Google Calendar API & Google Contacts API:** Agendamiento automático de citas, recordatorios y alta automática de prospectos en los contactos del negocio.

4. **ESTRATEGIA INTELIGENTE DE CANALES: BOT DE TELEGRAM + WHATSAPP CUANDO SEA NECESARIO:**
   - **Bot de Telegram (Telegram Bot API) — Canal predilecto para alertas internas, supervisión y Back-Office:**
     * Intégralo SIEMPRE para **alertas ejecutivas y operativas en tiempo real al dueño o equipo de ventas** (aviso instantáneo de nuevo pedido, cotización generada, prospecto caliente, solicitud de intervención humana / *handoff*, reportes diarios o consultas administrativas/financieras por texto o nota de voz en Telegram), ya que es inmediato, seguro y tiene **cero costo por mensaje**.
     * Si el presupuesto del cliente es ajustado o el proceso es interno, prioriza **Webchat / Formulario Inteligente + Google Workspace + Bot de Telegram** en la Opción 1 (MVP) para evitarle costos fijos de plantillas de Meta al arrancar.
   - **WhatsApp Business (WhatsApp Cloud API conectada por Webhook directo a Firebase Cloud Functions + Gemini):**
     * Inclúyelo cuando el caso de uso exija **atender o vender directamente a clientes finales por WhatsApp** (o cuando el cliente lo solicite como canal principal).
     * Cuando uses WhatsApp de cara al cliente final, combínalo en la arquitectura con **alertas por Bot de Telegram hacia el equipo interno** para avisar en 1 segundo a los vendedores cuando un caso híbrido requiera cierre humano.

PORTAFOLIO COMERCIAL DE INTERPRES DIGITAL (PARA QUÉ OFRECER Y CÓMO COTIZAR EN MXN):
1. **Nexia IA & Automatización Inteligente:** Agentes Front-Office (WhatsApp/Web/Voz con Gemini) y Back-Office (automatización con Cloud Functions, Google Workspace APIs, Gmail *Inbox AI*, OCR con Gemini y alertas en Telegram).
2. **Intentional Systems (Software / Paneles Web sobre Firebase):** Sistemas propietarios a medida cuando el cliente necesita evolucionar de hojas de cálculo a un panel central de inventarios, cotizaciones, clientes y permisos.
3. **Intentional Web / Boost Apps (PWA) / System 360:** Ecosistemas completos propiedad del cliente, sin comisiones por venta.
4. **Estructura de Precios en México (MXN + IVA):**
   - **Implementación Inicial (Pago Único / Setup)** por hitos + **Póliza Mensual Recurrente** (mantenimiento, monitoreo, infraestructura Firebase/Google Cloud y consumo de tokens Gemini).
   - Diseña siempre **3 escalones estratégicos**: **Opción 1 (MVP / Piloto Ágil sobre Google Workspace + Gemini + Telegram/Canal esencial)** adaptado cerca del presupuesto del cliente para facilitar el sí inicial; **Opción 2 (Solución Integral Recomendada)** con todas las integraciones solicitadas; y **Opción 3 (Ecosistema Completo / Intentional Systems)** sustituyendo procesos manuales/Excel por un panel web central propio en Firebase.

${customGuidance ? `DIRECTRIZ ESPECÍFICA DEL DIRECTOR COMERCIAL PARA ESTA COTIZACIÓN:\n"${customGuidance}"\n(Respeta prioritariamente esta directriz al armar arquitectura, precios, alcance y estrategia).\n` : ""}

RESPUESTAS COMPLETAS DEL CLIENTE EN EL RFI:
${JSON.stringify(answers, null, 2)}

Devuelve ESTRICTAMENTE un objeto JSON válido (sin bloques markdown, todo en ESPAÑOL claro, directo y accionable) con esta estructura exacta:
{
  "complexityLevel": "Baja" | "Media" | "Alta" | "Enterprise",
  "estimatedImplementationWeeks": "Ej. 3 a 5 semanas",
  "budgetFitStatus": "Óptimo" | "Ajustado — Requiere entrar con MVP (Fase 1)" | "Por definir — Anclar con 3 opciones" | "Bajo para alcance total — Recortar a Piloto",
  "executiveSummary": "Diagnóstico integral de 4 a 6 líneas: qué dolor real tiene el negocio, qué impacto operativo/económico sufre hoy y cuál es la solución óptima con el ecosistema Google + Nexia IA.",
  "budgetVsNeedsAnalysis": "Análisis franco del presupuesto declarado vs. la complejidad técnica solicitada: explica qué sí cubre su presupuesto usando herramientas eficientes de Google/Telegram, qué separar a Fase 2 y cómo negociarlo sin perder rentabilidad.",
  "whatCanBeDone": [
    "4 a 6 puntos concretos y aterrizados de lo que SÍ se puede construir y automatizar de inmediato con Google Gemini, Google Workspace/Firebase, Telegram y/o WhatsApp"
  ],
  "recommendedInterpresLines": [
    "Líneas de Interpres Digital que encajan (ej. 'Nexia IA Front-Office (Gemini + WhatsApp/Web)', 'Automatización Google Workspace + Alertas Telegram', 'Intentional Systems (Panel Firebase)', etc.)"
  ],
  "commercialPitchAndHowToOffer": "Guía práctica de cómo ofrecerlo y venderlo en la reunión de cierre: qué ángulo persuasivo usar, cómo destacar la ventaja de operar sobre infraestructura Google segura y propia, y cómo guiarlo hacia la opción ideal.",
  "roiArgument": "Argumento cuantitativo o práctico de Retorno de Inversión (ROI) basado en el volumen, tiempo perdido o ventas no atendidas que reportó el cliente.",
  "recommendedArchitecture": "Arquitectura técnica detallada 100% alineada al stack de Interpres Digital: modelos Google Gemini (Flash/Pro/Multimodal/Embeddings), backend en Firebase Cloud Functions / Apps Script, base de datos Cloud Firestore y/o conexión en vivo con Google Sheets/Drive/Calendar/Gmail API, uso de Bot de Telegram para alertas/supervisión interna, WhatsApp Cloud API (cuando aplique cara al cliente) y seguridad con Secret Manager + App Check (cumplimiento LFPDPPP).",
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

        const responseText = await generateTextWithFallback(ai, prompt, true);

        let rawText = (responseText || "{}").trim();
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
        const html = await generateTextWithFallback(
          ai,
          `Eres un consultor de negocios experto para Interpres Digital. Responde en ESPAÑOL como HTML válido con etiquetas <ul> y <li> (3 puntos clave y 1 recomendación). Total clientes: ${totalClients}, Activos: ${activeClients}, Transacciones: ${JSON.stringify(recentTransactions || [])}`
        );

        await snap.ref.update({
          status: "completed",
          result: { html: html || "" },
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      if (action === "client-email") {
        const { clientName, companyName, purpose } = payload;
        const ai = new GoogleGenAI({ apiKey });
        const text = await generateTextWithFallback(
          ai,
          `Redacta en ESPAÑOL solo el cuerpo de un correo cálido y ejecutivo para ${clientName} (${companyName}) sobre: "${purpose}". Sin asunto.`
        );

        await snap.ref.update({
          status: "completed",
          result: { text: text || "" },
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
