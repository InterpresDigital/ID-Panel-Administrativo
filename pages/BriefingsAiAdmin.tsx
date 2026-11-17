import React, { useState, useEffect } from "react";
import { db } from "../services/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { useData } from "../context/DataContext";
import { getAppBaseUrl } from "../utils/urlUtils";
import {
  AiBriefingRecord,
  AI_RFI_SECTIONS,
  isSectionFilled,
  formatVoiceDuration,
  sanitizeLegacyAnswers,
  toStringArray,
} from "../utils/aiBriefingTypes";
import { generateAiBriefingPDF } from "../utils/aiBriefingPdfGenerator";
import { generateAiRfiPreDiagnostic } from "../services/geminiService";
import {
  Sparkles,
  Copy,
  Search,
  Mic,
  PenTool,
  FileText,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Cpu,
  Download,
} from "lucide-react";
import clsx from "clsx";

const BriefingsAiAdmin: React.FC = () => {
  const { clients, companyInfo } = useData();
  const [briefings, setBriefings] = useState<AiBriefingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBriefing, setSelectedBriefing] = useState<AiBriefingRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"rfi" | "diagnostic">("rfi");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "draft">("all");
  const [selectedClientForLink, setSelectedClientForLink] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingDiag, setGeneratingDiag] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "briefings"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AiBriefingRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data && data.briefingType === "ai-agent") {
            list.push({
              id: d.id,
              ...data,
              answers: sanitizeLegacyAnswers(data.answers),
            } as AiBriefingRecord);
          }
        });
        setBriefings(list);
        setLoading(false);
        if (selectedBriefing) {
          const updated = list.find((item) => item.id === selectedBriefing.id);
          if (updated) setSelectedBriefing(updated);
        }
      },
      (err) => {
        console.error("Error leyendo briefings IA:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [selectedBriefing?.id]);

  const handleCopyInviteLink = () => {
    const base = getAppBaseUrl(companyInfo);
    const link = selectedClientForLink
      ? `${base}/#/briefing/ia/${selectedClientForLink}`
      : `${base}/#/briefing/ia`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("¿Eliminar este RFI de Agente de IA de forma permanente?")) return;
    await deleteDoc(doc(db, "briefings", id));
    if (selectedBriefing?.id === id) setSelectedBriefing(null);
  };

  const handleDownloadPdf = async (b: AiBriefingRecord) => {
    setGeneratingPdf(true);
    try {
      await generateAiBriefingPDF(b);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleRunDiagnostic = async (b: AiBriefingRecord) => {
    setGeneratingDiag(true);
    setDiagError(null);
    try {
      const diag = await generateAiRfiPreDiagnostic(b);
      setSelectedBriefing({ ...b, aiPreDiagnostic: diag });
    } catch (err: any) {
      setDiagError(
        err?.message ||
          "Para ejecutar el pre-diagnóstico automático despliega Cloud Functions con tu secreto GEMINI_API_KEY."
      );
    } finally {
      setGeneratingDiag(false);
    }
  };

  const filtered = briefings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (b.companyName || "").toLowerCase().includes(q) ||
      (b.clientName || "").toLowerCase().includes(q) ||
      (b.email || "").toLowerCase().includes(q)
    );
  });

  // Estadísticas internas de uso de Voz IA (solo visibles en el panel administrativo)
  const completedTotal = briefings.filter((b) => b.status === "completed").length;
  const voiceUsedBriefings = briefings.filter(
    (b) =>
      (b.voiceDurationSeconds || 0) > 0 ||
      (b.voiceSessionsCount || 0) > 0 ||
      b.completionMode === "voice" ||
      b.completionMode === "hybrid"
  );
  const totalVoiceSecondsAll = briefings.reduce(
    (acc, b) => acc + (Number(b.voiceDurationSeconds) || 0),
    0
  );
  const measuredVoiceBriefings = briefings.filter((b) => (b.voiceDurationSeconds || 0) > 0);
  const avgVoiceSeconds =
    measuredVoiceBriefings.length > 0
      ? Math.round(totalVoiceSecondsAll / measuredVoiceBriefings.length)
      : 0;
  const totalVoiceSessionsAll = briefings.reduce(
    (acc, b) => acc + (Number(b.voiceSessionsCount) || 0),
    0
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header & Invite Generator */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2.5">
            <Cpu className="w-7 h-7 text-indigo-500" />
            Briefings IA & Automatización (RFI)
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Envía el levantamiento interactivo (Voz con Gemini Live + Manual) para cotizar agentes de IA y automatizaciones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            value={selectedClientForLink}
            onChange={(e) => setSelectedClientForLink(e.target.value)}
            className="px-3.5 py-3 rounded-2xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-700 dark:text-gray-200"
          >
            <option value="">Enlace general (cualquier empresa)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                Personalizado: {c.companyName || c.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleCopyInviteLink}
            className={clsx(
              "px-5 py-3 font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg active:scale-95 transition-all",
              copiedLink
                ? "bg-emerald-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            )}
          >
            <Copy className="w-4 h-4" />
            <span>{copiedLink ? "¡Enlace Copiado!" : "Copiar Link de RFI"}</span>
          </button>
        </div>
      </header>

      {selectedBriefing ? (
        /* DETAILED VIEW */
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-4 bg-white dark:bg-dark-surface p-4 rounded-2xl border border-gray-100 dark:border-dark-border">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedBriefing(null)}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la lista</span>
              </button>

              <div className="h-4 w-px bg-gray-200 dark:bg-dark-border" />

              <button
                onClick={() => handleDownloadPdf(selectedBriefing)}
                disabled={generatingPdf}
                className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {generatingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Descargar PDF Ejecutivo</span>
              </button>

              {selectedBriefing.status === "draft" && (
                <>
                  <div className="h-4 w-px bg-gray-200 dark:bg-dark-border" />
                  <button
                    onClick={() => {
                      const base = getAppBaseUrl(companyInfo);
                      const draftUrl = selectedBriefing.clientId
                        ? `${base}/#/briefing/ia/${selectedBriefing.clientId}?draft=${selectedBriefing.id}`
                        : `${base}/#/briefing/ia?draft=${selectedBriefing.id}`;
                      navigator.clipboard.writeText(draftUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedLink ? "¡Link de Avance Copiado!" : "Copiar Link de Avance"}</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 bg-gray-100 dark:bg-dark-bg p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("rfi")}
                className={clsx(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === "rfi"
                    ? "bg-white dark:bg-dark-surface text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-gray-500"
                )}
              >
                10 Secciones del RFI
              </button>
              <button
                onClick={() => setActiveTab("diagnostic")}
                className={clsx(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                  activeTab === "diagnostic"
                    ? "bg-white dark:bg-dark-surface text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-gray-500"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pre-Diagnóstico IA (Cotizador)</span>
              </button>
            </div>
          </div>

          {/* Internal Voice Telemetry Strip (Invisible to Client & Excluded from PDF) */}
          <div className="bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200/70 dark:border-indigo-800/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                    Telemetría de Voz IA
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                    Solo uso interno • No visible al cliente
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Control interno de tiempo de conversación con Gemini Live para monitoreo operativo.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase text-gray-400">Duración Conversación</div>
                <div className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>
                    {(selectedBriefing.voiceDurationSeconds || 0) > 0
                      ? formatVoiceDuration(selectedBriefing.voiceDurationSeconds)
                      : "Sin uso de voz (0 seg)"}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase text-gray-400">Sesiones Conectadas</div>
                <div className="text-sm font-black text-gray-900 dark:text-white">
                  {selectedBriefing.voiceSessionsCount ||
                    ((selectedBriefing.voiceDurationSeconds || 0) > 0 ? 1 : 0)}{" "}
                  <span className="text-xs font-medium text-gray-500">/ 15 máx.</span>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase text-gray-400">Modalidad</div>
                <div className="text-sm font-black text-gray-900 dark:text-white">
                  {selectedBriefing.completionMode === "voice"
                    ? "Voz IA"
                    : selectedBriefing.completionMode === "hybrid"
                    ? "Híbrido (Voz + Texto)"
                    : "Manual"}
                </div>
              </div>

              {selectedBriefing.lastVoiceSessionAt && (
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400">Última Conexión Voz</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    {typeof selectedBriefing.lastVoiceSessionAt === "string"
                      ? selectedBriefing.lastVoiceSessionAt
                      : typeof (selectedBriefing.lastVoiceSessionAt as any)?.toDate === "function"
                      ? (selectedBriefing.lastVoiceSessionAt as any)
                          .toDate()
                          .toLocaleString("es-MX", { timeZone: "America/Mexico_City" })
                      : "Registrada"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeTab === "rfi" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoCard
                title="Encabezado de la Solicitud"
                items={[
                  ["Empresa solicitante", selectedBriefing.answers.companyName || selectedBriefing.companyName],
                  ["Contacto", selectedBriefing.answers.contactName || selectedBriefing.clientName],
                  ["Correo", selectedBriefing.answers.contactEmail || selectedBriefing.email],
                  ["Teléfono / WhatsApp", selectedBriefing.answers.contactPhone || selectedBriefing.whatsapp],
                  ["Fecha de solicitud", selectedBriefing.answers.requestDate],
                  [
                    "Consentimiento Privacidad, IA y Autorización",
                    selectedBriefing.answers.privacyConsentAccepted
                      ? `Aceptado (${selectedBriefing.answers.privacyConsentAcceptedAt || "Registrado"})`
                      : "Pendiente",
                  ],
                ]}
              />

              <InfoCard
                title="1. Contexto y Objetivo General"
                items={[
                  ["Problema de negocio", selectedBriefing.answers.businessProblem],
                  ["Resultado esperado", selectedBriefing.answers.expectedOutcome],
                  ["Iniciativas previas de IA", selectedBriefing.answers.previousAiInitiatives],
                ]}
              />

              <InfoCard
                title="2. Puesto / Proceso a Automatizar"
                items={[
                  ["Descripción del puesto/proceso", selectedBriefing.answers.roleOrProcessDescription],
                  ["Tareas periódicas", selectedBriefing.answers.periodicTasks],
                  ["% Automatizable estimado", selectedBriefing.answers.automationPercentage],
                  ["Impacto por ausencia", selectedBriefing.answers.unavailabilityImpact],
                ]}
              />

              <InfoCard
                title="3. Funciones y Tareas del Agente"
                items={[
                  ["Funciones específicas", selectedBriefing.answers.specificFunctions],
                  ["Fuera de alcance", selectedBriefing.answers.outOfScopeTasks],
                  ["Nivel de autonomía", selectedBriefing.answers.autonomyLevel],
                ]}
              />

              <InfoCard
                title="4. Usuarios y Volumen"
                items={[
                  ["Usuarios objetivo", toStringArray(selectedBriefing.answers.targetUsers).join(", ")],
                  ["Número aprox. de usuarios", selectedBriefing.answers.approxUserCount],
                  ["Volumen de interacciones", selectedBriefing.answers.interactionVolume],
                  ["Horarios de operación", selectedBriefing.answers.operatingHours],
                ]}
              />

              <InfoCard
                title="5. Canales e Integraciones"
                items={[
                  ["Canales", toStringArray(selectedBriefing.answers.channels).join(", ")],
                  ["Sistemas a integrar", selectedBriefing.answers.systemsToIntegrate],
                  ["Disponibilidad de APIs", selectedBriefing.answers.apiAvailability],
                ]}
              />

              <InfoCard
                title="6. Datos y Conocimiento"
                items={[
                  ["Base de conocimiento", selectedBriefing.answers.knowledgeBaseDocs],
                  ["Alojamiento y formato", selectedBriefing.answers.dataHostingAndFormat],
                  ["Responsable de actualizar", selectedBriefing.answers.maintenanceOwner],
                ]}
              />

              <InfoCard
                title="7. Seguridad, Privacidad y Cumplimiento"
                items={[
                  ["Datos sensibles", selectedBriefing.answers.sensitiveData],
                  ["Políticas / Regulaciones", selectedBriefing.answers.compliancePolicies],
                  ["Residencia de datos", selectedBriefing.answers.dataResidency],
                ]}
              />

              <InfoCard
                title="8. Restricciones y Expectativas"
                items={[
                  ["Presupuesto aproximado", selectedBriefing.answers.estimatedBudget],
                  ["Fecha ideal de arranque", selectedBriefing.answers.idealLaunchDate],
                  ["Idiomas", selectedBriefing.answers.operatingLanguages],
                  ["Aprobador / Sponsor", selectedBriefing.answers.approverAndSponsor],
                ]}
              />

              <InfoCard
                title="9. Métricas de Éxito"
                items={[
                  ["KPIs de evaluación", selectedBriefing.answers.kpis],
                  ["Éxito a 3 y 6 meses", selectedBriefing.answers.successAt3And6Months],
                ]}
              />

              <div className="md:col-span-2 bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-gray-100 dark:border-dark-border pb-2">
                  10. Observaciones, Comentarios Extra y Documentos Adjuntos
                </h3>
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase mb-1">
                    Observaciones / Comentarios adicionales del cliente
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {selectedBriefing.answers.additionalComments || (
                      <span className="text-gray-400 italic">Sin observaciones adicionales registradas.</span>
                    )}
                  </p>
                </div>

                {(selectedBriefing.answers.attachments || []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {selectedBriefing.answers.attachments.map((att, idx) => (
                      <a
                        key={idx}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border hover:border-indigo-500 transition-all"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                            {att.name}
                          </span>
                        </div>
                        <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* PRE-DIAGNOSTIC TAB */
            <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 md:p-8 border border-gray-100 dark:border-dark-border space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    Arquitectura y Pre-Diagnóstico para Cotización
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Análisis interno exclusivo para Interpres Digital generado sobre las 10 respuestas del cliente.
                  </p>
                </div>

                <button
                  onClick={() => handleRunDiagnostic(selectedBriefing)}
                  disabled={generatingDiag}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2"
                >
                  {generatingDiag ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {selectedBriefing.aiPreDiagnostic
                      ? "Regenerar Pre-Diagnóstico"
                      : "Generar Pre-Diagnóstico con IA"}
                  </span>
                </button>
              </div>

              {diagError && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{diagError}</span>
                </div>
              )}

              {selectedBriefing.aiPreDiagnostic ? (
                <div className="space-y-6 text-sm">
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 text-xs font-bold">
                      Complejidad: {selectedBriefing.aiPreDiagnostic.complexityLevel}
                    </span>
                    <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 text-xs font-bold">
                      Tiempo estimado: {selectedBriefing.aiPreDiagnostic.estimatedImplementationWeeks}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white mb-1">Resumen Ejecutivo</h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      {selectedBriefing.aiPreDiagnostic.executiveSummary}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                      Arquitectura Recomendada
                    </h4>
                    <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedBriefing.aiPreDiagnostic.recommendedArchitecture}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                      <h4 className="font-bold text-rose-700 dark:text-rose-300 mb-2 text-xs uppercase">
                        Riesgos Críticos / Dependencias
                      </h4>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                        {toStringArray(selectedBriefing.aiPreDiagnostic.criticalRisks).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                      <h4 className="font-bold text-emerald-700 dark:text-emerald-300 mb-2 text-xs uppercase">
                        Alcance Sugerido Fase 1 (MVP)
                      </h4>
                      <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                        {toStringArray(selectedBriefing.aiPreDiagnostic.mvpScope).map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Haz clic en "Generar Pre-Diagnóstico con IA" para obtener arquitectura recomendada, riesgos de APIs y alcance sugerido para tu cotización.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-5">
          {/* Internal Voice Usage KPIs (Visible only to Admin) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                RFIs Registrados
              </div>
              <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {briefings.length}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                {completedTotal} completados • {briefings.length - completedTotal} borradores
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Adopción de Voz IA
              </div>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {voiceUsedBriefings.length}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {totalVoiceSessionsAll} sesiones conectadas en total
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>Tiempo Acumulado Voz</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                  Interno
                </span>
              </div>
              <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {formatVoiceDuration(totalVoiceSecondsAll)}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Suma total en Gemini Live
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>Promedio por Entrevista</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                  Interno
                </span>
              </div>
              <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                {avgVoiceSeconds > 0 ? formatVoiceDuration(avgVoiceSeconds) : "—"}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Duración media usando voz
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por empresa, contacto o correo..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-sm text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              {(["all", "completed", "draft"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={clsx(
                    "px-3.5 py-2 rounded-xl text-xs font-bold transition-all",
                    statusFilter === st
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-dark-surface text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-dark-border"
                  )}
                >
                  {st === "all" ? "Todos" : st === "completed" ? "Completados" : "Borradores"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400">Cargando RFIs...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-dark-surface rounded-2xl p-12 text-center border border-gray-100 dark:border-dark-border space-y-2">
              <Cpu className="w-10 h-10 text-indigo-400 mx-auto" />
              <h3 className="font-bold text-gray-800 dark:text-white">
                Aún no hay RFIs de Agentes de IA registrados
              </h3>
              <p className="text-xs text-gray-500">
                Usa el botón superior "Copiar Link de RFI" para enviárselo a tu prospecto.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((b) => {
                const filledCount = AI_RFI_SECTIONS.filter((s) =>
                  isSectionFilled(b.answers, s.number)
                ).length;

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBriefing(b)}
                    className="bg-white dark:bg-dark-surface rounded-2xl p-5 border border-gray-100 dark:border-dark-border hover:border-indigo-500/60 shadow-xs cursor-pointer transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-extrabold text-gray-900 dark:text-white">
                          {b.companyName || "Empresa sin nombre"}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {b.clientName} • {b.email}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(b.id, e)}
                        className="text-gray-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span
                        className={clsx(
                          "px-2.5 py-1 rounded-full flex items-center gap-1",
                          b.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {b.status === "completed" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {b.status === "completed" ? "Completado" : `Borrador (${filledCount}/10)`}
                      </span>

                      <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center gap-1">
                        {b.completionMode === "voice" || b.completionMode === "hybrid" ? (
                          <Mic className="w-3 h-3" />
                        ) : (
                          <PenTool className="w-3 h-3" />
                        )}
                        {b.completionMode === "voice"
                          ? "Voz IA"
                          : b.completionMode === "hybrid"
                          ? "Híbrido (Voz + Texto)"
                          : "Manual"}
                      </span>

                      {(b.voiceDurationSeconds || 0) > 0 && (
                        <span
                          className="px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 flex items-center gap-1"
                          title="Duración acumulada de conversación con Voz IA (solo visible para el administrador)"
                        >
                          <Clock className="w-3 h-3" />
                          <span>{formatVoiceDuration(b.voiceDurationSeconds)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const InfoCard = ({
  title,
  items,
}: {
  title: string;
  items: [string, string | undefined][];
}) => (
  <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border space-y-3">
    <h3 className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-gray-100 dark:border-dark-border pb-2">
      {title}
    </h3>
    <div className="space-y-2.5">
      {items.map(([label, val], i) => (
        <div key={i}>
          <div className="text-[11px] font-bold text-gray-400 uppercase">{label}</div>
          <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {val && val.trim() ? val : <span className="text-gray-400 italic">Pendiente / No especificado</span>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default BriefingsAiAdmin;
