# Briefing Interactivo de Automatización y Agentes de IA (Implementado)

## Estado de Implementación
1. **Blindaje de Seguridad Aplicado:**
   - Se eliminó `'process.env.API_KEY'` de `vite.config.ts` para impedir que cualquier clave privada de Gemini vuelva a filtrarse al bundle público `dist/`.
   - Se movió la configuración pública de Firebase a `.env` (`VITE_FIREBASE_*`), se eliminaron archivos `.env` sueltos (`pages/.env` y `.env.local`) y se endureció `.gitignore`.
   - `services/geminiService.ts` ahora se comunica con el backend mediante cola reactiva segura en Firestore (`ai_requests/{requestId}`), compatible con políticas estrictas de Google Workspace sin exponer endpoints HTTP públicos (`allUsers`).
2. **Backend Seguro para Voz en Vivo y Diagnóstico (`functions/`):**
   - `functions/src/index.ts` implementa el trigger interno `onAiRequest` con `GEMINI_API_KEY` almacenada en **Firebase Secret Manager**:
     - Acción `voice-session`: Genera **Tokens Efímeros de 1 solo uso (`ai.authTokens.create`)** con caducidad de 15 minutos, detección automática del modelo nativo de audio Gemini Live y límite de 4 sesiones por briefing.
     - Acción `analyze-rfi`: Genera el **Pre-Diagnóstico Técnico Interno** para cotización.
     - Acciones `business-insights` y `client-email`: Reemplazo seguro en backend para funciones del panel.
3. **Módulo Completo de Briefing IA (RFI de 10 Secciones):**
   - **Vista Pública Híbrida (`pages/PublicAiBriefing.tsx`):** Rutas `/#/briefing/ia` y `/#/briefing/ia/:clientId` (con soporte `?draft=<id>` para compartir avance con TI), alternancia en tiempo real entre **Entrevista por Voz con Gemini Live (`services/aiVoiceBriefingService.ts`)** y **Edición Manual**, llenado visual en vivo de las 10 secciones y carga de documentos a Firebase Storage.
   - **Panel Administrativo (`pages/BriefingsAiAdmin.tsx`):** Ruta `/#/briefings-ia` en el menú lateral (**Briefing IA (RFI)**), generador de enlaces generales o personalizados por cliente, exportación de **PDF Ejecutivo (`utils/aiBriefingPdfGenerator.ts`)** y pestaña de **Pre-Diagnóstico IA**.

## Comandos para Activar la Voz en Producción (`interpres-digital`)
1. Asegúrate de tener habilitado el plan **Blaze (Pago por uso)** y la API **Cloud Functions** en el proyecto Firebase `interpres-digital` (con presupuesto tope en Google Cloud Billing).
2. Configura tu llave de Google AI Studio en Secret Manager (nunca en `.env` del frontend):
   ```bash
   cd functions && npm install && cd ..
   npx firebase-tools functions:secrets:set GEMINI_API_KEY --project interpres-digital
   ```
3. Despliega Funciones y Hosting:
   ```bash
   npm run build
   npx firebase-tools deploy --only functions,hosting:panel --project interpres-digital
   ```
