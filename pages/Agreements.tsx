import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Card } from '../components/ui/Card';
import { 
  FileText, Plus, FileSignature, Copy, Trash2, CheckCircle2, 
  Clock, AlertTriangle, ArrowLeft, Send, ExternalLink, MessageCircle,
  Edit2, Paperclip, Upload, Loader2, Mail
} from 'lucide-react';
import { Agreement, Client, CompanyInfo, Quotation } from '../types';
import { generateAgreementPDF } from '../utils/contractPdfGenerator';
import clsx from 'clsx';
import { MarkdownRenderer } from '../utils/markdownParser';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';
import { replacePlaceholders } from '../utils/placeholderResolver';
import { sendAgreementEmail } from '../services/emailService';
import { getAgreementWhatsAppText, getWhatsAppUrl } from '../services/whatsappService';
import { getAppBaseUrl } from '../utils/urlUtils';

const TEMPLATE_CONTRATO = `CONTRATO DE PRESTACIÓN DE SERVICIOS DIGITALES que celebran por una parte {MI_RAZON_SOCIAL} (en lo sucesivo "{MI_EMPRESA}"), representada en este acto por su representante legal, con dirección en {MI_DIRECCION}, RFC {MI_RFC} y correo {MI_EMAIL}; y por la otra parte la empresa {EMPRESA_CLIENTE}, representada por {CLIENTE} (en lo sucesivo "EL CLIENTE"), con dirección en {DIRECCION_CLIENTE}, RFC {RFC_CLIENTE} y correo {EMAIL_CLIENTE}.

DECLARACIONES:
I. "{MI_EMPRESA}" declara ser una entidad legalmente constituida dedicada a la prestación de servicios de {SERVICIO_CONTRATADO} y marketing digital.
II. "EL CLIENTE" declara estar interesado en contratar los servicios de {SERVICIO_CONTRATADO} provistos por la agencia.

CLÁUSULAS:
PRIMERA. OBJETO. El objeto del presente contrato es la prestación de los servicios de {SERVICIO_CONTRATADO} detallados en la propuesta comercial.
SEGUNDA. VIGENCIA. El presente contrato entra en vigor en la fecha de su firma electrónica y tendrá una vigencia indefinida, pudiendo ser cancelado por cualquiera de las partes mediante aviso por escrito con 30 días de anticipación.
TERCERA. COSTO Y PAGO. El cliente pagará la tarifa acordada de manera puntual a través de transferencia bancaria en los primeros 5 días hábiles de cada periodo mensual.
CUARTA. CONFIDENCIALIDAD. Ambas partes se comprometen a mantener en estricta confidencialidad toda la información, estrategias y datos compartidos durante la ejecución de los servicios.
QUINTA. JURISDICCIÓN. Para la interpretación y cumplimiento de este contrato, las partes se someten a las leyes aplicables de la jurisdicción local, renunciando a cualquier otro fuero que pudiere corresponderles.`;

const TEMPLATE_TERMINOS = `TÉRMINOS Y CONDICIONES DE SERVICIOS DIGITALES
Establecidos por {MI_EMPRESA} ({MI_RAZON_SOCIAL}) con RFC {MI_RFC} y domicilio en {MI_DIRECCION}.

1. ACEPTACIÓN DE TÉRMINOS. Al contratar y recibir los servicios de {SERVICIO_CONTRATADO}, el cliente {CLIENTE} ({EMPRESA_CLIENTE}) acepta en su totalidad los términos aquí estipulados.
2. PRESTACIÓN DEL SERVICIO. {MI_EMPRESA} proveerá soporte y desarrollo de {SERVICIO_CONTRATADO} empleando buenas prácticas de la industria y personal capacitado.
3. PROPIEDAD INTELECTUAL. Todo el material, diseño y códigos desarrollados serán propiedad exclusiva del cliente una vez liquidado el pago total de los servicios contratados.
4. LIMITACIÓN DE RESPONSABILIDAD. {MI_EMPRESA} no se hace responsable por pérdidas de ingresos comerciales derivados de fallas de plataformas de terceros ajenas a su control.
5. CORREO Y COMUNICACIÓN. Para cualquier duda, aclaración o entrega de entregables oficiales se utilizarán los correos {MI_EMAIL} y {EMAIL_CLIENTE}.`;

// replacePlaceholders is now imported from utils/placeholderResolver

const Agreements: React.FC = () => {
  const { clients, quotations, companyInfo, agreements, bookingSettings, addAgreement, updateAgreement, deleteAgreement } = useData();
  const [view, setView] = useState<'list' | 'create'>('list');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [includeRepSignature, setIncludeRepSignature] = useState(false);

  // Email Modal State
  const [emailModalAgreement, setEmailModalAgreement] = useState<Agreement | null>(null);
  const [emailTarget, setEmailTarget] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCustomNote, setEmailCustomNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ success: boolean; message: string } | null>(null);

  const handleOpenEmailModal = (agreement: Agreement) => {
    const client = clients.find(c => c.id === agreement.clientId);
    setEmailModalAgreement(agreement);
    setEmailTarget(client?.email || '');
    setEmailSubject(`Contrato de Prestación de Servicios - ${agreement.title}`);
    setEmailCustomNote('');
    setEmailNotice(null);
  };

  const handleSendAgreementEmail = async () => {
    if (!emailModalAgreement || !emailTarget.trim()) return;
    setSendingEmail(true);
    setEmailNotice(null);

    const res = await sendAgreementEmail(
      emailModalAgreement,
      emailTarget.trim(),
      bookingSettings?.googleConfig,
      emailSubject,
      emailCustomNote,
      companyInfo
    );

    setSendingEmail(false);
    setEmailNotice(res);
    if (res.success) {
      setTimeout(() => setEmailModalAgreement(null), 2500);
    }
  };

  const handleSendAgreementWhatsApp = (agreement: Agreement) => {
    const client = clients.find(c => c.id === agreement.clientId);
    const phone = client?.whatsapp || client?.phone || '';
    if (!phone) {
      alert("El cliente no tiene un teléfono o WhatsApp registrado.");
      return;
    }
    const text = getAgreementWhatsAppText(agreement, companyInfo);
    const url = getWhatsAppUrl(phone, text);
    window.open(url, '_blank');
  };

  // Observation Modal state
  const [activeObservation, setActiveObservation] = useState<Agreement | null>(null);

  // Attachments State
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

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

  const handleTemplateChange = (templateName: string, clientId: string, quoteId?: string) => {
    setSelectedTemplate(templateName);
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    let text = '';
    if (templateName === 'contrato') {
      text = TEMPLATE_CONTRATO;
      setTitle(`Contrato de Servicios - ${client.companyName || client.name}`);
    } else if (templateName === 'terminos') {
      text = TEMPLATE_TERMINOS;
      setTitle(`Términos y Condiciones - ${client.companyName || client.name}`);
    } else {
      text = '';
      setTitle('');
    }

    if (text) {
      const quote = quotations.find(q => q.id === (quoteId || selectedQuoteId));
      setContent(replacePlaceholders(text, client, companyInfo, quote));
    } else {
      setContent('');
    }
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedQuoteId('');
    if (selectedTemplate) {
      handleTemplateChange(selectedTemplate, clientId, '');
    }
  };

  const handleAddAttachmentRow = () => {
    setAttachments(prev => [...prev, { name: '', url: '' }]);
  };

  const handleRemoveAttachmentRow = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAttachmentNameChange = (index: number, name: string) => {
    setAttachments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  };

  const handleAttachmentUrlChange = (index: number, url: string) => {
    setAttachments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], url };
      return updated;
    });
  };

  const handleFileChange = async (index: number, file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Solo se permiten archivos PDF');
      return;
    }

    setUploadingIndex(index);
    setUploadProgress(0);

    try {
      const fileRef = ref(storage, `agreements/attachments/${crypto.randomUUID()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Error uploading file:', error);
          alert('Error al subir el archivo');
          setUploadingIndex(null);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setAttachments(prev => {
            const updated = [...prev];
            updated[index] = {
              name: updated[index]?.name || file.name.replace(/\.pdf$/i, ''),
              url: downloadURL
            };
            return updated;
          });
          setUploadingIndex(null);
        }
      );
    } catch (e) {
      console.error('Storage error:', e);
      alert('Error al inicializar la carga');
      setUploadingIndex(null);
    }
  };

  const handleOpenEdit = (agreement: Agreement) => {
    setEditingAgreement(agreement);
    setSelectedClientId(agreement.clientId);
    setSelectedQuoteId(agreement.quoteId || '');
    setTitle(agreement.title);
    setContent(agreement.content);
    setIncludeRepSignature(agreement.includeRepSignature || false);
    setAttachments(agreement.attachments || []);
    setSelectedTemplate('libre');
    setView('create');
  };

  const handleCreateAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) {
      alert("Por favor selecciona un cliente registrado para este contrato.");
      return;
    }
    if (!title.trim()) {
      alert("Por favor escribe el título del contrato.");
      return;
    }
    if (!content.trim()) {
      alert("Por favor ingresa el contenido o texto del contrato.");
      return;
    }

    const cleanAttachments = attachments.filter(att => att.name.trim() && att.url);

    if (editingAgreement) {
      const {
        signedAt,
        clientIP,
        signedByName,
        signatureDataUrl,
        feedback,
        rejectedAt,
        ...cleanAgreement
      } = editingAgreement;

      const updatedAgreement: Agreement = {
        ...cleanAgreement,
        clientId: client.id,
        clientName: client.name,
        clientCompanyName: client.companyName,
        title,
        content,
        quoteId: selectedQuoteId || undefined,
        status: 'Pendiente',
        includeRepSignature,
        attachments: cleanAttachments
      };
      await updateAgreement(updatedAgreement);
    } else {
      const newAgreement: Agreement = {
        id: crypto.randomUUID(),
        clientId: client.id,
        clientName: client.name,
        clientCompanyName: client.companyName,
        title,
        content,
        createdAt: new Date().toISOString(),
        status: 'Pendiente',
        quoteId: selectedQuoteId || undefined,
        includeRepSignature,
        attachments: cleanAttachments
      };
      await addAgreement(newAgreement);
    }
    
    // Reset Form
    setEditingAgreement(null);
    setSelectedClientId('');
    setSelectedQuoteId('');
    setTitle('');
    setContent('');
    setIncludeRepSignature(false);
    setSelectedTemplate('');
    setAttachments([]);
    setView('list');
  };

  const copySigningLink = (agreementId: string) => {
    const baseUrl = getAppBaseUrl(companyInfo);
    const link = `${baseUrl}/#/sign/${agreementId}`;

    navigator.clipboard.writeText(link);
    setCopiedId(agreementId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleDownloadPDF = async (agreement: Agreement) => {
    const client = clients.find(c => c.id === agreement.clientId);
    if (!client) {
      alert("No se encontró la información del cliente asociado.");
      return;
    }
    await generateAgreementPDF(agreement, client, companyInfo);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Acuerdos y Contratos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Genera contratos y obtén firmas digitales con validez de origen</p>
        </div>
        {view === 'list' && (
          <button 
            onClick={() => setView('create')}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-primary-500/30 transition-all active:scale-95 self-start"
          >
            <Plus className="w-5 h-5" />
            Nuevo Contrato
          </button>
        )}
      </div>

      {view === 'list' ? (
        /* VISTA LISTA DE CONTRATOS */
        <div className="space-y-6 animate-fade-in">
          {agreements.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
              <FileSignature className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No hay contratos generados</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-1">
                Genera tu primer contrato digital para compartir el enlace de firma con tu cliente.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {agreements.map(agreement => (
                <Card key={agreement.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 gap-4">
                  <div className="flex items-start gap-4">
                    <div className={clsx(
                      "p-3 rounded-2xl flex-shrink-0",
                      agreement.status === 'Firmado' ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600" :
                      agreement.status === 'Con Observaciones' ? "bg-rose-50 dark:bg-rose-950/20 text-rose-500" :
                      "bg-amber-50 dark:bg-amber-950/20 text-amber-500"
                    )}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-base">{agreement.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                        <span>Cliente: <span className="font-medium text-gray-700 dark:text-gray-300">{agreement.clientName} ({agreement.clientCompanyName || 'Particular'})</span></span>
                        <span className="hidden sm:inline">•</span>
                        <span>Creado: {new Date(agreement.createdAt).toLocaleDateString()}</span>
                        {agreement.signedAt && (
                          <>
                            <span className="hidden sm:inline">•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Firmado: {new Date(agreement.signedAt).toLocaleDateString()}</span>
                          </>
                        )}
                        {agreement.quoteId && (
                          <>
                            <span className="hidden sm:inline">•</span>
                            <span className="text-primary-600 dark:text-primary-400 font-medium">Ref: INT-COT-{agreement.quoteId.replace(/^quote_/, '').substring(0, 8).toUpperCase()}</span>
                          </>
                        )}
                      </div>
                      {agreement.feedback && (
                        <div className="mt-2 text-xs bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-rose-800 dark:text-rose-450 p-2.5 rounded-xl italic">
                          💬 Observaciones del Cliente: "{agreement.feedback}"
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                    {/* Status Badge */}
                    <span className={clsx(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider",
                      agreement.status === 'Firmado' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      agreement.status === 'Con Observaciones' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 animate-pulse" :
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}>
                      {agreement.status === 'Firmado' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {agreement.status === 'Con Observaciones' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {agreement.status === 'Pendiente' && <Clock className="w-3.5 h-3.5" />}
                      {agreement.status === 'Con Observaciones' ? 'Con Cambios' : agreement.status}
                    </span>

                    {/* Copy Signature Link Button */}
                    {agreement.status !== 'Firmado' && (
                      <button
                        onClick={() => copySigningLink(agreement.id)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold transition-colors active:scale-95"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedId === agreement.id ? 'Copiado!' : 'Enlace'}
                      </button>
                    )}

                    {/* Edit Button */}
                    {agreement.status !== 'Firmado' && (
                      <button
                        onClick={() => handleOpenEdit(agreement)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-semibold transition-colors"
                        title="Editar Contrato"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    )}

                    {/* Ver Observaciones Button */}
                    {agreement.status === 'Con Observaciones' && (
                      <button
                        onClick={() => setActiveObservation(agreement)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Ver Cambios
                      </button>
                    )}

                    {/* Send Email Button */}
                    <button
                      onClick={() => handleOpenEmailModal(agreement)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                      title="Enviar Contrato por Correo (Gmail)"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Correo
                    </button>

                    {/* Send WhatsApp Button */}
                    <button
                      onClick={() => handleSendAgreementWhatsApp(agreement)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
                      title="Enviar Contrato por WhatsApp"
                    >
                      <Send className="w-3.5 h-3.5" />
                      WhatsApp
                    </button>

                    {/* Download PDF Button */}
                    <button
                      onClick={() => handleDownloadPDF(agreement)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/30 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      PDF
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => {
                        if (confirm("¿Estás seguro de que deseas eliminar este contrato?")) {
                          deleteAgreement(agreement.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* VISTA CREAR / EDITAR CONTRATO */
        <Card className="p-6 md:p-8 animate-fade-in">
          <button 
            onClick={() => {
              setEditingAgreement(null);
              setSelectedClientId('');
              setSelectedQuoteId('');
              setTitle('');
              setContent('');
              setSelectedTemplate('');
              setAttachments([]);
              setEditorTab('edit');
              setView('list');
            }}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la lista
          </button>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            {editingAgreement ? 'Editar Contrato' : 'Crear Nuevo Contrato'}
          </h2>

          <form onSubmit={handleCreateAgreement} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Select Client */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase">Seleccionar Cliente</label>
                <select 
                  required 
                  value={selectedClientId} 
                  onChange={e => handleClientChange(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Selecciona...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} {client.companyName ? `(${client.companyName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Quote (Reference) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase">Cotización de Referencia (Opcional)</label>
                <select 
                  disabled={!selectedClientId}
                  value={selectedQuoteId} 
                  onChange={(e) => {
                    const qId = e.target.value;
                    setSelectedQuoteId(qId);
                    if (selectedTemplate) {
                      handleTemplateChange(selectedTemplate, selectedClientId, qId);
                    }
                  }}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <option value="">Ninguna cotización...</option>
                  {quotations
                    .filter(q => q && q.clientId === selectedClientId)
                    .map(q => {
                      const cleanFolio = (q.id || '').replace(/^quote_/, '').substring(0, 8).toUpperCase();
                      const totalFormatted = (q.total || 0).toLocaleString();
                      const statusStr = q.status || 'Pendiente';
                      return (
                        <option key={q.id} value={q.id}>
                          INT-COT-{cleanFolio} (${totalFormatted} - {statusStr})
                        </option>
                      );
                    })
                  }
                </select>
              </div>

              {/* Select Template */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase">Plantilla Previa</label>
                <select 
                  disabled={!selectedClientId}
                  value={selectedTemplate} 
                  onChange={e => handleTemplateChange(e.target.value, selectedClientId)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  <option value="">Selecciona cliente primero...</option>
                  <option value="contrato">Contrato de Prestación de Servicios</option>
                  <option value="terminos">Términos y Condiciones de Servicio</option>
                  <option value="libre">Ninguna - Texto Libre</option>
                </select>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase">Título del Contrato</label>
                <input 
                  required
                  type="text" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="Ej. Contrato de Diseño Web"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Checkbox Firma Rep */}
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="includeRepSignature" 
                  checked={includeRepSignature} 
                  onChange={e => setIncludeRepSignature(e.target.checked)} 
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer" 
                />
                <label htmlFor="includeRepSignature" className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase cursor-pointer select-none">
                  Incluir Firma de Representante Legal (Contrato Final)
                </label>
              </div>

            </div>

            {/* Content Textarea Editor */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <label className="text-xs font-semibold text-gray-500 uppercase">Cuerpo del Contrato</label>
                
                {/* Tabs */}
                <div className="flex border border-gray-200 dark:border-dark-border rounded-xl p-1 bg-gray-50 dark:bg-gray-800/50 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setEditorTab('edit')}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      editorTab === 'edit'
                        ? "bg-white dark:bg-gray-805 dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab('preview')}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      editorTab === 'preview'
                        ? "bg-white dark:bg-gray-805 dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Vista Previa
                  </button>
                </div>
              </div>

              {editorTab === 'edit' ? (
                <div className="space-y-2 animate-fade-in">
                  {/* Format Toolbar */}
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-dark-border rounded-xl">
                    <button
                      type="button"
                      onClick={() => insertMarkdown('h1', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Título Grande"
                    >
                      H1 (Grande)
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('h2', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Título Mediano"
                    >
                      H2 (Mediano)
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('h3', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Título Chico"
                    >
                      H3 (Chico)
                    </button>
                    <div className="w-px h-5 bg-gray-200 dark:bg-dark-border mx-1" />
                    <button
                      type="button"
                      onClick={() => insertMarkdown('bold', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm flex items-center gap-1"
                      title="Negrita"
                    >
                      Negrita (**Texto**)
                    </button>
                    <div className="w-px h-5 bg-gray-200 dark:bg-dark-border mx-1" />
                    <button
                      type="button"
                      onClick={() => insertMarkdown('align-left', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Alinear a la izquierda"
                    >
                      Izq
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('align-center', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Centrar texto"
                    >
                      Centro
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('align-right', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Alinear a la derecha"
                    >
                      Der
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdown('align-justify', 'contract-body-editor', setContent)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-750 dark:text-gray-300 rounded-lg shadow-sm"
                      title="Justificar texto"
                    >
                      Justificar
                    </button>
                  </div>

                  <textarea 
                    id="contract-body-editor"
                    required
                    rows={15} 
                    value={content} 
                    onChange={e => setContent(e.target.value)} 
                    placeholder="Redacta el contrato o selecciona una plantilla..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-4 text-sm font-mono leading-relaxed dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              ) : (
                /* Live Preview rendering */
                <div className="w-full bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-dark-border rounded-xl p-6 min-h-[340px] max-h-[450px] overflow-y-auto shadow-inner animate-fade-in">
                  <MarkdownRenderer content={replacePlaceholders(content, clients.find(c => c.id === selectedClientId) || null, companyInfo, selectedQuoteId)} />
                </div>
              )}
              
              <p className="text-xxs text-gray-400 dark:text-gray-500 leading-normal">
                Tip: Al seleccionar una plantilla corporativa, los marcadores como {`{CLIENTE}, {MI_EMPRESA}, {SERVICIO_CONTRATADO}`} se reemplazarán de manera automática por las variables correspondientes guardadas en tu panel.
              </p>
            </div>

            {/* Anexos del Contrato */}
            <div className="space-y-3.5 pt-4 border-t border-gray-150/40 dark:border-dark-border/40 mt-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-primary-500" />
                    Anexos y Documentos Adicionales (Opcional)
                  </h3>
                  <p className="text-xxs text-gray-400 dark:text-gray-500 leading-normal">
                    Carga un archivo PDF o pega directamente un enlace (ej. de Google Drive o Dropbox).
                    <span className="text-primary-500/90 font-semibold ml-1">Nota: Para usar la carga directa de archivos locales, asegúrate de haber inicializado "Firebase Storage" en tu consola.</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddAttachmentRow}
                  className="text-xs font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1 bg-primary-50 dark:bg-primary-950/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Anexo
                </button>
              </div>

              {attachments.length > 0 && (
                <div className="space-y-3 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-150/40 dark:border-dark-border/40 rounded-xl p-4">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex flex-col gap-2.5 border-b border-gray-150/20 dark:border-gray-800/20 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                        <div className="flex-1 w-full flex flex-col sm:flex-row gap-2.5">
                          <input
                            required
                            type="text"
                            value={att.name}
                            onChange={e => handleAttachmentNameChange(idx, e.target.value)}
                            placeholder="Nombre del anexo (ej. Anexo A: Especificaciones)..."
                            className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-xs font-semibold dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <input
                            required
                            type="text"
                            value={att.url}
                            onChange={e => handleAttachmentUrlChange(idx, e.target.value)}
                            placeholder="Enlace URL (ej. Google Drive, Dropbox) o sube un PDF..."
                            className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-xs dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        
                        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-start">
                          {uploadingIndex === idx ? (
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-500 bg-primary-50 dark:bg-primary-950/10 px-3 py-2 rounded-lg border border-primary-150/30">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>({uploadProgress}%)</span>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="file"
                                accept=".pdf"
                                id={`file-upload-${idx}`}
                                onChange={e => {
                                  const files = e.target.files;
                                  if (files && files[0]) {
                                    handleFileChange(idx, files[0]);
                                  }
                                }}
                                className="hidden"
                              />
                              <label
                                htmlFor={`file-upload-${idx}`}
                                className="flex items-center gap-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-dark-border px-2.5 py-2 rounded-lg cursor-pointer transition-colors shadow-sm"
                                title="Subir archivo PDF local"
                              >
                                <Upload className="w-3.5 h-3.5" /> Subir
                              </label>
                            </div>
                          )}

                          {att.url && (
                            <a 
                              href={att.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs font-bold text-primary-500 hover:text-primary-600 bg-primary-50 dark:bg-primary-950/20 px-2.5 py-2 rounded-lg border border-primary-150/30 flex items-center gap-0.5"
                              title="Ver enlace"
                            >
                              Ver
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveAttachmentRow(idx)}
                            className="p-2 text-gray-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={!selectedClientId || !title || !content}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold transition-all flex justify-center items-center gap-2 shadow-lg shadow-primary-500/20"
            >
              <Send className="w-5 h-5" />
              {editingAgreement ? 'Guardar Cambios del Contrato' : 'Generar Contrato y Crear Enlace'}
            </button>
          </form>
        </Card>
      )}

      {/* Observation Modal */}
      {activeObservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-lg p-6 relative">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-dark-border pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Observaciones del Cliente
              </h3>
              <button onClick={() => setActiveObservation(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-dark-border">
                <p className="text-sm text-gray-800 dark:text-gray-300 font-medium italic whitespace-pre-wrap">
                  "{activeObservation.feedback || 'El cliente no especificó comentarios.'}"
                </p>
              </div>
              <div className="text-xs text-gray-500 flex justify-between">
                <span>Fecha de rechazo: {activeObservation.rejectedAt ? new Date(activeObservation.rejectedAt).toLocaleString() : 'N/A'}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Nota: Para aplicar estas observaciones, puedes editar el contrato o crear uno nuevo reemplazando los términos solicitados por el cliente.
              </p>
              <button 
                onClick={() => {
                  // Pre-fill form with this contract's data to allow editing/correcting
                  setSelectedClientId(activeObservation.clientId);
                  setTitle(activeObservation.title);
                  setContent(activeObservation.content);
                  setSelectedTemplate('libre');
                  deleteAgreement(activeObservation.id); // delete old one to replace it
                  setActiveObservation(null);
                  setView('create');
                }} 
                className="w-full py-2.5 bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Editar y Corregir Contrato
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Enviar Contrato por Correo (Gmail) */}
      {emailModalAgreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <Card className="max-w-md w-full p-6 bg-white dark:bg-dark-card rounded-3xl border border-gray-100 dark:border-dark-border shadow-2xl space-y-5 relative">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Mail className="w-5 h-5" />
                <h3 className="text-base font-bold">Enviar Contrato por Gmail</h3>
              </div>
              <button 
                onClick={() => setEmailModalAgreement(null)} 
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
                  placeholder="Ej. Te compartimos el contrato solicitado para tu revisión y firma digital..."
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
                onClick={handleSendAgreementEmail}
                className="w-full bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-700 hover:to-primary-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
              >
                {sendingEmail ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{sendingEmail ? "Despachando por Gmail API..." : "🚀 Enviar Contrato por Correo"}</span>
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// Placeholder component for X button inside Modal Header since lucide X was not imported
const X = ({ className, onClick }: { className?: string, onClick?: () => void }) => (
  <svg onClick={onClick} className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

export default Agreements;
