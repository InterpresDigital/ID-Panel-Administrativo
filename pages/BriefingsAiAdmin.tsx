import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../services/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { useData } from "../context/DataContext";
import { Client, ClientStatus, Quotation, QuoteItem } from "../types";
import { getAppBaseUrl } from "../utils/urlUtils";
import {
  AiBriefingRecord,
  AiPricingPackageOption,
  AI_RFI_SECTIONS,
  isSectionFilled,
  formatVoiceDuration,
  safeStr,
  sanitizeLegacyAnswers,
  toAttachmentArray,
  toStringArray,
} from "../utils/aiBriefingTypes";
import {
  generateAiBriefingPDF,
  generateAiDiagnosticInternalPDF,
} from "../utils/aiBriefingPdfGenerator";
import { generateQuotationPDF } from "../utils/quotePdfGenerator";
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
  DollarSign,
  TrendingUp,
  Layers,
  HelpCircle,
  ArrowRight,
  Check,
  Edit2,
  Plus,
  X,
  Save,
} from "lucide-react";
import clsx from "clsx";

const formatMxn = (val?: number): string => {
  const n = Number(val) || 0;
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MXN`;
};

const BriefingsAiAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryBriefingId = searchParams.get("id");
  const queryClientId = searchParams.get("clientId");
  const { clients, companyInfo, addClient, addQuotation } = useData();
  const [briefings, setBriefings] = useState<AiBriefingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBriefing, setSelectedBriefing] = useState<AiBriefingRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"rfi" | "diagnostic">("rfi");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "draft">("all");
  const [selectedClientForLink, setSelectedClientForLink] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingDiagPdf, setGeneratingDiagPdf] = useState(false);
  const [generatingDiag, setGeneratingDiag] = useState(false);
  const [customGuidance, setCustomGuidance] = useState("");
  const [diagError, setDiagError] = useState<string | null>(null);
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const [creatingQuote, setCreatingQuote] = useState(false);

  // Estado del Editor Interactivo de Propuesta antes de Cotizar
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewPackageIndex, setReviewPackageIndex] = useState<number | null>(null);
  const [reviewSourceTitle, setReviewSourceTitle] = useState("");
  const [draftItems, setDraftItems] = useState<QuoteItem[]>([]);
  const [draftHasIva, setDraftHasIva] = useState(true);
  const [draftDiscount, setDraftDiscount] = useState(0);
  const [draftDeliveryTime, setDraftDeliveryTime] = useState("");
  const [draftValidUntil, setDraftValidUntil] = useState("");
  const [draftUpfrontPercent, setDraftUpfrontPercent] = useState(50);
  const [draftNotes, setDraftNotes] = useState("");
  const [savingPackageBack, setSavingPackageBack] = useState(false);
  const [savedPackageNotice, setSavedPackageNotice] = useState(false);

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
        if (queryBriefingId && !selectedBriefing) {
          const byId = list.find((item) => item.id === queryBriefingId);
          if (byId) setSelectedBriefing(byId);
        } else if (queryClientId && !selectedBriefing) {
          const byClient = list.find((item) => item.clientId === queryClientId);
          if (byClient) setSelectedBriefing(byClient);
        } else if (selectedBriefing) {
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

  const handleDownloadDiagnosticPdf = async (b: AiBriefingRecord) => {
    setGeneratingDiagPdf(true);
    try {
      await generateAiDiagnosticInternalPDF(b);
    } finally {
      setGeneratingDiagPdf(false);
    }
  };

  const handleRunDiagnostic = async (b: AiBriefingRecord) => {
    setGeneratingDiag(true);
    setDiagError(null);
    setCreatedQuoteId(null);
    try {
      const diag = await generateAiRfiPreDiagnostic(b, customGuidance);
      setSelectedBriefing({ ...b, aiPreDiagnostic: diag });
    } catch (err: any) {
      setDiagError(
        err?.message ||
          "No fue posible generar el pre-diagnóstico en este momento. Intenta nuevamente en unos segundos."
      );
    } finally {
      setGeneratingDiag(false);
    }
  };

  // Garantiza que exista el cliente real en el módulo de Clientes antes de emitir cualquier cotización
  const ensureClientForBriefing = async (b: AiBriefingRecord): Promise<Client> => {
    const cleanEmail = (b.answers.contactEmail || b.email || "").trim().toLowerCase();
    const cleanCompany = (b.answers.companyName || b.companyName || "").trim();
    const cleanName = (b.answers.contactName || b.clientName || cleanCompany || "Cliente IA").trim();
    const cleanPhone = (b.answers.contactPhone || b.whatsapp || "").trim();

    let found = clients.find(
      (c) =>
        (b.clientId && c.id === b.clientId) ||
        (cleanEmail && (c.email || "").trim().toLowerCase() === cleanEmail)
    );

    if (!found && cleanCompany) {
      found = clients.find(
        (c) => (c.companyName || "").trim().toLowerCase() === cleanCompany.toLowerCase()
      );
    }

    if (found) {
      if (b.clientId !== found.id) {
        await setDoc(doc(db, "briefings", b.id), { clientId: found.id }, { merge: true });
      }
      return found;
    }

    const generatedClientId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newClient: Client = {
      id: generatedClientId,
      name: cleanName,
      companyName: cleanCompany || cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      whatsapp: cleanPhone,
      serviceType: "Automatización y Agentes de IA",
      responsiblePerson: "Interpres Digital",
      contactMethod: cleanPhone ? "WhatsApp" : "Email",
      acquisitionSource: "Briefing IA (RFI)",
      contractStartDate: new Date().toISOString().split("T")[0],
      status: ClientStatus.Lead,
      notes: b.answers.businessProblem
        ? `RFI IA: ${b.answers.businessProblem}`
        : "Creado desde Briefing IA y Cotizador.",
    };

    await addClient(newClient);
    await setDoc(doc(db, "briefings", b.id), { clientId: newClient.id }, { merge: true });
    return newClient;
  };

  // Abre el editor interactivo para revisar/modificar precios, conceptos, IVA y condiciones antes de crear la cotización
  const handleOpenReviewPackage = (
    b: AiBriefingRecord,
    pkg: AiPricingPackageOption,
    pkgIdx: number
  ) => {
    const setup = Math.max(0, Number(pkg.setupPriceMxn) || 0);
    const monthly = Math.max(0, Number(pkg.monthlyRetainerMxn) || 0);
    const companyLabel = b.answers.companyName || b.companyName || "Cliente";

    const initialItems: QuoteItem[] = [
      {
        description: `${safeStr(pkg.tierName)} — ${companyLabel}`,
        details: [safeStr(pkg.subtitle), ...toStringArray(pkg.deliverables).map((d) => `• ${d}`)].join("\n"),
        quantity: 1,
        price: setup,
        billingType: "once",
      },
    ];
    if (monthly > 0) {
      initialItems.push({
        description: "Póliza Mensual de Infraestructura, Soporte y Consumo IA",
        details: "Monitoreo continuo, servidor seguro, ajustes evolutivos y bolsa operativa de procesamiento IA.",
        quantity: 1,
        price: monthly,
        billingType: "monthly",
      });
    }

    setReviewPackageIndex(pkgIdx);
    setReviewSourceTitle(safeStr(pkg.tierName));
    setDraftItems(initialItems);
    setDraftHasIva(true);
    setDraftDiscount(0);
    setDraftDeliveryTime(
      safeStr(pkg.estimatedWeeks || b.aiPreDiagnostic?.estimatedImplementationWeeks || "3 a 5 semanas")
    );
    setDraftValidUntil(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
    setDraftUpfrontPercent(50);
    setDraftNotes(
      safeStr(
        b.aiPreDiagnostic?.paymentStructureRecommendation ||
          "Propuesta generada a partir del Diagnóstico Ejecutivo de Automatización y Agentes de IA. Precios expresados en Pesos Mexicanos (MXN)."
      )
    );
    setSavedPackageNotice(false);
    setReviewModalOpen(true);
  };

  const handleOpenReviewSuggestedItems = (b: AiBriefingRecord) => {
    const rawItems = b.aiPreDiagnostic?.suggestedQuoteItems;
    if (!Array.isArray(rawItems) || rawItems.length === 0) return;

    const initialItems: QuoteItem[] = rawItems.map((it) => ({
      description: safeStr(it.concept || "Partida de implementación IA"),
      details: safeStr(it.details),
      quantity: 1,
      price: Math.max(0, Number(it.priceMxn) || 0),
      billingType: it.billingType === "monthly" ? "monthly" : "once",
    }));

    setReviewPackageIndex(null);
    setReviewSourceTitle("Partidas Desglosadas Sugeridas");
    setDraftItems(initialItems);
    setDraftHasIva(true);
    setDraftDiscount(0);
    setDraftDeliveryTime(safeStr(b.aiPreDiagnostic?.estimatedImplementationWeeks || "4 a 5 semanas"));
    setDraftValidUntil(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
    setDraftUpfrontPercent(50);
    setDraftNotes(
      safeStr(
        b.aiPreDiagnostic?.paymentStructureRecommendation ||
          "Propuesta técnica y económica derivada del Diagnóstico Ejecutivo de IA y Automatización."
      )
    );
    setSavedPackageNotice(false);
    setReviewModalOpen(true);
  };

  // Guarda los precios/tiempos editados de vuelta en la tarjeta del Pre-Diagnóstico (Firestore)
  const handleSaveAdjustmentsToPreDiagnostic = async () => {
    if (!selectedBriefing?.aiPreDiagnostic) return;
    setSavingPackageBack(true);
    try {
      const diag = { ...selectedBriefing.aiPreDiagnostic };
      const onceSum = draftItems
        .filter((i) => i.billingType !== "monthly")
        .reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
      const monthlySum = draftItems
        .filter((i) => i.billingType === "monthly")
        .reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);

      if (reviewPackageIndex !== null && Array.isArray(diag.pricingPackagesMxn)) {
        const updatedPkgs = [...diag.pricingPackagesMxn];
        if (updatedPkgs[reviewPackageIndex]) {
          const firstOnceDetails = draftItems.find((i) => i.billingType !== "monthly")?.details || "";
          const parsedBullets = firstOnceDetails
            .split("\n")
            .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
            .filter(Boolean);
          updatedPkgs[reviewPackageIndex] = {
            ...updatedPkgs[reviewPackageIndex],
            setupPriceMxn: onceSum,
            monthlyRetainerMxn: monthlySum,
            estimatedWeeks: draftDeliveryTime || updatedPkgs[reviewPackageIndex].estimatedWeeks,
            deliverables:
              parsedBullets.length > 1
                ? parsedBullets.slice(1)
                : updatedPkgs[reviewPackageIndex].deliverables,
          };
        }
        diag.pricingPackagesMxn = updatedPkgs;
      } else {
        diag.suggestedQuoteItems = draftItems.map((it) => ({
          concept: it.description,
          details: it.details || "",
          priceMxn: Number(it.price) || 0,
          billingType: it.billingType === "monthly" ? "monthly" : "once",
        }));
      }

      diag.paymentStructureRecommendation = draftNotes;

      await setDoc(
        doc(db, "briefings", selectedBriefing.id),
        { aiPreDiagnostic: diag },
        { merge: true }
      );
      setSelectedBriefing({ ...selectedBriefing, aiPreDiagnostic: diag });
      setSavedPackageNotice(true);
      setTimeout(() => setSavedPackageNotice(false), 3000);
    } finally {
      setSavingPackageBack(false);
    }
  };

  // Construye y guarda la Cotización oficial ya revisada/editada por ti
  const handleConfirmReviewedQuotation = async (mode: "save_only" | "download_pdf" | "open_editor") => {
    if (!selectedBriefing) return;
    const validItems = draftItems.filter((i) => i.description.trim() !== "");
    if (validItems.length === 0) {
      alert("Agrega al menos una partida con descripción.");
      return;
    }

    setCreatingQuote(true);
    try {
      const ensuredClient = await ensureClientForBriefing(selectedBriefing);
      const sanitizedItems: QuoteItem[] = validItems.map((it) => ({
        description: it.description.trim(),
        ...(it.details && it.details.trim() ? { details: it.details.trim() } : {}),
        quantity: Math.max(1, Number(it.quantity) || 1),
        price: Math.max(0, Number(it.price) || 0),
        billingType: it.billingType === "monthly" ? "monthly" : "once",
      }));

      const subtotalOnce = sanitizedItems
        .filter((i) => i.billingType !== "monthly")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);
      const subtotalMonthly = sanitizedItems
        .filter((i) => i.billingType === "monthly")
        .reduce((acc, i) => acc + i.price * i.quantity, 0);

      const safeDisc = Math.min(100, Math.max(0, Number(draftDiscount) || 0));
      const onceAfterDisc = subtotalOnce * (1 - safeDisc / 100);
      const totalOnce = Math.round((draftHasIva ? onceAfterDisc * 1.16 : onceAfterDisc) * 100) / 100;
      const totalMonthly =
        Math.round((draftHasIva ? subtotalMonthly * 1.16 : subtotalMonthly) * 100) / 100;

      const upfrontPct = Math.min(100, Math.max(0, Number(draftUpfrontPercent) || 50));
      const remainPct = Math.max(0, 100 - upfrontPct);
      const milestones =
        totalOnce > 0
          ? remainPct > 0
            ? [
                {
                  concept: "Anticipo de inicio de arquitectura y desarrollo",
                  percentage: upfrontPct,
                  amount: Math.round(((totalOnce * upfrontPct) / 100) * 100) / 100,
                  timeframe: "Al autorizar propuesta",
                },
                {
                  concept: "Liquidación contra entrega y salida a producción",
                  percentage: remainPct,
                  amount: Math.round(((totalOnce * remainPct) / 100) * 100) / 100,
                  timeframe: "Contra entrega",
                },
              ]
            : [
                {
                  concept: "Pago único de implementación",
                  percentage: 100,
                  amount: totalOnce,
                  timeframe: "Al autorizar propuesta",
                },
              ]
          : [];

      const newQuote: Quotation = {
        id: "quote_" + Math.random().toString(36).slice(2, 11),
        clientId: ensuredClient.id,
        clientName: ensuredClient.name,
        clientCompanyName: ensuredClient.companyName || "",
        clientEmail: ensuredClient.email || "",
        items: sanitizedItems,
        subtotal: subtotalOnce,
        ...(safeDisc > 0 ? { discount: safeDisc } : {}),
        total: totalOnce,
        subtotalMonthly,
        totalMonthly,
        hasIva: draftHasIva,
        deliveryTime: draftDeliveryTime.trim() || "3 a 5 semanas",
        paymentMilestones: milestones,
        notes: draftNotes.trim(),
        createdAt: new Date().toISOString(),
        validUntil:
          draftValidUntil ||
          new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "Pendiente",
      };

      await addQuotation(newQuote);
      setCreatedQuoteId(newQuote.id);
      setReviewModalOpen(false);

      if (mode === "download_pdf") {
        await generateQuotationPDF(newQuote, ensuredClient, companyInfo);
      } else if (mode === "open_editor") {
        navigate(`/quotations?edit=${newQuote.id}`);
      }
    } finally {
      setCreatingQuote(false);
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
                  <span className="text-xs font-medium text-gray-500">/ 40 máx.</span>
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

                {toAttachmentArray(selectedBriefing.answers.attachments).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {toAttachmentArray(selectedBriefing.answers.attachments).map((att, idx) => (
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
            /* PRE-DIAGNOSTIC & AI QUOTER TAB */
            <div className="space-y-6">
              {/* Top Action & Custom Guidance Card */}
              <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 md:p-7 border border-gray-100 dark:border-dark-border space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                      Agente de Pre-Diagnóstico Estratégico, Arquitectura y Cotizador IA
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Interpreta las necesidades y el presupuesto del cliente, define qué ofrecer, cómo venderlo, cómo integrarlo paso a paso y arma los paquetes en MXN listos para mandar a Cotizaciones.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {selectedBriefing.aiPreDiagnostic && (
                      <button
                        onClick={() => handleDownloadDiagnosticPdf(selectedBriefing)}
                        disabled={generatingDiagPdf}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-2 transition-all"
                      >
                        {generatingDiagPdf ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 text-indigo-500" />
                        )}
                        <span>Descargar PDF Interno</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleRunDiagnostic(selectedBriefing)}
                      disabled={generatingDiag}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
                    >
                      {generatingDiag ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>
                        {generatingDiag
                          ? "Analizando RFI y calculando propuesta..."
                          : selectedBriefing.aiPreDiagnostic
                          ? "Recalcular Pre-Diagnóstico y Cotizador"
                          : "Generar Pre-Diagnóstico y Cotización con IA"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Optional Director Guidance Input */}
                <div className="bg-gray-50 dark:bg-dark-bg/70 rounded-xl p-3.5 border border-gray-200/80 dark:border-dark-border space-y-1.5">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Directriz comercial o ajuste opcional antes de generar / recalcular:
                  </label>
                  <input
                    type="text"
                    value={customGuidance}
                    onChange={(e) => setCustomGuidance(e.target.value)}
                    placeholder="Ej. 'Ajusta la Opción 1 a un tope de $25,000 MXN', 'Prioriza WhatsApp API + Google Sheets', 'Incluye panel web propio en Opción 2'..."
                    className="w-full px-3.5 py-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {diagError && (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{diagError}</span>
                  </div>
                )}

                {createdQuoteId && (
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-300 dark:border-emerald-700 text-xs text-emerald-900 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>
                        ¡Borrador de cotización ({createdQuoteId}) creado con éxito en tu módulo de Cotizaciones!
                      </span>
                    </div>
                    <button
                      onClick={() => navigate("/quotations")}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1.5"
                    >
                      <span>Ir a Cotizaciones para revisar / enviar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {selectedBriefing.aiPreDiagnostic ? (
                <div className="space-y-6 text-sm">
                  {/* 1. Badges & Executive Interpretation + Budget Analysis */}
                  <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border space-y-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold">
                        Complejidad: {selectedBriefing.aiPreDiagnostic.complexityLevel}
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold">
                        Implementación estimada: {selectedBriefing.aiPreDiagnostic.estimatedImplementationWeeks}
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-extrabold">
                        Presupuesto declarado cliente: {selectedBriefing.answers.estimatedBudget || "Por definir"}
                      </span>
                      {selectedBriefing.aiPreDiagnostic.budgetFitStatus && (
                        <span className="px-3.5 py-1.5 rounded-full bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-xs font-extrabold">
                          Semáforo Presupuesto: {selectedBriefing.aiPreDiagnostic.budgetFitStatus}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-dark-bg/60 border border-gray-100 dark:border-dark-border space-y-1.5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          1. Diagnóstico e Interpretación del Caso
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {selectedBriefing.aiPreDiagnostic.executiveSummary}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 space-y-1.5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4" />
                          <span>Análisis Presupuesto vs. Alcance Solicitado</span>
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {selectedBriefing.aiPreDiagnostic.budgetVsNeedsAnalysis ||
                            "Regenera el pre-diagnóstico para obtener el cruce detallado entre el presupuesto del cliente y el alcance técnico."}
                        </p>
                      </div>
                    </div>

                    {toStringArray(selectedBriefing.aiPreDiagnostic.whatCanBeDone).length > 0 && (
                      <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                          Qué SÍ se puede hacer y automatizar de inmediato con su operación actual
                        </h4>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-200">
                          {toStringArray(selectedBriefing.aiPreDiagnostic.whatCanBeDone).map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 2. Commercial Strategy: What to Offer, How to Sell It & ROI */}
                  {(selectedBriefing.aiPreDiagnostic.commercialPitchAndHowToOffer ||
                    toStringArray(selectedBriefing.aiPreDiagnostic.recommendedInterpresLines).length > 0) && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-dark-border pb-3">
                        <h4 className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          <span>2. Qué Ofrecer, Cómo Presentarlo y Argumento de Cierre (ROI)</span>
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {toStringArray(selectedBriefing.aiPreDiagnostic.recommendedInterpresLines).map(
                            (line, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold"
                              >
                                {line}
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div>
                          <div className="text-[11px] font-bold uppercase text-gray-400 mb-1">
                            Cómo ofrecerlo y estructurar la venta con el cliente
                          </div>
                          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {selectedBriefing.aiPreDiagnostic.commercialPitchAndHowToOffer}
                          </p>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase text-gray-400 mb-1">
                            Argumento de Retorno de Inversión (ROI) para justificar precio
                          </div>
                          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {selectedBriefing.aiPreDiagnostic.roiArgument}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. AI Quoter: 3 Comparative Pricing Packages in MXN */}
                  {Array.isArray(selectedBriefing.aiPreDiagnostic.pricingPackagesMxn) &&
                    selectedBriefing.aiPreDiagnostic.pricingPackagesMxn.length > 0 && (
                      <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              <span>3. Cotizador Estratégico Sugerido (3 Escenarios en MXN + IVA)</span>
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Haz clic en <strong>"Revisar y Editar Propuesta"</strong> en cualquiera de las opciones para ajustar precios, entregables, IVA, descuentos y condiciones antes de crear o descargar la cotización.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                          {selectedBriefing.aiPreDiagnostic.pricingPackagesMxn.map((pkg, idx) => {
                            const isRecommended = idx === 1;
                            return (
                              <div
                                key={idx}
                                className={clsx(
                                  "rounded-2xl p-5 border flex flex-col justify-between space-y-4 transition-all",
                                  isRecommended
                                    ? "bg-indigo-50/50 dark:bg-indigo-950/30 border-2 border-indigo-500 shadow-lg shadow-indigo-500/10"
                                    : "bg-gray-50/70 dark:bg-dark-bg/70 border-gray-200 dark:border-dark-border"
                                )}
                              >
                                <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h5 className="font-black text-gray-900 dark:text-white text-sm">
                                        {pkg.tierName}
                                      </h5>
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                        {pkg.subtitle}
                                      </p>
                                    </div>
                                    {isRecommended && (
                                      <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold uppercase flex-shrink-0">
                                        Recomendada
                                      </span>
                                    )}
                                  </div>

                                  <div className="pt-2 border-t border-gray-200/70 dark:border-dark-border">
                                    <div className="text-[10px] font-bold uppercase text-gray-400">
                                      Implementación Inicial (Pago Único)
                                    </div>
                                    <div className="text-xl font-black text-gray-900 dark:text-white">
                                      {formatMxn(pkg.setupPriceMxn)}{" "}
                                      <span className="text-[10px] font-semibold text-gray-400">+ IVA</span>
                                    </div>
                                    <div className="text-xs font-bold text-indigo-600 dark:text-indigo-300 mt-1">
                                      + Póliza mensual: {formatMxn(pkg.monthlyRetainerMxn)}/mes
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                      Entrega estimada: <strong>{pkg.estimatedWeeks}</strong>
                                    </div>
                                  </div>

                                  <div className="space-y-1.5 pt-1">
                                    <div className="text-[10px] font-bold uppercase text-gray-400">
                                      Qué incluye:
                                    </div>
                                    <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-200">
                                      {toStringArray(pkg.deliverables).map((d, dIdx) => (
                                        <li key={dIdx} className="flex items-start gap-1.5">
                                          <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                                          <span>{d}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>

                                <button
                                  onClick={() => handleOpenReviewPackage(selectedBriefing, pkg, idx)}
                                  disabled={creatingQuote}
                                  className={clsx(
                                    "w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                                    isRecommended
                                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                      : "bg-white dark:bg-dark-surface hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                  )}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Revisar y Editar Propuesta</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Suggested Itemized Breakdown */}
                        {Array.isArray(selectedBriefing.aiPreDiagnostic.suggestedQuoteItems) &&
                          selectedBriefing.aiPreDiagnostic.suggestedQuoteItems.length > 0 && (
                            <div className="pt-4 border-t border-gray-100 dark:border-dark-border space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <h5 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">
                                    Partidas Desglosadas Sugeridas (Propuesta Recomendada)
                                  </h5>
                                  {selectedBriefing.aiPreDiagnostic.paymentStructureRecommendation && (
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                      {selectedBriefing.aiPreDiagnostic.paymentStructureRecommendation}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleOpenReviewSuggestedItems(selectedBriefing)}
                                  disabled={creatingQuote}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Revisar, Editar y Cotizar Partidas</span>
                                </button>
                              </div>

                              <div className="divide-y divide-gray-100 dark:divide-dark-border rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
                                {selectedBriefing.aiPreDiagnostic.suggestedQuoteItems.map((it, idx) => (
                                  <div
                                    key={idx}
                                    className="p-3.5 bg-gray-50/50 dark:bg-dark-bg/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                  >
                                    <div>
                                      <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span>{it.concept}</span>
                                        <span
                                          className={clsx(
                                            "px-2 py-0.5 rounded text-[10px] font-extrabold uppercase",
                                            it.billingType === "monthly"
                                              ? "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300"
                                              : "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
                                          )}
                                        >
                                          {it.billingType === "monthly" ? "Mensual" : "Pago Único"}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                        {it.details}
                                      </p>
                                    </div>
                                    <div className="text-sm font-black text-gray-900 dark:text-white whitespace-nowrap">
                                      {formatMxn(it.priceMxn)}
                                      {it.billingType === "monthly" ? "/mes" : ""}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}

                  {/* 4. Technical Architecture & Step-by-Step Integration Plan */}
                  <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border space-y-4">
                    <h4 className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2 border-b border-gray-100 dark:border-dark-border pb-3">
                      <Layers className="w-4 h-4" />
                      <span>4. Arquitectura Técnica y Cómo Integrarlo Paso a Paso</span>
                    </h4>

                    <div>
                      <div className="text-[11px] font-bold uppercase text-gray-400 mb-1">
                        Stack y Arquitectura Recomendada
                      </div>
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {selectedBriefing.aiPreDiagnostic.recommendedArchitecture}
                      </p>
                    </div>

                    {toStringArray(selectedBriefing.aiPreDiagnostic.stepByStepIntegrationPlan).length > 0 && (
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-dark-bg/70 border border-gray-200/70 dark:border-dark-border space-y-2">
                        <div className="text-[11px] font-bold uppercase text-indigo-600 dark:text-indigo-300">
                          Ruta de Implementación e Integración Técnica
                        </div>
                        <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-200">
                          {toStringArray(selectedBriefing.aiPreDiagnostic.stepByStepIntegrationPlan).map(
                            (stepText, i) => (
                              <li key={i} className="leading-relaxed">
                                {stepText}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                        <h5 className="font-bold text-emerald-700 dark:text-emerald-300 mb-2 text-xs uppercase">
                          Alcance Sugerido Fase 1 (MVP)
                        </h5>
                        <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                          {toStringArray(selectedBriefing.aiPreDiagnostic.mvpScope).map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40">
                        <h5 className="font-bold text-indigo-700 dark:text-indigo-300 mb-2 text-xs uppercase">
                          Alcance Sugerido Fase 2 (Escalamiento)
                        </h5>
                        <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                          {toStringArray(selectedBriefing.aiPreDiagnostic.phase2Scope).map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* 5. Critical Risks & Specialist Follow-up Questions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-rose-200/70 dark:border-rose-900/40 space-y-2.5">
                      <h4 className="font-black text-rose-700 dark:text-rose-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Riesgos Críticos y Dependencias a Cuidar en Contrato</span>
                      </h4>
                      <ul className="list-disc pl-4 space-y-1.5 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                        {toStringArray(selectedBriefing.aiPreDiagnostic.criticalRisks).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-indigo-200/70 dark:border-indigo-900/40 space-y-2.5">
                      <h4 className="font-black text-indigo-700 dark:text-indigo-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4" />
                        <span>Preguntas Clave para la Reunión con el Especialista</span>
                      </h4>
                      <ul className="list-disc pl-4 space-y-1.5 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                        {toStringArray(selectedBriefing.aiPreDiagnostic.followUpQuestions).map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-8 border border-gray-100 dark:border-dark-border text-center space-y-3">
                  <Sparkles className="w-8 h-8 text-indigo-500 mx-auto" />
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    Este briefing aún no tiene su Pre-Diagnóstico y Cotización generados
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                    Haz clic arriba en <strong>"Generar Pre-Diagnóstico y Cotización con IA"</strong> para que el agente analice el presupuesto y las 10 etapas del cliente, te proponga qué ofrecer, cómo venderlo, cómo integrarlo y te arme los 3 escenarios en pesos mexicanos listos para cotizar.
                  </p>
                </div>
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

      {/* MODAL INTERACTIVO: REVISIÓN Y EDICIÓN DE PROPUESTA ANTES DE COTIZAR */}
      {reviewModalOpen && selectedBriefing && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-4 bg-gray-50/70 dark:bg-dark-bg/60">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Editor Previo de Cotización • {selectedBriefing.answers.companyName || selectedBriefing.companyName}
                </div>
                <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                  Revisar y Ajustar: {reviewSourceTitle}
                </h3>
              </div>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {/* Items Editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">
                    1. Partidas, Entregables y Precios (MXN)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftItems((prev) => [
                        ...prev,
                        { description: "", details: "", quantity: 1, price: 0, billingType: "once" },
                      ])
                    }
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Partida</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {draftItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-gray-50 dark:bg-dark-bg/70 border border-gray-200 dark:border-dark-border space-y-3"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-6">
                          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Concepto de la partida *
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const next = [...draftItems];
                              next[idx] = { ...next[idx], description: e.target.value };
                              setDraftItems(next);
                            }}
                            placeholder="Ej. Implementación Agente Nexia IA"
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-900 dark:text-white"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Tipo Cobro
                          </label>
                          <select
                            value={item.billingType || "once"}
                            onChange={(e) => {
                              const next = [...draftItems];
                              next[idx] = {
                                ...next[idx],
                                billingType: e.target.value === "monthly" ? "monthly" : "once",
                              };
                              setDraftItems(next);
                            }}
                            className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-900 dark:text-white"
                          >
                            <option value="once">Pago Único</option>
                            <option value="monthly">Mensual</option>
                          </select>
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            Precio Unitario (MXN)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={item.price}
                            onChange={(e) => {
                              const next = [...draftItems];
                              next[idx] = { ...next[idx], price: Number(e.target.value) || 0 };
                              setDraftItems(next);
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs font-black text-gray-900 dark:text-white"
                          />
                        </div>

                        <div className="md:col-span-1 flex items-end justify-end">
                          {draftItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setDraftItems(draftItems.filter((_, i) => i !== idx))}
                              className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="Eliminar partida"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                          Descripción y entregables que verá el cliente
                        </label>
                        <textarea
                          rows={3}
                          value={item.details || ""}
                          onChange={(e) => {
                            const next = [...draftItems];
                            next[idx] = { ...next[idx], details: e.target.value };
                            setDraftItems(next);
                          }}
                          placeholder="Detalla qué incluye esta partida..."
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs text-gray-800 dark:text-gray-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Terms, Taxes, Delivery & Milestones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 border-t border-gray-100 dark:border-dark-border">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Tiempo de Entrega
                  </label>
                  <input
                    type="text"
                    value={draftDeliveryTime}
                    onChange={(e) => setDraftDeliveryTime(e.target.value)}
                    placeholder="Ej. 3 a 5 semanas"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Vigencia Propuesta
                  </label>
                  <input
                    type="date"
                    value={draftValidUntil}
                    onChange={(e) => setDraftValidUntil(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    % Anticipo Inicial
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draftUpfrontPercent}
                    onChange={(e) => setDraftUpfrontPercent(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Descuento (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draftDiscount}
                    onChange={(e) => setDraftDiscount(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-semibold text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  id="toggle-iva-review"
                  type="checkbox"
                  checked={draftHasIva}
                  onChange={(e) => setDraftHasIva(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="toggle-iva-review"
                  className="text-xs font-bold text-gray-700 dark:text-gray-200 cursor-pointer"
                >
                  Desglosar y sumar 16% de IVA en la cotización
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                  Notas y Condiciones Comerciales
                </label>
                <textarea
                  rows={2}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs text-gray-800 dark:text-gray-200"
                />
              </div>

              {/* Live Totals Summary */}
              {(() => {
                const subOnce = draftItems
                  .filter((i) => i.billingType !== "monthly")
                  .reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
                const subMonth = draftItems
                  .filter((i) => i.billingType === "monthly")
                  .reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
                const discFactor = 1 - Math.min(100, Math.max(0, Number(draftDiscount) || 0)) / 100;
                const totOnce = draftHasIva ? subOnce * discFactor * 1.16 : subOnce * discFactor;
                const totMonth = draftHasIva ? subMonth * 1.16 : subMonth;

                return (
                  <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-300">
                        Total Implementación {draftHasIva ? "(IVA incluido)" : "(Sin IVA)"}
                      </div>
                      <div className="text-xl font-black text-gray-900 dark:text-white">
                        {formatMxn(Math.round(totOnce))}
                      </div>
                    </div>
                    {subMonth > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase text-violet-600 dark:text-violet-300">
                          Póliza Mensual {draftHasIva ? "(IVA incluido)" : "(Sin IVA)"}
                        </div>
                        <div className="text-lg font-black text-violet-700 dark:text-violet-200">
                          {formatMxn(Math.round(totMonth))}/mes
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-gray-600 dark:text-gray-300">
                      Hitos: <strong>{draftUpfrontPercent}%</strong> anticipo /{" "}
                      <strong>{Math.max(0, 100 - draftUpfrontPercent)}%</strong> contra entrega
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-dark-border bg-gray-50/80 dark:bg-dark-bg/70 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSaveAdjustmentsToPreDiagnostic}
                disabled={savingPackageBack}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border hover:border-indigo-400 text-xs font-bold text-gray-700 dark:text-gray-200 inline-flex items-center gap-1.5"
              >
                {savingPackageBack ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-indigo-500" />
                )}
                <span>
                  {savedPackageNotice
                    ? "¡Guardado en Pre-Diagnóstico!"
                    : "Guardar precios en este Pre-Diagnóstico"}
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleConfirmReviewedQuotation("download_pdf")}
                  disabled={creatingQuote}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Guardar y Descargar PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmReviewedQuotation("open_editor")}
                  disabled={creatingQuote}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Guardar y Abrir en Cotizaciones</span>
                </button>
              </div>
            </div>
          </div>
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
            {safeStr(val).trim() ? safeStr(val) : <span className="text-gray-400 italic">Pendiente / No especificado</span>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default BriefingsAiAdmin;
