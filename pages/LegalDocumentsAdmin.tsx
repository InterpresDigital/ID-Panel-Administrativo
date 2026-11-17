import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, storage } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { LegalDocument, DocumentSigner, CompanyInfo } from '../types';
import { 
  FileSignature, Search, Copy, ExternalLink, Calendar, MapPin, 
  Clock, Share2, Globe, Heart, Palette, Sparkles, Loader2, ArrowLeft, ArrowRight, CheckCircle2,
  FileText, Trash2, Plus, Trash, HelpCircle, Download, FileCheck, Layers, Info, Edit2, Eye
} from 'lucide-react';
import clsx from 'clsx';
import { getAppBaseUrl } from '../utils/urlUtils';
import { generateLegalDocumentPDF } from '../utils/legalDocumentPdfGenerator';
import { sendTelegramDocumentSignedNotification } from '../services/telegramService';
import { Card } from '../components/ui/Card';
import { MarkdownRenderer } from '../utils/markdownParser';

const TEMPLATES = [
  {
    name: "Convenio de Confidencialidad (NDA)",
    title: "Convenio de Confidencialidad y No Divulgación (NDA)",
    content: `**CONVENIO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN (NDA)**

El presente Convenio se celebra por y entre las partes firmantes al calce, de conformidad con las siguientes declaraciones y cláusulas:

**DECLARACIONES**
I. Ambas partes desean compartir cierta información de carácter confidencial para el desarrollo de proyectos y colaboraciones tecnológicas conjuntas.
II. Se reconoce recíprocamente la capacidad legal para obligarse en los términos de este instrumento.

**CLÁUSULAS**
1. **Definición de Información Confidencial**: Toda información verbal, escrita, gráfica o digital compartida entre las partes será considerada confidencial.
2. **Obligaciones de No Divulgación**: Las partes se obligan a no divulgar, duplicar, vender o transferir la información confidencial a terceros sin autorización previa y por escrito.
3. **Vigencia**: La obligación de confidencialidad estará vigente durante la relación comercial y por un periodo adicional de 3 (tres) años.
4. **Penalizaciones**: El incumplimiento de lo pactado dará lugar al pago de daños y perjuicios de conformidad con las leyes aplicables.

Leído que fue y firman de conformidad de manera electrónica.`
  },
  {
    name: "Minuta de Acuerdo de Colaboración",
    title: "Minuta de Acuerdo de Colaboración Bilateral",
    content: `**MINUTA DE ACUERDO DE COLABORACIÓN**

En la fecha de firma del presente documento, las partes se reúnen con el objeto de formalizar las bases de su colaboración estratégica:

**COMPROMISOS**
1. **Objeto**: Coordinar esfuerzos de marketing, diseño y desarrollo tecnológico para potenciar la marca conjunta de los involucrados.
2. **Aportación**: Cada una de las partes aportará los recursos humanos y técnicos acordados en los anexos correspondientes.
3. **Propiedad Intelectual**: Las marcas e invenciones previas seguirán siendo propiedad exclusiva de quien las haya registrado.
4. **Modificaciones**: Cualquier cambio al presente acuerdo deberá ser aprobado por escrito y firmado electrónicamente por todos los miembros.

Las partes firman digitalmente aceptando el contenido y alcance de este acuerdo.`
  }
];

const LegalDocumentsAdmin: React.FC = () => {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLinkIndex, setCopiedLinkIndex] = useState<string | null>(null);
  
  // View states
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedDoc, setSelectedDoc] = useState<LegalDocument | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Allow editing if no other external party (index > 0) has signed yet
  const canEditDocument = (doc: LegalDocument): boolean => {
    if (!doc.signers || doc.signers.length === 0) return true;
    const externalSigners = doc.signers.slice(1);
    const anyExternalSigned = externalSigners.some(s => s.hasSigned);
    return !anyExternalSigned;
  };

  const handlePreviewDraftPDF = async () => {
    if (!title.trim() || !content.trim()) {
      alert("Por favor completa el título y contenido para previsualizar el PDF.");
      return;
    }
    const previewSigners: DocumentSigner[] = signers.map((s, sIdx) => {
      const isRep = sIdx === 0;
      const isSigned = isRep && autoSignRep && companyInfo?.signatureDataUrl;
      return {
        name: s.name.trim() || `Firmante #${sIdx + 1}`,
        email: s.email.trim() || 'pendiente@ejemplo.com',
        role: s.role.trim() || 'Firmante',
        hasSigned: Boolean(isSigned || ('hasSigned' in s && (s as DocumentSigner).hasSigned)),
        signedAt: isSigned ? new Date().toISOString() : ('signedAt' in s ? (s as DocumentSigner).signedAt : undefined),
        ipAddress: isSigned ? 'Sello del Representante' : ('ipAddress' in s ? (s as DocumentSigner).ipAddress : undefined),
        signatureDataUrl: isSigned ? companyInfo?.signatureDataUrl : ('signatureDataUrl' in s ? (s as DocumentSigner).signatureDataUrl : undefined)
      };
    });

    const tempDoc: LegalDocument = {
      id: editingDocId || 'doc_borrador',
      title: title.trim(),
      content: content.trim(),
      signers: previewSigners,
      attachments: attachments,
      createdAt: selectedDoc?.createdAt || new Date().toISOString(),
      status: previewSigners.every(s => s.hasSigned) ? 'Completado' : (previewSigners.some(s => s.hasSigned) ? 'Firmado Parcialmente' : 'Pendiente')
    };

    setGeneratingPdfId('preview_draft');
    try {
      await generateLegalDocumentPDF(tempDoc, { preview: true });
    } catch (err) {
      console.error("Error generating PDF preview:", err);
      alert("Hubo un error al generar la previsualización del PDF.");
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const insertFormat = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Save scroll positions to prevent jumping
    const scrollTop = textarea.scrollTop;
    const windowScrollTop = window.scrollY;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end);
    const replacement = before + selectedText + after;

    setContent(
      text.substring(0, start) +
      replacement +
      text.substring(end)
    );

    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
      
      // Restore scroll positions
      textarea.scrollTop = scrollTop;
      window.scrollTo(0, windowScrollTop);
    }, 0);
  };

  const handleLocalFileUpload = (file: File) => {
    if (!file) return;
    setUploadingFile(true);
    setUploadProgress(0);

    try {
      const fileRef = storageRef(storage, `legal_documents/attachments/${crypto.randomUUID()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Error uploading file:', error);
          alert('Hubo un error al subir el archivo.');
          setUploadingFile(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setAttachments([...attachments, { name: file.name, url: downloadURL }]);
          setUploadingFile(false);
        }
      );
    } catch (err) {
      console.error(err);
      alert('Error al iniciar la subida del archivo.');
      setUploadingFile(false);
    }
  };

  const handleStartEdit = (legalDoc: LegalDocument) => {
    setEditingDocId(legalDoc.id);
    setTitle(legalDoc.title);
    setContent(legalDoc.content);
    setSigners(legalDoc.signers);
    setAttachments(legalDoc.attachments || []);
    setAutoSignRep(legalDoc.signers[0]?.hasSigned || false);
    setView('create');
  };

  // Create Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [signers, setSigners] = useState<Omit<DocumentSigner, 'hasSigned'>[]>([
    { name: 'Interpres Digital', email: 'hola@interpresdigital.com', role: 'Prestador / Agencia' }
  ]);
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [autoSignRep, setAutoSignRep] = useState(false);

  // Admin Signature modal state
  const [adminSigningSignerIndex, setAdminSigningSignerIndex] = useState<number | null>(null);
  const [adminSigType, setAdminSigType] = useState<'saved' | 'typed'>('saved');
  const [adminTypedName, setAdminTypedName] = useState('');
  const [isApplyingAdminSignature, setIsApplyingAdminSignature] = useState(false);

  const handleApplyAdminSignature = async (signerIdx: number) => {
    if (!selectedDoc) return;
    setIsApplyingAdminSignature(true);

    try {
      const signerToSign = selectedDoc.signers[signerIdx];
      let signatureDataUrl = companyInfo?.signatureDataUrl || '';

      const nameToUse = adminTypedName.trim() || companyInfo?.legalRepresentative || signerToSign.name || 'Emiliano Mares Urrutia';

      if (adminSigType === 'typed' || !signatureDataUrl) {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 140;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.font = '36px "Dancing Script", "Brush Script MT", cursive';
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.fillText(nameToUse, canvas.width / 2, canvas.height / 2 - 5);
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#64748b';
          ctx.fillText(`Firmado electrónicamente por: ${signerToSign.email} | Administrador Interpres`, canvas.width / 2, canvas.height / 2 + 35);
          signatureDataUrl = canvas.toDataURL('image/png');
        }
      }

      const updatedSigners = selectedDoc.signers.map((s, idx) => {
        if (idx === signerIdx) {
          return {
            ...s,
            hasSigned: true,
            signedAt: new Date().toISOString(),
            ipAddress: 'Panel Administrativo (Firmado por Administrador)',
            signatureDataUrl: signatureDataUrl
          };
        }
        return s;
      });

      const allSigned = updatedSigners.every(s => s.hasSigned);
      const updatedStatus = allSigned ? 'Firmado' : selectedDoc.status;

      const updatedDoc: LegalDocument = {
        ...selectedDoc,
        signers: updatedSigners,
        status: updatedStatus
      };

      await setDoc(doc(db, 'legal_documents', selectedDoc.id), {
        signers: updatedSigners,
        status: updatedStatus
      }, { merge: true });

      setSelectedDoc(updatedDoc);
      setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
      setIsApplyingAdminSignature(false);
      setAdminSigningSignerIndex(null);

      // Send instant Telegram notification
      const signedCount = updatedSigners.filter(s => s.hasSigned).length;
      sendTelegramDocumentSignedNotification(
        selectedDoc.title,
        nameToUse,
        signerToSign.role,
        signerToSign.email,
        new Date().toISOString(),
        'Panel Administrativo',
        allSigned,
        signedCount,
        updatedSigners.length
      ).catch(err => console.error("Error sending admin sign notification:", err));
    } catch (err) {
      console.error("Error applying admin signature:", err);
      setIsApplyingAdminSignature(false);
      alert("Hubo un error al aplicar la firma de Administrador.");
    }
  };

  // Search Param sync for direct link access
  const [searchParams, setSearchParams] = useSearchParams();
  const queryDocId = searchParams.get('id');

  // Load company info from Firebase settings
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    // 1. Fetch documents
    const q = query(collection(db, 'legal_documents'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all: LegalDocument[] = [];
      snapshot.forEach(docSnap => {
        all.push({ id: docSnap.id, ...docSnap.data() } as LegalDocument);
      });
      setDocuments(all);
      setLoading(false);

      // Keep open detail view synced in real-time
      setSelectedDoc(prev => {
        if (queryDocId) {
          return all.find(d => d.id === queryDocId) || prev;
        }
        if (prev) {
          return all.find(d => d.id === prev.id) || prev;
        }
        return null;
      });
    }, (error) => {
      console.error("Error loading legal documents:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [queryDocId]);

  useEffect(() => {
    // 2. Fetch company info
    const fetchCompany = async () => {
      const snap = await getDoc(doc(db, "settings", "company_info"));
      if (snap.exists()) {
        const info = snap.data() as CompanyInfo;
        setCompanyInfo(info);
        // Pre-fill first signer with company representative
        setSigners([
          { 
            name: info.legalRepresentative || info.commercialName || 'Interpres Digital', 
            email: info.email || 'hola@interpresdigital.com', 
            role: 'Prestador / Agencia' 
          }
        ]);
      }
    };
    fetchCompany();
  }, []);

  const handleDownloadPDF = async (legalDoc: LegalDocument) => {
    setGeneratingPdfId(legalDoc.id);
    try {
      await generateLegalDocumentPDF(legalDoc);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Hubo un error al generar el PDF del documento.");
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handleDeleteDoc = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("¿Estás seguro de que deseas eliminar este documento legal de forma permanente? Se perderán las firmas registradas.")) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'legal_documents', docId));
      alert("Documento eliminado con éxito.");
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setView('list');
        setSearchParams({});
      }
    } catch (error) {
      console.error("Error deleting doc:", error);
      alert("Hubo un error al eliminar el documento.");
    }
  };

  const handleAddSigner = () => {
    if (signers.length >= 4) {
      alert("Se permite un máximo de 4 firmantes en documentos multilaterales.");
      return;
    }
    setSigners([...signers, { name: '', email: '', role: 'Cliente / Contraparte' }]);
  };

  const handleRemoveSigner = (idx: number) => {
    if (idx === 0) {
      alert("No puedes remover el primer firmante (Interpres Digital / Agencia).");
      return;
    }
    setSigners(signers.filter((_, i) => i !== idx));
  };

  const handleSignerChange = (idx: number, field: 'name' | 'email' | 'role', val: string) => {
    const updated = [...signers];
    updated[idx] = { ...updated[idx], [field]: val };
    setSigners(updated);
  };

  const handleAddAttachment = () => {
    if (!newAttachmentName.trim() || !newAttachmentUrl.trim()) return;
    setAttachments([...attachments, { name: newAttachmentName.trim(), url: newAttachmentUrl.trim() }]);
    setNewAttachmentName('');
    setNewAttachmentUrl('');
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  const handleLoadTemplate = (tpl: typeof TEMPLATES[0]) => {
    setTitle(tpl.title);
    setContent(tpl.content);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert("Por favor completa el título y contenido del acuerdo.");
      return;
    }

    // Validate signers
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      if (!s.name.trim() || !s.email.trim() || !s.role.trim()) {
        alert(`Por favor completa todos los campos del firmante #${i + 1}`);
        return;
      }
    }

    try {
      const docId = editingDocId || 'doc_' + Math.random().toString(36).substring(2, 15);
      const newDocSigners: DocumentSigner[] = signers.map((s, sIdx) => {
        const signerObj: DocumentSigner = {
          name: s.name.trim(),
          email: s.email.trim().toLowerCase(),
          role: s.role.trim(),
          hasSigned: 'hasSigned' in s ? (s as DocumentSigner).hasSigned : false
        };
        
        // Auto-sign as Representative if enabled
        if (sIdx === 0) {
          if (autoSignRep && companyInfo?.signatureDataUrl) {
            signerObj.hasSigned = true;
            signerObj.signedAt = ('signedAt' in s && (s as DocumentSigner).signedAt) ? (s as DocumentSigner).signedAt : new Date().toISOString();
            signerObj.ipAddress = ('ipAddress' in s && (s as DocumentSigner).ipAddress) ? (s as DocumentSigner).ipAddress : "Sello del Administrador";
            signerObj.signatureDataUrl = companyInfo.signatureDataUrl;
          } else {
            signerObj.hasSigned = false;
            delete signerObj.signedAt;
            delete signerObj.ipAddress;
            delete signerObj.signatureDataUrl;
          }
        } else {
          if ('signedAt' in s && (s as DocumentSigner).signedAt) {
            signerObj.signedAt = (s as DocumentSigner).signedAt;
          }
          if ('ipAddress' in s && (s as DocumentSigner).ipAddress) {
            signerObj.ipAddress = (s as DocumentSigner).ipAddress;
          }
          if ('signatureDataUrl' in s && (s as DocumentSigner).signatureDataUrl) {
            signerObj.signatureDataUrl = (s as DocumentSigner).signatureDataUrl;
          }
        }
        
        return signerObj;
      });

      // Recalculate status based on current signatures
      const allSigned = newDocSigners.every(s => s.hasSigned);
      const someSigned = newDocSigners.some(s => s.hasSigned);
      const updatedStatus = allSigned ? 'Completado' : (someSigned ? 'Firmado Parcialmente' : 'Pendiente');

      // Merge currently typed attachment name/url if not empty and not added
      let finalAttachments = [...attachments];
      if (newAttachmentName.trim() && newAttachmentUrl.trim()) {
        finalAttachments.push({
          name: newAttachmentName.trim(),
          url: newAttachmentUrl.trim()
        });
      }

      const newDoc: Partial<LegalDocument> = {
        title: title.trim(),
        content: content.trim(),
        signers: newDocSigners,
        attachments: finalAttachments,
        status: updatedStatus
      };

      if (!editingDocId) {
        (newDoc as any).createdAt = new Date().toISOString();
      }

      await setDoc(doc(db, 'legal_documents', docId), newDoc, { merge: true });
      alert(editingDocId ? "¡Documento legal modificado con éxito!" : "¡Documento legal multilateral creado con éxito!");
      
      // Reset form
      setTitle('');
      setContent('');
      setAttachments([]);
      setEditingDocId(null);
      setAutoSignRep(false);
      setView('list');
    } catch (err) {
      console.error("Error creating legal doc:", err);
      alert("Hubo un error al guardar el documento legal.");
    }
  };

  const getDocStatusBadge = (status: LegalDocument['status']) => {
    return (
      <span className={clsx(
        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
        status === 'Firmado' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
        status === 'Rechazado' ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" :
        "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
      )}>
        {status}
      </span>
    );
  };

  const filteredDocs = documents.filter(d => {
    const query = searchQuery.trim().toLowerCase();
    return !query || 
      (d.title || '').toLowerCase().includes(query) ||
      d.signers.some(s => s.name.toLowerCase().includes(query) || s.email.toLowerCase().includes(query));
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <header className="flex justify-between items-center bg-white dark:bg-dark-surface p-6 rounded-3xl border border-gray-100 dark:border-dark-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500 text-white rounded-2xl shadow-md">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              {view === 'create' ? (editingDocId ? 'Editar Documento Legal' : 'Crear Documento Legal') : (view === 'detail' ? 'Detalle del Documento' : 'Documentos Legales')}
            </h1>
            <p className="text-xxs text-gray-400 font-bold uppercase tracking-wider mt-0.5">Firma Electrónica Multilateral (2, 3 o 4 Partes)</p>
          </div>
        </div>

        {view === 'list' ? (
          <button
            onClick={() => {
              setEditingDocId(null);
              setTitle('');
              setContent('');
              setAttachments([]);
              setAutoSignRep(false);
              if (companyInfo) {
                setSigners([
                  { 
                    name: companyInfo.legalRepresentative || companyInfo.commercialName || 'Interpres Digital', 
                    email: companyInfo.email || 'hola@interpresdigital.com', 
                    role: 'Prestador / Agencia' 
                  }
                ]);
              } else {
                setSigners([
                  { name: 'Interpres Digital', email: 'hola@interpresdigital.com', role: 'Prestador / Agencia' }
                ]);
              }
              setView('create');
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Documento</span>
          </button>
        ) : (
          <button
            onClick={() => {
              setView('list');
              setSelectedDoc(null);
              setSearchParams({});
              setEditingDocId(null);
            }}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-250 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-white font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la Lista</span>
          </button>
        )}
      </header>

      {/* VIEW: CREATE NEW DOCUMENT */}
      {view === 'create' && (
        <form onSubmit={handleSubmit} className="space-y-6 animate-scale-up">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Form Fields */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6 md:p-8 space-y-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  1. Información del Documento
                </h3>

                {/* Templates Quick Loader */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cargar Plantilla Predeterminada:</span>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATES.map(t => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => handleLoadTemplate(t)}
                        className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-lg text-xxs font-bold transition-all border border-indigo-100 dark:border-indigo-900/60"
                      >
                        ⚡ {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Título del Documento</label>
                    <input
                      required
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Ej. Convenio de Colaboración de Diseño Web"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Contenido del Acuerdo (Markdown)</label>
                      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setEditorTab('edit')}
                          className={clsx(
                            "px-2.5 py-1 text-xxs font-bold rounded-md transition-all cursor-pointer",
                            editorTab === 'edit'
                              ? "bg-white dark:bg-dark-surface text-indigo-600 dark:text-indigo-400 shadow-xs"
                              : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                          )}
                        >
                          ✏️ Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorTab('preview')}
                          className={clsx(
                            "px-2.5 py-1 text-xxs font-bold rounded-md transition-all cursor-pointer",
                            editorTab === 'preview'
                              ? "bg-white dark:bg-dark-surface text-indigo-600 dark:text-indigo-400 shadow-xs"
                              : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                          )}
                        >
                          👁️ Vista Previa
                        </button>
                      </div>
                    </div>
                    
                    {editorTab === 'edit' ? (
                      <>
                        {/* Formatting Assistant Toolbar */}
                        <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-55 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-dark-border">
                          <button
                            type="button"
                            onClick={() => insertFormat('**', '**')}
                            className="px-2.5 py-1 bg-white dark:bg-dark-bg hover:bg-gray-55 dark:hover:bg-dark-surface text-gray-700 dark:text-white rounded-lg text-xxs font-extrabold shadow-sm active:scale-95 transition-all cursor-pointer border border-gray-150 dark:border-dark-border"
                            title="Texto en Negrita"
                          >
                            Negrita (N)
                          </button>
                          <button
                            type="button"
                            onClick={() => insertFormat('*', '*')}
                            className="px-2.5 py-1 bg-white dark:bg-dark-bg hover:bg-gray-55 dark:hover:bg-dark-surface text-gray-700 dark:text-white rounded-lg text-xxs font-serif italic shadow-sm active:scale-95 transition-all cursor-pointer border border-gray-150 dark:border-dark-border"
                            title="Texto en Cursiva"
                          >
                            Cursiva (I)
                          </button>
                          <div className="h-4 w-px bg-gray-300 dark:bg-dark-border mx-1" />
                          <button
                            type="button"
                            onClick={() => insertFormat('# ')}
                            className="px-2.5 py-1 bg-white dark:bg-dark-bg hover:bg-gray-55 dark:hover:bg-dark-surface text-gray-700 dark:text-white rounded-lg text-xxs font-bold shadow-sm active:scale-95 transition-all cursor-pointer border border-gray-150 dark:border-dark-border"
                            title="Título Grande"
                          >
                            H1 (Grande)
                          </button>
                          <button
                            type="button"
                            onClick={() => insertFormat('## ')}
                            className="px-2.5 py-1 bg-white dark:bg-dark-bg hover:bg-gray-55 dark:hover:bg-dark-surface text-gray-700 dark:text-white rounded-lg text-xxs font-bold shadow-sm active:scale-95 transition-all cursor-pointer border border-gray-150 dark:border-dark-border"
                            title="Título Mediano"
                          >
                            H2 (Mediano)
                          </button>
                          <button
                            type="button"
                            onClick={() => insertFormat('### ')}
                            className="px-2.5 py-1 bg-white dark:bg-dark-bg hover:bg-gray-55 dark:hover:bg-dark-surface text-gray-700 dark:text-white rounded-lg text-xxs font-bold shadow-sm active:scale-95 transition-all cursor-pointer border border-gray-150 dark:border-dark-border"
                            title="Título Chico"
                          >
                            H3 (Chico)
                          </button>
                          <div className="h-4 w-px bg-gray-300 dark:bg-dark-border mx-1" />
                          <button
                            type="button"
                            onClick={() => insertFormat('- ')}
                            className="px-2.5 py-1 bg-white dark:bg-dark-bg hover:bg-gray-55 dark:hover:bg-dark-surface text-gray-700 dark:text-white rounded-lg text-xxs font-bold shadow-sm active:scale-95 transition-all cursor-pointer border border-gray-150 dark:border-dark-border"
                            title="Lista de Viñetas"
                          >
                            • Lista
                          </button>
                        </div>

                        <textarea
                          ref={textareaRef}
                          required
                          rows={24}
                          value={content}
                          onChange={e => setContent(e.target.value)}
                          placeholder="Escribe el cuerpo legal del acuerdo, cláusulas y declaraciones aquí..."
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold resize-y dark:text-white min-h-[400px]"
                        />
                      </>
                    ) : (
                      <div className="p-6 bg-gray-50 dark:bg-dark-bg/60 rounded-2xl border border-gray-200 dark:border-dark-border min-h-[400px] prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed font-medium text-gray-800 dark:text-gray-300">
                        {content.trim() ? (
                          <MarkdownRenderer content={content} />
                        ) : (
                          <p className="text-gray-400 italic">No hay contenido redactado todavía para previsualizar.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Attachments Section */}
              <Card className="p-6 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  3. Documentos Anexos (Opcional)
                </h3>

                <div className="flex flex-col gap-3 p-3.5 bg-gray-55 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-250 dark:border-dark-border">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Subir Archivo Local (PDF / Imagen):</span>
                  {uploadingFile ? (
                    <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl text-xxs font-bold text-indigo-600 dark:text-indigo-400">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      <span>Subiendo archivo... ({uploadProgress}%)</span>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        id="legal-file-upload"
                        onChange={e => {
                          const files = e.target.files;
                          if (files && files[0]) {
                            handleLocalFileUpload(files[0]);
                          }
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="legal-file-upload"
                        className="w-full flex items-center justify-center gap-1.5 p-3 bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-gray-700/60 border border-gray-200 dark:border-dark-border rounded-xl text-xxs font-bold text-gray-700 dark:text-white cursor-pointer shadow-xs active:scale-95 transition-all"
                      >
                        <Download className="w-4 h-4 rotate-180 text-indigo-500" />
                        <span>Seleccionar y Subir Archivo Local</span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={newAttachmentName}
                      onChange={e => setNewAttachmentName(e.target.value)}
                      placeholder="Nombre del Anexo (ej. Cotización aprobada)"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg outline-none text-xxs font-semibold dark:text-white"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={newAttachmentUrl}
                      onChange={e => setNewAttachmentUrl(e.target.value)}
                      placeholder="Enlace o URL (ej. https://dropbox.com/...)"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg outline-none text-xxs font-semibold dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAttachment}
                    className="px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                  >
                    Agregar
                  </button>
                </div>

                {attachments.length > 0 && (
                  <div className="divide-y divide-gray-100 dark:divide-dark-border/60">
                    {attachments.map((att, index) => (
                      <div key={index} className="flex justify-between items-center py-2 text-xxs font-semibold">
                        <span className="text-gray-700 dark:text-gray-300">📄 {att.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 truncate max-w-[150px]">{att.url}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(index)}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Sidebar Form (Signers Column) */}
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <FileSignature className="w-4 h-4 text-indigo-500" />
                    2. Partes Firmantes
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddSigner}
                    disabled={signers.length >= 4}
                    className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-md border border-indigo-200 dark:border-indigo-850 transition-all text-[10px] font-bold flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Añadir
                  </button>
                </div>

                <div className="space-y-4 divide-y divide-gray-100 dark:divide-dark-border/60">
                  {signers.map((signer, idx) => (
                    <div key={idx} className={clsx("space-y-3", idx > 0 && "pt-4")}>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest">
                          Parte #{idx + 1} {idx === 0 && "(Prestador)"}
                        </span>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSigner(idx)}
                            className="text-rose-500 hover:text-rose-700 text-xxs font-bold flex items-center gap-0.5"
                          >
                            <Trash className="w-3.5 h-3.5" /> Quitar
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <input
                          required
                          type="text"
                          value={signer.name}
                          onChange={e => handleSignerChange(idx, 'name', e.target.value)}
                          placeholder="Nombre completo de la persona"
                          className="w-full px-3 py-2 bg-gray-55 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg outline-none text-xxs font-semibold dark:text-white"
                        />
                        <input
                          required
                          type="email"
                          value={signer.email}
                          onChange={e => handleSignerChange(idx, 'email', e.target.value)}
                          placeholder="correo@ejemplo.com"
                          className="w-full px-3 py-2 bg-gray-55 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg outline-none text-xxs font-semibold dark:text-white"
                        />
                        <input
                          required
                          type="text"
                          value={signer.role}
                          onChange={e => handleSignerChange(idx, 'role', e.target.value)}
                          placeholder="Rol (ej. Cliente, Testigo, Socio)"
                          className="w-full px-3 py-2 bg-gray-55 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-lg outline-none text-xxs font-semibold dark:text-white"
                        />
                        {idx === 0 && (
                          <div className="mt-2 pt-1 border-t border-gray-100 dark:border-dark-border/40">
                            {companyInfo?.signatureDataUrl ? (
                              <label className="flex items-start gap-2 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg border border-indigo-150/30 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={autoSignRep}
                                  onChange={e => setAutoSignRep(e.target.checked)}
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold leading-normal">
                                  Estampar mi firma digital autógrafa (Representante Legal)
                                </span>
                              </label>
                            ) : (
                              <p className="text-[9px] text-amber-600 font-bold leading-normal">
                                ⚠️ Sube tu firma en Configuración para poder auto-firmar.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 space-y-2.5">
                  <button
                    type="button"
                    onClick={handlePreviewDraftPDF}
                    disabled={generatingPdfId === 'preview_draft'}
                    className="w-full py-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-900/60 transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    {generatingPdfId === 'preview_draft' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    <span>Previsualizar PDF antes de Guardar</span>
                  </button>

                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 cursor-pointer"
                  >
                    {editingDocId ? 'Guardar Cambios del Documento' : 'Guardar y Crear Documento'}
                  </button>
                </div>
              </Card>
            </div>

          </div>
        </form>
      )}

      {/* VIEW: DOCUMENTS LIST */}
      {view === 'list' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 bg-white dark:bg-dark-surface p-2 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm max-w-md">
            <Search className="w-5 h-5 text-gray-400 ml-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por título o firmantes..."
              className="bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 w-full text-xs font-semibold"
            />
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-150 dark:divide-dark-border/60">
                <thead className="bg-gray-50 dark:bg-dark-bg">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Folio</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Documento Legal</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Firmantes (Progreso)</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Fecha</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Estatus</th>
                    <th className="px-6 py-3.5 text-right text-xxs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border/60 text-xs text-gray-700 dark:text-gray-300 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Cargando documentos legales...
                      </td>
                    </tr>
                  ) : filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        No se encontraron documentos creados.
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map(doc => {
                      const signedCount = doc.signers.filter(s => s.hasSigned).length;
                      const totalCount = doc.signers.length;
                      return (
                        <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg/60 transition-colors">
                          <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                            #{doc.id.replace(/^doc_/, '').substring(0, 8).toUpperCase()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900 dark:text-white">{doc.title}</div>
                            {doc.attachments && doc.attachments.length > 0 && (
                              <span className="text-[9px] text-indigo-500 font-bold">📎 {doc.attachments.length} Anexos</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-900 dark:text-white font-semibold">
                              {signedCount} de {totalCount} Firmas
                            </div>
                            <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${(signedCount / totalCount) * 100}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xxs text-gray-400">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            {getDocStatusBadge(doc.status)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canEditDocument(doc) && (
                                <button
                                  onClick={() => handleStartEdit(doc)}
                                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors cursor-pointer"
                                  title="Editar Documento"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedDoc(doc);
                                  setView('detail');
                                  setSearchParams({ id: doc.id });
                                }}
                                className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg text-xxs border border-indigo-200 dark:border-indigo-900/60 transition-all cursor-pointer"
                              >
                                Ver Detalle
                              </button>
                              <button
                                onClick={(e) => handleDeleteDoc(doc.id, e)}
                                className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: DETAIL AND CONTROL */}
      {view === 'detail' && selectedDoc && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Detailed Back Action Bar */}
          <div className="flex justify-between items-center bg-white dark:bg-dark-surface p-4 rounded-2xl border border-gray-100 dark:border-dark-border shadow-xs">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setSelectedDoc(null);
                  setView('list');
                  setSearchParams({});
                  setEditingDocId(null);
                }}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-bold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la Lista</span>
              </button>

              {canEditDocument(selectedDoc) ? (
                <>
                  <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />
                  <button
                    onClick={() => handleStartEdit(selectedDoc)}
                    className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar Documento</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />
                  <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg" title="El documento ya fue firmado por otra parte y no puede ser alterado.">
                    🔒 Firmado por contraparte (Bloqueado)
                  </span>
                </>
              )}

              <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />

              <button
                onClick={() => handleDownloadPDF(selectedDoc)}
                disabled={generatingPdfId === selectedDoc.id}
                className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold active:scale-95 transition-all cursor-pointer"
              >
                {generatingPdfId === selectedDoc.id ? (
                  <Loader2 className="w-4 animate-spin text-indigo-500" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Descargar PDF</span>
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-dark-border" />

              <button
                onClick={() => handleDeleteDoc(selectedDoc.id)}
                className="flex items-center gap-2 text-xs text-rose-500 hover:text-rose-700 dark:text-rose-450 dark:hover:text-rose-350 font-bold active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Documento</span>
              </button>
            </div>
            
            <div className="text-xxs text-slate-400 font-bold">
              Folio: #INT-LEG-{selectedDoc.id.replace(/^doc_/, '').substring(0, 8).toUpperCase()} — Creado: {new Date(selectedDoc.createdAt).toLocaleString()}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Document Content */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-8 md:p-10 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
                
                <div className="pb-4 border-b border-gray-100 dark:border-dark-border">
                  <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">{selectedDoc.title}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    {getDocStatusBadge(selectedDoc.status)}
                    <span className="text-xs text-gray-400 font-bold">
                      {selectedDoc.signers.filter(s => s.hasSigned).length} de {selectedDoc.signers.length} partes firmaron
                    </span>
                  </div>
                </div>

                {/* Markdown body content */}
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed font-medium text-gray-800 dark:text-gray-300">
                  <MarkdownRenderer content={selectedDoc.content} />
                </div>

                {/* Attachments rendering */}
                {selectedDoc.attachments && selectedDoc.attachments.length > 0 && (
                  <div className="pt-6 border-t border-gray-100 dark:border-dark-border space-y-3">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Documentos Anexados</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedDoc.attachments.map((att, index) => (
                        <a
                          key={index}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-150 dark:border-dark-border text-xxs font-bold text-gray-700 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-900 transition-all"
                        >
                          <span className="truncate">📄 {att.name}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Right: Signers Progress & Links */}
            <div className="space-y-6">
              <Card className="p-6 space-y-4">
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-indigo-500" />
                  Estatus y Enlaces de Firma
                </h3>

                <div className="space-y-4 divide-y divide-gray-100 dark:divide-dark-border/60">
                  {selectedDoc.signers.map((signer, idx) => {
                    const baseUrl = getAppBaseUrl(companyInfo);
                    
                    // Construct personalized sign URL
                    const personalUrl = `${baseUrl}/#/sign/legal/${selectedDoc.id}/${idx}`;
                    const isCopied = copiedLinkIndex === `${selectedDoc.id}_${idx}`;

                    return (
                      <div key={idx} className={clsx("space-y-2", idx > 0 && "pt-4")}>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">
                              {signer.role}
                            </span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {signer.name}
                            </span>
                          </div>
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[8px] font-extrabold uppercase",
                            signer.hasSigned 
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                          )}>
                            {signer.hasSigned ? 'Firmado' : 'Pendiente'}
                          </span>
                        </div>

                        {signer.hasSigned ? (
                          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/10 rounded-xl border border-emerald-100/60 dark:border-emerald-900/30 space-y-1.5">
                            {signer.signatureDataUrl && (
                              <div className="h-12 w-full bg-white rounded-lg flex items-center justify-center p-1 border border-gray-150">
                                <img src={signer.signatureDataUrl} alt="Firma" className="max-h-full max-w-full object-contain" />
                              </div>
                            )}
                            <div className="text-[9px] text-gray-500 font-semibold space-y-0.5">
                              <p>IP: {signer.ipAddress}</p>
                              <p>Fecha: {new Date(signer.signedAt!).toLocaleString()}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setAdminSigningSignerIndex(idx)}
                              className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
                            >
                              <FileSignature className="w-4 h-4" />
                              <span>Estampar Firma de Administrador ({signer.name})</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(personalUrl);
                                  setCopiedLinkIndex(`${selectedDoc.id}_${idx}`);
                                  setTimeout(() => setCopiedLinkIndex(null), 2500);
                                }}
                                className={clsx(
                                  "flex-1 py-2 font-bold rounded-lg text-xxs flex items-center justify-center gap-1 active:scale-95 transition-all border shadow-sm cursor-pointer",
                                  isCopied 
                                    ? "bg-emerald-600 text-white border-emerald-500" 
                                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-white border-gray-200 dark:border-dark-border hover:bg-gray-50"
                                )}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>{isCopied ? '¡Enlace Copiado!' : 'Copiar Enlace'}</span>
                              </button>
                              <a
                                href={personalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-white rounded-lg border border-gray-200 dark:border-dark-border cursor-pointer"
                                title="Abrir página de firma"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Instructions banner */}
              <Card className="p-4 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-150/40 rounded-2xl flex items-start gap-2.5">
                <Info className="w-4.5 h-4.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                <div className="text-[10px] text-gray-500 font-semibold leading-normal">
                  <p className="font-bold text-gray-800 dark:text-white">¿Cómo funciona la firma multilateral?</p>
                  <p className="mt-1">
                    Cada firmante recibe un enlace único y personalizado. Al firmar, su marca de tiempo e IP se estampan en el documento. Una vez que todas las partes firmen, el contrato pasará automáticamente a estatus <strong>Firmado</strong> y se habilitará la descarga del PDF final auditado.
                  </p>
                </div>
              </Card>
            </div>

          </div>
        </div>
      )}

      {/* Admin Direct Signature Modal */}
      {adminSigningSignerIndex !== null && selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-lg p-6 space-y-6 shadow-2xl bg-white dark:bg-dark-card border border-gray-150 dark:border-dark-border">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-dark-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <FileSignature className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Estampar Firma de Administrador</h3>
                  <p className="text-xs text-gray-500 font-medium">Firmante: {selectedDoc.signers[adminSigningSignerIndex]?.name} ({selectedDoc.signers[adminSigningSignerIndex]?.role})</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setAdminSigningSignerIndex(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white font-bold text-sm px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400 block">Selecciona el Método de Firma</span>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAdminSigType('saved')}
                  className={clsx(
                    "p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer",
                    adminSigType === 'saved'
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-white"
                      : "border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50"
                  )}
                >
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className={clsx("w-3.5 h-3.5", adminSigType === 'saved' ? "text-indigo-600" : "text-gray-300")} />
                    Firma Autógrafa Guardada
                  </span>
                  <span className="text-[10px] text-gray-500">Usa la firma guardada en Configuración</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdminSigType('typed')}
                  className={clsx(
                    "p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer",
                    adminSigType === 'typed'
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-white"
                      : "border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50"
                  )}
                >
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className={clsx("w-3.5 h-3.5", adminSigType === 'typed' ? "text-indigo-600" : "text-gray-300")} />
                    Firma Cursiva Digital
                  </span>
                  <span className="text-[10px] text-gray-500">Escribe el nombre del representante</span>
                </button>
              </div>

              {adminSigType === 'saved' && (
                <div className="p-4 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl space-y-2">
                  <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Vista previa de firma guardada:</span>
                  {companyInfo?.signatureDataUrl ? (
                    <div className="h-16 bg-white rounded-lg flex items-center justify-center p-2 border border-gray-200">
                      <img src={companyInfo.signatureDataUrl} alt="Firma Guardada" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                      ⚠️ No tienes una firma autógrafa guardada en Configuración. Se aplicará la firma cursiva digital con tu nombre.
                    </p>
                  )}
                </div>
              )}

              {adminSigType === 'typed' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Nombre completo para la firma cursiva:</label>
                  <input
                    type="text"
                    value={adminTypedName}
                    onChange={e => setAdminTypedName(e.target.value)}
                    placeholder="Ej. Emiliano Mares Urrutia"
                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-dark-border pt-4">
              <button
                type="button"
                onClick={() => setAdminSigningSignerIndex(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isApplyingAdminSignature}
                onClick={() => handleApplyAdminSignature(adminSigningSignerIndex)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isApplyingAdminSignature ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Estampando firma...</span>
                  </>
                ) : (
                  <span>✓ Aplicar Firma y Guardar</span>
                )}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LegalDocumentsAdmin;
