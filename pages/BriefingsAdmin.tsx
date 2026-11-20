import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { 
  ClipboardList, Search, Copy, ExternalLink, Calendar, MapPin, 
  Clock, Share2, Globe, Heart, Palette, Sparkles, Loader2, ArrowLeft, ArrowRight, CheckCircle2,
  FileText, Trash2
} from 'lucide-react';
import clsx from 'clsx';
import { getAppBaseUrl, ensureAbsoluteUrl, formatGoogleMapsUrl } from '../utils/urlUtils';
import { generateBriefingPDF } from '../utils/briefingPdfGenerator';

interface Briefing {
  id: string;
  clientId: string;
  clientName: string;
  businessName: string;
  email: string;
  whatsapp: string;
  createdAt: any;
  answers: {
    clientName: string;
    businessName: string;
    email: string;
    whatsapp: string;
    hasWebsite: string;
    websiteUrl: string;
    requiresInvoice: string;
    taxName: string;
    taxRfc: string;
    taxRegime: string;
    taxPostalCode: string;
    taxCfdiUse: string;
    taxEmail: string;
    establishmentType: string;
    description: string;
    operatingTime: string;
    targetAudience: string[];
    idealClient: string;
    brandPerception: string[];
    aiAvatarName: string;
    hasBrandManual: string;
    colorPrimary: string;
    colorSecondary: string;
    colorComplementary: string;
    colorsAvoid: string;
    visualStyle: string[];
    visualReferences: string;
    streetNum: string;
    colonia: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    mapsLink: string;
    socialInstagram: string;
    socialFacebook: string;
    socialTiktok: string;
    socialYoutube: string;
    socialOther: string;
    publicData: string[];
    bookingWhatsapp: string;
    publicEmail: string;
    weeklyHours: Record<string, { type: 'hours' | 'closed' | 'appointment'; from: string; to: string }>;
    hasMultipleBranches: string;
    primaryBranchName: string;
    branches: Array<{
      id: string;
      branchName: string;
      streetNum: string;
      colonia: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      mapsLink: string;
      bookingWhatsapp: string;
      publicEmail: string;
      socialInstagram: string;
      socialFacebook: string;
      socialTiktok: string;
      weeklyHours: Record<string, { type: 'hours' | 'closed' | 'appointment'; from: string; to: string }>;
    }>;
  };
}

const BriefingsAdmin: React.FC = () => {
  const { companyInfo } = useData();

  // Firestore briefs
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null);
  const [selectedBriefing, setSelectedBriefing] = useState<Briefing | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeBranchTab, setActiveBranchTab] = useState<string>('primary');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPDF = async (briefing: Briefing) => {
    setGeneratingPdf(true);
    try {
      await generateBriefingPDF(briefing);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Hubo un error al generar el PDF del briefing.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDeleteBriefing = async (briefingId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("¿Estás seguro de que deseas eliminar este briefing de forma permanente? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'briefings', briefingId));
      alert("Briefing eliminado con éxito.");
      if (selectedBriefingId === briefingId) {
        setSelectedBriefingId(null);
        setSelectedBriefing(null);
      }
    } catch (error) {
      console.error("Error al eliminar briefing:", error);
      alert("Hubo un error al eliminar el briefing.");
    }
  };

  const [searchParams] = useSearchParams();
  const queryBriefingId = searchParams.get('id');
  const queryClientId = searchParams.get('clientId');

  // Subscribe to briefings
  useEffect(() => {
    const q = query(collection(db, 'briefings'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all: Briefing[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.briefingType !== 'general' && data.briefingType !== 'ai-agent') {
          all.push({ id: docSnap.id, ...data } as Briefing);
        }
      });
      setBriefings(all);
      setLoading(false);

      // Auto-select on load if query param matches
      if (queryBriefingId) {
        const found = all.find(b => b.id === queryBriefingId);
        if (found) {
          setSelectedBriefingId(found.id);
          setSelectedBriefing(found);
        }
      } else if (queryClientId) {
        const found = all.find(b => b.clientId === queryClientId);
        if (found) {
          setSelectedBriefingId(found.id);
          setSelectedBriefing(found);
        }
      } else if (selectedBriefingId) {
        const found = all.find(b => b.id === selectedBriefingId);
        if (found) setSelectedBriefing(found);
      }
    }, (error) => {
      console.error("Error al escuchar briefings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedBriefingId, queryBriefingId, queryClientId]);

  // Copy general briefing link
  const handleCopyLink = () => {
    const origin = (typeof window !== 'undefined' && window.location) 
      ? window.location.origin 
      : 'https://panel.interpresdigital.com';
    const link = `${origin}/#/briefing/lumina-core`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Filtered briefs list
  const filteredBriefings = briefings.filter(b => {
    const query = searchQuery.trim().toLowerCase();
    return !query || 
      (b.clientName || '').toLowerCase().includes(query) ||
      (b.businessName || '').toLowerCase().includes(query) ||
      (b.email || '').toLowerCase().includes(query) ||
      (b.id || '').toLowerCase().includes(query);
  });

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-indigo-500" />
            Briefings Lumina Core
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Revisa y gestiona los cuestionarios de personalización de marca completados por tus clientes de Lumina Core.
          </p>
        </div>

        <button
          onClick={handleCopyLink}
          className={clsx(
            "px-6 py-3.5 font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg active:scale-95 transition-all whitespace-nowrap flex-shrink-0",
            copiedLink 
              ? "bg-emerald-600 text-white shadow-emerald-600/20" 
              : "bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-700"
          )}
        >
          <Copy className="w-4 h-4" />
          <span>{copiedLink ? "¡Copiado!" : "Copiar Enlace de Briefing"}</span>
        </button>
      </header>

      {selectedBriefing ? (
        // Detailed Briefing View
        <div className="space-y-6">
          {/* Back Action Bar */}
          <div className="flex justify-between items-center bg-white dark:bg-dark-surface p-4 rounded-2xl border border-gray-100 dark:border-dark-border shadow-xs">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setSelectedBriefing(null);
                  setSelectedBriefingId(null);
                  setActiveBranchTab('primary');
                }}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-bold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la Lista</span>
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />

              <button
                onClick={() => handleDownloadPDF(selectedBriefing)}
                disabled={generatingPdf}
                className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold active:scale-95 transition-all"
              >
                {generatingPdf ? (
                  <Loader2 className="w-4.5 h-4.5 animate-spin text-indigo-500" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span>Descargar PDF</span>
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />

              <button
                onClick={() => handleDeleteBriefing(selectedBriefing.id)}
                className="flex items-center gap-2 text-xs text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 font-bold active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Briefing</span>
              </button>
            </div>
            
            <div className="text-xxs text-slate-400 font-bold">
              ID Briefing: #{selectedBriefing.id.substring(0, 8).toUpperCase()} — Recibido: {selectedBriefing.createdAt?.toDate ? selectedBriefing.createdAt.toDate().toLocaleString() : 'Reciente'}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Column 1: Client & Invoice Info */}
            <div className="space-y-6">
              {/* Client Profile Summary Card */}
              <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 border border-gray-100 dark:border-dark-border/80 shadow-md space-y-4">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-gray-100 dark:border-dark-border pb-3 flex items-center gap-1.5">
                  <ClipboardList className="w-4.5 h-4.5 text-indigo-500" />
                  Datos de Contacto
                </h3>

                <div className="space-y-3.5 text-xs font-medium">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Nombre del Cliente</span>
                    <strong className="text-gray-900 dark:text-white text-sm">{selectedBriefing.answers.clientName}</strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Nombre del Negocio</span>
                    <strong className="text-gray-900 dark:text-white text-sm">{selectedBriefing.answers.businessName}</strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Correo Electrónico</span>
                    <strong className="text-indigo-600 dark:text-indigo-400">{selectedBriefing.answers.email}</strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">WhatsApp de Contacto</span>
                    <strong>{selectedBriefing.answers.whatsapp}</strong>
                  </div>

                  {selectedBriefing.answers.hasWebsite === 'Sí' && (
                    <div>
                      <span className="text-[10px] text-slate-400 block">Sitio Web</span>
                      <a 
                        href={ensureAbsoluteUrl(selectedBriefing.answers.websiteUrl)} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-indigo-500 hover:underline flex items-center gap-1"
                      >
                        <span>{selectedBriefing.answers.websiteUrl}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Invoice Card */}
              <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 border border-gray-100 dark:border-dark-border/80 shadow-md space-y-4">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-gray-100 dark:border-dark-border pb-3">
                  Información Fiscal / Factura
                </h3>

                {selectedBriefing.answers.requiresInvoice === 'Sí' ? (
                  <div className="space-y-3.5 text-xs font-medium">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Razón Social</span>
                      <strong className="text-gray-900 dark:text-white">{selectedBriefing.answers.taxName}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block">RFC</span>
                      <strong className="text-gray-900 dark:text-white uppercase">{selectedBriefing.answers.taxRfc}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block">Régimen Fiscal</span>
                      <span className="text-gray-600 dark:text-gray-300 block">{selectedBriefing.answers.taxRegime}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block">Uso de CFDI</span>
                      <span className="text-gray-600 dark:text-gray-300 block">{selectedBriefing.answers.taxCfdiUse}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Código Postal</span>
                        <strong>{selectedBriefing.answers.taxPostalCode}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Correo Envío</span>
                        <strong className="break-all block text-gray-900 dark:text-white">{selectedBriefing.answers.taxEmail}</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 italic text-xxs bg-slate-50 dark:bg-dark-bg rounded-2xl border border-slate-200 dark:border-dark-border">
                    El cliente no solicitó facturación.
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Profile & Branding colors */}
            <div className="lg:col-span-2 space-y-6">
              {/* Profile Card */}
              <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 border border-gray-100 dark:border-dark-border/80 shadow-md space-y-6">
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Heart className="w-5 h-5 text-indigo-500 animate-pulse" />
                    Perfil del Establecimiento
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold pt-2">
                    <div className="p-3 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl">
                      <span className="text-[10px] text-slate-400 block">Establecimiento</span>
                      <strong className="text-gray-800 dark:text-white">{selectedBriefing.answers.establishmentType}</strong>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl">
                      <span className="text-[10px] text-slate-400 block">Tiempo de Operación</span>
                      <strong className="text-gray-800 dark:text-white">{selectedBriefing.answers.operatingTime}</strong>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl">
                      <span className="text-[10px] text-slate-400 block">Manual de Identidad</span>
                      <strong className={clsx(
                        "font-extrabold",
                        selectedBriefing.answers.hasBrandManual === 'Sí' ? "text-emerald-500" : "text-rose-500"
                      )}>{selectedBriefing.answers.hasBrandManual}</strong>
                    </div>

                    <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/40 rounded-xl">
                      <span className="text-[10px] text-indigo-500 dark:text-indigo-400 block">🤖 Avatar de IA</span>
                      <strong className="text-indigo-700 dark:text-indigo-300 font-extrabold">
                        {selectedBriefing.answers.aiAvatarName || 'No definido'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Descripción del Establecimiento:</span>
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed bg-slate-50 dark:bg-dark-bg/60 p-4 rounded-2xl border border-slate-200 dark:border-dark-border font-medium">
                    {selectedBriefing.answers.description}
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-dark-border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-medium">
                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Público Objetivo:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedBriefing.answers.targetAudience?.map(t => (
                          <span key={t} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-lg text-xxs font-bold">
                            {t}
                          </span>
                        ))}
                        {(!selectedBriefing.answers.targetAudience || selectedBriefing.answers.targetAudience.length === 0) && (
                          <span className="text-slate-400 italic text-xxs">No especificado</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Valores a Percibir (Marca):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedBriefing.answers.brandPerception?.map(t => (
                          <span key={t} className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xxs font-bold">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-dark-border">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cliente Ideal:</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 italic font-medium">
                    "{selectedBriefing.answers.idealClient}"
                  </p>
                </div>
              </div>

              {/* Branding and Visual Styles */}
              <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 border border-gray-100 dark:border-dark-border/80 shadow-md space-y-6">
                <h3 className="text-md font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-500" />
                  Branding e Identidad Gráfica
                </h3>

                {/* Colors block */}
                <div className="space-y-3">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Colores Corporativos Seleccionados</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Primary */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-dark-bg rounded-xl border border-slate-200 dark:border-dark-border">
                      <div className="w-10 h-10 rounded-lg shadow-sm border border-slate-300 dark:border-slate-800" style={{ backgroundColor: selectedBriefing.answers.colorPrimary }} />
                      <div>
                        <span className="text-[9px] text-slate-400 block font-bold">Color Principal</span>
                        <strong className="text-xs font-mono">{selectedBriefing.answers.colorPrimary}</strong>
                      </div>
                    </div>

                    {/* Secondary */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-dark-bg rounded-xl border border-slate-200 dark:border-dark-border">
                      <div className="w-10 h-10 rounded-lg shadow-sm border border-slate-300 dark:border-slate-800" style={{ backgroundColor: selectedBriefing.answers.colorSecondary }} />
                      <div>
                        <span className="text-[9px] text-slate-400 block font-bold">Secundario</span>
                        <strong className="text-xs font-mono">{selectedBriefing.answers.colorSecondary}</strong>
                      </div>
                    </div>

                    {/* Complementary */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-dark-bg rounded-xl border border-slate-200 dark:border-dark-border">
                      <div className="w-10 h-10 rounded-lg shadow-sm border border-slate-300 dark:border-slate-800" style={{ backgroundColor: selectedBriefing.answers.colorComplementary }} />
                      <div>
                        <span className="text-[9px] text-slate-400 block font-bold">Complementario</span>
                        <strong className="text-xs font-mono">{selectedBriefing.answers.colorComplementary}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-medium">
                  {selectedBriefing.answers.colorsAvoid && (
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Colores a Evitar:</span>
                      <p className="p-3 bg-rose-50/70 dark:bg-rose-950/10 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-900/20 rounded-xl">
                        {selectedBriefing.answers.colorsAvoid}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Estilo Visual:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedBriefing.answers.visualStyle?.map(t => (
                        <span key={t} className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xxs font-bold">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedBriefing.answers.visualReferences && (
                  <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-dark-border">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Referencias Visuales y Links:</span>
                    <p className="text-xs text-gray-700 dark:text-gray-300 bg-slate-50 dark:bg-dark-bg/60 p-4 rounded-2xl border border-slate-200 dark:border-dark-border font-medium whitespace-pre-wrap">
                      {selectedBriefing.answers.visualReferences}
                    </p>
                  </div>
                )}
              </div>

              {/* Presence Digital & Hours */}
              <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 border border-gray-100 dark:border-dark-border/80 shadow-md space-y-6">
                <h3 className="text-md font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Globe className="w-5 h-5 text-indigo-500" />
                  Ubicaciones, Horarios y Redes
                </h3>

                {/* Branch selection tabs */}
                {selectedBriefing.answers.hasMultipleBranches === 'Sí' && (
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-100 dark:border-dark-border">
                    <button
                      type="button"
                      onClick={() => setActiveBranchTab('primary')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-xxs font-bold transition-all border",
                        activeBranchTab === 'primary'
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/10"
                          : "bg-slate-50 dark:bg-dark-bg/60 border-slate-200 dark:border-dark-border text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      📍 Matriz ({selectedBriefing.answers.primaryBranchName || 'Principal'})
                    </button>
                    {selectedBriefing.answers.branches?.map((branch) => (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => setActiveBranchTab(branch.id)}
                        className={clsx(
                          "px-4 py-2 rounded-xl text-xxs font-bold transition-all border",
                          activeBranchTab === branch.id
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/10"
                            : "bg-slate-50 dark:bg-dark-bg/60 border-slate-200 dark:border-dark-border text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        📍 {branch.branchName || 'Sucursal'}
                      </button>
                    ))}
                  </div>
                )}

                {(() => {
                  // If activeBranchTab is 'primary', or if hasMultipleBranches is 'No', render the main fields
                  if (activeBranchTab === 'primary' || selectedBriefing.answers.hasMultipleBranches !== 'Sí') {
                    return (
                      <div className="space-y-6">
                        <div className="space-y-3.5 text-xs font-medium">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Dirección Física</span>
                            <strong className="text-gray-900 dark:text-white">
                              {selectedBriefing.answers.streetNum}, Col. {selectedBriefing.answers.colonia}, {selectedBriefing.answers.city}, {selectedBriefing.answers.state}, CP {selectedBriefing.answers.postalCode}, {selectedBriefing.answers.country}
                            </strong>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedBriefing.answers.mapsLink && (
                              <div>
                                <span className="text-[10px] text-slate-400 block">Enlace Google Maps</span>
                                <a 
                                  href={formatGoogleMapsUrl(selectedBriefing.answers.mapsLink)} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-indigo-500 hover:underline flex items-center gap-1"
                                >
                                  <span>Ver Ubicación</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}

                            <div>
                              <span className="text-[10px] text-slate-400 block">WhatsApp Reservaciones</span>
                              <strong>{selectedBriefing.answers.bookingWhatsapp}</strong>
                            </div>

                            {selectedBriefing.answers.publicEmail && (
                              <div>
                                <span className="text-[10px] text-slate-400 block">Correo Público Contacto</span>
                                <strong className="break-all text-gray-900 dark:text-white">{selectedBriefing.answers.publicEmail}</strong>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Social media list */}
                        <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-dark-border">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Redes Sociales Enlazadas</span>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px] font-bold">
                            {selectedBriefing.answers.socialInstagram && (
                              <a href={ensureAbsoluteUrl(selectedBriefing.answers.socialInstagram)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                                <span>📸 Instagram</span>
                              </a>
                            )}
                            {selectedBriefing.answers.socialFacebook && (
                              <a href={ensureAbsoluteUrl(selectedBriefing.answers.socialFacebook)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                                <span>📘 Facebook</span>
                              </a>
                            )}
                            {selectedBriefing.answers.socialTiktok && (
                              <a href={ensureAbsoluteUrl(selectedBriefing.answers.socialTiktok)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                                <span>🎵 TikTok</span>
                              </a>
                            )}
                            {selectedBriefing.answers.socialYoutube && (
                              <a href={ensureAbsoluteUrl(selectedBriefing.answers.socialYoutube)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                                <span>🎥 YouTube</span>
                              </a>
                            )}
                            {selectedBriefing.answers.socialOther && (
                              <a href={ensureAbsoluteUrl(selectedBriefing.answers.socialOther)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500">
                                <span>🔗 Otra Red</span>
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Datos a mostrar públicamente */}
                        {selectedBriefing.answers.publicData && selectedBriefing.answers.publicData.length > 0 && (
                          <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-dark-border">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Datos a Mostrar Públicamente:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedBriefing.answers.publicData.map(d => (
                                <span key={d} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-lg text-xxs font-bold">
                                  {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Hours Table */}
                        <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-dark-border">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tabla Semanal de Horarios</span>
                          <div className="bg-slate-50 dark:bg-dark-bg/60 border border-slate-200 dark:border-dark-border rounded-2xl overflow-hidden">
                            <table className="w-full text-xxs font-medium text-slate-700 dark:text-slate-300">
                              <thead>
                                <tr className="bg-slate-100 dark:bg-dark-bg text-[9px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-dark-border">
                                  <th className="px-4 py-2.5 text-left">Día</th>
                                  <th className="px-4 py-2.5 text-left">Horario de Servicio</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedBriefing.answers.weeklyHours && Object.keys(selectedBriefing.answers.weeklyHours).map(day => {
                                  const sched = selectedBriefing.answers.weeklyHours[day];
                                  return (
                                    <tr key={day} className="border-b border-slate-200 dark:border-dark-border/40 last:border-0">
                                      <td className="px-4 py-2.5 font-bold text-gray-800 dark:text-white">{day}</td>
                                      <td className="px-4 py-2.5">
                                        {sched.type === 'hours' ? (
                                          <strong>{sched.from} a {sched.to}</strong>
                                        ) : sched.type === 'appointment' ? (
                                          <span className="text-amber-600 dark:text-amber-400 font-bold">Solo bajo agendamiento</span>
                                        ) : (
                                          <span className="text-rose-500 font-bold">Cerrado / No laborable</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Else, render the specific branch details
                  const branch = selectedBriefing.answers.branches?.find(b => b.id === activeBranchTab);
                  if (!branch) return null;

                  return (
                    <div className="space-y-6">
                      <div className="space-y-3.5 text-xs font-medium">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Dirección Física ({branch.branchName})</span>
                          <strong className="text-gray-900 dark:text-white">
                            {branch.streetNum}, Col. {branch.colonia}, {branch.city}, {branch.state}, CP {branch.postalCode}, {branch.country}
                          </strong>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {branch.mapsLink && (
                            <div>
                              <span className="text-[10px] text-slate-400 block">Enlace Google Maps</span>
                              <a 
                                href={formatGoogleMapsUrl(branch.mapsLink)} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-indigo-500 hover:underline flex items-center gap-1"
                              >
                                <span>Ver Ubicación</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}

                          <div>
                            <span className="text-[10px] text-slate-400 block">WhatsApp Reservaciones</span>
                            <strong>{branch.bookingWhatsapp}</strong>
                          </div>

                          {branch.publicEmail && (
                            <div>
                              <span className="text-[10px] text-slate-400 block">Correo Público Contacto</span>
                              <strong className="break-all text-gray-900 dark:text-white">{branch.publicEmail}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Social media overrides or defaults */}
                      <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-dark-border">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Redes Sociales de la Sucursal</span>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px] font-bold">
                          {(branch.socialInstagram || selectedBriefing.answers.socialInstagram) && (
                            <a 
                              href={ensureAbsoluteUrl(branch.socialInstagram || selectedBriefing.answers.socialInstagram)} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500"
                            >
                              <span>📸 Instagram {branch.socialInstagram ? '(Sucursal)' : '(Matriz)'}</span>
                            </a>
                          )}
                          {(branch.socialFacebook || selectedBriefing.answers.socialFacebook) && (
                            <a 
                              href={ensureAbsoluteUrl(branch.socialFacebook || selectedBriefing.answers.socialFacebook)} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500"
                            >
                              <span>📘 Facebook {branch.socialFacebook ? '(Sucursal)' : '(Matriz)'}</span>
                            </a>
                          )}
                          {(branch.socialTiktok || selectedBriefing.answers.socialTiktok) && (
                            <a 
                              href={ensureAbsoluteUrl(branch.socialTiktok || selectedBriefing.answers.socialTiktok)} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-500"
                            >
                              <span>🎵 TikTok {branch.socialTiktok ? '(Sucursal)' : '(Matriz)'}</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Hours Table */}
                      <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-dark-border">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tabla Semanal de Horarios ({branch.branchName})</span>
                        <div className="bg-slate-50 dark:bg-dark-bg/60 border border-slate-200 dark:border-dark-border rounded-2xl overflow-hidden">
                          <table className="w-full text-xxs font-medium text-slate-700 dark:text-slate-300">
                            <thead>
                              <tr className="bg-slate-100 dark:bg-dark-bg text-[9px] font-extrabold uppercase text-slate-400 border-b border-slate-200 dark:border-dark-border">
                                <th className="px-4 py-2.5 text-left">Día</th>
                                <th className="px-4 py-2.5 text-left">Horario de Servicio</th>
                              </tr>
                            </thead>
                            <tbody>
                              {branch.weeklyHours && Object.keys(branch.weeklyHours).map(day => {
                                const sched = branch.weeklyHours[day];
                                return (
                                  <tr key={day} className="border-b border-slate-200 dark:border-dark-border/40 last:border-0">
                                    <td className="px-4 py-2.5 font-bold text-gray-800 dark:text-white">{day}</td>
                                    <td className="px-4 py-2.5">
                                      {sched.type === 'hours' ? (
                                        <strong>{sched.from} a {sched.to}</strong>
                                      ) : sched.type === 'appointment' ? (
                                        <span className="text-amber-600 dark:text-amber-400 font-bold">Solo bajo agendamiento</span>
                                      ) : (
                                        <span className="text-rose-500 font-bold">Cerrado / No laborable</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // List View
        <div className="space-y-6">
          {/* Search Controls */}
          <div className="flex items-center gap-4 bg-white dark:bg-dark-surface p-2 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm max-w-md">
            <Search className="w-5 h-5 text-gray-400 ml-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente, negocio, correo..."
              className="bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 w-full text-xs font-semibold"
            />
          </div>

          {/* List Table */}
          <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-150 dark:divide-dark-border/60">
                <thead className="bg-gray-50 dark:bg-dark-bg">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Folio</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Establecimiento / Razón Comercial</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Nombre del Cliente</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Contacto</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Fecha</th>
                    <th className="px-6 py-3.5 text-right text-xxs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border/60 text-xs text-gray-700 dark:text-gray-300 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Cargando cuestionarios...
                      </td>
                    </tr>
                  ) : filteredBriefings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        No se encontraron cuestionarios completados.
                      </td>
                    </tr>
                  ) : (
                    filteredBriefings.map(brief => (
                      <tr key={brief.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg/60 transition-colors">
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                          #{brief.id.substring(0, 8).toUpperCase()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 dark:text-white">{brief.businessName}</div>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[9px] font-extrabold uppercase">
                            {brief.answers?.establishmentType}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {brief.clientName}
                        </td>
                        <td className="px-6 py-4">
                          <div>{brief.email}</div>
                          <div className="text-[10px] text-gray-400">{brief.whatsapp}</div>
                        </td>
                        <td className="px-6 py-4 text-xxs text-gray-400">
                          {brief.createdAt?.toDate ? brief.createdAt.toDate().toLocaleString() : 'Reciente'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedBriefingId(brief.id);
                                setSelectedBriefing(brief);
                              }}
                              className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg text-xxs border border-indigo-200 dark:border-indigo-800/60 transition-all animate-fade-in"
                            >
                              Ver Respuestas
                            </button>
                            <button
                              onClick={(e) => handleDeleteBriefing(brief.id, e)}
                              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                              title="Eliminar Briefing"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BriefingsAdmin;
