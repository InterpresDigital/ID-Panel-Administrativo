import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { LegalDocument, DocumentSigner } from '../types';
import { Card } from '../components/ui/Card';
import { FileSignature, CheckCircle2, AlertTriangle, Download, RefreshCw, Lock, HelpCircle, User, Check, X, ShieldAlert, Share2 } from 'lucide-react';
import clsx from 'clsx';
import { MarkdownRenderer } from '../utils/markdownParser';
import { getAppBaseUrl, ensureAbsoluteUrl } from '../utils/urlUtils';
import { sendTelegramDocumentSignedNotification } from '../services/telegramService';

const SignLegalDocument: React.FC = () => {
  const { docId, signerIndex } = useParams<{ docId: string; signerIndex: string }>();
  const idx = parseInt(signerIndex || '0', 10);

  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Verification State
  const [emailInput, setEmailInput] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  // Signing states
  const [signerName, setSignerName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ipAddress, setIpAddress] = useState('Local / Desconocida');
  const [signingMethod, setSigningMethod] = useState<'draw' | 'type'>('draw');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [finishedSigning, setFinishedSigning] = useState(false);
  
  const [verifiedSignerIndex, setVerifiedSignerIndex] = useState<number | null>(null);
  const activeIdx = verifiedSignerIndex !== null ? verifiedSignerIndex : idx;

  // HTML5 Canvas Drawing Pad State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasHasDrawing, setCanvasHasDrawing] = useState(false);

  // Load document and details
  useEffect(() => {
    const fetchDoc = async () => {
      if (!docId) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "legal_documents", docId));
        if (snap.exists()) {
          const data = snap.data() as LegalDocument;
          const fullDoc: LegalDocument = {
            id: snap.id,
            ...data
          };
          setLegalDoc(fullDoc);
          
          const signer = fullDoc.signers?.[activeIdx];
          if (signer) {
            setSignerName(signer.name);
            // If already signed, auto verify to show success/details
            if (signer.hasSigned) {
              setIsVerified(true);
            }
          }
        }
      } catch (err) {
        console.error("Error loading legal doc:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [docId, activeIdx, finishedSigning]);

  // Fetch Public IP Address
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

  const maskEmail = (email: string) => {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [name, domain] = parts;
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
  };

  const handleVerifyEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalDoc) return;
    
    const inputLower = emailInput.trim().toLowerCase();

    // 1. Search exact email in registered signers
    let matchedIdx = legalDoc.signers.findIndex(
      s => s.email.trim().toLowerCase() === inputLower
    );

    // 2. Failsafe for Administrator / Provider emails (e.g. admin@interpresdigital.com, emiliano@..., companyInfo.email)
    if (matchedIdx === -1) {
      const isProviderEmail = 
        inputLower.includes('interpresdigital.com') ||
        inputLower.includes('experienciainfinity@gmail.com') ||
        (companyInfo?.email && companyInfo.email.trim().toLowerCase() === inputLower);

      if (isProviderEmail) {
        const providerIdx = legalDoc.signers.findIndex(
          s => s.role.toLowerCase().includes('prestador') || s.role.toLowerCase().includes('agencia') || s.role.toLowerCase().includes('empresa')
        );
        matchedIdx = providerIdx !== -1 ? providerIdx : (activeIdx < legalDoc.signers.length ? activeIdx : 0);
      }
    }

    if (matchedIdx !== -1) {
      setVerifiedSignerIndex(matchedIdx);
      setIsVerified(true);
      setVerificationError('');
    } else {
      const validEmailsHint = legalDoc.signers.map(s => maskEmail(s.email)).join(', ');
      setVerificationError(`El correo ingresado no coincide con ningún firmante. Correos registrados: ${validEmailsHint}`);
    }
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPDF = async () => {
    if (!legalDoc) return;
    setDownloadingPdf(true);
    try {
      const { generateLegalDocumentPDF } = await import('../utils/legalDocumentPdfGenerator');
      await generateLegalDocumentPDF({
        ...legalDoc,
        id: legalDoc.id || docId || ''
      });
    } catch (err) {
      console.error("Error generating legal doc PDF:", err);
      alert("Hubo un error al generar el PDF del documento. Por favor intenta de nuevo.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleShareLink = () => {
    if (!legalDoc) return;
    const shareText = `Hola, te comparto el documento legal "${legalDoc.title}" de Interpres Digital para que lo revises y firmes:`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      navigator.share({
        title: legalDoc.title,
        text: shareText,
        url: shareUrl
      }).catch(err => console.log("Web Share canceled or failed", err));
    } else {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
      window.open(waUrl, '_blank');
    }
  };

  // Canvas Drawing Pad Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!legalDoc || legalDoc.signers[activeIdx]?.hasSigned) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e293b'; // Slate 800
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
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  // Cursive typed signature generator helper
  const generateTypedSignatureImage = (name: string, email: string): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 450;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Cursive typography name
    ctx.fillStyle = '#1e3a8a'; // Dark blue ink
    ctx.font = 'italic 30px "Brush Script MT", cursive, "Caveat", Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 - 5);

    // Audit email / stamp meta
    ctx.fillStyle = '#64748b'; // Slate 500
    ctx.font = '9px monospace';
    ctx.fillText(`Firmado electrónicamente por: ${email}`, canvas.width / 2, canvas.height / 2 + 35);
    ctx.fillText(`IP: ${ipAddress} | Marca de tiempo: ${new Date().toLocaleString()}`, canvas.width / 2, canvas.height / 2 + 50);

    return canvas.toDataURL('image/png');
  };

  const handleSignDocument = async () => {
    if (!legalDoc) return;
    const signer = legalDoc.signers[activeIdx];
    if (!signer || signer.hasSigned) return;

    if (!acceptedTerms) {
      alert("Debes aceptar los términos y condiciones del acuerdo digital para poder firmar.");
      return;
    }

    let signatureDataUrl = '';

    if (signingMethod === 'draw') {
      if (!canvasHasDrawing) {
        alert("Por favor estampa tu firma manuscrita en el panel de dibujo.");
        return;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        signatureDataUrl = canvas.toDataURL('image/png');
      }
    } else {
      if (!signerName.trim()) {
        alert("Por favor escribe tu nombre completo para la firma electrónica.");
        return;
      }
      signatureDataUrl = generateTypedSignatureImage(signerName, signer.email);
    }

    setIsSubmitting(true);

    try {
      // Create updated signers list
      const updatedSigners = legalDoc.signers.map((s, sIdx) => {
        if (sIdx === activeIdx) {
          return {
            ...s,
            hasSigned: true,
            signedAt: new Date().toISOString(),
            ipAddress: ipAddress,
            signatureDataUrl: signatureDataUrl
          };
        }
        return s;
      });

      // Determine new general status
      const allSigned = updatedSigners.every(s => s.hasSigned);
      const newStatus = allSigned ? 'Firmado' : legalDoc.status;

      const updatePayload: Partial<LegalDocument> = {
        signers: updatedSigners,
        status: newStatus
      };

      await updateDoc(doc(db, "legal_documents", docId!), updatePayload);
      setLegalDoc(prev => prev ? { ...prev, signers: updatedSigners, status: newStatus, id: prev.id || docId || '' } : null);
      setFinishedSigning(true);

      // Send instant Telegram notification
      const currentSigner = legalDoc.signers[activeIdx];
      const signedCount = updatedSigners.filter(s => s.hasSigned).length;
      sendTelegramDocumentSignedNotification(
        legalDoc.title,
        signerName || currentSigner.name,
        currentSigner.role,
        currentSigner.email,
        new Date().toISOString(),
        ipAddress,
        allSigned,
        signedCount,
        updatedSigners.length
      ).catch(err => console.error("Error sending sign notification:", err));
    } catch (err) {
      console.error("Error signing legal document:", err);
      alert("Hubo un error al procesar tu firma electrónica.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Cargando documento digital...</p>
        </div>
      </div>
    );
  }

  if (!legalDoc || !legalDoc.signers[activeIdx]) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-dark-bg p-4">
        <Card className="max-w-md p-8 text-center flex flex-col items-center">
          <AlertTriangle className="w-16 h-16 text-rose-500 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Documento No Encontrado</h3>
          <p className="text-sm text-gray-500 mt-2">
            El enlace que abriste no es válido o el documento ha sido eliminado por el administrador.
          </p>
        </Card>
      </div>
    );
  }

  const currentSigner = legalDoc.signers[activeIdx];

  // Success screen if signed successfully
  if (currentSigner.hasSigned) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f172a] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6 animate-scale-up">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 shadow-xs">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-gray-950 dark:text-white">¡Acuerdo Firmado Correctamente!</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Muchas gracias, <strong className="text-gray-800 dark:text-gray-200">{currentSigner.name}</strong>. Has estampado tu firma digital en el documento legal como <strong>{currentSigner.role}</strong>.
            </p>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-150 dark:border-dark-border text-[10px] text-gray-500 font-semibold text-left space-y-1.5">
            <p className="font-bold text-gray-700 dark:text-white border-b pb-1">DATOS DE AUDITORÍA REGISTRADOS:</p>
            <p>• Correo electrónico: {currentSigner.email}</p>
            <p>• Dirección IP: {currentSigner.ipAddress}</p>
            <p>• Sello de Tiempo: {new Date(currentSigner.signedAt!).toLocaleString()}</p>
          </div>

          {currentSigner.signatureDataUrl && (
            <div className="h-20 w-32 bg-white rounded-lg flex items-center justify-center p-1 border border-gray-150 mx-auto">
              <img src={currentSigner.signatureDataUrl} alt="Firma registrada" className="max-h-full max-w-full object-contain" />
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {downloadingPdf ? (
                <>Generando PDF...</>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Descargar PDF con mi Firma
                </>
              )}
            </button>

            <button
              onClick={handleShareLink}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Compartir / Enviar por WhatsApp
            </button>
          </div>

          <p className="text-[10px] text-gray-400">
            Una vez que todas las partes firmen, el administrador cerrará el documento y se podrá descargar el PDF completo con todas las rúbricas y hoja de auditoría final.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#071B36] text-[#102B4B] dark:text-white p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Branding */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white dark:bg-[#0C2548] p-4 sm:p-5 rounded-2xl border border-[#C7D5E2] dark:border-[#1B3C68] shadow-sm gap-3 text-center sm:text-right">
          <div>
            <img 
              src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/NUEVO%20LOGO/Logo%20futurista%20INTERPRES%20DIGITAL%20LABS.png" 
              alt="Interpres Digital Labs" 
              className="h-10 sm:h-11 w-auto object-contain dark:hidden"
            />
            <img 
              src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/NUEVO%20LOGO/Logotipo%20blanco%20de%20Interpres%20Digital%20Labs%20HOR.png" 
              alt="Interpres Digital Labs" 
              className="h-10 sm:h-11 w-auto object-contain hidden dark:block"
            />
          </div>
          <div>
            <span className="text-xxs font-extrabold bg-[#1464B8]/10 dark:bg-[#00A9B7]/20 text-[#1464B8] dark:text-[#7CE8F0] border border-[#1464B8]/30 dark:border-[#00A9B7]/40 px-3 py-1 rounded-full uppercase tracking-wider select-none">
              Firma Electrónica Multilateral
            </span>
          </div>
        </div>

        {/* VERIFICATION GATE SCREEN */}
        {!isVerified ? (
          <Card className="max-w-md mx-auto p-8 space-y-6 animate-scale-up">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-500 rounded-full flex items-center justify-center mx-auto border border-indigo-100">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Verificación de Identidad</h2>
              <p className="text-xxs text-gray-400 font-bold uppercase tracking-wider">Documento: {legalDoc.title}</p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-150 dark:border-dark-border text-xxs font-medium text-slate-500 dark:text-gray-300">
              <p>Hola, <strong className="text-gray-900 dark:text-white">{signerName}</strong>. Para acceder a firmar el documento, por favor verifica tu correo electrónico registrado.</p>
              <p className="mt-2 text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider">
                Pista: {maskEmail(currentSigner.email)}
              </p>
            </div>

            <form onSubmit={handleVerifyEmail} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Correo Electrónico Registrado</label>
                <input
                  required
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold text-gray-900 dark:text-white"
                />
              </div>

              {verificationError && (
                <div className="p-3 bg-rose-50/55 dark:bg-rose-950/15 border border-rose-100 rounded-xl flex gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-rose-600 dark:text-rose-450 leading-normal font-semibold">
                    {verificationError}
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Verificar y Acceder
              </button>
            </form>
          </Card>
        ) : (
          /* MAIN DOCUMENT & SIGNING INTERFACE */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Document View */}
            <div className="lg:col-span-2 space-y-6 animate-fade-in">
              <Card className="p-8 md:p-10 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
                
                <div className="pb-4 border-b border-gray-100 dark:border-dark-border">
                  <h1 className="text-2xl font-extrabold text-gray-950 dark:text-white">{legalDoc.title}</h1>
                  <p className="text-xxs text-gray-400 font-bold uppercase tracking-wider mt-1">Por favor lee el contenido completo antes de firmar.</p>
                </div>

                {/* Content body */}
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed font-medium text-gray-800 dark:text-gray-300">
                  <MarkdownRenderer content={legalDoc.content} />
                </div>
              </Card>
            </div>

            {/* Right: Signature form */}
            <div className="space-y-6 animate-fade-in">
              <Card className="p-6 space-y-6">
                <div className="flex items-center gap-2 pb-4 border-b border-gray-100 dark:border-dark-border">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 rounded-xl">
                    <FileSignature className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-xs uppercase tracking-wider">Tu Firma de Conformidad</h3>
                    <span className="text-[10px] text-gray-400 block font-bold">{currentSigner.role}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Firmante Name preview */}
                  <div className="space-y-1">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Tu Nombre Completo</label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={e => setSignerName(e.target.value)}
                      disabled={signingMethod === 'draw'}
                      className="block w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white disabled:opacity-60"
                    />
                  </div>

                  {/* Signer meta details */}
                  <div className="p-3.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-dark-border space-y-1 text-[10px] text-gray-400">
                    <p><span className="font-semibold text-gray-600 dark:text-gray-300">Correo Electrónico:</span> {currentSigner.email}</p>
                    <p><span className="font-semibold text-gray-600 dark:text-gray-300">IP de Registro:</span> {ipAddress}</p>
                    <p><span className="font-semibold text-gray-600 dark:text-gray-300">Sello de Tiempo:</span> {new Date().toLocaleString()}</p>
                  </div>

                  {/* Choose Signing Method */}
                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Elige Método de Firma</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSigningMethod('draw')}
                        className={clsx(
                          "py-2 text-[10px] font-bold rounded-lg transition-all active:scale-95 border cursor-pointer",
                          signingMethod === 'draw'
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-dark-border text-gray-700 dark:text-slate-200"
                        )}
                      >
                        ✍️ Dibujar Firma
                      </button>
                      <button
                        type="button"
                        onClick={() => setSigningMethod('type')}
                        className={clsx(
                          "py-2 text-[10px] font-bold rounded-lg transition-all active:scale-95 border cursor-pointer",
                          signingMethod === 'type'
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-dark-border text-gray-700 dark:text-slate-200"
                        )}
                      >
                        🔤 Firma Escrita
                      </button>
                    </div>
                  </div>

                  {/* DRAW CANVAS SIGNATURE */}
                  {signingMethod === 'draw' ? (
                    <div className="space-y-2 animate-fade-in">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Firma Manuscrita</label>
                        <button
                          onClick={clearCanvas}
                          type="button"
                          className="flex items-center gap-0.5 text-rose-500 hover:text-rose-700 text-xxs font-semibold cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" /> Limpiar
                        </button>
                      </div>

                      <div className="bg-gray-50 dark:bg-[#0f172a] rounded-2xl border border-gray-200 dark:border-dark-border shadow-inner overflow-hidden flex justify-center items-center h-40 relative">
                        <canvas
                          ref={canvasRef}
                          width={400}
                          height={160}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          className="w-full h-full bg-white cursor-crosshair"
                        />
                        {!canvasHasDrawing && (
                          <span className="absolute text-gray-300 dark:text-gray-700 pointer-events-none text-[10px] font-bold uppercase tracking-wider select-none">
                            Dibuja aquí
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* TYPED CURSIVE SIGNATURE PREVIEW */
                    <div className="space-y-2 animate-fade-in">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vista Previa Firma Cursiva</label>
                      <div className="bg-white rounded-xl border border-gray-200 shadow-inner flex flex-col justify-center items-center h-40 relative p-3 text-center border-dashed border-2">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest absolute top-2">Certificación Digital</span>
                        <p className="font-serif italic text-xl text-blue-900 tracking-wide select-none py-1">
                          {signerName || 'Escribe tu nombre arriba'}
                        </p>
                        <span className="text-[8px] text-gray-400 absolute bottom-2 font-mono">NOM-151 Digital Stamp</span>
                      </div>
                    </div>
                  )}

                  {/* Accept terms label */}
                  <label className="flex items-start gap-2.5 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-100/50">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-[10px] text-gray-500 leading-normal select-none font-semibold">
                      Acepto que mi firma electrónica y dirección IP registrada equivalen legalmente a mi firma manuscrita para este acuerdo.
                    </span>
                  </label>

                  <button
                    onClick={handleSignDocument}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all shadow-md hover:shadow-emerald-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Procesando firma...' : '✓ Firmar Documento Multilateral'}
                  </button>

                </div>
              </Card>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default SignLegalDocument;
