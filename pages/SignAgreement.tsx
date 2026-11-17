import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Agreement, Client, CompanyInfo } from '../types';
import { Card } from '../components/ui/Card';
import { FileSignature, CheckCircle2, AlertTriangle, FileDown, MessageCircle, X, Check, RefreshCw, Lock, Paperclip } from 'lucide-react';
import { generateAgreementPDF } from '../utils/contractPdfGenerator';
import clsx from 'clsx';
import { MarkdownRenderer } from '../utils/markdownParser';
import { replacePlaceholders } from '../utils/placeholderResolver';
import { sendTelegramDocumentSignedNotification } from '../services/telegramService';

const SignAgreement: React.FC = () => {
  const { agreementId } = useParams<{ agreementId: string }>();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Signing states
  const [signerName, setSignerName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ipAddress, setIpAddress] = useState('Local / Desconocida');
  const [signingMethod, setSigningMethod] = useState<'draw' | 'type'>('draw');
  const [signerEmail, setSignerEmail] = useState('');
  
  // Negotiation states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [finishedSigning, setFinishedSigning] = useState(false);
  
  // Review confirmation states
  const [isReviewConfirmed, setIsReviewConfirmed] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // HTML5 Canvas Drawing Pad State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasHasDrawing, setCanvasHasDrawing] = useState(false);

  // Load agreement and related info
  useEffect(() => {
    const fetchData = async () => {
      if (!agreementId) {
        setLoading(false);
        return;
      }
      try {
        // 1. Get Agreement
        const agreementDoc = await getDoc(doc(db, "agreements", agreementId));
        if (agreementDoc.exists()) {
          const agreementData = agreementDoc.data() as Agreement;
          const fullAgreement: Agreement = {
            id: agreementDoc.id,
            ...agreementData
          };
          setAgreement(fullAgreement);
          setIsReviewConfirmed(agreementData.reviewConfirmed || false);

          let repName = agreementData.clientName;

          // 2. Get Client details
          const clientDoc = await getDoc(doc(db, "clients", agreementData.clientId));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data() as Client;
            setClient(clientData);
            if (clientData.legalRepresentative) {
              repName = clientData.legalRepresentative;
            }
          }
          setSignerName(repName);

          // 3. Get Company details
          const companyDoc = await getDoc(doc(db, "settings", "company_info"));
          if (companyDoc.exists()) {
            setCompany(companyDoc.data() as CompanyInfo);
          }
        }
      } catch (err) {
        console.error("Error loading agreement details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [agreementId, finishedSigning]);

  // Fetch Public IP Address of the client
  useEffect(() => {
    const fetchIp = async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (data && data.ip) {
          setIpAddress(data.ip);
        }
      } catch (e) {
        console.log("Could not fetch public IP address, fallback to local.");
      }
    };
    fetchIp();
  }, []);

  // Canvas Drawing Pad Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!agreement || !agreement.includeRepSignature || agreement.status === 'Firmado' || agreement.status === 'Con Observaciones') {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e293b'; // Slate 800 (Dark ink)
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pos = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    if (!agreement || !agreement.includeRepSignature || agreement.status === 'Firmado' || agreement.status === 'Con Observaciones') {
      setIsDrawing(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCoordinates(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setCanvasHasDrawing(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasHasDrawing(false);
  };

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, 
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      // Touch event
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Scale coordinates based on canvas resolution and display size
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  // Cursive typed signature image generator helper
  const generateTypedSignatureImage = (name: string, email: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 450;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw a subtle border
    ctx.strokeStyle = '#e2e8f0'; // slate 200
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Cursive Font styling
    ctx.font = 'italic 28px "Georgia", "Times New Roman", serif';
    ctx.fillStyle = '#1e3a8a'; // dark blue
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 - 10);

    // Underline
    ctx.strokeStyle = '#94a3b8'; // slate 400
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, canvas.height / 2 + 15);
    ctx.lineTo(canvas.width - 80, canvas.height / 2 + 15);
    ctx.stroke();

    // Legal verification text
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = '#64748b'; // slate 500
    ctx.fillText(`Firmado electrónicamente por: ${name}`, canvas.width / 2, canvas.height / 2 + 35);
    ctx.fillText(`Email: ${email} | IP: ${ipAddress}`, canvas.width / 2, canvas.height / 2 + 47);
    ctx.fillText(`Fecha: ${new Date().toLocaleString()} | Origen: Panel Digital`, canvas.width / 2, canvas.height / 2 + 59);

    return canvas.toDataURL('image/png');
  };

  // Confirm Review Action (When representative signature is not included)
  const handleConfirmReview = async () => {
    if (!agreementId) return;

    setIsSubmitting(true);
    try {
      const updateData: Partial<Agreement> = {
        status: 'Pendiente', // Keep as pending so they can view it
        reviewConfirmed: true,
        feedback: 'El cliente ha revisado el borrador del contrato y confirma su conformidad.'
      };

      await updateDoc(doc(db, "agreements", agreementId), updateData);
      setIsReviewConfirmed(true);
      setShowSuccessModal(true);
    } catch (err) {
      console.error("Error confirming agreement review:", err);
      alert("Hubo un error al registrar tu conformidad. Por favor inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign Action
  const handleSignAgreement = async () => {
    if (!agreementId || !signerName || !acceptedTerms) return;
    if (signingMethod === 'draw' && !canvasHasDrawing) return;
    if (signingMethod === 'type' && !signerEmail.trim()) {
      alert("Por favor ingresa tu correo electrónico.");
      return;
    }

    setIsSubmitting(true);
    try {
      let signatureDataUrl = '';
      if (signingMethod === 'draw') {
        const canvas = canvasRef.current;
        if (canvas) {
          signatureDataUrl = canvas.toDataURL('image/png');
        }
      } else {
        signatureDataUrl = generateTypedSignatureImage(signerName, signerEmail);
      }
      
      const updateData: Partial<Agreement> = {
        status: 'Firmado',
        signedAt: new Date().toISOString(),
        clientIP: ipAddress,
        signedByName: signerName,
        signatureDataUrl: signatureDataUrl
      };

      await updateDoc(doc(db, "agreements", agreementId), updateData);
      setFinishedSigning(true);

      // Send instant Telegram notification
      sendTelegramDocumentSignedNotification(
        agreement?.title || 'Contrato Comercial',
        signerName,
        'Cliente / Contraparte',
        signerEmail,
        new Date().toISOString(),
        ipAddress,
        true,
        1,
        1
      ).catch(err => console.error("Error sending agreement sign notification to Telegram:", err));
    } catch (err) {
      console.error("Error signing agreement:", err);
      alert("Hubo un error al firmar el contrato. Por favor inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reject Action
  const handleRejectAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreementId || !rejectComments.trim()) return;

    setIsSubmitting(true);
    try {
      const updateData: Partial<Agreement> = {
        status: 'Con Observaciones',
        feedback: rejectComments,
        rejectedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "agreements", agreementId), updateData);
      setShowRejectModal(false);
      setRejectComments('');
      setFinishedSigning(true);
    } catch (err) {
      console.error("Error rejecting agreement:", err);
      alert("Hubo un error al enviar tus comentarios.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!agreement || !client || !company) return;
    await generateAgreementPDF(agreement, client, company);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Cargando acuerdo digital...</p>
        </div>
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-dark-bg p-4">
        <Card className="max-w-md p-8 text-center flex flex-col items-center">
          <AlertTriangle className="w-16 h-16 text-rose-500 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Acuerdo No Encontrado</h3>
          <p className="text-sm text-gray-500 mt-2">
            El enlace que abriste no es válido o el acuerdo ha sido eliminado por el administrador.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f172a] text-gray-900 dark:text-white p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Logo */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white dark:bg-dark-surface p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm gap-3 text-center sm:text-right">
          <img 
            src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/3.png" 
            alt="Interpres Logo" 
            className="h-8 sm:h-10 w-auto object-contain"
          />
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3">
            {agreement && !agreement.includeRepSignature && (
              <span className="text-[9px] sm:text-[10px] font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-600 border border-amber-200 dark:border-amber-900/30 px-2.5 py-1 rounded-full uppercase tracking-wider select-none animate-pulse">
                Borrador de Revisión
              </span>
            )}
            <span className="text-xs text-gray-450 dark:text-gray-500 font-medium hidden sm:inline">
              Acuerdo de Conformidad Digital
            </span>
          </div>
        </div>

        {/* Agreement Main View */}
        <Card className="p-6 md:p-10 space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-bl-full pointer-events-none" />

          {/* Title & Status */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-gray-100 dark:border-dark-border">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-950 dark:text-white tracking-tight">
                {agreement.title}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Por favor, lee el acuerdo detenidamente antes de firmar.
              </p>
            </div>
            <span className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider",
              agreement.status === 'Firmado' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
              agreement.status === 'Con Observaciones' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
              "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {agreement.status === 'Firmado' ? 'Firmado' : agreement.status === 'Con Observaciones' ? 'Con Observaciones' : 'Pendiente de Firma'}
            </span>
          </div>

          {/* Audit Notification if signed / observations */}
          {agreement.status === 'Firmado' && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 animate-fade-in">
              <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
              <div>
                <span className="font-bold text-sm block">✓ Acuerdo Firmado Electrónicamente</span>
                <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                  Este contrato es un documento legal cerrado. Puedes descargarlo en formato PDF en el botón de abajo.
                </span>
              </div>
            </div>
          )}

          {agreement.status === 'Con Observaciones' && (
            <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-900/30 animate-fade-in">
              <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              <div>
                <span className="font-bold text-sm block">Observaciones Enviadas al Administrador</span>
                <span className="text-xs text-rose-600/80 dark:text-rose-400/80">
                  Has enviado observaciones para este acuerdo. El administrador del panel las revisará para modificar los términos.
                </span>
              </div>
            </div>
          )}

          {/* Metadata Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/50 dark:bg-gray-800/30 p-5 rounded-2xl border border-gray-100 dark:border-dark-border">
            <div className="space-y-2">
              <span className="text-xxs font-bold text-gray-400 uppercase tracking-widest block">Parte Prestadora</span>
              {company ? (
                <div className="text-xs space-y-1">
                  <p className="font-bold text-gray-900 dark:text-white">{company.businessName || company.commercialName}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Nombre Comercial:</span> {company.commercialName || company.businessName}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">RFC:</span> {company.rfc || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Dirección:</span> {company.address || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Email:</span> {company.email || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Sitio Web:</span> {company.website || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Representante:</span> {company.legalRepresentative || 'N/A'}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Cargando datos corporativos...</p>
              )}
            </div>
            <div className="space-y-2">
              <span className="text-xxs font-bold text-gray-400 uppercase tracking-widest block">Parte Cliente</span>
              {client ? (
                <div className="text-xs space-y-1">
                  <p className="font-bold text-gray-900 dark:text-white">{client.businessName || client.name}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Nombre Comercial:</span> {client.companyName || client.businessName || client.name}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">RFC:</span> {client.rfc || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Dirección:</span> {client.address || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Email:</span> {client.email || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Sitio Web:</span> {client.website || 'N/A'}</p>
                  <p className="text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Representante Legal:</span> {client.legalRepresentative || 'N/A'}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Cargando datos del cliente...</p>
              )}
            </div>
          </div>

          {/* Contract Content Body */}
          <div className="p-6 md:p-8 bg-white dark:bg-[#0f172a] rounded-2xl border border-gray-150 dark:border-dark-border min-h-[400px] max-h-[65vh] md:max-h-[750px] overflow-y-auto shadow-inner font-sans">
            <MarkdownRenderer content={replacePlaceholders(agreement.content, client, company, agreement.quoteId)} />
          </div>

          {/* Anexos y Documentos Adjuntos (Si existen) */}
          {agreement.attachments && agreement.attachments.length > 0 && (
            <div className="space-y-4 pt-6 border-t border-gray-100 dark:border-dark-border">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wider flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary-500" />
                Documentos Anexos y Adjuntos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {agreement.attachments.map((att, idx) => (
                  <div 
                    key={idx} 
                    className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-150 dark:border-dark-border rounded-2xl hover:bg-gray-100/50 dark:hover:bg-slate-800/50 transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-rose-55/10 dark:bg-rose-950/20 text-rose-500 rounded-xl flex-shrink-0">
                        <FileDown className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate" title={att.name}>
                          {att.name}
                        </p>
                        <p className="text-[10px] text-gray-450 uppercase font-semibold">Documento PDF</p>
                      </div>
                    </div>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <FileDown className="w-4 h-4 text-white" />
                      <span>Descargar PDF</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SIGNATURE AREA (IF PENDING) */}
          {agreement.status === 'Pendiente' && (
            <div className="pt-6 border-t border-gray-100 dark:border-dark-border space-y-6">
              
              {/* Header / Title block */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-50 dark:bg-primary-950/20 text-primary-500 rounded-xl">
                    <FileSignature className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">Firma del Acuerdo</h3>
                    <p className="text-xs text-gray-400">Completa tu conformidad y firma digital de este acuerdo de servicio.</p>
                  </div>
                </div>
              </div>

              {/* Selector de Método de Firma (Visual y Explicativo) */}
              <div className="space-y-3">
                <label className="text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">
                  Elige cómo quieres firmar: dibujar firma o escribir nombre
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card Dibujar */}
                  <button
                    type="button"
                    disabled={!agreement.includeRepSignature}
                    onClick={() => setSigningMethod('draw')}
                    className={clsx(
                      "p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-28 focus:outline-none",
                      signingMethod === 'draw'
                        ? "border-primary-500 bg-primary-500/5 dark:bg-primary-500/10 ring-2 ring-primary-500"
                        : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-gray-300 dark:hover:border-slate-700",
                      !agreement.includeRepSignature && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">Dibujar Firma</span>
                      <div className={clsx(
                        "w-4 h-4 rounded-full border flex items-center justify-center",
                        signingMethod === 'draw' ? "border-primary-500 bg-primary-500 text-white" : "border-gray-300"
                      )}>
                        {signingMethod === 'draw' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                      Usa tu dedo, lápiz óptico o mouse para trazar tu firma manuscrita directamente en la pantalla.
                    </p>
                  </button>

                  {/* Card Escribir */}
                  <button
                    type="button"
                    disabled={!agreement.includeRepSignature}
                    onClick={() => setSigningMethod('type')}
                    className={clsx(
                      "p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-28 focus:outline-none",
                      signingMethod === 'type'
                        ? "border-primary-500 bg-primary-500/5 dark:bg-primary-500/10 ring-2 ring-primary-500"
                        : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:border-gray-300 dark:hover:border-slate-700",
                      !agreement.includeRepSignature && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">Escribir Nombre</span>
                      <div className={clsx(
                        "w-4 h-4 rounded-full border flex items-center justify-center",
                        signingMethod === 'type' ? "border-primary-500 bg-primary-500 text-white" : "border-gray-300"
                      )}>
                        {signingMethod === 'type' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                      Escribe tu nombre y correo para generar una firma digital con validez legal e historial de auditoría.
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Inputs and declarations */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Nombre Completo del Firmante</label>
                    <input
                      type="text"
                      disabled={!agreement.includeRepSignature}
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder={!agreement.includeRepSignature ? "Firma bloqueada - Contrato en revisión" : "Ej. Juan Pérez García"}
                      className="block w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Correo Electrónico del Firmante <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      disabled={!agreement.includeRepSignature}
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder={!agreement.includeRepSignature ? "Firma bloqueada - Contrato en revisión" : "ejemplo@correo.com"}
                      className={clsx(
                        "block w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border outline-none transition-all focus:ring-4 font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed",
                        agreement.includeRepSignature && !signerEmail.trim()
                          ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/10 dark:border-rose-900/50"
                          : "border-gray-200 dark:border-dark-border focus:border-primary-500 focus:ring-primary-500/10 dark:text-white"
                      )}
                    />
                    {agreement.includeRepSignature && !signerEmail.trim() && (
                      <p className="text-[11px] text-rose-500 font-semibold animate-pulse mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> El correo electrónico es obligatorio para poder firmar.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-gray-400">
                    <p><span className="font-semibold text-gray-600 dark:text-gray-300">IP de Registro:</span> {ipAddress}</p>
                    <p><span className="font-semibold text-gray-600 dark:text-gray-300">Marca de tiempo:</span> {new Date().toLocaleString()}</p>
                  </div>

                  <label className={clsx(
                    "flex items-start gap-3 p-3.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-dark-border cursor-pointer transition-all",
                    !agreement.includeRepSignature ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-100/50"
                  )}>
                    <input
                      type="checkbox"
                      disabled={!agreement.includeRepSignature}
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 leading-normal select-none">
                      Acepto que mi firma electrónica y la captura de mi dirección IP sirven como prueba legal de conformidad con los términos y condiciones de este contrato digital.
                    </span>
                  </label>
                </div>

                {/* Draw Signature Canvas Panel */}
                {signingMethod === 'draw' ? (
                  <div className="space-y-2 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Firma Manuscrita (Dibuja aquí)</label>
                      <button
                        onClick={clearCanvas}
                        disabled={!agreement.includeRepSignature}
                        type="button"
                        className="flex items-center gap-1 text-rose-500 hover:text-rose-700 text-xs font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className="w-3 h-3" /> Limpiar
                      </button>
                    </div>

                    <div className="bg-gray-50 dark:bg-[#0f172a] rounded-2xl border border-gray-200 dark:border-dark-border shadow-inner overflow-hidden flex justify-center items-center h-48 relative">
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={200}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className={clsx("w-full h-full bg-white", !agreement.includeRepSignature ? "cursor-not-allowed opacity-50" : "cursor-crosshair")}
                      />
                      {!agreement.includeRepSignature && (
                        <div className="absolute inset-0 bg-gray-900/10 dark:bg-slate-900/40 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none">
                          <span className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-md text-gray-500 mb-1">
                            <Lock className="w-5 h-5" />
                          </span>
                          <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Firma Bloqueada</span>
                        </div>
                      )}
                      {!canvasHasDrawing && agreement.includeRepSignature && (
                        <span className="absolute text-gray-300 dark:text-gray-600 pointer-events-none text-xs font-medium uppercase tracking-wider select-none">
                          Firma electrónica aquí
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Cursive Text Signature Live Preview Panel */
                  <div className="space-y-2 animate-fade-in">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Vista Previa de Firma Electrónica Autorizada</label>
                    <div className={clsx(
                      "bg-white rounded-2xl border border-gray-200 shadow-inner flex flex-col justify-center items-center h-48 relative p-4 text-center border-dashed border-2",
                      !agreement.includeRepSignature && "opacity-50"
                    )}>
                      {!agreement.includeRepSignature ? (
                        <div className="absolute inset-0 bg-gray-900/5 dark:bg-slate-900/30 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none rounded-2xl">
                          <span className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-md text-gray-500 mb-1">
                            <Lock className="w-5 h-5" />
                          </span>
                          <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Firma Bloqueada</span>
                        </div>
                      ) : (
                        <>
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest absolute top-2.5">Autenticación Digital Nom-151</span>
                          <p className="font-serif italic text-2xl text-blue-900 tracking-wide select-none py-1">
                            {signerName || 'Escribe tu nombre'}
                          </p>
                          <div className="w-2/3 border-t border-slate-200 my-1" />
                          <p className="text-[8px] font-mono text-slate-500">
                            AUDIT HASH: IP {ipAddress} | EMAIL: {signerEmail || 'N/A'}
                          </p>
                          <p className="text-[7px] font-mono text-slate-400 uppercase leading-normal">
                            Firmado electrónicamente con plena validez y efectos legales
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Action and Confirmation Buttons Section */}
              <div className="flex flex-col gap-4 pt-4 border-t border-gray-150 dark:border-dark-border">
                {agreement.includeRepSignature ? (
                  /* CASE A: CONTRATO HABILITADO PARA FIRMAR */
                  <div className="flex flex-col gap-4">
                    
                    {/* Warning checklist banner */}
                    {agreement.includeRepSignature && (!signerName.trim() || !signerEmail.trim() || !acceptedTerms || (signingMethod === 'draw' && !canvasHasDrawing)) && (
                      <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 border border-rose-150 dark:border-rose-900/30 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
                        <div>
                          <p className="font-bold">Faltan datos obligatorios por completar:</p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 ml-1 font-medium">
                            {!signerName.trim() && <li>Ingresa tu nombre completo.</li>}
                            {!signerEmail.trim() && <li>Ingresa tu correo electrónico.</li>}
                            {(signingMethod === 'draw' && !canvasHasDrawing) && <li>Dibuja tu firma manuscrita en el recuadro.</li>}
                            {!acceptedTerms && <li>Acepta la casilla de conformidad legal.</li>}
                          </ul>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleSignAgreement}
                        disabled={
                          isSubmitting || 
                          !signerName.trim() || 
                          !signerEmail.trim() || 
                          !acceptedTerms || 
                          (signingMethod === 'draw' && !canvasHasDrawing)
                        }
                        className="flex-1 flex justify-center items-center gap-2 py-4 px-6 bg-gradient-to-r from-primary-600 to-primary-800 hover:from-primary-700 hover:to-primary-900 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
                      >
                        <Check className="w-5 h-5" />
                        {isSubmitting ? 'Guardando firma...' : 'Firmar Acuerdo'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRejectModal(true)}
                        className="py-4 px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-350 font-bold rounded-xl text-sm transition-colors"
                      >
                        Solicitar Cambios / Observaciones
                      </button>
                    </div>
                  </div>
                ) : (
                  /* CASE B: CONTRATO SOLO PARA REVISIÓN (LECTURA Y CONFORMIDAD) */
                  <div className="space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-950/10 border border-amber-250 dark:border-amber-900/30 p-4 rounded-xl flex gap-3 text-xs text-amber-800 dark:text-amber-300 font-medium">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
                      <div>
                        <p className="font-bold text-amber-600 dark:text-amber-400">Firma deshabilitada - Solo Lectura y Revisión</p>
                        <p className="mt-1 leading-relaxed">
                          Este contrato es una propuesta en fase de revisión. La firma definitiva se habilitará cuando confirmes tu conformidad con los términos o solicites ajustes.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleConfirmReview}
                        disabled={isSubmitting || isReviewConfirmed}
                        className="flex-1 flex justify-center items-center gap-2 py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Check className="w-5 h-5" />
                        {isReviewConfirmed ? 'Acuerdo Confirmado ✓' : 'Confirmar Acuerdo (Solo Lectura)'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRejectModal(true)}
                        className="py-4 px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-305 font-bold rounded-xl text-sm transition-colors"
                      >
                        Solicitar Cambios / Observaciones
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* SIGNATURE AREA (IF SIGNED - DISPLAY METADATA) */}
          {agreement.status === 'Firmado' && (
            <div className="pt-6 border-t border-gray-100 dark:border-dark-border space-y-6">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">Evidencia y Firma de Conformidad</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-800/30 p-5 rounded-2xl border border-gray-200 dark:border-dark-border">
                <div className="text-xs space-y-2.5">
                  <p className="font-bold text-gray-400 uppercase tracking-wider text-xxs">Registro de Auditoría de Origen</p>
                  <p><span className="font-semibold text-gray-600 dark:text-gray-300">Nombre del Firmante:</span> {agreement.signedByName || agreement.clientName}</p>
                  <p><span className="font-semibold text-gray-600 dark:text-gray-300">IP de origen:</span> {agreement.clientIP || 'Local / Desconocida'}</p>
                  <p><span className="font-semibold text-gray-600 dark:text-gray-300">Fecha y Hora:</span> {agreement.signedAt ? new Date(agreement.signedAt).toLocaleString() : 'N/A'}</p>
                  <p><span className="font-semibold text-gray-600 dark:text-gray-300">Aceptación legal:</span> Conforme de manera electrónica (origen digital).</p>
                </div>

                <div className="flex flex-col justify-center items-center gap-2">
                  <span className="text-xxs font-bold text-gray-400 uppercase tracking-wider">Firma Manuscrita Registrada</span>
                  <div className="bg-white p-2 rounded-xl border border-gray-200 flex justify-center items-center h-28 w-56 shadow-sm">
                    {agreement.signatureDataUrl ? (
                      <img src={agreement.signatureDataUrl} alt="Firma digitalizada" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-gray-400 italic">No disponible</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleDownloadPDF}
                className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary-500/20"
              >
                <FileDown className="w-5 h-5" />
                Descargar Contrato en PDF
              </button>
            </div>
          )}

        </Card>

      </div>

      {/* Reject/Observations Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-lg p-6 relative">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-dark-border pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-rose-500" />
                Observaciones y Cambios
              </h3>
              <button onClick={() => setShowRejectModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleRejectAgreement} className="space-y-4">
              <p className="text-xs text-gray-500">
                Detalla a continuación cuáles son las cláusulas o aspectos que deseas modificar o corregir del contrato para que el administrador pueda revisarlas.
              </p>
              
              <textarea
                required
                rows={5}
                value={rejectComments}
                onChange={e => setRejectComments(e.target.value)}
                placeholder="Ej. Me gustaría cambiar la cláusula tercera para agregar..."
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-3 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !rejectComments.trim()}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md shadow-rose-500/20"
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar Observaciones'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* SUCCESS MODAL FOR READ-ONLY AGREEMENT CONFIRMATION */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <Card className="w-full max-w-md p-6 space-y-6 bg-white dark:bg-dark-surface border border-gray-150 dark:border-dark-border shadow-2xl relative">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 rounded-full animate-bounce">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">¡Acuerdo Confirmado!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Has confirmado tu conformidad con los términos de este contrato. En breve te enviaremos el contrato final firmado por Interpres Digital para proceder con la firma definitiva.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg transition-all text-sm hover:scale-[1.02] active:scale-[0.98]"
              >
                Entendido
              </button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

export default SignAgreement;
