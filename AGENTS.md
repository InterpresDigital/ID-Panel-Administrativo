# AGENTS.md — Panel Administrativo & Ecosistema Digital (Interpres Digital)

Memoria técnica y operativa del proyecto para sesiones remotas y locales en Antigravity.

## 1. Propósito del Proyecto
Plataforma integral web de administración empresarial y atención pública de **Interpres Digital** (**INTERPRES S.A. de C.V.**), desplegada en `https://interpres-panel.web.app` (vinculada a `https://panel.interpresdigital.com`).

Concentra en una sola aplicación:
- **Gestión Interna (Rutas protegidas):** Dashboard financiero y operativo, Clientes, Plataformas SaaS, Bitácoras de Trabajo y Mantenimiento, Command Center, Cotizaciones Comerciales, Contratos con Firma Electrónica, Documentos Legales Multilaterales, Administración de Briefings (Lúmina Core, General e IA/RFI), Calendario de Tareas, Impuestos, Finanzas y Configuración.
- **Módulos Públicos para Clientes (Sin login, vía `HashRouter`):**
  - Agendamiento Online con Zoom, Google Contacts, Gmail y Telegram (`/#/book`, `/#/book/:platformSlug`, `/#/cancel-booking/:bookingId`).
  - Firma Electrónica de Contratos y Documentos Legales con traza de auditoría (`/#/sign/:agreementId`, `/#/sign/legal/:docId/:signerIndex`).
  - Visualización y aceptación digital de Cotizaciones (`/#/quote/:quoteId`).
  - Cuestionarios interactivos de Briefing: **Lúmina Core** (`/#/briefing/lumina-core`), **General de Desarrollo** (`/#/briefing/general`) y **Diagnóstico Ejecutivo para Diseño de Agentes de IA — RFI Híbrido Voz + Formulario** (`/#/briefing/ia`, `/#/briefing/ia/:clientId`).

---

## 2. Arquitectura Técnica
- **Frontend:** React 19 + TypeScript (`~5.8`) + Vite (`^6.2` / `^7.3`) + Tailwind CSS + Lucide Icons + Recharts.
- **Enrutamiento:** `HashRouter` (`react-router-dom` v7). Todas las URLs públicas y privadas usan `/#/...` y el helper `utils/urlUtils.ts` (`getAppBaseUrl()`) garantiza enlaces limpios hacia `https://panel.interpresdigital.com` cuando corresponde.
- **Generación de Documentos PDF:** `jspdf` + `jspdf-autotable` + `utils/pdfLogoHelper.ts`.
- **Backend & Base de Datos (Firebase — Proyecto `interpres-digital`):**
  - **Firestore:** Colecciones `clients`, `transactions`, `taxes`, `tasks`, `agreements`, `legal_documents`, `platforms`, `quotations`, `bookings`, `briefings`, `work_logs`, `maintenance_logs`, `ai_requests` y configuración central en `settings/company_info`, `settings/categories`, `settings/auth` y `settings/booking_settings`.
  - **Firebase Storage:** Almacenamiento de adjuntos legales y archivos de RFI (`ai_briefing_attachments/{briefingId}/...`).
  - **Firebase App Check:** Protección activa con Google reCAPTCHA v3 en `services/firebase.ts`.
  - **Cloud Functions (`functions/`):** Trigger interno de Firestore `onAiRequest` (`ai_requests/{requestId}`, región `us-central1`, Node 22) que custodia `GEMINI_API_KEY` en **Firebase Secret Manager**. Provee tokens efímeros de 1 uso para Gemini Live Audio (`voice-session`), pre-diagnóstico técnico de RFI (`analyze-rfi`), insights financieros (`business-insights`) y redacción de correos (`client-email`) sin exponer llaves privadas ni endpoints HTTP públicos con problemas de CORS.

---

## 3. Estructura de Carpetas
- `App.tsx`, `index.tsx`, `index.html`, `types.ts`, `constants.ts`: Punto de entrada, rutas protegidas/públicas, metadatos Open Graph y tipos globales.
- `components/`: Layout principal (`Layout.tsx`), selector de tema (`ThemeContext.tsx`) y modales reutilizables.
- `context/`: Estado global sincronizado con Firestore (`DataContext.tsx`) y autenticación del panel (`AuthContext.tsx`).
- `pages/`: Vistas administrativas y públicas (`PublicAiBriefing.tsx`, `BriefingsAiAdmin.tsx`, `PublicBooking.tsx`, `Bookings.tsx`, `Quotations.tsx`, `ViewQuotation.tsx`, `Agreements.tsx`, `SignAgreement.tsx`, `LegalDocumentsAdmin.tsx`, `SignLegalDocument.tsx`, `PublicGeneralBriefing.tsx`, `PublicBriefing.tsx`, `Finance.tsx`, `Dashboard.tsx`, etc.).
- `services/`: Conectores de infraestructura (`firebase.ts`, `geminiService.ts`, `aiVoiceBriefingService.ts`, `telegramService.ts`, `zoomService.ts`, `gmailApiService.ts`, `emailService.ts`, `googleContactsService.ts`, `whatsappService.ts`).
- `utils/`: Tipos y prompt del consultor de voz IA (`aiBriefingTypes.ts`), resolución de placeholders (`placeholderResolver.ts`), helper de logos PDF (`pdfLogoHelper.ts`) y los 7 generadores de PDF (`aiBriefingPdfGenerator.ts`, `generalBriefingPdfGenerator.ts`, `briefingPdfGenerator.ts`, `contractPdfGenerator.ts`, `legalDocumentPdfGenerator.ts`, `quotePdfGenerator.ts`, `pdfGenerator.ts`).
- `public/`: Activos estáticos servidos en raíz (**NUNCA ignorar en Git**): `favicon.png`, `icon-192.png`, `icon-512.png`, `og-agentes-ia.jpg`, `manifest.json`, `sw.js` y logotipos de alta resolución para PDFs en `public/logos/` (`interpres-color.png`, `interpres-white.png`, `lumina-core.png`).
- `functions/`: Proyecto TypeScript independiente para Firebase Cloud Functions (`functions/src/index.ts`).

---

## 4. Variables de Entorno y Comandos Clave

### Variables en `.env` (raíz, no versionado en Git)
Solo variables públicas de cliente con prefijo `VITE_`:
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` (`interpres-digital`), `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_RECAPTCHA_SITE_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_AI_BACKEND_URL` (opcional)

> **Regla de Seguridad Intocable:** Prohibido definir `GEMINI_API_KEY` o secretos OAuth en `.env` o en `vite.config.ts`. `GEMINI_API_KEY` vive exclusivamente en Firebase Secret Manager (`npx firebase-tools functions:secrets:set GEMINI_API_KEY --project interpres-digital`).

### Comandos de Desarrollo y Despliegue
```bash
# Instalar dependencias y levantar entorno local (puerto 3000)
npm install
npm run dev

# Compilar bundle de producción en dist/
npm run build

# Desplegar frontend a Firebase Hosting (sitio interpres-panel)
firebase deploy --only hosting
# o usando el alias configurado en .firebaserc:
npm run deploy

# Compilar y desplegar Cloud Functions (solo cuando cambie functions/src/index.ts)
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
```

---

## 5. Reglas de Diseño, UX e Instrucciones Intocables

1. **Sin Avisos de Instalación PWA en Móviles:**
   - Los enlaces de briefings, contratos, cotizaciones y citas se envían a clientes externos. Está **prohibido** mostrar banners o ventanas emergentes de instalación de aplicación PWA en celulares.
   - Mantener en `index.html` el bloqueo `window.addEventListener('beforeinstallprompt', e => e.preventDefault())` y el desregistro automático de Service Workers, `display: "browser"` en `public/manifest.json` y la baja automática en `public/sw.js`.

2. **Favicon e Imagen Open Graph (OG Card):**
   - Favicon oficial basado en el isotipo de Interpres Digital centrado proporcionalmente en `public/favicon.png`, `public/icon-192.png` y `public/icon-512.png`.
   - Metadatos `og:*` y `twitter:*` (`summary_large_image`) al inicio de `<head>` en `index.html` utilizando `https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/agentes%20ia.jpg`.

3. **Proporción Exacta del Logotipo y Firmas en TODOS los PDFs:**
   - El logotipo horizontal de Interpres Digital tiene relación de aspecto `4.96:1` (`1200x242 px` en `public/logos/interpres-color.png` para fondos claros y `public/logos/interpres-white.png` para encabezados oscuros).
   - **Prohibido** usar `doc.addImage` con cajas cuadradas o dimensiones fijas que deformen el logo o las firmas. Siempre utilizar `loadPdfLogo`, `drawProportionalLogo` y `drawProportionalSignature` de `utils/pdfLogoHelper.ts`.

4. **Módulo Briefing de IA (`PublicAiBriefing.tsx` + `aiVoiceBriefingService.ts` + `aiBriefingTypes.ts`):**
   - **Consultora de Voz:** Se presenta como **Nexia IA**, inteligencia artificial de Interpres Digital (voz `Aoede`, español mexicano), haciendo **estrictamente 1 sola pregunta corta por turno** y avanzando en orden de Etapa 1 a Etapa 10.
   - **Diseño y Campos:** Portada en dos líneas balanceadas (*Diagnóstico Ejecutivo para* / *Diseño de Agentes de IA*), sin campo de *"Fecha límite ideal para recibir propuesta"* (`responseDeadline` retirado), tarjetas de campos con contornos visibles (`border-slate-600/80+`, `bg-slate-800/75`).
   - **Consentimiento Legal Obligatorio en Portada:** Casilla y modal con cláusulas alineadas al Aviso de Privacidad Integral (LFPDPPP) y Términos de **INTERPRES S.A. de C.V.** (`admin@interpresdigital.com`), garantizando confidencialidad, **cero entrenamiento de modelos públicos de IA** con datos del cliente y autorización para compartir la información ingresada. Se audita fecha/hora en Firestore y en el PDF.
   - **Persistencia Anti-Bloqueo de Pantalla:** Mantener activo el `Screen Wake Lock` durante sesiones de voz, el respaldo instantáneo en `localStorage` + Firestore al ocultar pestaña (`visibilitychange`/`pagehide`), la recuperación de borrador por `?draft=`, `:clientId` o correo electrónico, y el cálculo de etapa mediante `resolveResumeSection` (`lastActiveSection` de `1` a `10`) para que jamás reinicie en la Etapa 1 tras actualizar o bloquear pantalla.
   - **Candado de Cierre en Etapa 10:** `finishVoiceInterview` tiene prohibido cerrar la llamada antes de que el cliente responda la pregunta de observaciones finales (`additionalComments` o `observationsConfirmed` vía `noAdditionalComments: true`). Al cerrar, debe drenarse por completo el audio de despedida de Nexia IA sin cortarla, mostrando en Etapa 10: 1) Observaciones adicionales, 2) Resumen Ejecutivo de Etapas 1 a 9 editable, y 3) Carga de archivos opcional antes de **Enviar RFI**.

5. **Orden de Plataformas en Agendamiento Online (`PublicBooking.tsx` y `settings/booking_settings`):**
   - En *"1. Selecciona la Plataforma o Motivo"*, mantener siempre este orden exacto:
     1. **Interpres Digital** (opción preseleccionada por defecto al entrar a `/#/book`)
     2. **Lúmina Core**
     3. **TKD Register**
     4. **Otra consulta**

6. **Tarjetas de Gráficas Financieras:**
   - En vistas de distribución por concepto (`Dashboard.tsx` / `Finance.tsx`), las leyendas de conceptos deben fluir con scroll o diseño adaptable dentro de la tarjeta sin desbordarse fuera del contenedor.

---

## 6. Integraciones Activas
- **Telegram Bot (`services/telegramService.ts`):** Lee `telegramConfig` desde `settings/booking_settings` y envía alertas instantáneas en formato HTML seguro (`escapeHtml`) cuando ocurre:
  1. Nueva videollamada agendada (`sendTelegramBookingNotification`).
  2. Firma electrónica de contrato o documento legal (`sendTelegramDocumentSignedNotification` — asegurando espera `await` antes de redirigir o mostrar éxito).
  3. Envío de Briefing Lúmina Core y Briefing General.
  4. Envío o actualización de Briefing de IA (`sendTelegramAiBriefingNotification`).
- **Zoom Server-to-Server OAuth (`services/zoomService.ts`):** Creación automática de salas al agendar citas.
- **Google Workspace (`services/gmailApiService.ts`, `emailService.ts`, `googleContactsService.ts`):** Envío de confirmaciones por Gmail API con renovación automática de `refreshToken` y sincronización de contactos.

---

## 7. Estado Actual y Continuidad en Entorno Remoto
- Todo el código del frontend y generadores de PDF compila limpiamente (`npm run build`) y se encuentra desplegado en producción (`interpres-panel`).
- Al abrir este repositorio como **Remote Project** en Antigravity:
  1. Crear el archivo `.env` local en el workspace remoto con las llaves públicas `VITE_*` del proyecto Firebase `interpres-digital` para ejecutar `npm run dev` o `npm run build`.
  2. Para desplegar a Firebase Hosting desde el entorno remoto, autenticar Firebase CLI según el flujo interactivo estándar cuando se requiera publicar cambios.
