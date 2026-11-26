import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Quotation, Client, ClientStatus, CompanyInfo } from '../types';
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
import { LOGO_COLOR_URL } from '../utils/brandAssets';

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

        // Get Client (con respaldo automático si el clientId venía vacío o el cliente fue eliminado)
        let loadedClient: Client | null = null;
        if (qData.clientId && qData.clientId.trim()) {
          const clientSnap = await getDoc(doc(db, "clients", qData.clientId.trim()));
          if (clientSnap.exists()) {
            loadedClient = clientSnap.data() as Client;
          }
        }
        if (!loadedClient) {
          loadedClient = {
            id: qData.clientId || "fallback_client",
            name: qData.clientName || qData.clientCompanyName || "Cliente",
            companyName: qData.clientCompanyName || qData.clientName || "",
            email: qData.clientEmail || "",
            phone: "",
            serviceType: "Servicios Digitales",
            responsiblePerson: "Interpres Digital",
            contactMethod: "Email",
            contractStartDate: new Date().toISOString().split("T")[0],
            status: ClientStatus.Lead
          };
        }
        setClient(loadedClient);

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
      <div className="min-h-screen bg-[#F6F9FC] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#1464B8]/25 border-t-[#1464B8] rounded-full animate-spin mx-auto" />
          <p className="text-[#102B4B]/70 text-sm font-semibold tracking-wide">Cargando propuesta comercial...</p>
        </div>
      </div>
    );
  }

  if (!quotation || !client || !companyInfo) {
    return (
      <div className="min-h-screen bg-[#F6F9FC] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4 bg-white border-[#C7D5E2]">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="font-display text-xl font-bold text-[#102B4B]">Cotización no encontrada</h2>
          <p className="text-[#102B4B]/70 text-sm">El enlace proporcionado no es válido o la cotización ha sido eliminada.</p>
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
    <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Top Logo and Title bar */}
        <div className="flex justify-between items-center bg-white p-4 sm:p-5 rounded-2xl border border-[#C7D5E2] shadow-xs">
          <img src={LOGO_COLOR_URL} alt="Interpres Digital Labs" className="h-9 sm:h-12 object-contain" />
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 bg-[#1464B8] hover:bg-[#10539A] text-white text-[10px] sm:text-xs font-bold px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-sm transition-colors active:scale-95"
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
          <div className="p-4 bg-[#00A9B7]/10 border border-[#00A9B7]/40 text-[#007B86] rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-[#00A9B7]/15 rounded-xl">
              <Check className="w-5 h-5 text-[#00A9B7]" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-[#102B4B]">✓ Propuesta Aceptada</h4>
              <p className="text-xs text-[#102B4B]/75">Aceptaste formalmente esta propuesta el {new Date(quotation.acceptedAt!).toLocaleDateString()}. Nos pondremos en contacto contigo.</p>
            </div>
          </div>
        )}

        {quotation.status === 'Rechazada' && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-xl">
              <X className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm">✕ Propuesta con Observaciones</h4>
              <p className="text-xs text-rose-600">Se enviaron comentarios para ajustar la cotización el {new Date(quotation.rejectedAt!).toLocaleDateString()}.</p>
              {quotation.feedback && (
                <div className="mt-2 text-xs bg-white p-2.5 rounded-lg border border-rose-200 text-[#102B4B] italic">
                  "{quotation.feedback}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Editorial Proposal Card */}
        <Card className="bg-white border-[#C7D5E2] p-5 sm:p-9 shadow-[0_24px_60px_-15px_rgba(16,43,75,0.08)] relative overflow-hidden">
          {/* Watermark status */}
          <div className="flex justify-center sm:absolute sm:top-5 sm:right-6 mb-4 sm:mb-0">
            <div className="text-xxs font-mono tracking-wider text-[#1464B8] bg-[#F6F9FC] px-3 py-1 rounded-full uppercase border border-[#C7D5E2] font-bold">
              INT-COT-{quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase()}
            </div>
          </div>

          <div className="text-center pb-6 border-b border-[#C7D5E2]/80 mb-6 mt-2 sm:mt-0">
            <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[#102B4B] uppercase">Propuesta Comercial</h1>
            <p className="text-xs text-[#102B4B]/65 mt-1">Fecha de Emisión: {new Date(quotation.createdAt).toLocaleDateString()}</p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#F6F9FC] border border-[#C7D5E2] p-5 rounded-2xl mb-8">
            <div>
              <span className="block text-[10px] text-[#1464B8] font-extrabold uppercase tracking-wider mb-2">De: Parte Prestadora</span>
              <h3 className="font-bold text-[#102B4B] text-sm">{companyInfo.businessName || companyInfo.commercialName}</h3>
              <p className="text-xs text-[#102B4B]/80 mt-1"><span className="font-semibold text-[#102B4B]/60">Nombre Comercial:</span> {companyInfo.commercialName || companyInfo.businessName}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">RFC:</span> {companyInfo.rfc || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">Sitio Web:</span> {companyInfo.website || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">Correo:</span> {companyInfo.email || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">Representante:</span> {companyInfo.legalRepresentative || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80 mt-1.5 leading-relaxed"><span className="font-semibold text-[#102B4B]/60">Dirección:</span> {companyInfo.address || 'N/A'}</p>
            </div>
            <div className="border-t md:border-t-0 md:border-l border-[#C7D5E2] pt-4 md:pt-0 md:pl-6">
              <span className="block text-[10px] text-[#008995] font-extrabold uppercase tracking-wider mb-2">Para: Cliente</span>
              <h3 className="font-bold text-[#102B4B] text-sm">{client.businessName || client.name}</h3>
              <p className="text-xs text-[#102B4B]/80 mt-1"><span className="font-semibold text-[#102B4B]/60">Nombre Comercial:</span> {client.companyName || client.businessName || client.name}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">RFC:</span> {client.rfc || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">Sitio Web:</span> {client.website || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">Correo:</span> {client.email || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80"><span className="font-semibold text-[#102B4B]/60">Representante Legal:</span> {client.legalRepresentative || 'N/A'}</p>
              <p className="text-xs text-[#102B4B]/80 mt-1.5 leading-relaxed"><span className="font-semibold text-[#102B4B]/60">Dirección:</span> {client.address || 'N/A'}</p>
            </div>
          </div>

          {/* Commercial conditions & validity */}
          <div className="border-t border-[#C7D5E2]/80 pt-6 pb-6 space-y-3 text-xxs text-[#102B4B]/75 leading-relaxed">
            <h4 className="font-extrabold text-[#102B4B] uppercase tracking-wider text-xs">Términos y Notas</h4>
            {quotation.validUntil && (
              <p className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1464B8]" />
                <span>Propuesta vigente hasta el <span className="font-bold text-[#102B4B]">{formatLocalDate(quotation.validUntil)}</span></span>
              </p>
            )}
            <p>• Los importes están denominados en Pesos Mexicanos (MXN).</p>
            {quotation.deliveryTime && (
              <p className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#00A9B7]" />
                <span>Tiempo de entrega estimado: <span className="font-bold text-[#102B4B]">{quotation.deliveryTime}</span></span>
              </p>
            )}
            {quotation.notes && (
              <div className="bg-[#F6F9FC] p-4 border border-[#C7D5E2] rounded-xl mt-2 text-[#102B4B]/90 text-[11px] leading-relaxed">
                <MarkdownRenderer content={quotation.notes} />
              </div>
            )}
          </div>

          {/* Items breakdown */}
          <div className="space-y-4 mb-8 border-t border-[#C7D5E2]/80 pt-6">
            <h3 className="font-extrabold text-[#102B4B] text-sm uppercase tracking-wider">Conceptos de Servicio</h3>
            <div className="border border-[#C7D5E2] rounded-2xl overflow-x-auto">
              <table className="min-w-[650px] sm:min-w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#071B36] text-white font-bold uppercase tracking-wider">
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">Descripción</th>
                    <th className="p-3.5 text-center">Cant.</th>
                    <th className="p-3.5 text-right">Precio Unit.</th>
                    <th className="p-3.5 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C7D5E2]/70 text-[#102B4B]">
                  {quotation.items.map((item, idx) => {
                    const hasPromo = item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' && Number(item.promoPrice) < item.price;
                    const activePrice = hasPromo ? Number(item.promoPrice) : item.price;
                    return (
                      <tr key={idx} className="hover:bg-[#F6F9FC]">
                        <td className="p-3.5 font-semibold text-[#102B4B]/55 text-center">{idx + 1}</td>
                        <td className="p-3.5 leading-relaxed">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#102B4B] block">{item.description}</span>
                            {item.billingType === 'monthly' && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#00A9B7]/12 text-[#007B86] border border-[#00A9B7]/35 uppercase tracking-wide">
                                Mensual
                              </span>
                            )}
                          </div>
                          {item.details && (
                            <span className="text-xxs text-[#102B4B]/70 block mt-0.5 leading-normal whitespace-pre-wrap">
                              {item.details}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-medium">{item.quantity}</td>
                        <td className="p-3.5 text-right">
                          {hasPromo ? (
                            <div className="flex flex-col items-end">
                              <span className="line-through text-[#102B4B]/45 text-xxs">
                                ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="font-bold text-[#008995]">
                                ${Number(item.promoPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          ) : (
                            <span>
                              ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-bold text-[#102B4B]">
                          ${(item.quantity * activePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {item.billingType === 'monthly' && <span className="text-xxs text-[#102B4B]/60 font-normal"> / mes</span>}
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
            <div className="w-full sm:w-80 bg-[#F6F9FC] border border-[#C7D5E2] rounded-2xl p-5 space-y-4 text-xs">
              {/* Sección Pago Único */}
              <div className="space-y-2">
                <span className="block text-[10px] font-extrabold text-[#102B4B]/65 uppercase tracking-wider border-b border-[#C7D5E2] pb-1">Cargos del Proyecto (Inversión Inicial)</span>
                
                <div className="flex justify-between items-center text-[#102B4B]/75">
                  <span>Subtotal Proyecto:</span>
                  {hasPromos ? (
                    <div className="flex flex-col items-end">
                      <span className="line-through text-[10px] text-rose-500">${subtotalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="font-bold text-[#008995]">${quotation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <span className="font-bold text-[#102B4B]">${quotation.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  )}
                </div>
                {quotation.discount ? (
                  <div className="flex justify-between text-[#008995] font-semibold">
                    <span>Descuento ({quotation.discount}%):</span>
                    <span>-${((quotation.subtotal * quotation.discount) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ) : null}
                {quotation.hasIva && (
                  <div className="flex justify-between text-[#102B4B]/75">
                    <span>IVA (16%):</span>
                    <span>+${((quotation.subtotal - (quotation.subtotal * (quotation.discount || 0)) / 100) * 0.16).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="border-t border-[#C7D5E2] pt-2 flex justify-between font-extrabold text-sm">
                  <span className="text-[#102B4B]">TOTAL PROYECTO:</span>
                  <span className="text-[#1464B8]">${quotation.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                </div>
              </div>

              {/* Sección Cargos Recurrentes */}
              {hasMonthlyItems && (
                <div className="border-t border-[#C7D5E2] pt-3 mt-1 space-y-2">
                  <span className="block text-[10px] font-extrabold text-[#008995] uppercase tracking-wider border-b border-[#C7D5E2] pb-1">Cargos Recurrentes Mensuales</span>
                  
                  <div className="flex justify-between items-center text-[#102B4B]/75">
                    <span>Subtotal Mensual:</span>
                    {hasMonthlyPromos ? (
                      <div className="flex flex-col items-end">
                        <span className="line-through text-[10px] text-rose-500">${subtotalMonthlyBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="font-bold text-[#008995]">${subtotalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    ) : (
                      <span className="font-bold text-[#102B4B]">${subtotalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                  </div>
                  {quotation.hasIva && (
                    <div className="flex justify-between text-[#102B4B]/75">
                      <span>IVA Mensual (16%):</span>
                      <span>+${(subtotalMonthlyVal * 0.16).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="border-t border-[#C7D5E2] pt-2 flex justify-between font-extrabold text-sm text-[#008995]">
                    <span>TOTAL MENSUAL:</span>
                    <span>${totalMonthlyVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hitos de Pago / Condiciones de Pago */}
          {quotation.paymentMilestones && quotation.paymentMilestones.length > 0 && (
            <div className="mt-8 border-t border-[#C7D5E2]/80 pt-6">
              <h3 className="font-extrabold text-[#102B4B] text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1464B8]" />
                Condiciones de Pago (Hitos de Facturación)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quotation.paymentMilestones.map((m, idx) => (
                  <div key={idx} className="bg-[#F6F9FC] border border-[#C7D5E2] p-4 rounded-xl flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="block text-[10px] text-[#1464B8] font-extrabold uppercase">Hito {idx + 1} - {m.concept}</span>
                      <p className="text-xs text-[#102B4B]/80">{m.timeframe || 'Al cumplir el hito'}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="block text-sm font-extrabold text-[#102B4B]">${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="block text-[10px] text-[#102B4B]/55 font-semibold">{m.percentage}% del Proyecto</span>
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
              className="flex-1 flex justify-center items-center gap-2 py-4 px-6 bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white font-bold rounded-2xl shadow-lg shadow-[#1464B8]/20 uppercase tracking-wider text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Check className="w-5 h-5" /> Aceptar Propuesta
            </button>
            <button
              onClick={() => setActionType('reject')}
              className="flex-1 flex justify-center items-center gap-2 py-4 px-6 bg-white hover:bg-[#F6F9FC] text-[#102B4B] font-bold rounded-2xl transition-all shadow-sm uppercase tracking-wider text-sm active:scale-[0.99] border border-[#C7D5E2]"
            >
              <MessageSquare className="w-5 h-5 text-[#1464B8]" /> Solicitar Ajustes
            </button>
          </div>
        )}

        {/* Download PDF button if already accepted */}
        {quotation.status === 'Aceptada' && (
          <button
            onClick={handleDownloadPDF}
            className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#1464B8]/20 uppercase tracking-wider text-sm active:scale-[0.99]"
          >
            <Download className="w-5 h-5" />
            Descargar Cotización en PDF
          </button>
        )}

        {/* Action Panel: Accept Form */}
        {actionType === 'accept' && (
          <Card className="bg-white border-[#00A9B7]/60 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-[#00A9B7]/12 text-[#00A9B7] rounded-xl">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-[#102B4B] text-sm">¿Confirmas la aceptación de la propuesta?</h4>
                <p className="text-xs text-[#102B4B]/70 mt-0.5">Al presionar el botón, se registrará tu aceptación digital de la cotización INT-COT-{quotation.id.replace(/^quote_/, '').substring(0, 8).toUpperCase()} por un total de ${quotation.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                disabled={submitting}
                onClick={() => setActionType(null)}
                className="px-4 py-2 bg-[#F6F9FC] hover:bg-[#EBF2F8] border border-[#C7D5E2] text-[#102B4B] rounded-xl text-xs font-semibold transition-colors"
              >
                Atrás
              </button>
              <button
                disabled={submitting}
                onClick={handleAccept}
                className="px-4 py-2 bg-[#1464B8] hover:bg-[#10539A] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                {submitting ? 'Aceptando...' : 'Sí, Aceptar Propuesta'}
              </button>
            </div>
          </Card>
        )}

        {/* Action Panel: Reject Form */}
        {actionType === 'reject' && (
          <Card className="bg-white border-rose-300 p-6">
            <h4 className="font-bold text-[#102B4B] text-sm mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-rose-500" />
              Solicitar Ajustes o Comentarios
            </h4>
            <p className="text-xs text-[#102B4B]/70 mb-4">Por favor escribe detalladamente qué modificaciones necesitas en la cotización para poder ajustarla.</p>
            
            <form onSubmit={handleReject} className="space-y-4">
              <textarea
                required
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Escribe aquí las observaciones o cambios solicitados (ej: ajustar cantidad de licencias, método de pago, etc.)..."
                rows={4}
                className="w-full bg-[#F6F9FC] border border-[#C7D5E2] rounded-xl p-3 text-xs text-[#102B4B] outline-none focus:border-[#1464B8] resize-none placeholder-[#102B4B]/45 leading-relaxed"
              />
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setActionType(null)}
                  className="px-4 py-2 bg-[#F6F9FC] hover:bg-[#EBF2F8] border border-[#C7D5E2] text-[#102B4B] rounded-xl text-xs font-semibold transition-colors"
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
