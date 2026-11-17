import React, { useState } from 'react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit2, 
  Link, 
  Download, 
  Eye, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  User,
  X,
  AlertTriangle,
  Mail,
  Send,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useData } from '../context/DataContext';
import { Quotation, QuoteItem, Client, PaymentMilestone } from '../types';
import { MarkdownRenderer } from '../utils/markdownParser';
import { generateQuotationPDF } from '../utils/quotePdfGenerator';
import clsx from 'clsx';
import { sendQuotationEmail } from '../services/emailService';
import { getQuotationWhatsAppText, getWhatsAppUrl } from '../services/whatsappService';
import { getAppBaseUrl } from '../utils/urlUtils';

const Quotations: React.FC = () => {
  const { clients, platforms, quotations, companyInfo, bookingSettings, addQuotation, updateQuotation, deleteQuotation } = useData();

  const formatLocalDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).toLocaleDateString();
    }
    return new Date(dateStr).toLocaleDateString();
  };

  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Pendiente' | 'Aceptada' | 'Rechazada'>('Todos');

  // Email Modal State
  const [emailModalQuotation, setEmailModalQuotation] = useState<Quotation | null>(null);
  const [emailTarget, setEmailTarget] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCustomNote, setEmailCustomNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ success: boolean; message: string } | null>(null);

  const handleOpenEmailModal = (quotation: Quotation) => {
    const client = clients.find(c => c.id === quotation.clientId);
    setEmailModalQuotation(quotation);
    setEmailTarget(quotation.clientEmail || client?.email || '');
    setEmailSubject(`Cotización y Propuesta Comercial - ${quotation.clientName}`);
    setEmailCustomNote('');
    setEmailNotice(null);
  };

  const handleSendQuotationEmail = async () => {
    if (!emailModalQuotation || !emailTarget.trim()) return;
    setSendingEmail(true);
    setEmailNotice(null);

    const res = await sendQuotationEmail(
      emailModalQuotation,
      emailTarget.trim(),
      bookingSettings?.googleConfig,
      emailSubject,
      emailCustomNote,
      companyInfo
    );

    setSendingEmail(false);
    setEmailNotice(res);
    if (res.success) {
      setTimeout(() => setEmailModalQuotation(null), 2500);
    }
  };

  const handleSendQuotationWhatsApp = (quotation: Quotation) => {
    const client = clients.find(c => c.id === quotation.clientId);
    const phone = client?.whatsapp || client?.phone || '';
    if (!phone) {
      alert("El cliente no tiene un teléfono o WhatsApp registrado.");
      return;
    }
    const text = getQuotationWhatsAppText(quotation, companyInfo);
    const url = getWhatsAppUrl(phone, text);
    window.open(url, '_blank');
  };

  // Form States
  const [selectedClientId, setSelectedClientId] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([{ description: '', quantity: 1, price: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [createdAtDate, setCreatedAtDate] = useState('');
  const [notes, setNotes] = useState('');
  const [hasIva, setHasIva] = useState(false);
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>([]);
  const [deliveryTime, setDeliveryTime] = useState('');

  // Editor Tab State
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');

  const insertMarkdown = (tag: string, textareaId: string, setState: (val: string) => void) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const scrollTop = textarea.scrollTop; // Save scroll position

    let replacement = '';
    if (tag === 'bold') {
      const leadingWhitespace = selected.match(/^\s*/)?.[0] || '';
      const trailingWhitespace = selected.match(/\s*$/)?.[0] || '';
      const cleanSelected = selected.trim();
      replacement = `${leadingWhitespace}**${cleanSelected || 'texto'}**${trailingWhitespace}`;
    } else if (tag === 'h1') {
      const cleanSelected = selected.trim();
      replacement = `\n# ${cleanSelected || 'Título 1'}\n`;
    } else if (tag === 'h2') {
      const cleanSelected = selected.trim();
      replacement = `\n## ${cleanSelected || 'Título 2'}\n`;
    } else if (tag === 'h3') {
      const cleanSelected = selected.trim();
      replacement = `\n### ${cleanSelected || 'Título 3'}\n`;
    } else if (tag === 'align-left' || tag === 'align-center' || tag === 'align-right' || tag === 'align-justify') {
      const prefix = tag === 'align-left' ? '[l]' : tag === 'align-center' ? '[c]' : tag === 'align-right' ? '[r]' : '[j]';
      const cleanSelected = selected.trim();
      if (!cleanSelected) {
        replacement = `\n${prefix} Texto\n`;
      } else {
        const linesList = cleanSelected.split(/\r?\n/);
        const processedLines = linesList.map(l => {
          const trimmed = l.trim();
          if (!trimmed) return '';
          const cleanLineText = trimmed.replace(/^\[[clrj]\]\s*/i, '');
          return `${prefix} ${cleanLineText}`;
        });
        replacement = `\n${processedLines.join('\n')}\n`;
      }
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    setState(newValue);

    // Re-focus, set selection, and restore scroll position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
      textarea.scrollTop = scrollTop;
    }, 0);
  };

  // Calculations
  const filteredQuotations = quotations.filter(q => {
    if (statusFilter === 'Todos') return true;
    return q.status === statusFilter;
  });

  const getSubtotal = (itemsList: QuoteItem[]) => {
    return itemsList.reduce((sum, item) => {
      const activePrice = (item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '')
        ? Number(item.promoPrice)
        : (item.price !== undefined && item.price !== null && item.price !== '' ? Number(item.price) : 0);
      const quantity = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? Number(item.quantity) : 0;
      return sum + (quantity * activePrice);
    }, 0);
  };

  const getTotal = (subtotal: number, disc: number, addIva: boolean) => {
    const safeSubtotal = isNaN(subtotal) ? 0 : subtotal;
    const safeDisc = isNaN(disc) ? 0 : disc;
    const discountAmount = (safeSubtotal * safeDisc) / 100;
    const afterDiscount = safeSubtotal - discountAmount;
    const ivaAmount = addIva ? afterDiscount * 0.16 : 0;
    return afterDiscount + ivaAmount;
  };

  const getIvaAmount = (subtotalAfterDiscount: number, addIva: boolean) => {
    const safeSubtotalAfterDiscount = isNaN(subtotalAfterDiscount) ? 0 : subtotalAfterDiscount;
    return addIva ? safeSubtotalAfterDiscount * 0.16 : 0;
  };

  const getBaseSubtotal = (itemsList: QuoteItem[]) => {
    return itemsList.reduce((sum, item) => {
      const basePrice = item.price !== undefined && item.price !== null && item.price !== '' ? Number(item.price) : 0;
      const quantity = item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? Number(item.quantity) : 0;
      return sum + (quantity * basePrice);
    }, 0);
  };

  const oneTimeItems = items.filter(item => item.billingType !== 'monthly');
  const monthlyItems = items.filter(item => item.billingType === 'monthly');

  const subtotalValue = getSubtotal(oneTimeItems);
  const subtotalBaseValue = getBaseSubtotal(oneTimeItems);
  const totalValue = getTotal(subtotalValue, discount, hasIva);

  const subtotalMonthlyValue = getSubtotal(monthlyItems);
  const totalMonthlyValue = getTotal(subtotalMonthlyValue, 0, hasIva);

  // Recalcular montos de hitos cuando cambie el totalValue de la cotización
  React.useEffect(() => {
    const safeTotal = isNaN(totalValue) ? 0 : totalValue;
    setPaymentMilestones(prev => prev.map(m => {
      const percentage = isNaN(m.percentage) ? 0 : m.percentage;
      return {
        ...m,
        amount: Number(((safeTotal * percentage) / 100).toFixed(2))
      };
    }));
  }, [totalValue]);

  const handleAddMilestone = () => {
    const currentSum = paymentMilestones.reduce((sum, m) => sum + (isNaN(m.percentage) ? 0 : m.percentage), 0);
    const remaining = Math.max(0, 100 - currentSum);
    const safeTotal = isNaN(totalValue) ? 0 : totalValue;
    const amount = (safeTotal * remaining) / 100;
    setPaymentMilestones([
      ...paymentMilestones,
      { concept: '', percentage: remaining, amount: Number(amount.toFixed(2)), timeframe: '' }
    ]);
  };

  const handleRemoveMilestone = (index: number) => {
    setPaymentMilestones(paymentMilestones.filter((_, idx) => idx !== index));
  };

  const handleMilestoneChange = (index: number, field: keyof PaymentMilestone, value: any) => {
    const newMilestones = [...paymentMilestones];
    if (field === 'percentage') {
      const rawVal = value === '' ? 0 : Number(value);
      const percentage = isNaN(rawVal) ? 0 : rawVal;
      const safeTotal = isNaN(totalValue) ? 0 : totalValue;
      const amount = (safeTotal * percentage) / 100;
      newMilestones[index] = {
        ...newMilestones[index],
        percentage,
        amount: Number(amount.toFixed(2))
      };
    } else {
      newMilestones[index] = {
        ...newMilestones[index],
        [field]: value
      } as PaymentMilestone;
    }
    setPaymentMilestones(newMilestones);
  };

  // Handlers for Items
  const handleAddItemRow = () => {
    setItems([...items, { description: '', quantity: 1, price: 0, billingType: 'once' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof QuoteItem, value: any) => {
    const newItems = [...items];
    let parsedValue = value;
    if (field === 'quantity' || field === 'price' || field === 'promoPrice') {
      parsedValue = value === '' ? undefined : Number(value);
    }
    newItems[index] = {
      ...newItems[index],
      [field]: parsedValue
    } as QuoteItem;
    setItems(newItems);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingQuotation(null);
    setSelectedClientId('');
    setItems([{ description: '', quantity: 1, price: 0, billingType: 'once' }]);
    setDiscount(0);
    setHasIva(false);
    setPaymentMilestones([]);
    setDeliveryTime('');
    setValidUntil(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 15 days validity default
    setCreatedAtDate(new Date().toISOString().split('T')[0]); // today's date default
    setNotes('');
    setEditorTab('edit');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (quote: Quotation) => {
    setEditingQuotation(quote);
    setSelectedClientId(quote.clientId);
    setItems(quote.items);
    setDiscount(quote.discount || 0);
    setHasIva(quote.hasIva || false);
    setPaymentMilestones(quote.paymentMilestones || []);
    setDeliveryTime(quote.deliveryTime || '');
    setValidUntil(quote.validUntil || '');
    setCreatedAtDate(quote.createdAt ? quote.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    setNotes(quote.notes || '');
    setEditorTab('edit');
    setIsModalOpen(true);
  };

  // Save Quotation
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      alert("Por favor selecciona un cliente.");
      return;
    }
    if (items.some(item => !item.description.trim() || item.price === undefined || item.price === null || item.price < 0)) {
      alert("Por favor completa la descripción y el precio de todas las partidas.");
      return;
    }

    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    const sanitizedItems = items.map(item => {
      const cleaned: any = {
        description: item.description,
        quantity: Number(item.quantity),
        price: Number(item.price),
        billingType: item.billingType || 'once'
      };
      if (item.details && item.details.trim() !== '') {
        cleaned.details = item.details.trim();
      }
      if (item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '') {
        cleaned.promoPrice = Number(item.promoPrice);
      }
      return cleaned;
    });

    const subtotal = subtotalValue;
    const total = totalValue;

    const parts = createdAtDate.split('-');
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
    const createdAtIso = dateObj.toISOString();

    if (editingQuotation) {
      const {
        acceptedAt,
        rejectedAt,
        feedback,
        ...cleanQuotation
      } = editingQuotation;

      await updateQuotation({
        ...cleanQuotation,
        clientId: selectedClientId,
        clientName: client.name,
        clientCompanyName: client.companyName || '',
        clientEmail: client.email || '',
        items: sanitizedItems,
        subtotal,
        discount,
        total,
        subtotalMonthly: subtotalMonthlyValue,
        totalMonthly: totalMonthlyValue,
        notes,
        validUntil,
        createdAt: createdAtIso,
        hasIva,
        status: 'Pendiente',
        paymentMilestones,
        deliveryTime
      });
    } else {
      await addQuotation({
        id: 'quote_' + Math.random().toString(36).substr(2, 9),
        clientId: selectedClientId,
        clientName: client.name,
        clientCompanyName: client.companyName || '',
        clientEmail: client.email || '',
        items: sanitizedItems,
        subtotal,
        discount,
        total,
        subtotalMonthly: subtotalMonthlyValue,
        totalMonthly: totalMonthlyValue,
        notes,
        validUntil,
        status: 'Pendiente',
        createdAt: createdAtIso,
        hasIva,
        paymentMilestones,
        deliveryTime
      });
    }

    setIsModalOpen(false);
    setEditorTab('edit');
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta cotización?")) {
      await deleteQuotation(id);
    }
  };

  const copyAcceptLink = (quoteId: string) => {
    const baseUrl = getAppBaseUrl(companyInfo);
    const link = `${baseUrl}/#/quote/${quoteId}`;

    navigator.clipboard.writeText(link);
    setCopiedId(quoteId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const downloadPDF = async (quote: Quotation) => {
    const client = clients.find(c => c.id === quote.clientId);
    if (!client) {
      alert("Cliente no encontrado.");
      return;
    }
    await generateQuotationPDF(quote, client, companyInfo);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Cotizaciones</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Elabora y da seguimiento a propuestas comerciales formalizadas</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-md shadow-primary-500/10 transition-colors"
        >
          <Plus className="w-5 h-5" /> Crear Cotización
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 dark:border-dark-border no-print gap-6">
        {(['Todos', 'Pendiente', 'Aceptada', 'Rechazada'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={clsx(
              "pb-4 text-sm font-semibold tracking-wide border-b-2 transition-colors",
              statusFilter === tab
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            {tab === 'Todos' ? 'Todos' : tab === 'Pendiente' ? 'Pendientes' : tab === 'Aceptada' ? 'Aceptadas' : 'Rechazadas'}
          </button>
        ))}
      </div>

      {/* List / Table */}
      <Card className="overflow-hidden">
        {filteredQuotations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xxs font-bold uppercase tracking-wider border-b border-gray-100 dark:border-dark-border">
                  <th className="p-4">Folio</th>
                  <th className="p-4">Cliente / Empresa</th>
                  <th className="p-4">Importe Total</th>
                  <th className="p-4">Vence</th>
                  <th className="p-4">Estatus</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border text-sm">
                {filteredQuotations.map(quote => (
                  <React.Fragment key={quote.id}>
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-850/20 transition-colors">
                      <td className="p-4 font-mono font-semibold text-xs text-gray-500">
                        INT-COT-{quote.id.replace(/^quote_/, '').substring(0, 8).toUpperCase()}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-gray-900 dark:text-white">{quote.clientName}</div>
                        <div className="text-xs text-gray-500">{quote.clientCompanyName || 'Particular'}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-gray-900 dark:text-white">${quote.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        {quote.totalMonthly ? (
                          <div className="text-xxs text-emerald-600 dark:text-emerald-400 font-bold">
                            + ${quote.totalMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes
                          </div>
                        ) : null}
                        {quote.discount ? (
                          <div className="text-xxs text-slate-550 dark:text-slate-400 font-medium">Desc. {quote.discount}% aplicado</div>
                        ) : null}
                      </td>
                      <td className="p-4 text-gray-550">
                        {quote.validUntil ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatLocalDate(quote.validUntil)}</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="p-4">
                        <span className={clsx(
                          "px-2.5 py-1 rounded-full text-xxs font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit",
                          quote.status === 'Aceptada' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" :
                          quote.status === 'Rechazada' ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400" :
                          "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                        )}>
                          {quote.status === 'Aceptada' ? <CheckCircle className="w-3.5 h-3.5" /> :
                           quote.status === 'Rechazada' ? <XCircle className="w-3.5 h-3.5" /> :
                           <Clock className="w-3.5 h-3.5 animate-pulse" />}
                          {quote.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end items-center gap-1">
                          <button
                            onClick={() => copyAcceptLink(quote.id)}
                            className={clsx(
                              "p-2 rounded-lg border transition-all text-xs font-semibold flex items-center gap-1.5",
                              copiedId === quote.id 
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900" 
                                : "bg-white hover:bg-gray-50 text-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-dark-border"
                            )}
                            title="Copiar Enlace para el Cliente"
                          >
                            <Link className="w-4 h-4" />
                            <span>{copiedId === quote.id ? '¡Copiado!' : 'Enlace'}</span>
                          </button>

                          <button
                            onClick={() => handleOpenEmailModal(quote)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30 rounded-lg transition-colors border border-indigo-200 dark:border-indigo-900/50 flex items-center gap-1 text-xs font-semibold"
                            title="Enviar Cotización por Correo (Gmail)"
                          >
                            <Mail className="w-4 h-4" />
                            <span>Correo</span>
                          </button>

                          <button
                            onClick={() => handleSendQuotationWhatsApp(quote)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1 text-xs font-semibold"
                            title="Enviar Cotización por WhatsApp"
                          >
                            <Send className="w-4 h-4" />
                            <span>WhatsApp</span>
                          </button>

                          <button
                            onClick={() => downloadPDF(quote)}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-lg transition-colors border border-transparent"
                            title="Descargar PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleOpenEdit(quote)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors border border-transparent"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDelete(quote.id)}
                            className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors border border-transparent"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Observaciones de Cotizaciones */}
                    {(quote.feedback || quote.status === 'Aceptada') && (
                      <tr className="bg-gray-50/30 dark:bg-gray-900/10">
                        <td colSpan={6} className="p-3 pl-12 border-b border-gray-100 dark:border-dark-border">
                          <div className={clsx(
                            "p-3 rounded-xl border text-xs leading-relaxed max-w-3xl",
                            quote.status === 'Aceptada' 
                              ? "bg-emerald-50/40 border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400"
                              : "bg-rose-50/40 border-rose-100 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-450"
                          )}>
                            {quote.status === 'Aceptada' ? (
                              <span className="font-semibold">✓ Cotización Aceptada:</span>
                            ) : (
                              <span className="font-semibold">💬 Observaciones del Cliente (Rechazada):</span>
                            )}
                            <span className="ml-1.5 italic">
                              {quote.status === 'Aceptada' 
                                ? `Propuesta aceptada el ${quote.acceptedAt ? new Date(quote.acceptedAt).toLocaleString() : 'N/A'}`
                                : `"${quote.feedback}" (Enviado el ${quote.rejectedAt ? new Date(quote.rejectedAt).toLocaleString() : 'N/A'})`
                              }
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-20 text-gray-400 gap-3 border-2 border-dashed border-gray-100 dark:border-dark-border rounded-2xl m-4">
            <FileText className="w-12 h-12 opacity-30" />
            <div>
              <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm">No hay cotizaciones</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-[250px]">Elabora propuestas de proyectos y envíaselas a tus clientes para su aceptación digital.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 no-print animate-fade-in">
          <Card className="max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingQuotation ? 'Editar Cotización' : 'Elaborar Cotización'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Client Dropdown */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Cliente Receptor</label>
                  <select
                    required
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Selecciona un cliente...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.companyName || 'Particular'})</option>
                    ))}
                  </select>
                </div>

                {/* Emission date */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Fecha de Emisión</label>
                  <input 
                    required 
                    type="date" 
                    value={createdAtDate} 
                    onChange={e => setCreatedAtDate(e.target.value)} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" 
                  />
                </div>

                {/* Expiration date */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Validez de Propuesta (Fecha)</label>
                  <input 
                    required 
                    type="date" 
                    value={validUntil} 
                    onChange={e => setValidUntil(e.target.value)} 
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" 
                  />
                </div>
              </div>

              {/* Items Rows */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Partidas / Conceptos de Cotización</label>
                  
                  <div className="flex items-center gap-4">
                    {platforms.length > 0 && (
                      <select
                        onChange={(e) => {
                          const platId = e.target.value;
                          if (!platId) return;
                          const plat = platforms.find(p => p.id === platId);
                          if (plat) {
                            if (items.length === 1 && !items[0].description.trim() && items[0].price === 0) {
                              setItems([{ description: `Licencia Mensual - ${plat.name}`, quantity: 1, price: plat.monthlyPrice }]);
                            } else {
                              setItems([...items, { description: `Licencia Mensual - ${plat.name}`, quantity: 1, price: plat.monthlyPrice }]);
                            }
                          }
                          e.target.value = ''; // reset selection
                        }}
                        className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1 text-gray-600 dark:text-gray-400 outline-none cursor-pointer focus:ring-1 focus:ring-primary-500 font-semibold"
                      >
                        <option value="">+ Cargar Producto SaaS...</option>
                        {platforms.map(p => (
                          <option key={p.id} value={p.id}>{p.name} (${p.monthlyPrice.toLocaleString()})</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="text-xs font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar Partida
                    </button>
                  </div>
                </div>
                <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                  {items.map((item, index) => (
                    <div key={index} className="flex flex-col gap-3.5 p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-xl border border-gray-150/40 dark:border-gray-850 pb-4 relative shadow-sm">
                      {/* Botón Eliminar Absoluto en la Esquina Superior Derecha */}
                      <div className="absolute top-3 right-3 z-10">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(index)}
                          disabled={items.length === 1}
                          className="p-1.5 text-gray-400 hover:text-rose-600 disabled:opacity-40 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                          title="Eliminar partida"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Concepto y Detalles (Ancho Completo) */}
                      <div className="space-y-2 pr-8">
                        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Concepto del Servicio / Producto</label>
                        <input
                          required
                          type="text"
                          value={item.description}
                          onChange={e => handleItemChange(index, 'description', e.target.value)}
                          placeholder="Ej. Diseño de Identidad Corporativa o Licencia Mensual"
                          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-xs font-semibold dark:text-white outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                        />
                        <input
                          type="text"
                          value={item.details || ''}
                          onChange={e => handleItemChange(index, 'details', e.target.value)}
                          placeholder="Detalles adicionales (Ej. Incluye logotipo, paleta de colores, manual de marca)..."
                          className="w-full bg-white/70 dark:bg-gray-900/70 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-[11px] dark:text-gray-200 outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                        />
                      </div>

                      {/* Campos Numéricos Separados (Uno al lado de otro con etiquetas claras y más ancho) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-1">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Esquema</label>
                          <select
                            value={item.billingType || 'once'}
                            onChange={e => handleItemChange(index, 'billingType', e.target.value)}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500 font-bold shadow-sm cursor-pointer"
                          >
                            <option value="once">Proyecto</option>
                            <option value="monthly">Mensual</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Cantidad</label>
                          <input
                            required
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                            onFocus={e => { try { e.target.select(); } catch (err) {} }}
                            placeholder="Cant."
                            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500 text-center font-bold shadow-sm"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Precio Base ($)</label>
                          <input
                            required
                            type="number"
                            min="0"
                            value={item.price !== undefined && item.price !== null && item.price !== '' ? item.price : ''}
                            onChange={e => handleItemChange(index, 'price', e.target.value)}
                            onFocus={e => { try { e.target.select(); } catch (err) {} }}
                            placeholder="0.00"
                            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500 text-right font-bold shadow-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Precio Promo ($)</label>
                          <input
                            type="number"
                            min="0"
                            value={item.promoPrice !== undefined && item.promoPrice !== null && item.promoPrice !== '' ? item.promoPrice : ''}
                            onChange={e => handleItemChange(index, 'promoPrice', e.target.value)}
                            onFocus={e => { try { e.target.select(); } catch (err) {} }}
                            placeholder="Precio final"
                            className="w-full bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/30 rounded-lg p-2.5 text-xs text-emerald-700 dark:text-emerald-300 outline-none focus:ring-2 focus:ring-emerald-500 text-right font-bold placeholder-emerald-400/80 shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proposal Editor (Notes) - FULL WIDTH */}
              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-dark-border mt-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-550 dark:text-gray-400 uppercase tracking-wider block">Propuesta Comercial (Notas y Condiciones en Markdown)</label>
                  
                  {/* Tabs */}
                  <div className="flex border border-gray-200 dark:border-dark-border rounded-lg p-0.5 bg-gray-50 dark:bg-gray-800/50 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setEditorTab('edit')}
                      className={clsx(
                        "px-2.5 py-1 rounded text-[10px] font-bold transition-all",
                        editorTab === 'edit'
                          ? "bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab('preview')}
                      className={clsx(
                        "px-2.5 py-1 rounded text-[10px] font-bold transition-all",
                        editorTab === 'preview'
                          ? "bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Vista Previa
                    </button>
                  </div>
                </div>

                {editorTab === 'edit' ? (
                  <div className="space-y-2 animate-fade-in w-full">
                    {/* Format Toolbar */}
                    <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-dark-border rounded-lg">
                      <button
                        type="button"
                        onClick={() => insertMarkdown('h1', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Título Grande"
                      >
                        H1
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarkdown('h2', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Título Mediano"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarkdown('h3', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Título Chico"
                      >
                        H3
                      </button>
                      <div className="w-px h-4 bg-gray-200 dark:bg-dark-border mx-1" />
                      <button
                        type="button"
                        onClick={() => insertMarkdown('bold', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Negrita"
                      >
                        Negrita
                      </button>
                      <div className="w-px h-4 bg-gray-200 dark:bg-dark-border mx-1" />
                      <button
                        type="button"
                        onClick={() => insertMarkdown('align-left', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Izquierda"
                      >
                        Izq
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarkdown('align-center', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Centro"
                      >
                        Centro
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarkdown('align-right', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Derecha"
                      >
                        Der
                      </button>
                      <button
                        type="button"
                        onClick={() => insertMarkdown('align-justify', 'quote-notes-editor', setNotes)}
                        className="px-2 py-0.5 text-[9px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded shadow-sm"
                        title="Justificar"
                      >
                        Justificar
                      </button>
                    </div>

                    <textarea 
                      id="quote-notes-editor"
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      placeholder="Redacta los puntos de tu propuesta comercial, alcances y condiciones..."
                      rows={10}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-3 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono" 
                    />
                  </div>
                ) : (
                  <div className="w-full bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-dark-border rounded-lg p-4 min-h-[220px] max-h-[300px] overflow-y-auto shadow-inner animate-fade-in">
                    <MarkdownRenderer content={notes} />
                  </div>
                )}
              </div>

              {/* Stacked block for settings and totals BELOW the editor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100 dark:border-dark-border mt-4">
                {/* Column 1: Settings */}
                <div className="space-y-4">
                  <div className="bg-gray-50/50 dark:bg-gray-800/10 p-5 rounded-2xl border border-gray-150 dark:border-dark-border space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ajustes Generales</h4>
                    
                    <div className="space-y-1.5">
                      <label className="text-xxs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Descuento (%)</label>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={discount !== undefined && discount !== null && discount !== '' ? discount : ''}
                        onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))} 
                        onFocus={e => { try { e.target.select(); } catch (err) {} }}
                        placeholder="0"
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500 shadow-sm" 
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-xxs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">Tiempo de Entrega</label>
                      <input 
                        type="text" 
                        value={deliveryTime} 
                        onChange={e => setDeliveryTime(e.target.value)} 
                        placeholder="Ej. 1 mes, 15 días hábiles"
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500 shadow-sm" 
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox" 
                        id="hasIva" 
                        checked={hasIva} 
                        onChange={e => setHasIva(e.target.checked)} 
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer" 
                      />
                      <label htmlFor="hasIva" className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase cursor-pointer select-none">
                        Precios Más IVA (+16%)
                      </label>
                    </div>
                  </div>
                </div>

                {/* Column 2: Totals and Payment Milestones */}
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-800/30 p-5 rounded-2xl flex flex-col gap-3 text-sm border border-gray-155 dark:border-dark-border/40">
                    {/* Sección Pago Único */}
                    <div className="space-y-3">
                      <div className="text-xxs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block border-b border-gray-200/50 dark:border-gray-800 pb-1">Conceptos del Proyecto (Inversión Inicial)</div>
                      <div className="flex justify-between items-center text-gray-550 dark:text-gray-400">
                        <span>Subtotal Proyecto:</span>
                        {subtotalBaseValue > subtotalValue ? (
                          <div className="flex flex-col items-end">
                            <span className="line-through text-xs text-rose-500">${subtotalBaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">${subtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ) : (
                          <span className="font-semibold text-gray-900 dark:text-white">${subtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        )}
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                          <span>Descuento ({discount}%):</span>
                          <span className="font-semibold">-${((subtotalValue * discount) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {hasIva && (
                        <div className="flex justify-between text-gray-550 dark:text-gray-400">
                          <span>IVA (16%):</span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            +${getIvaAmount(subtotalValue - (subtotalValue * discount) / 100, hasIva).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="border-t border-gray-200 dark:border-dark-border pt-2 flex justify-between font-bold text-base">
                        <span className="text-gray-900 dark:text-white">TOTAL PROYECTO (Inicial):</span>
                        <span className="text-primary-600 dark:text-primary-400">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* Sección Cargos Recurrentes si existen */}
                    {subtotalMonthlyValue > 0 && (
                      <div className="border-t border-gray-200 dark:border-dark-border pt-3 mt-1 space-y-3">
                        <div className="text-xxs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block border-b border-gray-200/50 dark:border-gray-800 pb-1">Conceptos Recurrentes Mensuales</div>
                        <div className="flex justify-between text-gray-550 dark:text-gray-400">
                          <span>Subtotal Mensual:</span>
                          <span className="font-semibold text-gray-900 dark:text-white">${subtotalMonthlyValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {hasIva && (
                          <div className="flex justify-between text-gray-550 dark:text-gray-400">
                            <span>IVA Mensual (16%):</span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              +${(subtotalMonthlyValue * 0.16).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div className="border-t border-gray-200 dark:border-dark-border pt-2 flex justify-between font-bold text-base text-emerald-600 dark:text-emerald-400">
                          <span>TOTAL MENSUAL:</span>
                          <span>${totalMonthlyValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50/50 dark:bg-gray-850/10 p-5 rounded-2xl border border-gray-150 dark:border-dark-border space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-gray-550 dark:text-gray-400 uppercase tracking-wider">Condiciones de Pago</label>
                      <button
                        type="button"
                        onClick={handleAddMilestone}
                        className="text-[10px] font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1 bg-primary-50 dark:bg-primary-950/20 px-2 py-1 rounded-lg border border-primary-200/30 shadow-xs"
                      >
                        <Plus className="w-3 h-3" /> Agregar Hito
                      </button>
                    </div>

                    {paymentMilestones.length > 0 ? (
                      <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {paymentMilestones.map((milestone, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-150 dark:border-dark-border space-y-2 relative shadow-xs">
                            <button
                              type="button"
                              onClick={() => handleRemoveMilestone(idx)}
                              className="absolute top-2 right-2 text-gray-400 hover:text-rose-500 transition-colors"
                              title="Eliminar hito"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            
                            <div className="grid grid-cols-4 gap-2 pr-6">
                              <div className="col-span-3">
                                <input
                                  required
                                  type="text"
                                  placeholder="Concepto (Ej. Anticipo)"
                                  value={milestone.concept}
                                  onChange={e => handleMilestoneChange(idx, 'concept', e.target.value)}
                                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-250 dark:border-dark-border rounded-lg px-2 py-1 text-xs dark:text-white outline-none focus:ring-1 focus:ring-primary-500 font-semibold"
                                />
                              </div>
                              <div>
                                <input
                                  required
                                  type="number"
                                  min="0"
                                  max="100"
                                  placeholder="%"
                                  value={milestone.percentage}
                                  onChange={e => handleMilestoneChange(idx, 'percentage', e.target.value)}
                                  onFocus={e => { try { e.target.select(); } catch (err) {} }}
                                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-255 dark:border-dark-border rounded-lg px-2 py-1 text-xs dark:text-white outline-none focus:ring-1 focus:ring-primary-500 text-center font-bold"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <input
                                  type="text"
                                  placeholder="Plazo (Ej. Al inicio)"
                                  value={milestone.timeframe || ''}
                                  onChange={e => handleMilestoneChange(idx, 'timeframe', e.target.value)}
                                  className="w-full bg-gray-50/50 dark:bg-gray-800/35 border border-gray-250 dark:border-dark-border rounded-lg px-2 py-1 text-[11px] dark:text-white outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                              <div className="flex items-center justify-end text-xs font-mono font-bold text-slate-550 dark:text-slate-350 pr-1">
                                <span>${milestone.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 border border-dashed border-gray-200 dark:border-dark-border rounded-xl text-gray-400 text-xs bg-gray-50/20">
                        No hay hitos de pago. El cliente pagará el 100% al finalizar.
                      </div>
                    )}

                    {paymentMilestones.length > 0 && (
                      (() => {
                        const sum = paymentMilestones.reduce((s, m) => s + m.percentage, 0);
                        if (sum !== 100) {
                          return (
                            <div className="flex items-center gap-1.5 p-2 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-bold border border-amber-200/50">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>Suma de hitos: {sum}% (debe ser 100%)</span>
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center gap-1.5 p-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-bold border border-emerald-250/50">
                            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Suma de hitos: 100% (correcto)</span>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-dark-border mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium shadow-md shadow-primary-500/10 transition-colors"
                >
                  Guardar Cotización
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal de Enviar Cotización por Correo (Gmail) */}
      {emailModalQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <Card className="max-w-md w-full p-6 bg-white dark:bg-dark-card rounded-3xl border border-gray-100 dark:border-dark-border shadow-2xl space-y-5 relative">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Mail className="w-5 h-5" />
                <h3 className="text-base font-bold">Enviar Cotización por Gmail</h3>
              </div>
              <button 
                onClick={() => setEmailModalQuotation(null)} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5 cursor-pointer" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Correo Electrónico del Cliente:
                </label>
                <input
                  type="email"
                  value={emailTarget}
                  onChange={(e) => setEmailTarget(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full px-3 py-2 text-xs border rounded-xl dark:bg-gray-800 dark:border-dark-border dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Asunto del Correo:
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-xl dark:bg-gray-800 dark:border-dark-border dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Nota / Mensaje Personalizado Adicional (Opcional):
                </label>
                <textarea
                  value={emailCustomNote}
                  onChange={(e) => setEmailCustomNote(e.target.value)}
                  rows={3}
                  placeholder="Ej. Te compartimos la propuesta comercial solicitada..."
                  className="w-full px-3 py-2 text-xs border rounded-xl dark:bg-gray-800 dark:border-dark-border dark:text-white font-medium"
                />
              </div>

              {emailNotice && (
                <div className={clsx(
                  "p-3 rounded-xl text-xs font-semibold flex items-center gap-2",
                  emailNotice.success 
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200" 
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200"
                )}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{emailNotice.message}</span>
                </div>
              )}

              <button
                type="button"
                disabled={sendingEmail || !emailTarget.trim()}
                onClick={handleSendQuotationEmail}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
              >
                {sendingEmail ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{sendingEmail ? "Despachando por Gmail API..." : "🚀 Enviar Cotización por Correo"}</span>
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Quotations;
