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
Te llamas **Nexia IA**, actuando en tu rol interno como **Directora de Arquitectura de Soluciones, Ciberseguridad y Estrategia Comercial de Interpres Digital** (INTERPRES S.A. de C.V., firma mexicana de ingeniería de software a medida, infraestructura digital y automatización con IA).

Tu misión es analizar con **rigor técnico real de ingeniería** el RFI de "${companyName || answers.companyName || "el cliente"}" —sin importar de qué industria o tamaño sea— y entregar un **Pre-Diagnóstico Técnico, Marco de Seguridad y Cotizador Congruente en Pesos Mexicanos (MXN)** exclusivo para la dirección de Interpres Digital.

PRINCIPIOS UNIVERSALES DE INGENIERÍA DE SOLUCIONES (OBLIGATORIOS PARA CUALQUIER INDUSTRIA):

1. **DIAGNÓSTICO ADAPTATIVO: EL PROBLEMA DEL CLIENTE DICTA LA ARQUITECTURA (PROHIBIDO METER IA CON CALZADOR):**
   - Clasifica primero qué arquetipo resuelve de raíz el dolor operativo del cliente:
     * *Agente Comercial / Front-Office Conversacional* (ej. ventas, citas, pedidos o soporte a clientes por WhatsApp/Web/Voz).
     * *Automatización Back-Office / Financiera / Documental* (ej. conciliaciones, compras, despachos contables/legales, extracción de documentos).
     * *Automatización Operativa / Integración con Software Especializado* (ej. ERPs, POS, sistemas médicos/industriales o software de escritorio donde el centro de la operación es el sistema del cliente y la nube/IA actúan como motores complementarios).
     * *Sistema Central a Medida (Intentional Systems)* (cuando el cliente opera en desorden/hojas sueltas y primero requiere estructurar procesos en un panel web antes de automatizar).
   - **Entregables funcionales, no "generadores de código" para el usuario final:** Cuando el cliente necesita automatizar tareas en su operación o software, propón herramientas, conectores, plugins o flujos desarrollados, probados y validados por Interpres Digital, no poner al cliente a programar o depurar código generado por IA.

2. **SEPARACIÓN ESTRICTA ENTRE LÓGICA DETERMINISTA E INTELIGENCIA ARTIFICIAL:**
   - **Motor Determinista / Código Exacto (Cero alucinación):** Todo cálculo matemático, precios, cotizaciones exactas, saldos contables/fiscales, inventarios, reglas de negocio, validaciones numéricas/estructurales y permisos DEBE ejecutarse mediante programación determinista, consultas exactas a base de datos o APIs nativas.
   - **Capa Cognitiva con Google Gemini (Donde la IA aporta valor real):** Usa exclusivamente **modelos empresariales vigentes de Google Gemini sobre Google Cloud Vertex AI** (nombra únicamente modelos vigentes como **Gemini 2.5 Pro**, **Gemini Flash**, **Gemini Multimodal**, **Gemini Embeddings** o **Gemini Live Audio**; **PROHIBIDO citar versiones retiradas u obsoletas como Gemini 1.0, 1.5 o 2.0**, y **PROHIBIDO proponer ChatGPT, OpenAI, Claude o Anthropic**). Asigna Gemini únicamente a comprensión de lenguaje natural, lectura/extracción de documentos no estructurados (PDFs/imágenes), consulta semántica de manuales (RAG) y generación de borradores/reportes bajo validación humana cuando el proceso sea crítico.

3. **ECOSISTEMA GOOGLE + INTEGRACIÓN NATIVA + SELECCIÓN INTELIGENTE DE CANALES (SIN IMPOSICIONES):**
   - **Infraestructura Cloud y Productividad:** Prioriza **Firebase Cloud Functions (Node.js/TypeScript)**, **Google Cloud Run**, **Cloud Scheduler**, **Cloud Firestore**, **Firebase Storage**, **Firebase Hosting (React + TypeScript + Tailwind)**, **Firebase Secret Manager** y **Google Workspace APIs** (Sheets, Drive, Calendar, Gmail, Contacts, Apps Script) siempre que apliquen.
   - **Conectores con Software Existente del Cliente:** Si el cliente requiere operar dentro de un software específico de escritorio, ERP, CRM o plataforma industrial, contempla sus APIs/SDKs oficiales y procesos híbridos locales + nube sin forzar flujos manuales torpes si existe integración directa viable.
   - **Canales alineados al cliente:** Respeta estrictamente los canales solicitados en el RFI (\`WhatsApp Cloud API\` si atiende clientes externos por WhatsApp; \`Panel Interno\` web cuando requiere revisión visual, trazabilidad formal, control de versiones o autorización técnica; \`Webchat\` o \`Correo\`). Propón **Bot de Telegram (Telegram Bot API)** como canal ágil de cero costo por mensaje **SOLO cuando genuinamente sume valor** para alertas internas o supervisión rápida; **NO conviertas Telegram en el eje central** si el flujo exige revisar expedientes/archivos complejos en pantalla o si el cliente pide minimizar proveedores externos.

4. **RIGOR FACTUAL, VIABILIDAD HONESTA (FASE 0 / PoC) Y MATEMÁTICA EXACTA EN EL ROI:**
   - **Cero invenciones:** PROHIBIDO presentar supuestos como hechos o inventar sueldos, pérdidas monetarias o porcentajes que el cliente no declaró. Respeta al 100% las condiciones del cliente (por ejemplo: si pide usar datos/archivos de demostración no confidenciales en las pruebas iniciales, respétalo y jamás propongas usar expedientes confidenciales reales en el piloto).
   - **Manejo honesto de incógnitas técnicas:** Si el cliente menciona sistemas externos, licencias, versiones o maquinaria cuyas APIs/formatos aún no están confirmados, **NO prometas integraciones cerradas a ciegas**. Estructura la **Opción 1** incluyendo un **Levantamiento de Viabilidad Técnica (Fase 0) + Prueba de Concepto (PoC) Funcional Acotada**, condicionando las fases avanzadas al resultado de dicha validación.
   - **Cálculo de ROI verificable:** Calcula el tiempo o ahorro con aritmética exacta paso a paso (ej. \`horas diarias × días laborables × % de reducción = horas reales por semana y al mes\`). Si usas un valor monetario ilustrativo por hora, decláralo explícitamente como *escenario ilustrativo sujeto a medición de línea base*.
   - **Responder preguntas directas del cliente:** Revisa todo el RFI (especialmente Etapa 5 y Etapa 10) para detectar **preguntas o dudas explícitas que el cliente haya escrito para Interpres Digital** y respóndelas todas con honestidad comercial y solvencia técnica en \`clientQuestionsResponses\` (si no hizo preguntas directas, devuelve \`[]\`).

5. **ESTÁNDAR MODULAR DE CIBERSEGURIDAD DE 10 CAPAS DE INTERPRES DIGITAL (DOSIFICADO SEGÚN EL RIESGO DEL GIRO):**
   Evalúa la sensibilidad real de la información del cliente y selecciona del siguiente catálogo propietario de Interpres Digital las capas proporcionales a su caso (sin sobredimensionar negocios sencillos ni dejar huecos en empresas financieras, médicas, legales o industriales):
   - **Capa 1 — Anonimización / Enmascaramiento en RAM antes de la IA (\`Zero-Disk & RAM Masking\`):** Procesamiento volátil en memoria RAM y tokenización de identificadores sensibles (nombres de clientes terceros, RFCs, cuentas, costos confidenciales -> \`[ENTE_REF_001]\`) antes de enviar contexto al modelo de IA.
   - **Capa 2 — Modo Oficina Segura (\`Autorización de IP en 1 Clic\` con \`2FA\`):** Restricción de acceso a las redes de internet autorizadas de oficinas/plantas sin exigir IPs fijas costosas, permitiendo reautorizar cambios de IP dinámica con 1 clic validado por código 2FA directivo.
   - **Capa 3 — Huella Criptográfica de Equipo (\`Device Fingerprinting\`) y Ventanas de Horario Operativo:** Vinculación por dispositivo autorizado y bloqueo automático fuera de horarios laborales definidos.
   - **Capa 4 — Escudo Cloudflare WAF y \`Geo-Fencing\` (Cerco Geográfico):** Mitigación de inyecciones SQL/XSS/DDoS y bloqueo automático de conexiones desde países no autorizados, proxies anónimos o redes TOR.
   - **Capa 5 — Defensa Anti-Fuerza Bruta Invisible (\`Google reCAPTCHA v3 Enterprise\` + \`Rate Limiting\`):** Protección continua en segundo plano contra bots y ataques automatizados (junto con Firebase App Check).
   - **Capa 6 — Aislamiento Criptográfico Multi-Tenant (\`Bóveda Aislada\` + \`RBAC\`):** Segregación lógica estricta por empresa/proyecto/cliente final y control granular de permisos por rol (ej. Operador, Supervisor, Dirección).
   - **Capa 7 — Cifrado Militar en Tránsito y Reposo (\`TLS 1.3 / HSTS\` + \`AES-256\`):** Sobre infraestructura Google Cloud certificada ISO/IEC 27001 y SOC 2 Type II.
   - **Capa 8 — IA Privada Empresarial (\`Google Cloud Vertex AI Enterprise\`):** Distinguiendo explícitamente entre **(a) Cero Entrenamiento de modelos públicos/terceros** y **(b) Política de Cero Retención / Conservación de Datos (\`Zero Data Retention\`)**.
   - **Capa 9 — Doble Factor Obligatorio (\`2FA TOTP\` Google/Microsoft Authenticator) y Cierre Automático (\`15 min\`):** Destrucción automática de sesión y caché tras 15 minutos de inactividad.
   - **Capa 10 — Bitácora Forense Inmutable y Marco Legal (\`NDA\` + \`LFPDPPP\`):** Sello inborrable de auditoría (usuario, fecha/hora exacta, IP, equipo, versión de archivo o aprobación ejecutada), respaldado por convenio de confidencialidad bilateral y cumplimiento LFPDPPP (más reglas de residencia/transferencia transfronteriza cuando aplique).

6. **COTIZADOR CONGRUENTE BASADO EN ECONOMÍA UNITARIA REAL (MXN + IVA):**
   - **Implementación Inicial (Pago Único / Setup):** Debe reflejar con realismo las horas de ingeniería de cada alcance:
     * **Opción 1 (Piloto / PoC / MVP de Entrada):** Acotado, de bajo riesgo y financieramente congruente con el presupuesto del cliente para demostrar valor medible rápido (incluyendo Fase 0 de viabilidad si hay sistemas externos por auditar).
     * **Opción 2 (Solución Integral Recomendada):** Resuelve de punta a punta el flujo operativo principal con controles, seguridad y panel/integraciones clave.
     * **Opción 3 (Ecosistema Completo / Escalamiento):** Plataforma multiusuario avanzada, automatización expandida e inteligencia operativa completa (*Intentional Systems*).
   - **Póliza Mensual Recurrente (PROHIBIDO INFLAR MENSUALIDADES SIN JUSTIFICACIÓN):**
     * Calcula \`monthlyRetainerMxn\` estrictamente en proporción al **número real de usuarios, volumen mensual de operaciones/mensajes, costo real de nube + tokens Gemini, capas de seguridad activas y nivel de soporte**:
       - *Volumen bajo / uso interno ligero (1 a 3 usuarios, <500 ejecuciones/mes):* Póliza ligera y creíble (ej. \`$1,200 a $2,800 MXN/mes\`).
       - *Volumen medio (4 a 15 usuarios o 500 a 5,000 interacciones/mes):* Póliza media (ej. \`$3,000 a $5,800 MXN/mes\`).
       - *Volumen alto / misión crítica (+15 usuarios, miles de transacciones, multi-sede o bolsa mensual de horas de desarrollo continuo):* Póliza corporativa justificada (\`$6,500 a $15,000+ MXN/mes\`).
     * En CADA paquete es obligatorio llenar \`monthlyRetainerBreakdown\` desglosando con transparencia qué incluye ese monto mensual (Infraestructura Cloud + Consumo IA estimado + Seguridad activa + Soporte/Mantenimiento).

${customGuidance ? `DIRECTRIZ ESPECÍFICA DEL DIRECTOR COMERCIAL PARA ESTA PROPUESTA:\n"${customGuidance}"\n(Aplica prioritariamente esta directriz en arquitectura, alcance y precios).\n` : ""}

RESPUESTAS COMPLETAS DEL CLIENTE EN EL RFI:
${JSON.stringify(answers, null, 2)}

Devuelve ESTRICTAMENTE un objeto JSON válido (sin bloques markdown, 100% en ESPAÑOL profesional, técnico y claro) con esta estructura exacta:
{
  "complexityLevel": "Baja" | "Media" | "Alta" | "Enterprise",
  "solutionArchetype": "Clasificación precisa de la solución (ej. 'Automatización de Ingeniería Híbrida + Copiloto IA', 'Agente Comercial Omnicanal', 'Automatización Back-Office Financiero', 'Sistema Operativo Central + IA')",
  "estimatedImplementationWeeks": "Ej. 3 a 4 semanas (Fase 1 PoC) / 6 a 8 semanas (Integral)",
  "budgetFitStatus": "Óptimo" | "Ajustado — Entrar con MVP/Piloto" | "Por definir — Validar con PoC + 3 Escenarios" | "Bajo para alcance total — Acotar a Fase 1",
  "executiveSummary": "Diagnóstico técnico y de negocio objetivo (4 a 6 líneas): cuál es el cuello de botella real basado estrictamente en lo declarado por el cliente, qué requiere automatización determinista vs. IA y cuál es la estrategia correcta.",
  "budgetVsNeedsAnalysis": "Análisis honesto de viabilidad económica y técnica: cruza el presupuesto y expectativas del cliente contra la complejidad real, explicando por qué conviene arrancar con PoC/MVP si hay dependencias por validar.",
  "pricingRationale": "Justificación transparente de costos y economía unitaria según el número de usuarios, volumen diario/semanal declarado, complejidad de integraciones y consumo real estimado de nube/IA.",
  "whatCanBeDone": [
    "4 a 6 capacidades concretas, realistas y verificables que SÍ se pueden resolver (distinguiendo qué es directo y qué está sujeto a validación de versiones/licencias si aplica)"
  ],
  "deterministicVsAiSplit": {
    "deterministicScope": "Qué procesos, cálculos, validaciones exactas, reglas de negocio o automatizaciones DEBEN resolverse con código determinista / APIs / base de datos sin depender de IA generativa.",
    "aiCognitiveScope": "Dónde interviene específicamente Google Gemini (sobre Vertex AI) para aportar valor cognitivo real (lectura documental, lenguaje natural, RAG, reportes) respetando siempre la supervisión humana requerida."
  },
  "recommendedInterpresLines": [
    "Líneas de Interpres Digital aplicables al caso (ej. 'Automatización a Medida & Conectores Nativos', 'Nexia IA Copiloto / Back-Office (Vertex AI)', 'Intentional Systems (Panel Web Firebase)', etc.)"
  ],
  "commercialPitchAndHowToOffer": "Cómo debe presentar y vender esta propuesta Interpres Digital en la reunión: qué enfoque genera máxima confianza en este perfil de comprador y cómo guiarlo al cierre.",
  "roiArgument": "Cálculo de ROI con matemática exacta paso a paso basada en los datos del RFI (ej. horas/día × días/semana × % ahorro = horas recuperadas/semana y al mes), separando claramente datos reales declarados de escenarios ilustrativos y recomendando medir línea base.",
  "recommendedArchitecture": "Arquitectura técnica detallada y coherente con la necesidad real del cliente: flujo extremo a extremo desde la entrada de datos/sistema del cliente, capa determinista, capa cognitiva con modelos vigentes de Google Gemini (Vertex AI), backend/base de datos en Google Cloud & Firebase (o integración con Workspace/software local según corresponda), interfaz de usuario/aprobación humana y canales adecuados.",
  "securityArchitecture": {
    "riskTier": "Nivel de criticidad de datos del caso (ej. 'Estándar Comercial', 'Alto — Información Financiera/Sensible', 'Crítico — Propiedad Industrial y Confidencialidad Internacional')",
    "recommendedLayers": [
      "Lista de las capas exactas seleccionadas del Estándar de 10 Capas de Interpres Digital adaptadas al cliente (ej. 'Google reCAPTCHA v3 Enterprise + Rate Limiting', 'Doble Factor (2FA TOTP) + Cierre Automático de Sesión (15 min)', 'Anonimización en RAM antes de la IA', 'Modo Oficina Segura (Control IP en 1 clic) + Huella de Equipo y Horario', 'Cloudflare WAF + Geo-Fencing', 'Bóveda Aislada Multi-Tenant + Permisos por Rol (RBAC)', 'Cifrado TLS 1.3 y AES-256', 'Vertex AI Enterprise (Cero Entrenamiento + Zero Data Retention)', 'Bitácora Forense Inmutable + NDA y LFPDPPP')"
    ],
    "dataGovernanceAndRetention": "Especificación clara de ubicación/residencia de datos, distinción entre política de Cero Entrenamiento y política de Conservación/Borrado de datos, respaldos, control de acceso y manejo de archivos de prueba/demostración."
  },
  "stepByStepIntegrationPlan": [
    "Fase 0 / Paso 1: ...",
    "Paso 2: ...",
    "Paso 3: ...",
    "Paso 4: ...",
    "Paso 5: ..."
  ],
  "pricingPackagesMxn": [
    {
      "tierName": "Opción 1 — Viabilidad Técnica y Piloto Funcional (PoC / MVP)",
      "subtitle": "Validación práctica de bajo riesgo sobre el flujo prioritario",
      "setupPriceMxn": 24000,
      "monthlyRetainerMxn": 1800,
      "monthlyRetainerBreakdown": "Desglose mensual transparente: $X infraestructura Google Cloud/Firebase + $Y consumo estimado Vertex AI/Gemini + $Z seguridad activa y soporte técnico base.",
      "estimatedWeeks": "2 a 3 semanas",
      "idealFor": "Demostrar resultados medibles y viabilidad técnica antes de escalar la inversión",
      "deliverables": ["Entregable concreto 1", "Entregable concreto 2", "Entregable concreto 3"]
    },
    {
      "tierName": "Opción 2 — Solución Integral Recomendada",
      "subtitle": "Automatización operativa completa, seguridad corporativa y panel de control",
      "setupPriceMxn": 58000,
      "monthlyRetainerMxn": 3400,
      "monthlyRetainerBreakdown": "Desglose mensual transparente acorde al volumen real de usuarios y operaciones.",
      "estimatedWeeks": "5 a 6 semanas",
      "idealFor": "Operar el proceso completo con trazabilidad, supervisión y ahorro sostenido",
      "deliverables": ["Entregable concreto 1", "Entregable concreto 2", "Entregable concreto 3", "Entregable concreto 4"]
    },
    {
      "tierName": "Opción 3 — Ecosistema Completo y Escalamiento",
      "subtitle": "Arquitectura multiusuario expandida, gestión avanzada y evolución continua",
      "setupPriceMxn": 98000,
      "monthlyRetainerMxn": 5800,
      "monthlyRetainerBreakdown": "Desglose mensual transparente incluyendo infraestructura, seguridad avanzada y horas de evolución.",
      "estimatedWeeks": "7 a 9 semanas",
      "idealFor": "Escalar el equipo y estandarizar toda la operación a mediano/largo plazo",
      "deliverables": ["Entregable concreto 1", "Entregable concreto 2", "Entregable concreto 3", "Entregable concreto 4"]
    }
  ],
  "suggestedQuoteItems": [
    {
      "concept": "Concepto principal de implementación recomendado",
      "details": "Descripción ejecutiva clara de entregables y alcance para la cotización formal",
      "priceMxn": 24000,
      "billingType": "once"
    },
    {
      "concept": "Póliza Mensual de Infraestructura, Ciberseguridad, Consumo IA y Soporte",
      "details": "Desglose claro de alojamiento seguro, consumo estimado de IA para su volumen y mantenimiento operativo",
      "priceMxn": 1800,
      "billingType": "monthly"
    }
  ],
  "paymentStructureRecommendation": "Esquema de pagos por hitos verificables (ej. anticipo al firmar NDA/contrato, pago contra validación de prototipo/PoC y liquidación contra entrega + inicio de póliza mensual al salir a producción; precios en MXN más IVA).",
  "criticalRisks": [
    "3 a 5 riesgos técnicos, de licenciamiento, calidad de datos o dependencias externas que deben quedar acotados contractualmente"
  ],
  "mvpScope": [
    "3 a 5 entregables exactos y medibles para la Fase inicial (PoC / MVP)"
  ],
  "phase2Scope": [
    "3 a 4 módulos o integraciones avanzadas que deben reservarse para Fase 2 una vez validada la Fase 1"
  ],
  "clientQuestionsResponses": [
    {
      "question": "Pregunta o inquietud específica planteada por el cliente dentro de su RFI",
      "strategicAnswer": "Respuesta honesta, técnica y comercialmente sólida que Interpres Digital debe darle"
    }
  ],
  "followUpQuestions": [
    "4 a 6 preguntas técnicas y operativas clave que el especialista de Interpres Digital debe levantar en la sesión de descubrimiento"
  ]
}
(IMPORTANTE: Los precios numéricos de arriba son solo ejemplos de formato JSON; calcula montos 100% REALISTAS y CONGRUENTES en MXN según el tamaño, presupuesto, usuarios y volumen específico de este cliente).
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

      if (action === "translate-rfi-es") {
        const { briefingId, answers, forceRefresh } = payload;
        if (!briefingId || !answers || typeof answers !== "object") {
          throw new Error("Faltan datos del RFI para traducir.");
        }

        const briefingRef = db.collection("briefings").doc(String(briefingId));
        const existingSnap = await briefingRef.get();
        const existingData = existingSnap.exists ? existingSnap.data() || {} : {};

        if (!forceRefresh && existingData.answersTranslatedEs && existingData.translatedEsAt) {
          await snap.ref.update({
            status: "completed",
            result: {
              answersTranslatedEs: existingData.answersTranslatedEs,
              translatedEsAt: existingData.translatedEsAt
            },
            completedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          return;
        }

        const translatableFields: Record<string, any> = {
          businessProblem: answers.businessProblem || "",
          expectedOutcome: answers.expectedOutcome || "",
          previousAiInitiatives: answers.previousAiInitiatives || "",
          roleOrProcessDescription: answers.roleOrProcessDescription || "",
          periodicTasks: answers.periodicTasks || "",
          automationPercentage: answers.automationPercentage || "",
          unavailabilityImpact: answers.unavailabilityImpact || "",
          specificFunctions: answers.specificFunctions || "",
          outOfScopeTasks: answers.outOfScopeTasks || "",
          autonomyLevel: answers.autonomyLevel || "",
          targetUsers: Array.isArray(answers.targetUsers) ? answers.targetUsers : [],
          approxUserCount: answers.approxUserCount || "",
          interactionVolume: answers.interactionVolume || "",
          operatingHours: answers.operatingHours || "",
          channels: Array.isArray(answers.channels) ? answers.channels : [],
          systemsToIntegrate: answers.systemsToIntegrate || "",
          apiAvailability: answers.apiAvailability || "",
          knowledgeBaseDocs: answers.knowledgeBaseDocs || "",
          dataHostingAndFormat: answers.dataHostingAndFormat || "",
          maintenanceOwner: answers.maintenanceOwner || "",
          sensitiveData: answers.sensitiveData || "",
          compliancePolicies: answers.compliancePolicies || "",
          dataResidency: answers.dataResidency || "",
          estimatedBudget: answers.estimatedBudget || "",
          idealLaunchDate: answers.idealLaunchDate || "",
          operatingLanguages: answers.operatingLanguages || "",
          approverAndSponsor: answers.approverAndSponsor || "",
          kpis: answers.kpis || "",
          successAt3And6Months: answers.successAt3And6Months || "",
          additionalComments: answers.additionalComments || ""
        };

        const ai = new GoogleGenAI({ apiKey });
        const translationPrompt = `
Eres un **Traductor Técnico Senior especializado en Ingeniería de Software, Automatización Industrial (CAD/CAM/CNC), Arquitectura Cloud e Inteligencia Artificial Empresarial** para **Interpres Digital** en México.

Tu tarea es traducir al **español técnico ejecutivo de México** las respuestas de un RFI (Request for Information) redactadas en inglés (o idioma mixto).

REGLAS ESTRICTAS DE TRADUCCIÓN TÉCNICA REAL (PROHIBIDA LA TRADUCCIÓN LITERAL):
1. **Precisión terminológica de ingeniería e industria:**
   - Emplea la terminología real que usan directores técnicos, ingenieros industriales, arquitectos de software y líderes de TI en México.
   - Ejemplos obligatorios de criterio técnico:
     * "shop drawings" -> "planos de taller / planos de fabricación"
     * "sheet-metal flat-pattern development" -> "desarrollo de plantillas desplegadas (desarrollos en plano) de lámina metálica"
     * "customer redlines" -> "marcas de revisión / correcciones sobre plano del cliente (redlines)"
     * "nesting" -> "anidado de piezas para corte (nesting)"
     * "open contours / duplicate geometry" -> "contornos abiertos / geometría duplicada"
     * "title blocks" -> "cuadros de datos / membretes del plano"
     * "turnaround times" -> "tiempos de entrega y respuesta"
     * "human-in-the-loop" -> "esquema supervisado con validación humana en el ciclo (human-in-the-loop)"
     * "proof of concept (PoC)" -> "prueba de concepto (PoC)"
     * "return on investment" -> "retorno de inversión (ROI)"
     * "foodservice equipment manufacturers" -> "fabricantes de equipamiento gastronómico comercial / cocinas industriales"
     * "stainless steel fabrication shops" -> "talleres de fabricación y transformación de acero inoxidable"
2. **Intocables técnicos y comerciales:**
   - Conserva EXACTOS nombres propios de personas, empresas, marcas de software/maquinaria, lenguajes, protocolos, formatos de archivo, cifras, monedas y enlaces URL (ej. AutoCAD, Autodesk, AutoLISP, DWG, DXF, CNC, Bodor, API, SDK, ERP, CRM, KPIs, PPC Stainless, Fernando, https://...).
3. **Fidelidad 100% y limpieza editorial para PDF:**
   - NO resumas, NO omitas ningún párrafo, viñeta ni matiz legal o técnico del cliente: traduce el 100% del contenido conservando sus saltos de línea, numeraciones ("1.", "2.") y viñetas ("- " o "• ").
   - Elimina marcas crudas de Markdown como "**" o "__" para que el texto luzca limpio en un PDF ejecutivo formal.
   - Si algún fragmento o campo ya está en español correcto, consérvalo íntegro y natural. Si un campo está vacío (""), devuélvelo vacío ("").

ENTRADA JSON DEL RFI A TRADUCIR:
${JSON.stringify(translatableFields, null, 2)}

Devuelve ESTRICTAMENTE un objeto JSON válido con EXACTAMENTE las mismas llaves de entrada y sus valores traducidos al español técnico profesional (manteniendo "targetUsers" y "channels" como arreglos de strings).
`;

        const responseText = await generateTextWithFallback(ai, translationPrompt, true);
        let rawJson = (responseText || "{}").trim();
        rawJson = rawJson.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const translatedPartial = JSON.parse(rawJson);

        const answersTranslatedEs = {
          ...answers,
          ...translatedPartial,
          // Garantizar que los metadatos legales y de contacto originales permanezcan idénticos
          requestDate: answers.requestDate || "",
          companyName: answers.companyName || "",
          contactName: answers.contactName || "",
          contactEmail: answers.contactEmail || "",
          contactPhone: answers.contactPhone || "",
          privacyConsentAccepted: Boolean(answers.privacyConsentAccepted),
          privacyConsentAcceptedAt: answers.privacyConsentAcceptedAt || "",
          attachments: Array.isArray(answers.attachments) ? answers.attachments : []
        };
        const translatedEsAt = new Date().toISOString();

        await briefingRef.set(
          {
            answersTranslatedEs,
            translatedEsAt
          },
          { merge: true }
        );

        await snap.ref.update({
          status: "completed",
          result: { answersTranslatedEs, translatedEsAt },
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
