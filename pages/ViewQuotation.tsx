import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Quotation, Client, CompanyInfo } from '../types';
import { Card } from '../components/ui/Card';
import { generateQuotationPDF } from '../utils/quotePdfGenerator';
import { 
  FileText, 
  Check, 
  X, 
  MessageSquare, 
  Download, 
  AlertTriangle,
  Send,
  Building,
  Calendar,
  Layers,
  Clock
} from 'lucide-react';
import clsx from 'clsx';
import { MarkdownRenderer } from '../utils/markdownParser';

const LOGO_URL = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";

const ViewQuotation: React.FC = () => {
  const { quoteId } = useParams<{ quoteId: string }>();

  const formatLocalDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString();
        }
      }
      const d2 = new Date(dateStr);
      if (!isNaN(d2.getTime())) {
        return d2.toLocaleDateString();
      }
      return dateStr;
    } catch (err) {
      console.error("Error formatting date:", err);
      return dateStr;
    }
  };
  
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null);
  const [feedback, setFeedback] = useState('');

  const fetchQuotationData = async () => {
    if (!quoteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Get Quote
      const quoteRef = doc(db, "quotations", quoteId);
      const quoteSnap = await getDoc(quoteRef);
      if (quoteSnap.exists()) {
        const qData = quoteSnap.data() as Quotation;
        setQuotation(qData);

        // Get Client
        const clientSnap = await getDoc(doc(db, "clients", qData.clientId));
        if (clientSnap.exists()) {
          setClient(clientSnap.data() as Client);
        }

        // Get Company info
        const companySnap = await getDoc(doc(db, "settings", "company_info"));
        if (companySnap.exists()) {
          setCompanyInfo(companySnap.data() as CompanyInfo);
        }
      }
    } catch (e) {
      console.error("Error fetching public quotation:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotationData();
  }, [quoteId]);

  const handleAccept = async () => {
    if (!quotation || submitting) return;
    setSubmitting(true);
    try {
      const updatedQuote: Quotation = {
        ...quotation,
        status: 'Aceptada',
        acceptedAt: new Date().toISOString()
      };
      await setDoc(doc(db, "quotations", quotation.id), updatedQuote);
      setQuotation(updatedQuote);
      setActionType(null);
    } catch (e) {
      alert("Error al procesar la aceptación. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotation || submitting || !feedback.trim()) return;
    setSubmitting(true);
    try {
      const updatedQuote: Quotation = {
        ...quotation,
        status: 'Rechazada',
        rejectedAt: new Date().toISOString(),
        feedback: feedback
      };
      await setDoc(doc(db, "quotations", quotation.id), updatedQuote);
      setQuotation(updatedQuote);
      setActionType(null);
    } catch (e) {
      alert("Error al procesar el rechazo. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!quotation || !client || !companyInfo) return;
    await generateQuotationPDF(quotation, client, companyInfo);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm font-semibold tracking-wide">Cargando propuesta comercial...</p>
        </div>
      </div>
    );
  }

  if (!quotation || !client || !companyInfo) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4 bg-slate-950 border-slate-800">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Cotización no encontrada</h2>
          <p className="text-gray-400 text-sm">El enlace proporcionado no es válido o la cotización ha sido eliminada.</p>
        </Card>
      </div>
    );
  }

  const oneTimeItems = quotation.items.filter(item => item.billingType !== 'monthly');
  const monthlyItems = quotation.items.filter(item => item.billingType === 'monthly');

  const subtotalBase = oneTimeItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const subtotalPromo = oneTimeItems.reduce((sum, item) => {
    const hasPromo = item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
    return sum + (item.quantity * (hasPromo ? Number(item.promoPrice) : item.price));
  }, 0);
  const hasPromos = subtotalBase > subtotalPromo;

  const subtotalMonthlyBase = monthlyItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const subtotalMonthlyPromo = monthlyItems.reduce((sum, item) => {
    const hasPromo = item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
    return sum + (item.quantity * (hasPromo ? Number(item.promoPrice) : item.price));
  }, 0);
  const hasMonthlyPromos = subtotalMonthlyBase > subtotalMonthlyPromo;

  const hasMonthlyItems = monthlyItems.length > 0;
  const subtotalMonthlyVal = quotation.subtotalMonthly !== undefined ? quotation.subtotalMonthly : subtotalMonthlyPromo;
  const totalMonthlyVal = quotation.totalMonthly !== undefined ? quotation.totalMonthly : (subtotalMonthlyPromo * (quotation.hasIva ? 1.16 : 1));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Top Logo and Title bar */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <img src={LOGO_URL} alt="Interpres Digital" className="h-8 sm:h-10 object-contain" />
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[10px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-slate-700 transition-colors active:scale-95"
            title="Descargar PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              <span className="inline sm:hidden">PDF</span>
              <span className="hidden sm:inline">Descargar PDF</span>
            </span>
          </button>
        </div>

        {/* Status Notification Banner */}
        {quotation.status === 'Aceptada' && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-400 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-emerald-900/50 rounded-xl">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm">✓ Propuesta Aceptada</h4>
              <p className="text-xs text-emerald-500/80">Aceptaste formalmente esta propuesta el {new Date(quotation.acceptedAt!).toLocaleDateString()}. Nos pondremos en contacto contigo.</p>
            </div>
          </div>
        )}

        {quotation.status === 'Rechazada' && (
          <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-400 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-rose-900/50 rounded-xl">
              <X className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm">✕ Propuesta con Observaciones</h4>
              <p className="text-xs text-rose-500/80">Se enviaron comentarios para ajustar la cotización el {new Date(quotation.rejectedAt!).toLocaleDateString()}.</p>
              {quotation.feedback && (
                <div className="mt-2 text-xs bg-black/20 p-2.5 rounded-lg text-slate-300 italic">
                  "{quotation.feedback}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Proposal Card */}
        <Card className="bg-slate-950 border-slate-800 p-5 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Watermark status */}
          <div className="flex justify-center sm:absolute sm:top-4 sm:right-4 mb-4 sm:mb-0">
            <div className="text-xxs font-mono tracking-wider text-slate-500 bg-slate-900 px-3 py-1 rounded-full uppercase border border-slate-850">
              INT-COT-{quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase()}
            </div>
          </div>

          <div className="text-center pb-6 border-b border-slate-850 mb-6 mt-2 sm:mt-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase">Propuesta Comercial</h1>
            <p className="text-xs text-slate-400 mt-1">Fecha de Emisión: {new Date(quotation.createdAt).toLocaleDateString()}</p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/50 border border-slate-850 p-5 rounded-2xl mb-8">
            <div>
              <span className="block text-[10px] text-primary-500 font-bold uppercase tracking-wider mb-2">De: Parte Prestadora</span>
              <h3 className="font-bold text-white text-sm">{companyInfo.businessName || companyInfo.commercialName}</h3>
              <p className="text-xs text-slate-400 mt-1"><span className="font-medium text-slate-500">Nombre Comercial:</span> {companyInfo.commercialName || companyInfo.businessName}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">RFC:</span> {companyInfo.rfc || 'N/A'}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">Sitio Web:</span> {companyInfo.website || 'N/A'}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">Correo:</span> {companyInfo.email || 'N/A'}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">Representante:</span> {companyInfo.legalRepresentative || 'N/A'}</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed"><span className="font-medium text-slate-500">Dirección:</span> {companyInfo.address || 'N/A'}</p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
              <span className="block text-[10px] text-primary-500 font-bold uppercase tracking-wider mb-2">Para: Cliente</span>
              <h3 className="font-bold text-white text-sm">{client.businessName || client.name}</h3>
              <p className="text-xs text-slate-400 mt-1"><span className="font-medium text-slate-500">Nombre Comercial:</span> {client.companyName || client.businessName || client.name}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">RFC:</span> {client.rfc || 'N/A'}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">Sitio Web:</span> {client.website || 'N/A'}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">Correo:</span> {client.email || 'N/A'}</p>
              <p className="text-xs text-slate-400"><span className="font-medium text-slate-500">Representante Legal:</span> {client.legalRepresentative || 'N/A'}</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed"><span className="font-medium text-slate-500">Dirección:</span> {client.address || 'N/A'}</p>
            </div>
          </div>

          {/* Commercial conditions & validity */}
          <div className="border-t border-slate-850 pt-6 pb-6 space-y-3 text-xxs text-slate-400 leading-relaxed">
            <h4 className="font-bold text-white uppercase tracking-wider text-xs">Términos y Notas</h4>
            {quotation.validUntil && (
              <p className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Propuesta vigente hasta el <span className="font-semibold text-slate-350">{formatLocalDate(quotation.validUntil)}</span></span>
              </p>
            )}
            <p>• Los importes están denominados en Pesos Mexicanos (MXN).</p>
            {quotation.deliveryTime && (
              <p className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-550" />
                <span>Tiempo de entrega estimado: <span className="font-semibold text-slate-300">{quotation.deliveryTime}</span></span>
              </p>
            )}
            {quotation.notes && (
              <div className="bg-slate-900/25 p-3.5 border border-slate-850 rounded-xl mt-2 text-slate-300 text-[11px] leading-relaxed">
                <MarkdownRenderer content={quotation.notes} />
              </div>
            )}
          </div>

          {/* Items breakdown */}
          <div className="space-y-4 mb-8 border-t border-slate-850 pt-6">
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">Conceptos de Servicio</h3>
            <div className="border border-slate-850 rounded-2xl overflow-x-auto">
              <table className="min-w-[650px] sm:min-w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-850 font-bold uppercase tracking-wider">
                    <th className="p-3">#</th>
                    <th className="p-3">Descripción</th>
                    <th className="p-3 text-center">Cant.</th>
                    <th className="p-3 text-right">Precio Unit.</th>
                    <th className="p-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-350">
                  {quotation.items.map((item, idx) => {
                    const hasPromo = item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
                    const activePrice = hasPromo ? Number(item.promoPrice) : item.price;
                    return (
                      <tr key={idx} className="hover:bg-slate-900/30">
                        <td className="p-3 font-semibold text-slate-500 text-center">{idx + 1}</td>
                        <td className="p-3 leading-relaxed">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white block">{item.description}</span>
                            {item.billingType === 'monthly' && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
                                Mensual
                              </span>
                            )}
                          </div>
                          {item.details && (
                            <span className="text-xxs text-slate-400 block mt-0.5 leading-normal whitespace-pre-wrap">
                              {item.details}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">{item.quantity}</td>
                        <td className="p-3 text-right">
                          {hasPromo ? (
                            <div className="flex flex-col items-end">
                              <span className="line-through text-slate-500 text-xxs">
                                ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="font-bold text-emerald-400">
                                ${Number(item.promoPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          ) : (
                            <span>
                              ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold text-white">
                          ${(item.quantity * activePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {item.billingType === 'monthly' && <span className="text-xxs text-slate-400 font-normal"> / mes</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals block */}
          <div className="flex justify-end mb-4">
            <div className="w-full sm:w-80 bg-slate-900/30 border border-slate-850 rounded-2xl p-5 space-y-4 text-xs">
              {/* Sección Pago Único */}
              <div className="space-y-2">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-850 pb-1">Cargos del Proyecto (Inversión Inicial)</span>
                
                <div className="flex justify-between items-center text-slate-400">
                  <span>Subtotal Proyecto:</span>
                  {hasPromos ? (
                    <div className="flex flex-col items-end">
                      <span className="line-through text-[10px] text-rose-500">${subtotalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="font-bold text-emerald-400">${quotation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <span className="font-medium text-white">${quotation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  )}
                </div>
                {quotation.discount ? (
                  <div className="flex justify-between text-emerald-400">
                    <span>Descuento ({quotation.discount}%):</span>
                    <span>-${((quotation.subtotal * quotation.discount) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ) : null}
                {quotation.hasIva && (
                  <div className="flex justify-between text-slate-400">
                    <span>IVA (16%):</span>
                    <span>+${((quotation.subtotal - (quotation.subtotal * (quotation.discount || 0)) / 100) * 0.16).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm">
                  <span className="text-white">TOTAL PROYECTO:</span>
                  <span className="text-primary-400">${quotation.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                </div>
              </div>

              {/* Sección Cargos Recurrentes */}
              {hasMonthlyItems && (
                <div className="border-t border-slate-800 pt-3 mt-1 space-y-2">
                  <span className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-850 pb-1">Cargos Recurrentes Mensuales</span>
                  
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Subtotal Mensual:</span>
                    {hasMonthlyPromos ? (
                      <div className="flex flex-col items-end">
                        <span className="line-through text-[10px] text-rose-500">${subtotalMonthlyBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="font-bold text-emerald-400">${subtotalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    ) : (
                      <span className="font-medium text-white">${subtotalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                  </div>
                  {quotation.hasIva && (
                    <div className="flex justify-between text-slate-400">
                      <span>IVA Mensual (16%):</span>
                      <span>+${(subtotalMonthlyVal * 0.16).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm text-emerald-400">
                    <span>TOTAL MENSUAL:</span>
                    <span>${totalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hitos de Pago / Condiciones de Pago */}
          {quotation.paymentMilestones && quotation.paymentMilestones.length > 0 && (
            <div className="mt-8 border-t border-slate-850 pt-6">
              <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary-400" />
                Condiciones de Pago (Hitos de Facturación)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quotation.paymentMilestones.map((m, idx) => (
                  <div key={idx} className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="block text-[10px] text-primary-400 font-bold uppercase">Hito {idx + 1} - {m.concept}</span>
                      <p className="text-xs text-slate-350">{m.timeframe || 'Al cumplir el hito'}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="block text-sm font-bold text-white">${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="block text-[10px] text-slate-500 font-semibold">{m.percentage}% del Proyecto</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Action Panel Buttons (If pending) */}
        {quotation.status === 'Pendiente' && !actionType && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              onClick={() => setActionType('accept')}
              className="flex-1 flex justify-center items-center gap-2 py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/10 uppercase tracking-wider text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Check className="w-5 h-5" /> Aceptar Propuesta
            </button>
            <button
              onClick={() => setActionType('reject')}
              className="flex-1 flex justify-center items-center gap-2 py-4 px-6 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold rounded-2xl transition-all shadow-md uppercase tracking-wider text-sm active:scale-[0.98] border border-slate-700"
            >
              <MessageSquare className="w-5 h-5" /> Solicitar Ajustes
            </button>
          </div>
        )}

        {/* Download PDF button if already accepted */}
        {quotation.status === 'Aceptada' && (
          <button
            onClick={handleDownloadPDF}
            className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-950/20 uppercase tracking-wider text-sm active:scale-[0.98]"
          >
            <Download className="w-5 h-5" />
            Descargar Cotización en PDF
          </button>
        )}

        {/* Action Panel: Accept Form */}
        {actionType === 'accept' && (
          <Card className="bg-slate-950 border-emerald-900/50 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-950/50 text-emerald-400 rounded-xl">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">¿Confirmas la aceptación de la propuesta?</h4>
                <p className="text-xs text-slate-400 mt-0.5">Al presionar el botón, se registrará tu aceptación digital de la cotización INT-COT-{quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase()} por un total de ${quotation.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                disabled={submitting}
                onClick={() => setActionType(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Atrás
              </button>
              <button
                disabled={submitting}
                onClick={handleAccept}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                {submitting ? 'Aceptando...' : 'Sí, Aceptar Propuesta'}
              </button>
            </div>
          </Card>
        )}

        {/* Action Panel: Reject Form */}
        {actionType === 'reject' && (
          <Card className="bg-slate-950 border-rose-900/50 p-6">
            <h4 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-rose-500" />
              Solicitar Ajustes o Comentarios
            </h4>
            <p className="text-xs text-slate-400 mb-4">Por favor escribe detalladamente qué modificaciones necesitas en la cotización para poder ajustarla.</p>
            
            <form onSubmit={handleReject} className="space-y-4">
              <textarea
                required
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Escribe aquí las observaciones o cambios solicitados (ej: ajustar cantidad de licencias, método de pago, etc.)..."
                rows={4}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:ring-2 focus:ring-rose-500 resize-none placeholder-slate-500 leading-relaxed"
              />
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setActionType(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Enviando...' : 'Enviar Observaciones'}
                </button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ViewQuotation;
