import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useTheme } from '../components/ThemeContext';
import { 
  Building2, ShieldCheck, Sun, Moon, CheckCircle2, AlertTriangle, KeyRound, 
  Mail, Send, FileText, Video, Users, Calendar, Loader2, FlaskConical, Link as LinkIcon, Plus, Copy, Edit3, Save, RotateCcw, Key, Search, CheckSquare, Square, UserCheck, XCircle, RefreshCw, Image as ImageIcon, Paperclip, File, Trash2, ChevronDown, ChevronRight, Eye, EyeOff
} from 'lucide-react';
import clsx from 'clsx';
import { sendCustomEmail, sendTestEmailTemplate, EMAIL_TEMPLATES } from '../services/emailService';
import { getAppBaseUrl } from '../utils/urlUtils';
import { CustomEmailTemplate } from '../types';
import { connectGoogleAccount1Click, connectGoogleAccountOffline, openGoogleOAuthPopup, isGoogleTokenExpired, EmailAttachment } from '../services/gmailApiService';

const Configuration: React.FC = () => {
  const { 
    companyInfo, updateCompanyInfo, updateMasterPassword, 
    clients, bookings, quotations, agreements, bookingSettings, updateBookingSettings 
  } = useData();
  const { theme, toggleTheme } = useTheme();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'general' | 'compose' | 'templates'>('general');

  const [commercialName, setCommercialName] = useState(companyInfo.commercialName || '');
  const [businessName, setBusinessName] = useState(companyInfo.businessName || '');
  const [address, setAddress] = useState(companyInfo.address || '');
  const [email, setEmail] = useState(companyInfo.email || '');
  const [rfc, setRfc] = useState(companyInfo.rfc || '');
  const [website, setWebsite] = useState(companyInfo.website || '');
  const [signatureBaseUrl, setSignatureBaseUrl] = useState(companyInfo.signatureBaseUrl || '');
  const [legalRepresentative, setLegalRepresentative] = useState(companyInfo.legalRepresentative || '');
  const [signatureDataUrl, setSignatureDataUrl] = useState(companyInfo.signatureDataUrl || '');

  // Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Gemini AI State
  const [geminiApiKey, setGeminiApiKey] = useState(bookingSettings?.geminiConfig?.apiKey || '');
  const [geminiEnabled, setGeminiEnabled] = useState(bookingSettings?.geminiConfig?.enabled || false);
  const [showGeminiSuccess, setShowGeminiSuccess] = useState(false);

  // Google OAuth State
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [showGoogleSuccess, setShowGoogleSuccess] = useState(false);
  const [showGoogleClientId, setShowGoogleClientId] = useState(false);
  const [showGoogleClientSecret, setShowGoogleClientSecret] = useState(false);
  
  // Notification states
  const [showCompanySuccess, setShowCompanySuccess] = useState(false);
  const [showPasswordSuccess, setShowPasswordSuccess] = useState(false);

  // --- REDACTAR CORREO ESTADOS ---
  const [recipientGroup, setRecipientGroup] = useState<'client' | 'booking' | 'manual'>('client');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isOpenClientsDropdown, setIsOpenClientsDropdown] = useState(false);
  const [isOpenLeadsDropdown, setIsOpenLeadsDropdown] = useState(false);
  const [clientsSearchQuery, setClientsSearchQuery] = useState('');
  const [leadsSearchQuery, setLeadsSearchQuery] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeImageUrl, setComposeImageUrl] = useState('');
  const [sendingCompose, setSendingCompose] = useState(false);
  const [composeResult, setComposeResult] = useState<{ success: boolean; message: string } | null>(null);

  // Estados de Progreso para Envíos Masivos
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; percentage: number; currentTarget: string } | null>(null);
  const [bulkDispatchResult, setBulkDispatchResult] = useState<{ successCount: number; failCount: number; details: string[] } | null>(null);

  // Conteo de clientes por estatus
  const activeClientsCount = clients.filter(c => c.status === 'Activo').length;
  const prospectClientsCount = clients.filter(c => c.status === 'Prospecto').length;
  const inactiveClientsCount = clients.filter(c => c.status === 'Inactivo').length;

  const selectedActiveCount = clients.filter(c => c.status === 'Activo' && selectedClientIds.includes(c.id)).length;
  const selectedProspectCount = clients.filter(c => c.status === 'Prospecto' && selectedClientIds.includes(c.id)).length;

  // Filtrado dinámico de clientes activos
  const filteredActiveClients = clients.filter(c => {
    if (c.status !== 'Activo') return false;
    const query = clientsSearchQuery.trim().toLowerCase();
    return !query || 
      (c.name || '').toLowerCase().includes(query) ||
      (c.companyName || '').toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query) ||
      (c.phone || '').toLowerCase().includes(query);
  });

  // Filtrado dinámico de prospectos
  const filteredProspectClients = clients.filter(c => {
    if (c.status !== 'Prospecto') return false;
    const query = leadsSearchQuery.trim().toLowerCase();
    return !query || 
      (c.name || '').toLowerCase().includes(query) ||
      (c.companyName || '').toLowerCase().includes(query) ||
      (c.email || '').toLowerCase().includes(query) ||
      (c.phone || '').toLowerCase().includes(query);
  });

  const handleToggleSelectClient = (cId: string) => {
    setSelectedClientIds(prev => 
      prev.includes(cId) ? prev.filter(id => id !== cId) : [...prev, cId]
    );
  };

  const handleSelectClientsByStatus = (status: 'Activo' | 'Prospecto' | 'Inactivo') => {
    const targetIds = clients.filter(c => c.status === status && c.email && c.email.trim()).map(c => c.id);
    const combined = new Set([...selectedClientIds, ...targetIds]);
    setSelectedClientIds(Array.from(combined));
  };

  const handleDeselectClientsByStatus = (status: 'Activo' | 'Prospecto' | 'Inactivo') => {
    const targetIds = clients.filter(c => c.status === status).map(c => c.id);
    setSelectedClientIds(prev => prev.filter(id => !targetIds.includes(id)));
  };

  const handleDeselectAllClients = () => {
    setSelectedClientIds([]);
  };

  const handleRemoveSelectedClient = (cId: string) => {
    setSelectedClientIds(prev => prev.filter(id => id !== cId));
  };

  const handleAppendManualEmail = (emailToAppend: string) => {
    if (!emailToAppend) return;
    setManualEmail(prev => {
      const cleanPrev = prev.trim();
      if (!cleanPrev) return emailToAppend;
      if (cleanPrev.endsWith(',')) return `${cleanPrev} ${emailToAppend}`;
      return `${cleanPrev}, ${emailToAppend}`;
    });
  };

  const handleSelectBookingRecipient = (bId: string) => {
    setSelectedBookingId(bId);
    const booking = bookings.find(b => b.id === bId);
    if (booking) {
      if (!composeSubject) setComposeSubject(`Seguimiento de Videollamada - ${booking.platformName}`);
      if (!composeBody) setComposeBody(`Hola ${booking.clientName},\n\nCon respecto a tu cita en ${booking.platformName} el ${booking.date} a las ${booking.startTime} CDMX:\n\n`);
    }
  };

  // --- ARCHIVOS ADJUNTOS LOCALES (PDF, Imágenes, Documentos) ---
  const [emailAttachments, setEmailAttachments] = useState<EmailAttachment[]>([]);

  const handleAddLocalAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64 = evt.target?.result as string;
        if (base64) {
          setEmailAttachments(prev => [
            ...prev,
            {
              name: file.name,
              type: file.type || 'application/octet-stream',
              base64: base64,
              size: file.size
            }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setEmailAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // --- CÁLCULO DE DESTINATARIOS UNIFICADOS (Clientes + Agenda + Correos Manuales) ---
  const manualEmailList = manualEmail
    .split(/[,\s;\n]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && e.includes('@'));

  const manualTargets = manualEmailList.map(e => ({
    id: `manual-${e}`,
    email: e,
    name: e,
    source: 'manual' as const
  }));

  const clientTargets = clients
    .filter(c => selectedClientIds.includes(c.id) && c.email)
    .map(c => ({
      id: c.id,
      email: c.email!.trim(),
      name: c.name,
      source: 'client' as const,
      companyName: c.companyName
    }));

  const bookingTarget = bookings.find(b => b.id === selectedBookingId);
  const bookingTargets = (bookingTarget && bookingTarget.clientEmail)
    ? [{
        id: `booking-${bookingTarget.id}`,
        email: bookingTarget.clientEmail.trim(),
        name: bookingTarget.clientName,
        source: 'booking' as const
      }]
    : [];

  // Mapa para desduplicar por correo
  const unifiedTargetsMap = new Map<string, { id: string; email: string; name: string; source: 'client' | 'booking' | 'manual'; companyName?: string }>();
  [...clientTargets, ...bookingTargets, ...manualTargets].forEach(t => {
    if (t.email) {
      unifiedTargetsMap.set(t.email.toLowerCase(), t);
    }
  });
  const unifiedTargets = Array.from(unifiedTargetsMap.values());

  const handleRemoveUnifiedTarget = (target: { id: string; email: string; source: string }) => {
    if (target.source === 'client') {
      setSelectedClientIds(prev => prev.filter(id => id !== target.id));
    } else if (target.source === 'booking') {
      setSelectedBookingId('');
    } else if (target.source === 'manual') {
      const remainingManuals = manualEmailList.filter(e => e.toLowerCase() !== target.email.toLowerCase());
      setManualEmail(remainingManuals.join(', '));
    }
  };

  const handleClearAllTargets = () => {
    setSelectedClientIds([]);
    setSelectedBookingId('');
    setManualEmail('');
  };

  const handleSendComposeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeResult(null);
    setBulkDispatchResult(null);

    if (!composeSubject.trim() || !composeBody.trim()) {
      alert("Por favor completa el asunto y el cuerpo del mensaje.");
      return;
    }

    if (unifiedTargets.length === 0) {
      alert("Por favor selecciona o ingresa al menos un destinatario (cliente de la base de datos, cita de la agenda o correo manual).");
      return;
    }

    setSendingCompose(true);
    
    // Obtener la primera imagen adjunta para usarla automáticamente como banner promocional del correo
    const finalBannerUrl = emailAttachments.find(att => att.type.startsWith('image/'))?.base64 || composeImageUrl;

    if (unifiedTargets.length === 1) {
      const target = unifiedTargets[0];
      const personalizedBody = composeBody.includes('{nombre_cliente}') 
        ? composeBody.replace(/\{nombre_cliente\}/g, target.name)
        : composeBody;

      const personalizedSubject = composeSubject.includes('{nombre_cliente}')
        ? composeSubject.replace(/\{nombre_cliente\}/g, target.name)
        : composeSubject;

      const res = await sendCustomEmail(
        target.email,
        personalizedSubject,
        personalizedBody,
        bookingSettings?.googleConfig,
        finalBannerUrl,
        emailAttachments
      );
      setSendingCompose(false);
      setComposeResult(res);
      return;
    }

    // Envío Masivo a Múltiples Destinatarios Combinados
    let successCount = 0;
    let failCount = 0;
    const detailsLog: string[] = [];

    for (let i = 0; i < unifiedTargets.length; i++) {
      const target = unifiedTargets[i];
      setBulkProgress({
        current: i + 1,
        total: unifiedTargets.length,
        percentage: Math.round(((i + 1) / unifiedTargets.length) * 100),
        currentTarget: `${target.name} (${target.email})`
      });

      const personalizedBody = composeBody.includes('{nombre_cliente}') 
        ? composeBody.replace(/\{nombre_cliente\}/g, target.name)
        : composeBody;

      const personalizedSubject = composeSubject.includes('{nombre_cliente}')
        ? composeSubject.replace(/\{nombre_cliente\}/g, target.name)
        : composeSubject;

      const res = await sendCustomEmail(
        target.email,
        personalizedSubject,
        personalizedBody,
        bookingSettings?.googleConfig,
        finalBannerUrl,
        emailAttachments
      );

      if (res.success) {
        successCount++;
        detailsLog.push(`✓ ${target.name} (${target.email}): Enviado correctamente.`);
      } else {
        failCount++;
        detailsLog.push(`❌ ${target.name} (${target.email}): ${res.message}`);
      }
    }

    setSendingCompose(false);
    setBulkProgress(null);
    setBulkDispatchResult({
      successCount,
      failCount,
      details: detailsLog
    });
  };

  // --- PLANTILLAS & PRUEBAS (TESTS) ESTADOS ---
  const defaultTestTargetEmail = bookingSettings?.emailConfig?.senderEmail || bookingSettings?.googleConfig?.userEmail || 'experienciainfinity@gmail.com';
  const [testTargetEmails, setTestTargetEmails] = useState<Record<string, string>>({
    confirmation: defaultTestTargetEmail,
    reminder: defaultTestTargetEmail,
    followup: defaultTestTargetEmail,
    cancellation: defaultTestTargetEmail,
    agreement: defaultTestTargetEmail,
    quotation: defaultTestTargetEmail
  });

  const [editableTemplates, setEditableTemplates] = useState<Record<string, CustomEmailTemplate>>({});
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState<Record<string, boolean>>({});
  const [openEditorId, setOpenEditorId] = useState<string | null>(null);
  const [testingTemplateId, setTestingTemplateId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [customSheetUrlInput, setCustomSheetUrlInput] = useState(bookingSettings?.googleConfig?.customSpreadsheetUrl || '');

  const handleSaveCustomSheetUrl = async () => {
    const raw = customSheetUrlInput.trim();
    let sheetId = '';
    const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      sheetId = match[1];
    } else {
      sheetId = raw;
    }

    const updatedConfig = {
      ...(bookingSettings?.googleConfig || {}),
      customSpreadsheetUrl: raw,
      customSpreadsheetId: sheetId
    };

    await updateBookingSettings({
      ...bookingSettings,
      googleConfig: updatedConfig
    });

    alert("✓ Enlace de Google Sheets personalizado guardado exitosamente. Tus transacciones se sincronizarán en vivo en esa hoja.");
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const clientId = googleClientId.trim() || bookingSettings?.googleConfig?.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com';
      const clientSecret = googleClientSecret.trim() || bookingSettings?.googleConfig?.clientSecret || import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';

      let res;
      try {
        // Conexión avanzada con token de actualización (Offline flow con PKCE)
        const offlineRes = await connectGoogleAccountOffline(clientId, clientSecret);
        res = {
          accessToken: offlineRes.accessToken,
          refreshToken: offlineRes.refreshToken,
          userEmail: offlineRes.userEmail
        };
      } catch (offlineErr: any) {
        if (clientSecret) {
          throw new Error(`El flujo de conexión permanente falló: ${offlineErr.message}. Verifica que el Client Secret sea correcto y que la URI de redirección 'https://interpres-panel.web.app' esté agregada en tu consola de Google Cloud.`);
        }
        console.warn("Flujo offline PKCE omitido o no compatible sin secreto. Usando vinculación directa:", offlineErr.message);
        const simpleRes = await connectGoogleAccount1Click();
        res = {
          accessToken: simpleRes.accessToken,
          refreshToken: '',
          userEmail: simpleRes.userEmail
        };
      }

      const email = res.userEmail || bookingSettings?.googleConfig?.userEmail || 'admin@interpresdigital.com';
      const updatedGoogle = {
        ...(bookingSettings?.googleConfig || {}),
        enabled: true,
        connected: true,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        refreshToken: res.refreshToken || bookingSettings?.googleConfig?.refreshToken || undefined,
        accessToken: res.accessToken,
        userEmail: email,
        connectedAt: new Date().toISOString(),
        tokenObtainedAt: Date.now()
      };

      await updateBookingSettings({
        ...bookingSettings,
        googleConfig: updatedGoogle
      });

      alert(`¡Cuenta de Google Workspace (${email}) vinculada exitosamente con renovación automática permanente!`);
    } catch (err: any) {
      console.error("Error conectando Google Workspace:", err);
      alert(err.message || "Error al conectar con la cuenta de Google.");
    } finally {
      setConnectingGoogle(false);
    }
  };

  // Cargar plantillas de Firestore o inicializar con valores predeterminados
  useEffect(() => {
    const initialMap: Record<string, CustomEmailTemplate> = {};
    EMAIL_TEMPLATES.forEach(tpl => {
      if (bookingSettings?.emailTemplates?.[tpl.id]) {
        initialMap[tpl.id] = { ...bookingSettings.emailTemplates[tpl.id] };
      } else {
        initialMap[tpl.id] = {
          id: tpl.id,
          name: tpl.name,
          subject: tpl.subject,
          bodyTemplate: tpl.bodyTemplate
        };
      }
    });
    setEditableTemplates(initialMap);
    
    if (bookingSettings?.geminiConfig) {
      setGeminiApiKey(bookingSettings.geminiConfig.apiKey || '');
      setGeminiEnabled(bookingSettings.geminiConfig.enabled || false);
    }

    // Las credenciales de Google no se cargan en memoria del navegador por seguridad
  }, [bookingSettings]);

  const handleUpdateTemplateField = (id: string, field: 'subject' | 'bodyTemplate', value: string) => {
    setEditableTemplates(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleInsertVariableToTemplate = (id: string, field: 'subject' | 'bodyTemplate', varName: string) => {
    setEditableTemplates(prev => {
      const current = prev[id] || { id, name: '', subject: '', bodyTemplate: '' };
      return {
        ...prev,
        [id]: {
          ...current,
          [field]: (current[field] || '') + ` {${varName}} `
        }
      };
    });
  };

  const handleSaveTemplate = async (templateId: string) => {
    setSavingTemplateId(templateId);
    try {
      const updatedTemplates = {
        ...(bookingSettings?.emailTemplates || {}),
        [templateId]: editableTemplates[templateId]
      };

      await updateBookingSettings({
        ...bookingSettings,
        emailTemplates: updatedTemplates
      });

      setTemplateSaveSuccess(prev => ({ ...prev, [templateId]: true }));
      setTimeout(() => {
        setTemplateSaveSuccess(prev => ({ ...prev, [templateId]: false }));
      }, 3000);
    } catch (err) {
      console.error("Error al guardar plantilla de correo:", err);
      alert("Ocurrió un error al guardar la plantilla en Firestore.");
    } finally {
      setSavingTemplateId(null);
    }
  };

  const handleResetTemplate = (templateId: string) => {
    const defaultTpl = EMAIL_TEMPLATES.find(t => t.id === templateId);
    if (defaultTpl) {
      setEditableTemplates(prev => ({
        ...prev,
        [templateId]: {
          id: defaultTpl.id,
          name: defaultTpl.name,
          subject: defaultTpl.subject,
          bodyTemplate: defaultTpl.bodyTemplate
        }
      }));
    }
  };

  const handleRunTemplateTest = async (templateId: 'confirmation' | 'reminder' | 'followup' | 'cancellation' | 'agreement' | 'quotation') => {
    const target = testTargetEmails[templateId] || defaultTestTargetEmail;
    if (!target) {
      alert("Ingresa un correo para recibir el test.");
      return;
    }

    setTestingTemplateId(templateId);
    setTestResults(prev => ({ ...prev, [templateId]: null }));

    const currentCustomTpl = editableTemplates[templateId];

    const res = await sendTestEmailTemplate(
      templateId,
      target,
      bookingSettings?.googleConfig,
      currentCustomTpl,
      companyInfo
    );

    setTestingTemplateId(null);
    setTestResults(prev => ({ ...prev, [templateId]: res }));
  };

  // Drawing Pad Refs and States
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A'; // Slate 900

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl('');
  };

  // Sync state with Context when async load finishes
  React.useEffect(() => {
    setCommercialName(companyInfo.commercialName || '');
    setBusinessName(companyInfo.businessName || '');
    setAddress(companyInfo.address || '');
    setEmail(companyInfo.email || '');
    setRfc(companyInfo.rfc || '');
    setWebsite(companyInfo.website || '');
    setSignatureBaseUrl(companyInfo.signatureBaseUrl || '');
    setLegalRepresentative(companyInfo.legalRepresentative || '');
    setSignatureDataUrl(companyInfo.signatureDataUrl || '');

    // Draw existing signature on canvas if exists
    if (companyInfo.signatureDataUrl) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = companyInfo.signatureDataUrl;
      }
    }
  }, [companyInfo]);

  const handleCompanySave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateCompanyInfo({
      commercialName,
      businessName,
      address,
      email,
      rfc,
      website,
      signatureBaseUrl,
      legalRepresentative,
      signatureDataUrl
    });
    setShowCompanySuccess(true);
    setTimeout(() => setShowCompanySuccess(false), 3000);
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      setPasswordError('La contraseña no puede estar vacía.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    setPasswordError('');
    await updateMasterPassword(newPassword);
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordSuccess(true);
    setTimeout(() => setShowPasswordSuccess(false), 3000);
  };

  const handleGeminiSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateBookingSettings({
      ...bookingSettings,
      geminiConfig: {
        apiKey: geminiApiKey,
        enabled: geminiEnabled
      }
    });
    setShowGeminiSuccess(true);
    setTimeout(() => setShowGeminiSuccess(false), 3000);
  };

  const handleGoogleCredentialsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalClientId = googleClientId.trim() || bookingSettings?.googleConfig?.clientId || '';
    const finalClientSecret = googleClientSecret.trim() || bookingSettings?.googleConfig?.clientSecret || '';

    await updateBookingSettings({
      ...bookingSettings,
      googleConfig: {
        ...(bookingSettings?.googleConfig || {}),
        clientId: finalClientId,
        clientSecret: finalClientSecret
      }
    });

    // Limpiar de la memoria del navegador inmediatamente
    setGoogleClientId('');
    setGoogleClientSecret('');

    setShowGoogleSuccess(true);
    setTimeout(() => setShowGoogleSuccess(false), 3000);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border flex gap-4 text-sm font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={clsx(
            "pb-3 px-2 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors",
            activeTab === 'general'
              ? "border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          )}
        >
          <Building2 className="w-4 h-4" />
          Datos & Seguridad Corporativa
        </button>

        <button
          onClick={() => setActiveTab('compose')}
          className={clsx(
            "pb-3 px-2 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors",
            activeTab === 'compose'
              ? "border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          )}
        >
          <Send className="w-4 h-4 text-indigo-500" />
          Redactar Correo Directo (Gmail)
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={clsx(
            "pb-3 px-2 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors",
            activeTab === 'templates'
              ? "border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          )}
        >
          <FlaskConical className="w-4 h-4 text-amber-500" />
          Plantillas de Correo y Pruebas (Tests)
        </button>
      </div>
      {/* TAB 1: DATOS CORPORATIVOS & SEGURIDAD */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna Principal - Datos de la Empresa */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-dark-border relative overflow-hidden transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-bl-full pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-primary-50 dark:bg-primary-950/30 text-primary-500 rounded-2xl">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Información Corporativa
                  </h2>
                  <p className="text-sm text-gray-400">
                    Estos datos se utilizarán para la generación de contratos y documentos fiscales.
                  </p>
                </div>
              </div>

              {showCompanySuccess && (
                <div className="mb-6 flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 animate-fade-in">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span className="font-semibold text-sm">Información guardada correctamente en Firestore.</span>
                </div>
              )}

              <form onSubmit={handleCompanySave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Nombre Comercial
                    </label>
                    <input
                      type="text"
                      value={commercialName}
                      onChange={(e) => setCommercialName(e.target.value)}
                      placeholder="Ej. Interpres Digital"
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Razón Social
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Ej. Interpres S.A. de C.V."
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Dirección Comercial / Fiscal
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej. Av. Reforma 123, Col. Centro, CDMX"
                    className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      RFC de la Empresa
                    </label>
                    <input
                      type="text"
                      value={rfc}
                      onChange={(e) => setRfc(e.target.value.toUpperCase())}
                      placeholder="Ej. IDM123456789"
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ej. administracion@interpres.com"
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Sitio Web de la Empresa
                    </label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="Ej. interpresdigital.com"
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Representante Legal (Empresa)
                    </label>
                    <input
                      type="text"
                      value={legalRepresentative}
                      onChange={(e) => setLegalRepresentative(e.target.value)}
                      placeholder="Ej. Nombre del Representante Legal"
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Dominio de la App/Panel para Enlaces (Opcional)
                    </label>
                    <input
                      type="text"
                      value={signatureBaseUrl}
                      onChange={(e) => setSignatureBaseUrl(e.target.value)}
                      placeholder="Ej. https://interpres-panel.web.app o https://panel.interpresdigital.com"
                      className="block w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-normal">
                      * Si usas un subdominio propio para el panel (ej. <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">panel.interpresdigital.com</code>), escríbelo aquí. De lo contrario, déjalo vacío o con <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">https://interpres-panel.web.app</code>.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 border-t border-gray-100 dark:border-dark-border pt-6 mt-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Firma Autógrafa del Representante Legal (Para Contratos y Cotizaciones)
                  </label>
                  
                  <div className="flex flex-col md:flex-row items-start gap-6 pt-2">
                    <div className="bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-2xl p-3 flex flex-col items-center">
                      <canvas
                        ref={canvasRef}
                        width={280}
                        height={120}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="bg-white border border-gray-200 rounded-xl cursor-crosshair touch-none"
                        style={{ width: '280px', height: '120px' }}
                      />
                      <div className="flex justify-between w-full mt-2">
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="text-xxs font-bold text-rose-500 hover:text-rose-600 px-1 py-0.5"
                        >
                          Limpiar Pizarra
                        </button>
                        <span className="text-xxs text-gray-400">Dibuja aquí tu firma</span>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-start gap-3 w-full">
                      <span className="text-xs text-gray-500 dark:text-gray-400">O también puedes subir una imagen de tu firma digitalizada:</span>
                      <input
                        type="file"
                        accept="image/*"
                        id="sig-upload"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const base64 = event.target?.result as string;
                              setSignatureDataUrl(base64);
                              const canvas = canvasRef.current;
                              if (canvas) {
                                const ctx = canvas.getContext('2d');
                                const img = new Image();
                                img.onload = () => {
                                  ctx?.clearRect(0, 0, canvas.width, canvas.height);
                                  ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                                };
                                img.src = base64;
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor="sig-upload"
                        className="w-fit px-4 py-2 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer text-center transition-colors"
                      >
                        Subir Imagen (.png, .jpg)
                      </label>

                      {signatureDataUrl ? (
                        <div className="mt-1">
                          <span className="text-xxs font-bold text-emerald-600 dark:text-emerald-400 block mb-1">✓ Vista Previa de la Firma Registrada:</span>
                          <img src={signatureDataUrl} alt="Firma Guardada" className="h-16 object-contain bg-white border border-gray-200 rounded-xl p-2 max-w-[200px]" />
                        </div>
                      ) : (
                        <span className="text-xxs text-gray-400">No hay ninguna firma guardada actualmente.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-dark-border">
                  <button
                    type="submit"
                    className="px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-800 hover:from-primary-700 hover:to-primary-900 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    Guardar Datos de Empresa
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Lateral - Tema y Seguridad */}
          <div className="space-y-8">
            
            {/* Tarjeta de Tema */}
            <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-dark-border transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-2xl">
                  {theme === 'dark' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Apariencia
                  </h2>
                  <p className="text-sm text-gray-400">
                    Selecciona tu tema preferido
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => theme === 'dark' && toggleTheme()}
                  className={clsx(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 gap-2",
                    theme === 'light'
                      ? "border-primary-500 bg-primary-50/50 text-primary-600 ring-2 ring-primary-500/20"
                      : "border-gray-200 dark:border-dark-border text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg"
                  )}
                >
                  <Sun className="w-6 h-6" />
                  <span className="font-semibold text-sm">Modo Claro</span>
                </button>

                <button
                  onClick={() => theme === 'light' && toggleTheme()}
                  className={clsx(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 gap-2",
                    theme === 'dark'
                      ? "border-primary-500 bg-primary-950/30 text-primary-400 ring-2 ring-primary-500/20"
                      : "border-gray-200 dark:border-dark-border text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-bg"
                  )}
                >
                  <Moon className="w-6 h-6" />
                  <span className="font-semibold text-sm">Modo Oscuro</span>
                </button>
              </div>
            </div>

            {/* Tarjeta de Seguridad (Contraseña) */}
            <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-dark-border transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-bl-full pointer-events-none" />

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-2xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Código de Acceso
                  </h2>
                  <p className="text-sm text-gray-400">
                    Actualiza tu clave maestra
                  </p>
                </div>
              </div>

              {showPasswordSuccess && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold text-xs">Clave maestra actualizada con éxito.</span>
                </div>
              )}

              {passwordError && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium text-xs">{passwordError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Nueva Clave Maestra
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordError('');
                      }}
                      placeholder="Mínimo 4 caracteres"
                      className="block w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Confirmar Clave
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setPasswordError('');
                      }}
                      placeholder="Repite la clave maestra"
                      className="block w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gray-900 dark:bg-white dark:text-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-md text-sm"
                >
                  Actualizar Clave en Firestore
                </button>
              </form>
            </div>
            {/* Tarjeta de IA (Gemini API Key) */}
            <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-dark-border transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-bl-full pointer-events-none" />

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 rounded-2xl">
                  <FlaskConical className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Integración de IA (Gemini)
                  </h2>
                  <p className="text-sm text-gray-400">
                    Configura diagnósticos del Command Center
                  </p>
                </div>
              </div>

              {showGeminiSuccess && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold text-xs">Clave de Gemini guardada correctamente.</span>
                </div>
              )}

              <form onSubmit={handleGeminiSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Google Gemini API Key
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                      <Key className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="block w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setGeminiEnabled(!geminiEnabled)}
                    className={clsx(
                      "w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer",
                      geminiEnabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"
                    )}
                  >
                    <div className={clsx(
                      "bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200",
                      geminiEnabled ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Activar Diagnósticos con IA
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-md text-sm"
                >
                  Guardar Configuración IA
                </button>
              </form>
            </div>

            {/* Tarjeta de Google Workspace (Gmail, Calendar, Contacts) */}
            <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-dark-border transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-bl-full pointer-events-none" />

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 rounded-2xl">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Credenciales Google Workspace
                  </h2>
                  <p className="text-sm text-gray-400">
                    Configura las credenciales de Google OAuth 2.0 para el envío permanente de correos.
                  </p>
                </div>
              </div>

              {showGoogleSuccess && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold text-xs">Credenciales de Google guardadas correctamente.</span>
                </div>
              )}

              <form onSubmit={handleGoogleCredentialsSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Google Client ID
                  </label>
                  <div className="relative">
                    <input
                      type={showGoogleClientId ? "text" : "password"}
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      placeholder={bookingSettings?.googleConfig?.clientId ? "•••••••••••• (Guardado y protegido en la Base de Datos)" : "Ingrese el Client ID"}
                      className="block w-full pl-4 pr-10 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGoogleClientId(!showGoogleClientId)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {showGoogleClientId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Google Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showGoogleClientSecret ? "text" : "password"}
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      placeholder={bookingSettings?.googleConfig?.clientSecret ? "•••••••••••• (Guardado y protegido en la Base de Datos)" : "Ingrese el Client Secret"}
                      className="block w-full pl-4 pr-10 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGoogleClientSecret(!showGoogleClientSecret)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {showGoogleClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-md text-sm mb-4"
                >
                  Guardar Credenciales de Google
                </button>
              </form>

              <div className="border-t border-gray-150 dark:border-dark-border pt-4 mt-4 space-y-3">
                <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Estado de la Vinculación:
                </span>
                {bookingSettings?.googleConfig?.connected ? (
                  <div className="flex flex-col gap-2">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-xs">
                      🟢 Conectado con <strong>{bookingSettings.googleConfig.userEmail}</strong>
                      {!bookingSettings.googleConfig.refreshToken && (
                        <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                          ⚠️ Advertencia: No hay refresh token. La sesión expirará en 1 hora. Guarda el Client Secret y reconecta para obtener acceso permanente.
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={connectingGoogle}
                      onClick={handleConnectGoogle}
                      className="w-full py-2.5 bg-emerald-700/10 hover:bg-emerald-700/20 text-emerald-800 dark:text-emerald-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                    >
                      <RefreshCw className={clsx("w-4 h-4", connectingGoogle && "animate-spin")} />
                      <span>Reconectar y Autorizar</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-100 dark:border-rose-900/30 text-xs">
                      🔴 Cuenta de Google Workspace Desconectada
                    </div>
                    <button
                      type="button"
                      disabled={connectingGoogle}
                      onClick={handleConnectGoogle}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                    >
                      {connectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                      <span>Vincular Cuenta de Google</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Configurar Hoja de Google Sheets Personalizada */}
            <div className="pt-4 border-t border-gray-100 dark:border-dark-border space-y-3">
              <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                Vincular Hoja de Cálculo Específica de Google Sheets (En Vivo)
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pega el enlace o ID de tu hoja de Google Sheets para que todas las transacciones de Finanzas se escriban automáticamente en tiempo real dentro de tu documento personal.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/TU_ID_DE_HOJA/edit"
                  value={customSheetUrlInput}
                  onChange={e => setCustomSheetUrlInput(e.target.value)}
                  className="flex-1 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveCustomSheetUrl}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
                >
                  Vincular Hoja
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: REDACTAR CORREO DIRECTO (GMAIL API) */}
      {activeTab === 'compose' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 dark:border-dark-border space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-dark-border">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 rounded-2xl">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Redactar y Enviar Correo Electrónico</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Envía mensajes personalizados directamente vía Gmail API seleccionando clientes o contactos de videollamadas.
                </p>
              </div>
            </div>

            {/* Banner Estado de Google Gmail API */}
            {(() => {
              const isConnected = Boolean(bookingSettings?.googleConfig?.connected || bookingSettings?.googleConfig?.userEmail);
              const userEmail = bookingSettings?.googleConfig?.userEmail || 'admin@interpresdigital.com';

              if (!isConnected) {
                return (
                  <div className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 text-rose-800 dark:text-rose-300">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-rose-500 text-white">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider">🔴 Cuenta de Google Workspace Desconectada</h4>
                        <p className="text-xs opacity-90 mt-0.5">Para enviar correos de prueba y automáticos, vincula tu cuenta corporativa de Google.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={connectingGoogle}
                      onClick={handleConnectGoogle}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all flex-shrink-0 disabled:opacity-50"
                    >
                      {connectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                      <span>{connectingGoogle ? "Conectando..." : "🔑 Vincular Cuenta de Google"}</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-emerald-500 text-white">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">🟢 Cuenta de Google Workspace Conectada y Activa</h4>
                      <p className="text-xs opacity-90 mt-0.5">Cuenta corporativa vinculada: <strong>{userEmail}</strong>.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={connectingGoogle}
                    onClick={handleConnectGoogle}
                    className="px-3.5 py-2 bg-emerald-700/10 hover:bg-emerald-700/20 text-emerald-800 dark:text-emerald-300 font-bold rounded-xl text-xxs flex items-center gap-1.5 transition-all flex-shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconectar</span>
                  </button>
                </div>
              );
            })()}

            <form onSubmit={handleSendComposeEmail} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Columna Izquierda (Destinatarios y Adjuntos) */}
              <div className="lg:col-span-6 space-y-6">
                {/* SECCIÓN DE DESTINATARIOS UNIFICADOS */}
                <div className="space-y-4 p-5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-2xl animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-indigo-100 dark:border-indigo-900/50">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        Destinatarios (Para):
                      </h3>
                      <p className="text-xxs text-gray-500 dark:text-gray-400 mt-0.5">
                        Ingresa correos manuales o marca las casillas de tus clientes/prospectos.
                      </p>
                    </div>

                    {unifiedTargets.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllTargets}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xxs font-bold transition-all border border-rose-200 dark:border-rose-950/20"
                      >
                        ✖ Limpiar Todo
                      </button>
                    )}
                  </div>

                  {/* 1. Correos Manuales */}
                  <div className="space-y-1">
                    <label className="block text-xxs font-bold text-gray-500 uppercase tracking-wider">
                      ✏️ Agregar Correos Manuales:
                    </label>
                    <input
                      type="text"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="Escribe correos separados por comas (ej. correo@dominio.com, otro@gmail.com)..."
                      className="w-full px-3 py-2.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs rounded-xl outline-none focus:border-indigo-500 shadow-sm"
                    />
                  </div>

                  {/* 2. Reservación de Agenda */}
                  <div className="space-y-1">
                    <label className="block text-xxs font-bold text-gray-500 uppercase tracking-wider">
                      📅 Agregar Cita de la Agenda:
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const booking = bookings.find(b => b.id === e.target.value);
                        if (booking?.clientEmail && selectedBookingId !== booking.id) {
                          setSelectedBookingId(booking.id);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs rounded-xl outline-none"
                    >
                      <option value="">➕ Seleccionar Cita...</option>
                      {bookings.filter(b => b.clientEmail).map(b => (
                        <option key={b.id} value={b.id}>
                          📅 {b.clientName} ({b.date}) - {b.clientEmail}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Desplegable de Clientes Activos */}
                  <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface shadow-sm">
                    <button
                      type="button"
                      onClick={() => setIsOpenClientsDropdown(!isOpenClientsDropdown)}
                      className="w-full flex items-center justify-between p-3.5 bg-gray-50 dark:bg-dark-bg text-left font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 transition-all select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-500" />
                        <span>👥 Menú de Clientes Activos</span>
                        <span className="text-xxs font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                          {selectedActiveCount} marcados / {activeClientsCount} en total
                        </span>
                      </div>
                      {isOpenClientsDropdown ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                    </button>

                    {isOpenClientsDropdown && (
                      <div className="p-3.5 border-t border-gray-200 dark:border-dark-border space-y-3 bg-white dark:bg-dark-surface animate-fade-in">
                        {/* Buscador de clientes */}
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400">
                            <Search className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="text"
                            value={clientsSearchQuery}
                            onChange={(e) => setClientsSearchQuery(e.target.value)}
                            placeholder="Buscar cliente por nombre, empresa o correo..."
                            className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs rounded-xl outline-none focus:border-indigo-500 focus:bg-white"
                          />
                        </div>

                        {/* Botones rápidos */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectClientsByStatus('Activo')}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 rounded text-xxs font-bold transition-all border border-emerald-250/50"
                          >
                            ⚡ Marcar Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeselectClientsByStatus('Activo')}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 rounded text-xxs font-bold transition-all border border-rose-250/50"
                          >
                            ✖ Desmarcar Todos
                          </button>
                        </div>

                        {/* Lista de clientes activos */}
                        <div className="max-h-40 overflow-y-auto border border-gray-150 dark:border-dark-border rounded-xl divide-y divide-gray-100 dark:divide-dark-border">
                          {filteredActiveClients.length === 0 ? (
                            <div className="p-3 text-center text-xs text-gray-400 font-medium bg-gray-50/50">
                              No hay clientes activos que coincidan.
                            </div>
                          ) : (
                            filteredActiveClients.map(c => {
                              const isSelected = selectedClientIds.includes(c.id);
                              const hasEmail = Boolean(c.email && c.email.trim());
                              return (
                                <label
                                  key={c.id}
                                  className={clsx(
                                    "flex items-center justify-between p-2 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-colors text-xs select-none",
                                    !hasEmail && "opacity-50 cursor-not-allowed bg-gray-50/30"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={!hasEmail}
                                      onChange={() => {
                                        if (hasEmail) {
                                          handleToggleSelectClient(c.id);
                                        }
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                    <div>
                                      <span className="font-bold text-gray-900 dark:text-white">{c.name}</span>
                                      {c.companyName && (
                                        <span className="text-xxs font-semibold text-gray-500 dark:text-gray-400 ml-1">
                                          ({c.companyName})
                                        </span>
                                      )}
                                      <span className="block text-xxs text-gray-400 font-mono mt-0.5">
                                        {hasEmail ? c.email : "⚠️ Sin correo registrado"}
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Desplegable de Prospectos */}
                  <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface shadow-sm">
                    <button
                      type="button"
                      onClick={() => setIsOpenLeadsDropdown(!isOpenLeadsDropdown)}
                      className="w-full flex items-center justify-between p-3.5 bg-gray-50 dark:bg-dark-bg text-left font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 transition-all select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-500" />
                        <span>⚡ Menú de Prospectos</span>
                        <span className="text-xxs font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                          {selectedProspectCount} marcados / {prospectClientsCount} en total
                        </span>
                      </div>
                      {isOpenLeadsDropdown ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                    </button>

                    {isOpenLeadsDropdown && (
                      <div className="p-3.5 border-t border-gray-200 dark:border-dark-border space-y-3 bg-white dark:bg-dark-surface animate-fade-in">
                        {/* Buscador de prospectos */}
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400">
                            <Search className="w-3.5 h-3.5" />
                          </span>
                          <input
                            type="text"
                            value={leadsSearchQuery}
                            onChange={(e) => setLeadsSearchQuery(e.target.value)}
                            placeholder="Buscar prospecto por nombre, empresa o correo..."
                            className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs rounded-xl outline-none focus:border-indigo-500 focus:bg-white"
                          />
                        </div>

                        {/* Botones rápidos */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectClientsByStatus('Prospecto')}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 rounded text-xxs font-bold transition-all border border-amber-250/50"
                          >
                            ⚡ Marcar Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeselectClientsByStatus('Prospecto')}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 rounded text-xxs font-bold transition-all border border-rose-250/50"
                          >
                            ✖ Desmarcar Todos
                          </button>
                        </div>

                        {/* Lista de prospectos */}
                        <div className="max-h-40 overflow-y-auto border border-gray-150 dark:border-dark-border rounded-xl divide-y divide-gray-100 dark:divide-dark-border">
                          {filteredProspectClients.length === 0 ? (
                            <div className="p-3 text-center text-xs text-gray-400 font-medium bg-gray-50/50">
                              No hay prospectos que coincidan.
                            </div>
                          ) : (
                            filteredProspectClients.map(c => {
                              const isSelected = selectedClientIds.includes(c.id);
                              const hasEmail = Boolean(c.email && c.email.trim());
                              return (
                                <label
                                  key={c.id}
                                  className={clsx(
                                    "flex items-center justify-between p-2 cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-colors text-xs select-none",
                                    !hasEmail && "opacity-50 cursor-not-allowed bg-gray-50/30"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={!hasEmail}
                                      onChange={() => {
                                        if (hasEmail) {
                                          handleToggleSelectClient(c.id);
                                        }
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                    <div>
                                      <span className="font-bold text-gray-900 dark:text-white">{c.name}</span>
                                      {c.companyName && (
                                        <span className="text-xxs font-semibold text-gray-500 dark:text-gray-400 ml-1">
                                          ({c.companyName})
                                        </span>
                                      )}
                                      <span className="block text-xxs text-gray-400 font-mono mt-0.5">
                                        {hasEmail ? c.email : "⚠️ Sin correo registrado"}
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resumen de destinatarios incluidos */}
                  {unifiedTargets.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-dark-border">
                      <span className="text-xxs font-bold text-indigo-500 uppercase tracking-wider block">
                        Destinatarios Incluidos ({unifiedTargets.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1 p-2 bg-white dark:bg-dark-surface border border-gray-250 dark:border-dark-border rounded-xl">
                        {unifiedTargets.map(t => (
                          <span
                            key={t.id || t.email}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xxs font-bold"
                          >
                            <span>{t.source === 'client' ? '👥' : t.source === 'booking' ? '📅' : '✏️'} {t.name} ({t.email})</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveUnifiedTarget(t)}
                              className="text-indigo-400 hover:text-rose-600 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ADJUNTAR ARCHIVOS LOCALES (PDFs, IMÁGENES, DOCUMENTOS DESDE TU COMPUTADORA) */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-indigo-400" />
                      Adjuntar Archivos (PDF, Imágenes, Docs):
                    </span>
                    <span className="text-xxs text-slate-400">Las imágenes se usarán como banner de cabecera</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all shadow-md">
                      <Plus className="w-4 h-4" />
                      <span>Seleccionar de mi PC</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                        className="hidden"
                        onChange={handleAddLocalAttachment}
                      />
                    </label>

                    <span className="text-xxs text-slate-400 font-medium">
                      {emailAttachments.length === 0 
                        ? "Sin archivos." 
                        : `${emailAttachments.length} ${emailAttachments.length === 1 ? 'archivo' : 'archivos'}`}
                    </span>
                  </div>

                  {/* Lista de Archivos Adjuntos Cargados */}
                  {emailAttachments.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {emailAttachments.map((att, idx) => {
                        const isImage = att.type.startsWith('image/');
                        const isPdf = att.type.includes('pdf');
                        const sizeKb = (att.size / 1024).toFixed(1);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/90 border border-slate-700 rounded-xl text-xs">
                            <div className="flex items-center gap-2 overflow-hidden pr-2">
                              {isImage ? (
                                <div className="w-8 h-8 rounded overflow-hidden bg-black/20 flex-shrink-0 flex items-center justify-center">
                                  <img src={att.base64} alt="Preview" className="w-full h-full object-cover" />
                                </div>
                              ) : isPdf ? (
                                <FileText className="w-4 h-4 text-rose-400 flex-shrink-0" />
                              ) : (
                                <File className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                              )}
                              <div className="truncate">
                                <div className="font-bold text-slate-200 truncate">{att.name}</div>
                                <div className="text-xxs text-slate-400 font-mono">{sizeKb} KB | {isImage ? 'Imagen' : isPdf ? 'PDF' : 'Archivo'}</div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Eliminar archivo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Columna Derecha (Asunto, Mensaje y Enviar) */}
              <div className="lg:col-span-6 space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  {/* Asunto */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Asunto del Correo:
                    </label>
                    <input
                      type="text"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      placeholder="Asunto formal del mensaje..."
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-medium dark:text-white"
                    />
                  </div>

                  {/* Botones de Inserción Rápida de Enlaces */}
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5" />
                      Adjuntar / Insertar Enlaces Rápidos en el Mensaje:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* Insertar Cotización */}
                      <div>
                        <select
                          onChange={(e) => {
                            const q = quotations.find(item => item.id === e.target.value);
                            if (q) {
                              const baseUrl = getAppBaseUrl(companyInfo);
                              handleInsertLink(`📄 Ver Cotización Online (${q.title || 'Propuesta Comercial'} - $${q.total.toLocaleString()} MXN):\n${baseUrl}/#/quote/${q.id}`);
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xxs font-semibold bg-slate-800 border border-slate-700 text-slate-200 rounded-xl"
                        >
                          <option value="">➕ Cotización...</option>
                          {quotations.map(q => (
                            <option key={q.id} value={q.id}>📄 {q.clientName} - ${q.total.toLocaleString()}</option>
                          ))}
                        </select>
                      </div>

                      {/* Insertar Contrato */}
                      <div>
                        <select
                          onChange={(e) => {
                            const a = agreements.find(item => item.id === e.target.value);
                            if (a) {
                              const baseUrl = getAppBaseUrl(companyInfo);
                              handleInsertLink(`✍️ Ver y Firmar Contrato Digital (${a.title}):\n${baseUrl}/#/sign/${a.id}`);
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xxs font-semibold bg-slate-800 border border-slate-700 text-slate-200 rounded-xl"
                        >
                          <option value="">➕ Contrato...</option>
                          {agreements.map(a => (
                            <option key={a.id} value={a.id}>✍️ {a.title} ({a.clientName})</option>
                          ))}
                        </select>
                      </div>

                      {/* Insertar Enlace de Zoom / Agendamiento */}
                      <div>
                        <select
                          onChange={(e) => {
                            const p = bookingSettings?.platforms?.find(item => item.id === e.target.value);
                            if (p) {
                              const baseUrl = getAppBaseUrl(companyInfo);
                              handleInsertLink(`📅 Enlace de Agendamiento Online (${p.name}):\n${baseUrl}/#/book/${p.slug}`);
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xxs font-semibold bg-slate-800 border border-slate-700 text-slate-200 rounded-xl"
                        >
                          <option value="">➕ Agendamiento...</option>
                          {(bookingSettings?.platforms || []).map(p => (
                            <option key={p.id} value={p.id}>🎥 {p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Mensaje Body */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Cuerpo del Mensaje (Soporta variables como {"{nombre_cliente}"}):
                    </label>
                    <textarea
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      rows={10}
                      placeholder="Escribe aquí tu comunicado..."
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-medium dark:text-white leading-relaxed"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  {composeResult && (
                    <div className={clsx(
                      "p-4 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in",
                      composeResult.success 
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200" 
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200"
                    )}>
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                      <span>{composeResult.message}</span>
                    </div>
                  )}

                  {/* Barra de Progreso de Envío Masivo */}
                  {bulkProgress && (
                    <div className="p-4 bg-indigo-900 text-white rounded-2xl space-y-2 shadow-lg animate-fade-in">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
                          Enviando ({bulkProgress.current} de {bulkProgress.total})...
                        </span>
                        <span>{bulkProgress.percentage}%</span>
                      </div>
                      <div className="w-full bg-indigo-950 rounded-full h-2 overflow-hidden">
                        <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${bulkProgress.percentage}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Resultado Detallado de Envío Masivo */}
                  {bulkDispatchResult && (
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-2xl space-y-2 animate-fade-in">
                      <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-dark-border">
                        <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Reporte Masivo:</span>
                        <span className="text-xxs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-250">
                          ✓ {bulkDispatchResult.successCount} ok | ❌ {bulkDispatchResult.failCount} error
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto font-mono text-xxs bg-white dark:bg-dark-surface p-2 rounded-lg border border-gray-100 dark:border-dark-border">
                        {bulkDispatchResult.details.map((logLine, idx) => (
                          <div key={idx} className={logLine.startsWith('✓') ? "text-emerald-600" : "text-rose-500"}>
                            {logLine}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sendingCompose}
                    className="w-full bg-gradient-to-r from-indigo-600 via-primary-600 to-emerald-600 hover:opacity-95 text-white font-bold py-4 px-6 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                  >
                    {sendingCompose ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    <span>
                      {sendingCompose
                        ? `Enviando por Gmail API...`
                        : recipientGroup === 'client'
                        ? `🚀 Despachar Correo Masivo por Gmail API (${selectedClientIds.length} destinatarios)`
                        : `🚀 Despachar Correo por Gmail API`}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>

        </div>
      )}

      {/* TAB 3: PLANTILLAS DE CORREO Y PRUEBAS (TESTS) */}
      {activeTab === 'templates' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white dark:bg-dark-surface rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 dark:border-dark-border space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-dark-border">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-2xl">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Plantillas de Correo Electrónico, Edición & Envíos de Prueba</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Edita el asunto y contenido de cada plantilla corporativa y realiza pruebas de recepción en tiempo real.
                </p>
              </div>
            </div>

            {/* Banner Estado de Google Gmail API */}
            {(() => {
              const isConnected = Boolean(bookingSettings?.googleConfig?.connected || bookingSettings?.googleConfig?.userEmail);
              const userEmail = bookingSettings?.googleConfig?.userEmail || 'admin@interpresdigital.com';

              if (!isConnected) {
                return (
                  <div className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 text-rose-800 dark:text-rose-300">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-rose-500 text-white">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider">🔴 Cuenta de Google Workspace Desconectada</h4>
                        <p className="text-xs opacity-90 mt-0.5">Para enviar correos de prueba y automáticos, vincula tu cuenta corporativa de Google.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={connectingGoogle}
                      onClick={handleConnectGoogle}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all flex-shrink-0 disabled:opacity-50"
                    >
                      {connectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                      <span>{connectingGoogle ? "Conectando..." : "🔑 Vincular Cuenta de Google"}</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-emerald-500 text-white">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">🟢 Cuenta de Google Workspace Conectada y Activa</h4>
                      <p className="text-xs opacity-90 mt-0.5">Cuenta corporativa vinculada: <strong>{userEmail}</strong>.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={connectingGoogle}
                    onClick={handleConnectGoogle}
                    className="px-3.5 py-2 bg-emerald-700/10 hover:bg-emerald-700/20 text-emerald-800 dark:text-emerald-300 font-bold rounded-xl text-xxs flex items-center gap-1.5 transition-all flex-shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconectar</span>
                  </button>
                </div>
              );
            })()}

            <div className="space-y-6">
              {[
                { id: 'confirmation', title: '1. Confirmación de Cita con Zoom', desc: 'Enviado automáticamente al agendar una videollamada.', badge: 'Zoom & HTML', vars: ['nombre_cliente', 'plataforma', 'fecha', 'hora', 'tema', 'enlace_zoom'] },
                { id: 'reminder', title: '2. Recordatorio Pre-Reunión', desc: 'Enviado 1 hora antes del inicio de la videollamada.', badge: 'Recordatorio', vars: ['nombre_cliente', 'plataforma', 'fecha', 'hora', 'enlace_zoom'] },
                { id: 'followup', title: '3. Agradecimiento Post-Videollamada', desc: 'Enviado después de concluir la sesión en Zoom.', badge: 'Seguimiento', vars: ['nombre_cliente', 'plataforma'] },
                { id: 'cancellation', title: '4. Notificación de Cancelación de Cita', desc: 'Enviado al cancelar o cambiar estatus a Cancelada.', badge: 'Cancelación', vars: ['nombre_cliente', 'plataforma', 'fecha', 'hora', 'enlace_reagendar'] },
                { id: 'agreement', title: '5. Envío de Contrato Digital', desc: 'Plantilla utilizada para el despacho de contratos de clientes.', badge: 'Contratos', vars: ['nombre_cliente', 'titulo_contrato', 'enlace_contrato'] },
                { id: 'quotation', title: '6. Envío de Cotización Comercial', desc: 'Plantilla utilizada para enviar propuestas comerciales.', badge: 'Cotizaciones', vars: ['nombre_cliente', 'enlace_cotizacion'] },
              ].map(tpl => {
                const currentData = editableTemplates[tpl.id] || {
                  id: tpl.id,
                  name: tpl.title,
                  subject: '',
                  bodyTemplate: ''
                };
                const isEditorOpen = openEditorId === tpl.id;

                return (
                  <div key={tpl.id} className="p-6 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-3xl space-y-4 transition-all">
                    {/* Header de la tarjeta */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">{tpl.title}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-xxs font-extrabold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 uppercase">
                            {tpl.badge}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tpl.desc}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setOpenEditorId(isEditorOpen ? null : tpl.id)}
                        className={clsx(
                          "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm",
                          isEditorOpen
                            ? "bg-indigo-600 text-white shadow-indigo-500/20"
                            : "bg-white dark:bg-dark-surface text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-dark-border hover:bg-gray-100"
                        )}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEditorOpen ? "Cerrar Editor" : "✏️ Editar Plantilla"}</span>
                      </button>
                    </div>

                    {/* Formulario Editor de la Plantilla */}
                    {isEditorOpen && (
                      <div className="p-5 bg-white dark:bg-dark-surface border border-indigo-100 dark:border-indigo-900/30 rounded-2xl space-y-5 animate-fade-in">
                        {/* Asunto */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                            Asunto del Correo:
                          </label>
                          <input
                            type="text"
                            value={currentData.subject}
                            onChange={(e) => handleUpdateTemplateField(tpl.id, 'subject', e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-semibold dark:text-white"
                          />
                        </div>

                        {/* Variables automáticas clicables */}
                        <div className="space-y-1.5">
                          <span className="text-xxs font-bold text-indigo-500 uppercase tracking-wider block">
                            💡 Haz clic en una variable para insertarla en el mensaje:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {tpl.vars.map(v => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => handleInsertVariableToTemplate(tpl.id, 'bodyTemplate', v)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-xxs font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                              >
                                + {'{'}{v}{'}'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Cuerpo de la Plantilla */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                            Cuerpo del Mensaje (Texto con variables):
                          </label>
                          <textarea
                            value={currentData.bodyTemplate}
                            onChange={(e) => handleUpdateTemplateField(tpl.id, 'bodyTemplate', e.target.value)}
                            rows={7}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs font-medium leading-relaxed dark:text-white"
                          />
                        </div>

                        {templateSaveSuccess[tpl.id] && (
                          <div className="p-3 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2 animate-fade-in">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>✓ Plantilla guardada exitosamente en Firestore.</span>
                          </div>
                        )}

                        {/* Botones Guardar y Resetear */}
                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            onClick={() => handleResetTemplate(tpl.id)}
                            className="text-xxs font-bold text-gray-400 hover:text-gray-600 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Restablecer Texto Original
                          </button>

                          <button
                            type="button"
                            disabled={savingTemplateId === tpl.id}
                            onClick={() => handleSaveTemplate(tpl.id)}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
                          >
                            {savingTemplateId === tpl.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            <span>{savingTemplateId === tpl.id ? "Guardando..." : "💾 Guardar Cambios de Plantilla"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Área de Envío de Prueba (Test) */}
                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="block text-xxs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Enviar prueba (Test) a este correo:
                        </label>
                        <input
                          type="email"
                          value={testTargetEmails[tpl.id] || ''}
                          onChange={(e) => setTestTargetEmails({ ...testTargetEmails, [tpl.id]: e.target.value })}
                          className="w-full px-3 py-2 text-xs border rounded-xl dark:bg-dark-surface dark:border-dark-border dark:text-white font-medium"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={testingTemplateId === tpl.id}
                        onClick={() => handleRunTemplateTest(tpl.id as any)}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                      >
                        {testingTemplateId === tpl.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FlaskConical className="w-4 h-4" />
                        )}
                        <span>{testingTemplateId === tpl.id ? "Enviando..." : "🧪 Enviar Test"}</span>
                      </button>
                    </div>

                    {testResults[tpl.id] && (
                      <div className={clsx(
                        "p-2.5 rounded-xl text-xxs font-semibold flex items-center gap-1.5 animate-fade-in",
                        testResults[tpl.id]?.success
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200"
                      )}>
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{testResults[tpl.id]?.message}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Configuration;
