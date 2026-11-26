import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { Booking, BookingSettings, BookingPlatform, CustomDateSchedule } from '../types';
import { sendTelegramTestNotification, detectTelegramChatId, sendTelegramBookingNotification } from '../services/telegramService';
import { WHATSAPP_TEMPLATES, getWhatsAppUrl } from '../services/whatsappService';
import { sendBookingConfirmationEmail, sendBookingCancellationEmail, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY, EMAIL_TEMPLATES, interpolateEmailTemplate } from '../services/emailService';
import { connectGoogleAccount1Click, openGoogleOAuthPopup, connectGoogleAccountOffline, isGoogleTokenExpired } from '../services/gmailApiService';
import { COUNTRY_CODES } from './PublicBooking';
import { createZoomMeeting } from '../services/zoomService';
import { getAppBaseUrl } from '../utils/urlUtils';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Video, 
  Send, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  XCircle, 
  ExternalLink, 
  Copy, 
  Check, 
  Sparkles, 
  Settings, 
  Layers, 
  ShieldCheck,
  AlertCircle,
  Phone,
  Mail,
  User,
  MessageSquare,
  Globe,
  Key,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Info,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import clsx from 'clsx';

const formatCardDateParts = (isoDate: string) => {
  if (!isoDate) return { day: '--', month: '---', weekday: 'Sin fecha', year: '' };
  try {
    const d = new Date(`${isoDate}T00:00:00`);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase();
    const weekdayRaw = d.toLocaleDateString('es-MX', { weekday: 'long' });
    const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);
    return { day, month, weekday, year: d.getFullYear().toString() };
  } catch {
    return { day: '--', month: '---', weekday: isoDate, year: '' };
  }
};

const Bookings: React.FC = () => {
  const { bookings, bookingSettings, addBooking, updateBooking, deleteBooking, updateBookingSettings, companyInfo } = useData();

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'calendar' | 'availability' | 'platforms' | 'integrations'>('calendar');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('Todas');
  const [platformFilter, setPlatformFilter] = useState<string>('Todas');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Helper para inicializar la lista de horarios independientes por día de la semana
  const getInitialDailySchedules = (avail?: BookingAvailability): DaySchedule[] => {
    if (avail?.dailySchedules && avail.dailySchedules.length > 0) {
      return avail.dailySchedules;
    }
    const legacyRanges = (avail?.timeRanges && avail.timeRanges.length > 0)
      ? avail.timeRanges
      : [{ id: '1', startTime: avail?.startTime || '09:00', endTime: avail?.endTime || '18:00' }];

    const defaultWorkingDays = avail?.daysOfWeek || [1, 2, 3, 4, 5];

    return [
      { dayOfWeek: 1, enabled: defaultWorkingDays.includes(1), timeRanges: [...legacyRanges] },
      { dayOfWeek: 2, enabled: defaultWorkingDays.includes(2), timeRanges: [...legacyRanges] },
      { dayOfWeek: 3, enabled: defaultWorkingDays.includes(3), timeRanges: [...legacyRanges] },
      { dayOfWeek: 4, enabled: defaultWorkingDays.includes(4), timeRanges: [...legacyRanges] },
      { dayOfWeek: 5, enabled: defaultWorkingDays.includes(5), timeRanges: [...legacyRanges] },
      { dayOfWeek: 6, enabled: defaultWorkingDays.includes(6), timeRanges: [] },
      { dayOfWeek: 0, enabled: defaultWorkingDays.includes(0), timeRanges: [] },
    ];
  };

  // Settings Forms State
  const [availabilityForm, setAvailabilityForm] = useState(bookingSettings.availability);
  const [dailySchedulesForm, setDailySchedulesForm] = useState<DaySchedule[]>(() => getInitialDailySchedules(bookingSettings.availability));
  const [customDateSchedulesForm, setCustomDateSchedulesForm] = useState<CustomDateSchedule[]>(bookingSettings?.availability?.customDateSchedules || []);
  const [zoomForm, setZoomForm] = useState(bookingSettings.zoomConfig);
  const [telegramForm, setTelegramForm] = useState(bookingSettings.telegramConfig);
  const [emailForm, setEmailForm] = useState(bookingSettings.emailConfig || {
    senderEmail: 'contacto@interpresdigital.com',
    subject: DEFAULT_EMAIL_SUBJECT,
    bodyTemplate: DEFAULT_EMAIL_BODY,
    enabled: true
  });
  const [googleForm, setGoogleForm] = useState(bookingSettings.googleConfig || {
    enabled: true,
    connected: false,
    userEmail: 'contacto@interpresdigital.com'
  });
  const [platformsList, setPlatformsList] = useState<BookingPlatform[]>(bookingSettings.platforms || []);

  // --- ESTADOS Y ACCIONES PARA DISPONIBILIDAD POR FECHAS ESPECÍFICAS (EXCEPCIONES) ---
  const [newCustomDate, setNewCustomDate] = useState('');
  const [newCustomDateEnabled, setNewCustomDateEnabled] = useState(true);

  const handleAddCustomDateSchedule = () => {
    if (!newCustomDate) {
      alert("Por favor selecciona una fecha válida.");
      return;
    }
    if (customDateSchedulesForm.some(c => c.date === newCustomDate)) {
      alert("Ya existe una configuración de excepción para esta fecha.");
      return;
    }
    const newSchedule: CustomDateSchedule = {
      date: newCustomDate,
      enabled: newCustomDateEnabled,
      timeRanges: newCustomDateEnabled 
        ? [{ id: Date.now().toString(), startTime: '09:00', endTime: '18:00' }]
        : []
    };
    setCustomDateSchedulesForm(prev => [...prev, newSchedule].sort((a,b) => a.date.localeCompare(b.date)));
    setNewCustomDate('');
  };

  const handleRemoveCustomDateSchedule = (dateStr: string) => {
    setCustomDateSchedulesForm(prev => prev.filter(c => c.date !== dateStr));
  };

  const handleToggleCustomDateEnabled = (dateStr: string) => {
    setCustomDateSchedulesForm(prev => prev.map(c => 
      c.date === dateStr 
        ? { 
            ...c, 
            enabled: !c.enabled,
            timeRanges: !c.enabled && c.timeRanges.length === 0 
              ? [{ id: Date.now().toString(), startTime: '09:00', endTime: '18:00' }]
              : c.timeRanges
          } 
        : c
    ));
  };

  const handleAddCustomDateTimeRange = (dateStr: string) => {
    const newRange = { id: Date.now().toString(), startTime: '14:00', endTime: '18:00' };
    setCustomDateSchedulesForm(prev => prev.map(c => 
      c.date === dateStr 
        ? { ...c, timeRanges: [...c.timeRanges, newRange] }
        : c
    ));
  };

  const handleUpdateCustomDateTimeRange = (dateStr: string, rangeId: string, field: 'startTime' | 'endTime', value: string) => {
    setCustomDateSchedulesForm(prev => prev.map(c => 
      c.date === dateStr 
        ? { ...c, timeRanges: c.timeRanges.map(r => r.id === rangeId ? { ...r, [field]: value } : r) }
        : c
    ));
  };

  const handleRemoveCustomDateTimeRange = (dateStr: string, rangeId: string) => {
    setCustomDateSchedulesForm(prev => prev.map(c => 
      c.date === dateStr 
        ? { ...c, timeRanges: c.timeRanges.filter(r => r.id !== rangeId) }
        : c
    ));
  };

  // WhatsApp Modal State
  const [whatsAppModalBooking, setWhatsAppModalBooking] = useState<Booking | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('confirmation');
  const [customWhatsAppText, setCustomWhatsAppText] = useState<string>('');

  // Email Test Modal State
  const [emailTestModalOpen, setEmailTestModalOpen] = useState<boolean>(false);
  const [testEmailTarget, setTestEmailTarget] = useState<string>('experienciainfinity@gmail.com');
  const [testEmailTemplateId, setTestEmailTemplateId] = useState<string>('confirmation');
  const [sendingEmailTest, setSendingEmailTest] = useState<boolean>(false);

  // Manual Email Modal for individual booking card
  const [emailModalBooking, setEmailModalBooking] = useState<Booking | null>(null);
  const [selectedEmailTplId, setSelectedEmailTplId] = useState<string>('confirmation');
  const [customEmailSubject, setCustomEmailSubject] = useState<string>('');
  const [customEmailBody, setCustomEmailBody] = useState<string>('');
  const [sendingManualEmail, setSendingManualEmail] = useState<boolean>(false);

  // Manual Booking Modal State
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [manualClientName, setManualClientName] = useState<string>('');
  const [manualClientEmail, setManualClientEmail] = useState<string>('');
  const [manualCountryCode, setManualCountryCode] = useState<string>('+52');
  const [manualClientPhone, setManualClientPhone] = useState<string>('');
  const [manualPlatformId, setManualPlatformId] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [manualStartTime, setManualStartTime] = useState<string>('12:00');
  const [manualEndTime, setManualEndTime] = useState<string>('12:45');
  const [manualTopic, setManualTopic] = useState<string>('');
  const [creatingManualBooking, setCreatingManualBooking] = useState<boolean>(false);

  // Citas de Hoy y Mañana
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

  const todayBookings = bookings.filter(b => b.date === todayStr && b.status === 'Programada');
  const tomorrowBookings = bookings.filter(b => b.date === tomorrowStr && b.status === 'Programada');

  // Sync state when Firestore bookingSettings finishes loading asynchronously
  React.useEffect(() => {
    if (bookingSettings) {
      if (bookingSettings.availability) {
        setAvailabilityForm(bookingSettings.availability);
        setDailySchedulesForm(getInitialDailySchedules(bookingSettings.availability));
        setCustomDateSchedulesForm(bookingSettings.availability.customDateSchedules || []);
      }
      if (bookingSettings.zoomConfig) setZoomForm(bookingSettings.zoomConfig);
      if (bookingSettings.telegramConfig) setTelegramForm(bookingSettings.telegramConfig);
      if (bookingSettings.emailConfig) setEmailForm(bookingSettings.emailConfig);
      if (bookingSettings.googleConfig) {
        const { clientId, clientSecret, ...rest } = bookingSettings.googleConfig;
        setGoogleForm(rest);
      }
      if (bookingSettings.platforms) setPlatformsList(bookingSettings.platforms);
    }
  }, [bookingSettings]);

  // Escuchar respuesta de Google OAuth en URL Hash (#access_token=...)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      if (accessToken) {
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        .then(res => res.json())
        .then(async (userInfo) => {
          const userEmail = userInfo.email || 'admin@interpresdigital.com';
          const updatedGoogle = {
            connected: true,
            enabled: true,
            userEmail,
            accessToken
          };
          setGoogleForm(updatedGoogle);
          setEmailForm(prev => ({ ...prev, senderEmail: userEmail }));
          
          const updated = {
            ...bookingSettings,
            googleConfig: updatedGoogle,
            emailConfig: { ...emailForm, senderEmail: userEmail }
          };
          await updateBookingSettings(updated);
          window.history.replaceState(null, '', window.location.pathname);
          showSaveNotice(`✓ ¡Cuenta de Google Workspace (${userEmail}) vinculada exitosamente!`);
        })
        .catch(err => console.error("Error al procesar token de Google:", err));
      }
    }
  }, []);

  // Google OAuth state
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [showGoogleHelpModal, setShowGoogleHelpModal] = useState(false);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testTargetEmail, setTestTargetEmail] = useState('experienciainfinity@gmail.com');
  const [showClientIdText, setShowClientIdText] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);

  const copyRedirectUri = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (origin) {
      navigator.clipboard.writeText(origin);
      setCopiedRedirectUri(true);
      setTimeout(() => setCopiedRedirectUri(false), 2500);
    }
  };

  // Conectar con Google usando popup OAuth
  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    setGoogleAuthError(null);
    try {
      const clientId = googleForm.clientId?.trim() || bookingSettings?.googleConfig?.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com';
      const clientSecret = googleForm.clientSecret?.trim() || bookingSettings?.googleConfig?.clientSecret || import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '';
      let res;

      try {
        // Conexión con renovación automática (Offline flow con PKCE)
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

      const email = res.userEmail || googleForm.userEmail || 'admin@interpresdigital.com';
      const updatedGoogle = {
        ...googleForm,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
        refreshToken: res.refreshToken || googleForm.refreshToken || undefined,
        connected: true,
        enabled: true,
        userEmail: email,
        accessToken: res.accessToken,
        connectedAt: new Date().toISOString(),
        tokenObtainedAt: Date.now()
      };
      setGoogleForm(updatedGoogle);
      setEmailForm(prev => ({ ...prev, senderEmail: email }));
      
      const updated = {
        ...bookingSettings,
        googleConfig: updatedGoogle,
        emailConfig: { ...emailForm, senderEmail: email }
      };
      await updateBookingSettings(updated);
      
      showSaveNotice(`✓ ¡Cuenta de Google (${email}) vinculada exitosamente con renovación automática permanente!`);
    } catch (err: any) {
      console.error("Error conectando Google Workspace:", err);
      setGoogleAuthError(err.message || "Error al autenticar con Google.");
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm("¿Deseas desconectar la cuenta de Google Workspace actual?")) return;
    const updatedGoogle = {
      ...googleForm,
      connected: false,
      accessToken: '',
      userEmail: ''
    };
    setGoogleForm(updatedGoogle);
    await updateBookingSettings({
      ...bookingSettings,
      googleConfig: updatedGoogle
    });
    showSaveNotice("Cuenta de Google desconectada.");
  };

  const handleSendTestEmail = async () => {
    if (!testTargetEmail || !testTargetEmail.trim()) {
      alert("Por favor ingresa un correo válido para la prueba.");
      return;
    }
    setTestEmailSending(true);
    setTestEmailResult(null);

    const mockBooking: Booking = {
      id: `test_${Date.now()}`,
      clientName: "Cliente de Prueba",
      clientEmail: testTargetEmail.trim().toLowerCase(),
      clientPhone: "+52 415 179 0204",
      platformId: "p1",
      platformName: "Lumina Core",
      topic: "Prueba de envío automático vía Gmail API",
      date: new Date().toISOString().split('T')[0],
      startTime: "12:00",
      endTime: "12:45",
      zoomJoinUrl: "https://zoom.us/j/94907422248?pwd=test",
      status: "Programada",
      createdAt: new Date().toISOString()
    };

    const res = await sendBookingConfirmationEmail(mockBooking, emailForm, googleForm);
    setTestEmailResult(res);
    setTestEmailSending(false);
  };

  // Telegram test state
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [detectingChatId, setDetectingChatId] = useState(false);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [savedIntegrationsNotice, setSavedIntegrationsNotice] = useState(false);
  const [telegramResult, setTelegramResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleAutoDetectChatId = async () => {
    setDetectingChatId(true);
    setTelegramResult(null);
    const res = await detectTelegramChatId(telegramForm.botToken);
    if (res.success && res.chatId) {
      setTelegramForm(prev => ({ ...prev, chatId: res.chatId! }));
      setTelegramResult({ success: true, message: res.message });
    } else {
      setTelegramResult({ success: false, message: res.message });
    }
    setDetectingChatId(false);
  };

  // Success notifications
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Platform edit state
  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformSlug, setNewPlatformSlug] = useState('');
  const [newPlatformColor, setNewPlatformColor] = useState('#2563eb');
  const [newPlatformDesc, setNewPlatformDesc] = useState('');

  const showSaveNotice = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const copyBookingLink = (slug?: string) => {
    const baseUrl = getAppBaseUrl(companyInfo);
    const url = slug ? `${baseUrl}/#/book/${slug}` : `${baseUrl}/#/book`;
    navigator.clipboard.writeText(url);
    setCopiedId(slug || 'main');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const enabledDays = dailySchedulesForm.filter(d => d.enabled && d.timeRanges.length > 0).map(d => d.dayOfWeek);

    const updatedAvailability: BookingAvailability = {
      ...availabilityForm,
      daysOfWeek: enabledDays,
      dailySchedules: dailySchedulesForm,
      customDateSchedules: customDateSchedulesForm
    };

    const updated: BookingSettings = {
      ...bookingSettings,
      availability: updatedAvailability
    };
    await updateBookingSettings(updated);
    showSaveNotice("✓ ¡Configuración de disponibilidad y excepciones de fecha guardada exitosamente!");
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIntegrations(true);
    setSavedIntegrationsNotice(false);
    try {
      const updatedTelegram = {
        ...telegramForm,
        enabled: telegramForm.botToken.trim().length > 0 ? true : telegramForm.enabled
      };
      const updatedZoom = {
        ...zoomForm,
        enabled: zoomForm.clientId.trim().length > 0 ? true : zoomForm.enabled
      };
      const updated: BookingSettings = {
        ...bookingSettings,
        zoomConfig: updatedZoom,
        telegramConfig: updatedTelegram,
        emailConfig: emailForm,
        googleConfig: {
          ...(bookingSettings?.googleConfig || {}),
          ...googleForm
        }
      };
      await updateBookingSettings(updated);
      setTelegramForm(updatedTelegram);
      setZoomForm(updatedZoom);
      setSavedIntegrationsNotice(true);
      showSaveNotice("¡Configuración de Zoom, Telegram, Gmail y Correo guardada exitosamente!");
      setTimeout(() => setSavedIntegrationsNotice(false), 4000);
    } catch (err) {
      console.error("Error al guardar integraciones:", err);
    } finally {
      setSavingIntegrations(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTelegramResult(null);
    const res = await sendTelegramTestNotification(telegramForm.botToken, telegramForm.chatId);
    setTelegramResult(res);
    setTestingTelegram(false);
  };

  const handleAddPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlatformName.trim()) return;

    const slug = (newPlatformSlug.trim() || newPlatformName.trim())
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const newP: BookingPlatform = {
      id: `plat_${Date.now()}`,
      name: newPlatformName.trim(),
      slug,
      color: newPlatformColor,
      description: newPlatformDesc.trim() || undefined
    };

    const updatedPlatforms = [...platformsList, newP];
    setPlatformsList(updatedPlatforms);

    const updatedSettings: BookingSettings = {
      ...bookingSettings,
      platforms: updatedPlatforms
    };
    await updateBookingSettings(updatedSettings);

    setNewPlatformName('');
    setNewPlatformSlug('');
    setNewPlatformDesc('');
    showSaveNotice("Nueva plataforma agregada con éxito.");
  };

  // Platform edit state
  const [editingPlatform, setEditingPlatform] = useState<BookingPlatform | null>(null);

  const handleSaveEditPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlatform) return;

    const updatedPlatforms = platformsList.map(p => p.id === editingPlatform.id ? editingPlatform : p);
    setPlatformsList(updatedPlatforms);

    const updatedSettings: BookingSettings = {
      ...bookingSettings,
      platforms: updatedPlatforms
    };
    await updateBookingSettings(updatedSettings);
    setEditingPlatform(null);
    showSaveNotice("¡Plataforma actualizada con éxito!");
  };

  const handleDeletePlatform = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta plataforma de origen?")) return;
    const updated = platformsList.filter(p => p.id !== id);
    setPlatformsList(updated);
    await updateBookingSettings({
      ...bookingSettings,
      platforms: updated
    });
    showSaveNotice("Plataforma eliminada.");
  };

  const handleStatusChange = async (booking: Booking, newStatus: 'Programada' | 'Completada' | 'Cancelada') => {
    try {
      await updateBooking({
        ...booking,
        status: newStatus
      });

      if (newStatus === 'Cancelada') {
        // Enviar correo automático de cancelación con enlace para volver a agendar
        sendBookingCancellationEmail(booking, emailForm, googleForm);
        showSaveNotice(`✅ Cita cancelada. Se envió correo de notificación y reprogramación a ${booking.clientEmail}`);
      } else {
        showSaveNotice(`Estatus de cita actualizado a: ${newStatus}`);
      }
    } catch (err: any) {
      console.error("Error cambiando estatus de la cita:", err);
      alert(`Error al actualizar estatus: ${err.message || 'Error desconocido'}`);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    const bookingToDelete = bookings.find(b => b.id === id);
    if (!bookingToDelete) return;

    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la cita de ${bookingToDelete.clientName}?`)) {
      try {
        if (bookingToDelete.status === 'Programada') {
          // Si estaba programada y se elimina, avisar al cliente si lo desea
          if (confirm("¿Deseas enviar un correo de cancelación notificando al cliente sobre la eliminación de la cita?")) {
            sendBookingCancellationEmail(bookingToDelete, emailForm, googleForm);
          }
        }

        await deleteBooking(id);
        showSaveNotice(`✅ Registro de cita de ${bookingToDelete.clientName} eliminado de la base de datos.`);
      } catch (err: any) {
        console.error("Error eliminando cita:", err);
        alert(`Error al eliminar cita: ${err.message || 'Error desconocido'}`);
      }
    }
  };

  const filteredBookings = bookings.filter(b => {
    if (statusFilter !== 'Todas' && b.status !== statusFilter) return false;
    if (platformFilter !== 'Todas' && b.platformId !== platformFilter) return false;
    return true;
  });

  const scheduledCount = bookings.filter(b => b.status === 'Programada').length;
  const completedCount = bookings.filter(b => b.status === 'Completada').length;

  return (
    <div className="space-y-6 pb-10">
      {/* Executive Header & Actions */}
      <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-5 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1464B8] to-[#00A9B7] text-white flex items-center justify-center shadow-md shadow-[#1464B8]/20 flex-shrink-0">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#102B4B] dark:text-white tracking-tight">
                Citas y Videollamadas
              </h1>
              <p className="text-[#102B4B]/65 dark:text-slate-300 mt-0.5 text-xs sm:text-sm">
                Control ejecutivo de sesiones Zoom, disponibilidad y enlaces públicos por plataforma.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              onClick={() => copyBookingLink()}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] text-[#102B4B] dark:text-slate-100 px-4 py-2.5 rounded-xl text-xs font-bold hover:border-[#1464B8] transition-all cursor-pointer"
            >
              {copiedId === 'main' ? <Check className="w-4 h-4 text-[#00A9B7]" /> : <Copy className="w-4 h-4 text-[#1464B8] dark:text-[#5FD9E4]" />}
              <span>{copiedId === 'main' ? '¡Enlace Público Copiado!' : 'Copiar Link de Agenda'}</span>
            </button>

            <a
              href="/#/book"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] text-[#1464B8] dark:text-[#7CE8F0] px-3.5 py-2.5 rounded-xl text-xs font-bold hover:border-[#1464B8] transition-all"
              title="Abrir vista pública de agendamiento"
            >
              <span>Ver Agenda</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={() => setManualModalOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-[#1464B8]/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Agendar Cita Manual</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-[#C7D5E2]/70 dark:border-[#1B3C68]">
          <div className="p-3.5 rounded-2xl bg-[#F6F9FC] dark:bg-[#071B36]/85 border border-[#C7D5E2]/80 dark:border-[#1B3C68] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#102B4B]/60 dark:text-slate-400 block">
                Programadas
              </span>
              <span className="font-display text-2xl font-extrabold text-[#1464B8] dark:text-[#66B2FF]">
                {scheduledCount}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#1464B8]/12 text-[#1464B8] dark:text-[#66B2FF] flex items-center justify-center">
              <CalendarIcon className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F6F9FC] dark:bg-[#071B36]/85 border border-[#C7D5E2]/80 dark:border-[#1B3C68] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#102B4B]/60 dark:text-slate-400 block">
                Hoy y Mañana
              </span>
              <span className="font-display text-2xl font-extrabold text-[#008995] dark:text-[#5FD9E4]">
                {todayBookings.length + tomorrowBookings.length}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#00A9B7]/15 text-[#00A9B7] dark:text-[#5FD9E4] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F6F9FC] dark:bg-[#071B36]/85 border border-[#C7D5E2]/80 dark:border-[#1B3C68] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#102B4B]/60 dark:text-slate-400 block">
                Completadas
              </span>
              <span className="font-display text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {completedCount}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#F6F9FC] dark:bg-[#071B36]/85 border border-[#C7D5E2]/80 dark:border-[#1B3C68] flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#102B4B]/60 dark:text-slate-400 block">
                Plataformas Activas
              </span>
              <span className="font-display text-2xl font-extrabold text-[#102B4B] dark:text-white">
                {platformsList.length || bookingSettings.platforms?.length || 0}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#102B4B]/10 dark:bg-white/10 text-[#102B4B] dark:text-slate-200 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-4 bg-[#00A9B7]/12 border border-[#00A9B7]/40 text-[#007B86] dark:text-[#7CE8F0] text-xs font-bold rounded-2xl flex items-center gap-2 shadow-xs animate-fade-in">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Segmented Navigation Bar */}
      <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] p-1.5 rounded-2xl flex gap-1.5 text-xs sm:text-sm font-bold overflow-x-auto shadow-2xs">
        <button
          onClick={() => setActiveTab('calendar')}
          className={clsx(
            "py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer",
            activeTab === 'calendar'
              ? "bg-[#1464B8] text-white shadow-sm"
              : "text-[#102B4B]/70 dark:text-slate-300 hover:bg-[#F6F9FC] dark:hover:bg-[#071B36]"
          )}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Agenda de Citas ({bookings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('availability')}
          className={clsx(
            "py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer",
            activeTab === 'availability'
              ? "bg-[#1464B8] text-white shadow-sm"
              : "text-[#102B4B]/70 dark:text-slate-300 hover:bg-[#F6F9FC] dark:hover:bg-[#071B36]"
          )}
        >
          <Clock className="w-4 h-4" />
          <span>Horarios y Disponibilidad</span>
        </button>

        <button
          onClick={() => setActiveTab('platforms')}
          className={clsx(
            "py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer",
            activeTab === 'platforms'
              ? "bg-[#1464B8] text-white shadow-sm"
              : "text-[#102B4B]/70 dark:text-slate-300 hover:bg-[#F6F9FC] dark:hover:bg-[#071B36]"
          )}
        >
          <Globe className="w-4 h-4" />
          <span>Plataformas ({platformsList.length || bookingSettings.platforms?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('integrations')}
          className={clsx(
            "py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer",
            activeTab === 'integrations'
              ? "bg-[#1464B8] text-white shadow-sm"
              : "text-[#102B4B]/70 dark:text-slate-300 hover:bg-[#F6F9FC] dark:hover:bg-[#071B36]"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>Integraciones (Zoom, Gmail & Telegram)</span>
        </button>
      </div>

      {/* TAB 1: CALENDAR / LIST */}
      {activeTab === 'calendar' && (
        <div className="space-y-5">
            {/* Barra de Alertas de Videollamadas de Hoy y Mañana */}
            {(todayBookings.length > 0 || tomorrowBookings.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Alerta HOY */}
                <div className={clsx(
                  "p-5 rounded-2xl border transition-all space-y-3 shadow-xs",
                  todayBookings.length > 0 
                    ? "bg-[#00A9B7]/10 dark:bg-[#00A9B7]/15 border-[#00A9B7]/45" 
                    : "bg-white dark:bg-[#0C2548] border-[#C7D5E2] dark:border-[#1B3C68]"
                )}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-extrabold text-xs text-[#102B4B] dark:text-white">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00A9B7] animate-pulse"></span>
                      <span>SESIONES PARA HOY ({todayBookings.length})</span>
                    </div>
                    <span className="text-xxs font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-[#00A9B7]/20 text-[#007B86] dark:text-[#7CE8F0]">
                      {todayStr}
                    </span>
                  </div>

                  {todayBookings.length === 0 ? (
                    <p className="text-xs text-[#102B4B]/60 dark:text-slate-400 italic">No tienes videollamadas pendientes para hoy.</p>
                  ) : (
                    <div className="space-y-2">
                      {todayBookings.map(b => (
                        <div key={b.id} className="bg-white dark:bg-[#071B36] p-3 rounded-xl border border-[#C7D5E2] dark:border-[#1B3C68] flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-xs text-[#102B4B] dark:text-white">{b.clientName}</div>
                            <div className="text-xxs font-semibold text-[#008995] dark:text-[#5FD9E4]">{b.startTime} – {b.endTime} CDMX | {b.platformName}</div>
                          </div>
                          {b.zoomJoinUrl && (
                            <a
                              href={b.zoomStartUrl || b.zoomJoinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-[#1464B8] hover:bg-[#10539A] text-white rounded-lg text-xxs font-bold flex items-center gap-1 shadow-xs transition-colors flex-shrink-0"
                            >
                              <Video className="w-3 h-3" />
                              <span>Entrar Zoom</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alerta MAÑANA */}
                <div className={clsx(
                  "p-5 rounded-2xl border transition-all space-y-3 shadow-xs",
                  tomorrowBookings.length > 0 
                    ? "bg-[#1464B8]/8 dark:bg-[#1464B8]/15 border-[#1464B8]/40" 
                    : "bg-white dark:bg-[#0C2548] border-[#C7D5E2] dark:border-[#1B3C68]"
                )}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 font-extrabold text-xs text-[#102B4B] dark:text-white">
                      <Clock className="w-4 h-4 text-[#1464B8] dark:text-[#66B2FF]" />
                      <span>SESIONES PARA MAÑANA ({tomorrowBookings.length})</span>
                    </div>
                    <span className="text-xxs font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-[#1464B8]/15 text-[#1464B8] dark:text-[#7CE8F0]">
                      {tomorrowStr}
                    </span>
                  </div>

                  {tomorrowBookings.length === 0 ? (
                    <p className="text-xs text-[#102B4B]/60 dark:text-slate-400 italic">No tienes videollamadas agendadas para mañana.</p>
                  ) : (
                    <div className="space-y-2">
                      {tomorrowBookings.map(b => (
                        <div key={b.id} className="bg-white dark:bg-[#071B36] p-3 rounded-xl border border-[#C7D5E2] dark:border-[#1B3C68] flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-xs text-[#102B4B] dark:text-white">{b.clientName}</div>
                            <div className="text-xxs font-semibold text-[#1464B8] dark:text-[#66B2FF]">{b.startTime} – {b.endTime} CDMX | {b.platformName}</div>
                          </div>
                          {b.zoomJoinUrl && (
                            <a
                              href={b.zoomStartUrl || b.zoomJoinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-[#1464B8] hover:bg-[#10539A] text-white rounded-lg text-xxs font-bold flex items-center gap-1 shadow-xs transition-colors flex-shrink-0"
                            >
                              <Video className="w-3 h-3" />
                              <span>Ver Zoom</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white dark:bg-[#0C2548] p-4 rounded-2xl border border-[#C7D5E2] dark:border-[#1B3C68] shadow-2xs">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-extrabold text-[#102B4B]/60 dark:text-slate-400 uppercase tracking-wider mr-1">
                  Estado:
                </span>
                {['Todas', 'Programada', 'Completada', 'Cancelada'].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={clsx(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                      statusFilter === st
                        ? "bg-[#1464B8] border-[#1464B8] text-white shadow-xs"
                        : "bg-[#F6F9FC] dark:bg-[#071B36] border-[#C7D5E2] dark:border-[#1B3C68] text-[#102B4B]/75 dark:text-slate-300 hover:border-[#1464B8]"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {(platformsList.length > 0 || (bookingSettings.platforms && bookingSettings.platforms.length > 0)) && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold text-[#102B4B]/60 dark:text-slate-400 uppercase tracking-wider">
                    Plataforma:
                  </span>
                  <select
                    value={platformFilter}
                    onChange={e => setPlatformFilter(e.target.value)}
                    className="bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl px-3 py-2 text-xs font-bold text-[#102B4B] dark:text-white outline-none focus:border-[#1464B8]"
                  >
                    <option value="Todas">Todas las plataformas</option>
                    {(platformsList.length > 0 ? platformsList : bookingSettings.platforms).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Bookings Grid */}
            {filteredBookings.length === 0 ? (
              <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 bg-[#1464B8]/10 text-[#1464B8] dark:text-[#66B2FF] rounded-2xl flex items-center justify-center mx-auto">
                  <CalendarIcon className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="font-display font-bold text-lg text-[#102B4B] dark:text-white">No hay citas en esta vista</h3>
                  <p className="text-xs text-[#102B4B]/65 dark:text-slate-400">
                    Las reservaciones realizadas desde tus enlaces públicos o agendadas manualmente aparecerán aquí.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredBookings.map(b => {
                  const dateParts = formatCardDateParts(b.date);
                  const matchedPlat = platformsList.find(p => p.id === b.platformId || p.name.toLowerCase() === (b.platformName || '').toLowerCase());
                  const dotColor = matchedPlat?.color || '#1464B8';
                  const initial = (b.clientName || 'C').trim().charAt(0).toUpperCase();

                  return (
                    <div 
                      key={b.id}
                      className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] hover:border-[#1464B8]/70 dark:hover:border-[#00A9B7]/60 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3.5">
                        {/* Header: Platform Pill & Status Pill */}
                        <div className="flex justify-between items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] text-[#102B4B] dark:text-slate-100 font-extrabold text-[10px] rounded-lg uppercase tracking-wider truncate">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                            <span className="truncate">{b.platformName}</span>
                          </span>

                          <span className={clsx(
                            "px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 flex-shrink-0 border",
                            b.status === 'Programada'
                              ? "bg-[#00A9B7]/12 border-[#00A9B7]/35 text-[#007B86] dark:text-[#7CE8F0]"
                              : b.status === 'Completada'
                              ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                              : "bg-rose-500/12 border-rose-500/30 text-rose-700 dark:text-rose-300"
                          )}>
                            {b.status}
                          </span>
                        </div>

                        {/* Executive Calendar Date & Time Box */}
                        <div className="bg-[#F6F9FC] dark:bg-[#071B36]/90 p-3 rounded-xl border border-[#C7D5E2]/80 dark:border-[#1B3C68] flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] flex flex-col items-center justify-center flex-shrink-0 shadow-2xs">
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#1464B8] dark:text-[#66B2FF] leading-none">
                              {dateParts.month}
                            </span>
                            <span className="font-display text-base font-extrabold text-[#102B4B] dark:text-white leading-tight mt-0.5">
                              {dateParts.day}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-[#102B4B] dark:text-white truncate">
                              {dateParts.weekday} {dateParts.year && `• ${dateParts.year}`}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#008995] dark:text-[#5FD9E4] mt-0.5">
                              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{b.startTime} – {b.endTime} (CDMX)</span>
                            </div>
                          </div>
                        </div>

                        {/* Client Profile Block */}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#1464B8]/12 dark:bg-[#1464B8]/25 text-[#1464B8] dark:text-[#7CE8F0] font-display font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <div className="font-display font-bold text-sm text-[#102B4B] dark:text-white truncate">
                                {b.clientName}
                              </div>
                            </div>
                          </div>

                          <div className="pl-1 space-y-1 text-[#102B4B]/70 dark:text-slate-300">
                            <div className="flex items-center gap-2 truncate">
                              <Mail className="w-3.5 h-3.5 text-[#1464B8] dark:text-[#66B2FF] flex-shrink-0" />
                              <a href={`mailto:${b.clientEmail}`} className="hover:text-[#1464B8] dark:hover:text-white hover:underline truncate">
                                {b.clientEmail}
                              </a>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 text-[#00A9B7] dark:text-[#5FD9E4] flex-shrink-0" />
                              <a href={`tel:${b.clientPhone}`} className="hover:text-[#1464B8] dark:hover:text-white hover:underline font-mono text-[11px]">
                                {b.clientPhone}
                              </a>
                            </div>
                          </div>

                          {b.topic && (
                            <div className="mt-1.5 px-3 py-2 rounded-xl bg-[#F6F9FC] dark:bg-[#071B36]/60 border-l-2 border-[#00A9B7] text-[11px] text-[#102B4B]/75 dark:text-slate-300 italic line-clamp-2">
                              &ldquo;{b.topic}&rdquo;
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Harmonious Executive Actions */}
                      <div className="pt-3.5 border-t border-[#C7D5E2]/70 dark:border-[#1B3C68] space-y-2.5">
                        {/* Primary Action: Zoom */}
                        {b.zoomJoinUrl && (
                          <a
                            href={b.zoomStartUrl || b.zoomJoinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                          >
                            <Video className="w-4 h-4" />
                            <span>Iniciar / Unirse a Zoom</span>
                          </a>
                        )}

                        {/* Secondary 2-Column Clean Surface Buttons: WhatsApp & Correo */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setWhatsAppModalBooking(b);
                              const confirmTpl = WHATSAPP_TEMPLATES.find(t => t.id === 'confirmation');
                              if (confirmTpl) {
                                setCustomWhatsAppText(confirmTpl.getMessage(b));
                              }
                            }}
                            className="bg-[#F6F9FC] dark:bg-[#071B36] hover:bg-[#E6F7F8] dark:hover:bg-[#10305C] border border-[#C7D5E2] dark:border-[#1B3C68] hover:border-[#00A9B7] text-[#102B4B] dark:text-slate-100 font-bold py-2 px-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-[#00A9B7]" />
                            <span>WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEmailModalBooking(b);
                              setSelectedEmailTplId('confirmation');
                              const tpl = EMAIL_TEMPLATES.find(t => t.id === 'confirmation') || EMAIL_TEMPLATES[0];
                              setCustomEmailSubject(interpolateEmailTemplate(tpl.subject, b));
                              setCustomEmailBody(interpolateEmailTemplate(tpl.bodyTemplate, b));
                            }}
                            className="bg-[#F6F9FC] dark:bg-[#071B36] hover:bg-[#EAF3FC] dark:hover:bg-[#10305C] border border-[#C7D5E2] dark:border-[#1B3C68] hover:border-[#1464B8] text-[#102B4B] dark:text-slate-100 font-bold py-2 px-2.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5 text-[#1464B8] dark:text-[#66B2FF]" />
                            <span>Enviar Correo</span>
                          </button>
                        </div>

                        {/* Status & Delete Footer */}
                        <div className="flex justify-between items-center pt-1 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            {b.status === 'Programada' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b, 'Completada')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold transition-colors cursor-pointer"
                              >
                                ✓ Completar
                              </button>
                            )}
                            {b.status !== 'Cancelada' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b, 'Cancelada')}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteBooking(b.id)}
                            className="p-1.5 rounded-lg text-[#102B4B]/40 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Eliminar registro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* TAB 2: AVAILABILITY & HOURS */}
      {activeTab === 'availability' && (
        <div className="max-w-7xl mx-auto">
          <form onSubmit={handleSaveAvailability} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Columna Izquierda: Duración, Colchón y Horarios Recurrentes Semanales */}
            <div className="lg:col-span-6 bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="space-y-1 border-b border-gray-100 dark:border-dark-border/60 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Horarios de Atención y Disponibilidad Recurrente</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Define los días de la semana y bloques de horarios generales en que los clientes pueden agendar citas contigo.
                </p>
              </div>

              {/* Duración y Colchón entre citas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Duración por Cita (minutos)</label>
                  <select
                    value={availabilityForm.slotDurationMinutes}
                    onChange={e => setAvailabilityForm({ ...availabilityForm, slotDurationMinutes: Number(e.target.value) })}
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-3 text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={15}>15 Minutos</option>
                    <option value={30}>30 Minutos</option>
                    <option value={45}>45 Minutos</option>
                    <option value={60}>60 Minutos (1 Hora)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Tiempo de Colchón entre Citas (minutos)</label>
                  <select
                    value={availabilityForm.bufferMinutes}
                    onChange={e => setAvailabilityForm({ ...availabilityForm, bufferMinutes: Number(e.target.value) })}
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-3 text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value={0}>0 Minutos</option>
                    <option value={10}>10 Minutos</option>
                    <option value={15}>15 Minutos</option>
                    <option value={30}>30 Minutos</option>
                  </select>
                </div>
              </div>

              {/* Configuración de Horarios e Independientes por Día de la Semana */}
              <div className="pt-4 border-t border-gray-100 dark:border-dark-border/60 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Bloques Horarios por Día de la Semana (Lunes a Domingo)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Habilita los días laborables generales y asigna las franjas horarias (bloques) para cada día de forma independiente.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { dayOfWeek: 1, label: 'Lunes' },
                    { dayOfWeek: 2, label: 'Martes' },
                    { dayOfWeek: 3, label: 'Miércoles' },
                    { dayOfWeek: 4, label: 'Jueves' },
                    { dayOfWeek: 5, label: 'Viernes' },
                    { dayOfWeek: 6, label: 'Sábado' },
                    { dayOfWeek: 0, label: 'Domingo' },
                  ].map(dayConfig => {
                    const daySched = dailySchedulesForm.find(d => d.dayOfWeek === dayConfig.dayOfWeek) || {
                      dayOfWeek: dayConfig.dayOfWeek,
                      enabled: false,
                      timeRanges: []
                    };

                    return (
                      <div 
                        key={dayConfig.dayOfWeek}
                        className={clsx(
                          "p-4 rounded-2xl border transition-all space-y-3 shadow-xs",
                          daySched.enabled 
                            ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-dark-border" 
                            : "bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-dark-border/40 opacity-75"
                        )}
                      >
                        {/* Header del Día */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div className="flex items-center gap-3">
                            {/* Switch ON/OFF */}
                            <button
                              type="button"
                              onClick={() => {
                                setDailySchedulesForm(prev => prev.map(d => {
                                  if (d.dayOfWeek === dayConfig.dayOfWeek) {
                                    const nextEnabled = !d.enabled;
                                    return {
                                      ...d,
                                      enabled: nextEnabled,
                                      timeRanges: nextEnabled && d.timeRanges.length === 0 
                                        ? [{ id: Date.now().toString(), startTime: '09:00', endTime: '18:00' }]
                                        : d.timeRanges
                                    };
                                  }
                                  return d;
                                }));
                              }}
                              className={clsx(
                                "w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer",
                                daySched.enabled ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-700"
                              )}
                            >
                              <div className={clsx(
                                "bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200",
                                daySched.enabled ? "translate-x-6" : "translate-x-0"
                              )} />
                            </button>

                            <div>
                              <span className="font-bold text-xs text-gray-900 dark:text-white flex items-center gap-2">
                                <span>📅 {dayConfig.label}</span>
                                <span className={clsx(
                                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                                  daySched.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                )}>
                                  {daySched.enabled ? 'Disponible' : 'Cerrado'}
                                </span>
                              </span>
                            </div>
                          </div>

                          {daySched.enabled && (
                            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const sourceRanges = daySched.timeRanges;
                                  setDailySchedulesForm(prev => prev.map(d => 
                                    d.enabled ? { ...d, timeRanges: sourceRanges.map(r => ({ ...r, id: Math.random().toString() })) } : d
                                  ));
                                  alert(`Se copió la configuración de horarios de ${dayConfig.label} a todos los demás días habilitados.`);
                                }}
                                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                                title="Copiar a todos los días"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copiar a todos</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const newRange = { id: Date.now().toString(), startTime: '14:00', endTime: '18:00' };
                                  setDailySchedulesForm(prev => prev.map(d => 
                                    d.dayOfWeek === dayConfig.dayOfWeek 
                                      ? { ...d, timeRanges: [...d.timeRanges, newRange] }
                                      : d
                                  ));
                                }}
                                className="px-2 py-1 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-300 hover:bg-primary-100 rounded text-[10px] font-bold flex items-center gap-1 transition-colors border border-primary-200 dark:border-primary-800"
                              >
                                <Plus className="w-3 h-3" />
                                <span>+ Franja</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Lista de Franjas del Día */}
                        {daySched.enabled && (
                          <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-dark-border/40">
                            {daySched.timeRanges.length === 0 ? (
                              <p className="text-[10px] text-amber-600 font-semibold italic">
                                Agrega al menos una franja horaria para habilitar este día.
                              </p>
                            ) : (
                              daySched.timeRanges.map((range, index) => (
                                <div 
                                  key={range.id}
                                  className="p-2 bg-gray-50 dark:bg-dark-bg rounded-xl border border-gray-200 dark:border-dark-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xxs"
                                >
                                  <span className="font-bold text-gray-600 dark:text-gray-300 text-[10px] flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-primary-500" />
                                    Franja {index + 1}:
                                  </span>

                                  <div className="grid grid-cols-2 gap-2 flex-1 max-w-[240px]">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="time"
                                        value={range.startTime}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setDailySchedulesForm(prev => prev.map(d => 
                                            d.dayOfWeek === dayConfig.dayOfWeek 
                                              ? { ...d, timeRanges: d.timeRanges.map(r => r.id === range.id ? { ...r, startTime: val } : r) }
                                              : d
                                          ));
                                        }}
                                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded p-1 text-[11px] font-bold dark:text-white outline-none"
                                      />
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <input
                                        type="time"
                                        value={range.endTime}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setDailySchedulesForm(prev => prev.map(d => 
                                            d.dayOfWeek === dayConfig.dayOfWeek 
                                              ? { ...d, timeRanges: d.timeRanges.map(r => r.id === range.id ? { ...r, endTime: val } : r) }
                                              : d
                                          ));
                                        }}
                                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-dark-border rounded p-1 text-[11px] font-bold dark:text-white outline-none"
                                      />
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDailySchedulesForm(prev => prev.map(d => 
                                        d.dayOfWeek === dayConfig.dayOfWeek 
                                          ? { ...d, timeRanges: d.timeRanges.filter(r => r.id !== range.id) }
                                          : d
                                      ));
                                    }}
                                    className="p-1 text-rose-500 hover:text-rose-700 rounded transition-colors"
                                    title="Eliminar franja"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Columna Derecha: Excepciones por Fechas Específicas */}
            <div className="lg:col-span-6 bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="space-y-1 border-b border-gray-100 dark:border-dark-border/60 pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-indigo-500" />
                  Horarios y Excepciones por Fecha Específica
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configura horarios particulares para fechas específicas (por ejemplo, trabajar medio día en una fecha o cerrarla por completo).
                </p>
              </div>

              {/* Agregar Excepción por Fecha */}
              <div className="p-4 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-2xl space-y-3">
                <span className="text-xs font-bold text-[#1464B8] dark:text-[#66B2FF] flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  Añadir fecha con horario personalizado:
                </span>

                <div className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-[10px] font-bold text-[#102B4B]/70 dark:text-slate-300 block">Selecciona Fecha:</label>
                    <input
                      type="date"
                      value={newCustomDate}
                      onChange={e => setNewCustomDate(e.target.value)}
                      className="w-full bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] text-[#102B4B] dark:text-slate-100 rounded-xl p-2 text-xs outline-none"
                    />
                  </div>

                  <div className="space-y-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-[#102B4B]/70 dark:text-slate-300 block">Estatus Inicial:</label>
                    <select
                      value={newCustomDateEnabled ? 'yes' : 'no'}
                      onChange={e => setNewCustomDateEnabled(e.target.value === 'yes')}
                      className="w-full bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] text-[#102B4B] dark:text-slate-100 rounded-xl p-2 text-xs outline-none"
                    >
                      <option value="yes">🟢 Disponible</option>
                      <option value="no">🔴 Cerrado / No Laboral</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddCustomDateSchedule}
                    className="px-4 py-2 bg-[#1464B8] hover:bg-[#10539A] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm flex-shrink-0 w-full sm:w-auto"
                  >
                    <span>Agregar Fecha</span>
                  </button>
                </div>
              </div>

              {/* Lista de excepciones */}
              <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                {customDateSchedulesForm.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-gray-200 dark:border-dark-border rounded-2xl text-xs text-gray-400 font-medium">
                    No has agregado ninguna excepción de fecha específica aún. Las citas se generarán siguiendo los horarios recurrentes semanales de la columna izquierda.
                  </div>
                ) : (
                  customDateSchedulesForm.map(c => {
                    const dateObj = new Date(`${c.date}T00:00:00`);
                    const formattedDateStr = dateObj.toLocaleDateString('es-MX', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    });

                    return (
                      <div 
                        key={c.date}
                        className={clsx(
                          "p-4 rounded-2xl border transition-all space-y-3 shadow-xs",
                          c.enabled 
                            ? "bg-white dark:bg-gray-900 border-gray-250 dark:border-dark-border" 
                            : "bg-rose-50/35 dark:bg-rose-950/10 border-rose-200/50 dark:border-rose-900/30 opacity-80"
                        )}
                      >
                        {/* Header de la Excepción */}
                        <div className="flex justify-between items-center gap-3">
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs text-gray-900 dark:text-white capitalize">
                              📅 {formattedDateStr}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {c.date}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Toggle Disponible/Cerrado */}
                            <button
                              type="button"
                              onClick={() => handleToggleCustomDateEnabled(c.date)}
                              className={clsx(
                                "px-2 py-1 rounded text-xxs font-extrabold uppercase transition-all border",
                                c.enabled 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" 
                                  : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                              )}
                            >
                              {c.enabled ? '🟢 Disponible' : '🔴 Cerrado'}
                            </button>

                            {/* Eliminar fecha */}
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomDateSchedule(c.date)}
                              className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                              title="Eliminar excepción de fecha"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Franjas horarias de esta fecha */}
                        {c.enabled && (
                          <div className="space-y-2 border-t border-gray-100 dark:border-dark-border/40 pt-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bloques de horarios:</span>
                              <button
                                type="button"
                                onClick={() => handleAddCustomDateTimeRange(c.date)}
                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-300 rounded text-xxs font-bold transition-all border border-indigo-200/50"
                              >
                                + Agregar Bloque
                              </button>
                            </div>

                            {c.timeRanges.length === 0 ? (
                              <p className="text-xxs text-amber-600 font-semibold italic">Agrega bloques para habilitar la disponibilidad en esta fecha.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {c.timeRanges.map((range, idx) => (
                                  <div key={range.id} className="flex items-center justify-between gap-2 p-2 bg-gray-55 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-xxs">
                                    <div className="flex items-center gap-1">
                                      <span className="text-gray-400 font-bold">{idx + 1}:</span>
                                      <input
                                        type="time"
                                        value={range.startTime}
                                        onChange={e => handleUpdateCustomDateTimeRange(c.date, range.id, 'startTime', e.target.value)}
                                        className="bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border rounded p-1 text-[11px] font-bold outline-none"
                                      />
                                      <span className="text-gray-400 font-bold">a</span>
                                      <input
                                        type="time"
                                        value={range.endTime}
                                        onChange={e => handleUpdateCustomDateTimeRange(c.date, range.id, 'endTime', e.target.value)}
                                        className="bg-white dark:bg-gray-800 border border-gray-250 dark:border-dark-border rounded p-1 text-[11px] font-bold outline-none"
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCustomDateTimeRange(c.date, range.id)}
                                      className="p-1 text-gray-400 hover:text-rose-500 transition-colors"
                                      title="Eliminar bloque"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Fila del Botón de Guardar en la Base de Datos */}
            <div className="col-span-1 lg:col-span-12 pt-4">
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white font-bold py-4 px-6 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.99]"
              >
                💾 Guardar Configuración de Horarios & Excepciones de Fecha
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: PLATFORMS */}
      {activeTab === 'platforms' && (
        <div className="space-y-8">
          {/* Add Platform */}
          <form onSubmit={handleAddPlatform} className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 space-y-4 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Agregar Nueva Plataforma de Origen</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Registra diferentes sitios web o marcas (ej. *Lumina Core*, *Interpres Digital*) para saber exactamente desde cuál se agendó cada videollamada.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Nombre de la Marca / Plataforma *</label>
                <input
                  type="text"
                  required
                  value={newPlatformName}
                  onChange={e => setNewPlatformName(e.target.value)}
                  placeholder="Ej. Lumina Core"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Slug de la URL (Identificador)</label>
                <input
                  type="text"
                  value={newPlatformSlug}
                  onChange={e => setNewPlatformSlug(e.target.value)}
                  placeholder="ej. lumina-core"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Color Distintivo</label>
                <input
                  type="color"
                  value={newPlatformColor}
                  onChange={e => setNewPlatformColor(e.target.value)}
                  className="w-full h-10 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-1 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-primary-600 hover:bg-primary-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Plataforma</span>
            </button>
          </form>

          {/* Platforms List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {platformsList.map(p => (
              <div 
                key={p.id}
                className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-2xl p-5 shadow-sm space-y-4"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.color }}></div>
                    <div>
                      <h3 className="font-bold text-sm text-gray-900 dark:text-white">{p.name}</h3>
                      <span className="text-xxs font-semibold text-gray-400">Slug: /book/{p.slug}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingPlatform(p)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      title="Editar plataforma"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePlatform(p.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors"
                      title="Eliminar plataforma"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-dark-border/50 flex justify-between items-center">
                  <button
                    onClick={() => copyBookingLink(p.slug)}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    {copiedId === p.slug ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === p.slug ? '¡Enlace Copiado!' : 'Copiar Enlace Específico'}</span>
                  </button>

                  <a
                    href={`/#/book/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <span>Ver Formulario</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Modal Modal para Editar Plataforma */}
          {editingPlatform && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-3">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white">Editar Plataforma de Origen</h3>
                  <button 
                    onClick={() => setEditingPlatform(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditPlatform} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Nombre de la Marca / Plataforma *</label>
                    <input
                      type="text"
                      required
                      value={editingPlatform.name}
                      onChange={e => setEditingPlatform({ ...editingPlatform, name: e.target.value })}
                      className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Slug de la URL (Identificador)</label>
                    <input
                      type="text"
                      required
                      value={editingPlatform.slug}
                      onChange={e => setEditingPlatform({ ...editingPlatform, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })}
                      className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Color Distintivo</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={editingPlatform.color}
                        onChange={e => setEditingPlatform({ ...editingPlatform, color: e.target.value })}
                        className="w-12 h-10 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-1 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{editingPlatform.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Descripción (Opcional)</label>
                    <input
                      type="text"
                      value={editingPlatform.description || ''}
                      onChange={e => setEditingPlatform({ ...editingPlatform, description: e.target.value })}
                      placeholder="Ej. Sitio Web Principal"
                      className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingPlatform(null)}
                      className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INTEGRATIONS (ZOOM & TELEGRAM) */}
      {activeTab === 'integrations' && (
        <form onSubmit={handleSaveIntegrations} className="space-y-8">
          
          {/* Zoom Settings */}
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center font-bold">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Integración Oficial de Zoom API</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Server-to-Server OAuth (Creación automática de enlaces)</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={zoomForm.enabled}
                  onChange={e => setZoomForm({ ...zoomForm, enabled: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Habilitar Zoom API</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Account ID (Zoom Marketplace)</label>
                <input
                  type="text"
                  value={zoomForm.accountId}
                  onChange={e => setZoomForm({ ...zoomForm, accountId: e.target.value })}
                  placeholder="Ej. abc123XYZ..."
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-mono outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Client ID</label>
                <input
                  type="text"
                  value={zoomForm.clientId}
                  onChange={e => setZoomForm({ ...zoomForm, clientId: e.target.value })}
                  placeholder="Ej. client_id_123"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-mono outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Client Secret</label>
                <input
                  type="password"
                  value={zoomForm.clientSecret}
                  onChange={e => setZoomForm({ ...zoomForm, clientSecret: e.target.value })}
                  placeholder="••••••••••••••••"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-mono outline-none"
                />
              </div>
            </div>
          </div>

          {/* Telegram Bot Settings */}
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-500/10 text-sky-500 rounded-2xl flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notificaciones Instantáneas en Telegram</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Recibe un mensaje en tu celular en cuanto agenden una cita</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={telegramForm.enabled}
                  onChange={e => setTelegramForm({ ...telegramForm, enabled: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Habilitar Telegram</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Bot Token (@BotFather)</label>
                <input
                  type="text"
                  value={telegramForm.botToken}
                  onChange={e => setTelegramForm({ ...telegramForm, botToken: e.target.value })}
                  placeholder="Ej. 123456789:ABCdefGHIjklMNOpqrs..."
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-mono outline-none"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Chat ID / Canal ID</label>
                  <button
                    type="button"
                    onClick={handleAutoDetectChatId}
                    disabled={detectingChatId || !telegramForm.botToken}
                    className="text-xxs font-extrabold text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50 flex items-center gap-1"
                  >
                    {detectingChatId ? <div className="w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div> : <Sparkles className="w-3 h-3" />}
                    <span>Auto-Detectar ID de Canal</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={telegramForm.chatId}
                  onChange={e => setTelegramForm({ ...telegramForm, chatId: e.target.value })}
                  placeholder="Ej. 987654321 o -100123456789"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-mono outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={testingTelegram}
                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm"
              >
                {testingTelegram ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-3.5 h-3.5" />}
                <span>Enviar Mensaje de Prueba a Telegram</span>
              </button>

              {telegramResult && (
                <div className={clsx(
                  "text-xs font-bold p-2.5 rounded-xl border flex items-center gap-2",
                  telegramResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-400"
                )}>
                  {telegramResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  <span>{telegramResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Email / Gmail Settings & Plantilla */}
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/10 text-purple-500 rounded-2xl flex items-center justify-center font-bold">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Correos Automáticos & Plantilla de Confirmación</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Personaliza el mensaje y el correo remitente que reciben tus clientes al agendar</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailForm.enabled ?? true}
                  onChange={e => setEmailForm({ ...emailForm, enabled: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Habilitar Envío de Correo</span>
              </label>
            </div>

            <div className="space-y-4">
              {/* Selector de Plantillas Predefinidas */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Cargar Plantilla Predefinida:</label>
                <div className="flex flex-wrap gap-2">
                  {EMAIL_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setEmailForm({
                          ...emailForm,
                          subject: tpl.subject,
                          bodyTemplate: tpl.bodyTemplate
                        });
                        showSaveNotice(`Plantilla "${tpl.name}" cargada en el editor.`);
                      }}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xxs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-purple-500" />
                      <span>{tpl.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Correo Remitente (Tu Gmail / Correo Oficial)</label>
                  <input
                    type="email"
                    value={emailForm.senderEmail || 'contacto@interpresdigital.com'}
                    onChange={e => setEmailForm({ ...emailForm, senderEmail: e.target.value })}
                    placeholder="contacto@interpresdigital.com"
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-sans outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Asunto del Correo</label>
                  <input
                    type="text"
                    value={emailForm.subject || DEFAULT_EMAIL_SUBJECT}
                    onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                    placeholder="Ej. ¡Videollamada Agendada con Éxito! - {plataforma}"
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Cuerpo del Mensaje / Plantilla del Correo</label>
                  <div className="text-xxs text-purple-600 dark:text-purple-400 font-semibold">
                    Etiquetas automáticas: <code className="bg-purple-50 dark:bg-purple-950/40 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300">&#123;nombre_cliente&#125;</code> <code className="bg-purple-50 dark:bg-purple-950/40 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300">&#123;fecha&#125;</code> <code className="bg-purple-50 dark:bg-purple-950/40 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300">&#123;hora&#125;</code> <code className="bg-purple-50 dark:bg-purple-950/40 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300">&#123;enlace_zoom&#125;</code> <code className="bg-purple-50 dark:bg-purple-950/40 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300">&#123;plataforma&#125;</code>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={emailForm.bodyTemplate || DEFAULT_EMAIL_BODY}
                  onChange={e => setEmailForm({ ...emailForm, bodyTemplate: e.target.value })}
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-3 text-xs dark:text-white outline-none font-sans leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setEmailTestModalOpen(true)}
                  className="bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>⚡ Enviar Correo de Prueba (Test Modal)</span>
                </button>
              </div>
            </div>
          </div>

              {/* Servicio Oficial de Google Workspace / Gmail API */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-dark-border/60 p-6 sm:p-8 space-y-6 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 dark:border-dark-border/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center font-bold">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Conexión con Google Workspace</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Vincula tu correo corporativo para enviar las confirmaciones de videollamadas automáticamente</p>
                    </div>
                  </div>

                  {(() => {
                    const isConnected = Boolean(googleForm.connected || googleForm.userEmail);
                    const userEmail = googleForm.userEmail || 'admin@interpresdigital.com';

                    if (!isConnected) {
                      return (
                        <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          🔴 Desconectado
                        </span>
                      );
                    }
                    return (
                      <span className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        ✓ Conectado: {userEmail}
                      </span>
                    );
                  })()}
                </div>

                {(() => {
                  const isConnected = Boolean(googleForm.connected || googleForm.userEmail);
                  const userEmail = googleForm.userEmail || 'admin@interpresdigital.com';

                  if (isConnected) {
                    return (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-emerald-50/60 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>Cuenta Vinculada y Activa: {userEmail}</span>
                          </p>
                          <p className="text-xxs text-emerald-700 dark:text-emerald-400">
                            Las confirmaciones de citas se enviarán automáticamente desde tu dirección oficial de Gmail.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleConnectGoogle}
                            disabled={connectingGoogle}
                            className="bg-emerald-700/10 hover:bg-emerald-700/20 text-emerald-800 dark:text-emerald-300 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reconectar</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleDisconnectGoogle}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-rose-50 hover:border-rose-300 text-rose-600 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Desconectar</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        Haz clic en el botón para vincular tu cuenta corporativa de <strong>Google Workspace / Gmail</strong>.
                      </p>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleConnectGoogle}
                          disabled={connectingGoogle}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-2xl text-xs inline-flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                        >
                          {connectingGoogle ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Key className="w-4 h-4" />
                          )}
                          <span>🔑 Vincular Cuenta de Google</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

          {savedIntegrationsNotice && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm animate-fade-in my-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>¡Configuración de Zoom y Telegram guardada exitosamente en la base de datos!</span>
            </div>
          )}

          <button
            type="submit"
            disabled={savingIntegrations}
            className={clsx(
              "w-full font-bold py-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2",
              savedIntegrationsNotice 
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20" 
                : "bg-primary-600 hover:bg-primary-700 text-white shadow-primary-500/20"
            )}
          >
            {savingIntegrations ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Guardando en la base de datos...</span>
              </>
            ) : savedIntegrationsNotice ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>¡Guardado Exitosamente!</span>
              </>
            ) : (
              <span>Guardar Configuración de Zoom y Telegram</span>
            )}
          </button>
        </form>
      )}

      {/* Modal de WhatsApp con Plantillas */}
      {whatsAppModalBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-500" />
                  Enviar WhatsApp a {whatsAppModalBooking.clientName}
                </h3>
                <p className="text-xs text-gray-400">Teléfono: {whatsAppModalBooking.clientPhone}</p>
              </div>
              <button 
                onClick={() => setWhatsAppModalBooking(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                Selecciona una Plantilla Mensaje
              </label>
              <div className="grid grid-cols-1 gap-2">
                {WHATSAPP_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(tpl.id);
                      setCustomWhatsAppText(tpl.getMessage(whatsAppModalBooking));
                    }}
                    className={clsx(
                      "p-3 rounded-xl text-left border text-xs font-semibold transition-all flex items-center justify-between",
                      selectedTemplateId === tpl.id 
                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold" 
                        : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300"
                    )}
                  >
                    <span>{tpl.name}</span>
                    {selectedTemplateId === tpl.id && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="space-y-1 pt-2">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300">Vista Previa / Edición de Texto</label>
                <textarea
                  rows={6}
                  value={customWhatsAppText}
                  onChange={e => setCustomWhatsAppText(e.target.value)}
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-3 text-xs dark:text-white outline-none font-sans"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setWhatsAppModalBooking(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = getWhatsAppUrl(whatsAppModalBooking.clientPhone, customWhatsAppText);
                  window.open(url, '_blank');
                  setWhatsAppModalBooking(null);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Abrir WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Prueba de Correo Electrónico */}
      {emailTestModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-purple-500" />
                  Enviar Correo de Prueba (Test Modal)
                </h3>
                <p className="text-xs text-gray-400">Prueba la entrega real con diseño HTML corporativo</p>
              </div>
              <button 
                onClick={() => setEmailTestModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                  Correo Electrónico de Destino *
                </label>
                <input
                  type="email"
                  value={testEmailTarget}
                  onChange={e => setTestEmailTarget(e.target.value)}
                  placeholder="experienciainfinity@gmail.com"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-3 text-xs dark:text-white font-sans outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                  Selecciona la Plantilla a Probar
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {EMAIL_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setTestEmailTemplateId(tpl.id)}
                      className={clsx(
                        "p-3 rounded-xl text-left border text-xs font-semibold transition-all flex items-center justify-between",
                        testEmailTemplateId === tpl.id 
                          ? "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-700 dark:text-purple-300 font-bold" 
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300"
                      )}
                    >
                      <span>{tpl.name}</span>
                      {testEmailTemplateId === tpl.id && <Check className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEmailTestModalOpen(false)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sendingEmailTest || !testEmailTarget}
                onClick={async () => {
                  setSendingEmailTest(true);
                  try {
                    const selectedTpl = EMAIL_TEMPLATES.find(t => t.id === testEmailTemplateId) || EMAIL_TEMPLATES[0];
                    const mockBooking: Booking = {
                      id: `test_${Date.now()}`,
                      clientName: "Experiencia Infinity",
                      clientEmail: testEmailTarget.trim().toLowerCase(),
                      clientPhone: "+52 415 179 0204",
                      platformId: "p1",
                      platformName: "Lumina Core",
                      topic: "Demostración y cotización de servicios digitales",
                      date: "2026-07-28",
                      startTime: "12:00",
                      endTime: "12:45",
                      zoomJoinUrl: "https://zoom.us/j/97693257924?pwd=test",
                      status: "Programada",
                      createdAt: new Date().toISOString()
                    };

                    const testConfig = {
                      ...emailForm,
                      subject: selectedTpl.subject,
                      bodyTemplate: selectedTpl.bodyTemplate
                    };

                    const res = await sendBookingConfirmationEmail(mockBooking, testConfig, googleForm);
                    if (res.success) {
                      showSaveNotice(`✅ Correo de prueba con plantilla enviado exitosamente a ${testEmailTarget}`);
                      alert(`✅ ¡Éxito! Correo enviado a ${testEmailTarget}`);
                    } else {
                      alert(`⚠️ Resultado: ${res.message}`);
                    }
                  } catch (err: any) {
                    alert(`Error enviando correo: ${err.message || 'Error al conectar'}`);
                  } finally {
                    setSendingEmailTest(false);
                    setEmailTestModalOpen(false);
                  }
                }}
                className="flex-1 bg-[#1464B8] hover:bg-[#10539A] text-white font-bold py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sendingEmailTest ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-4 h-4" />}
                <span>{sendingEmailTest ? "Enviando..." : "Enviar Correo de Prueba"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Envío Directo de Correo para Cita Individual */}
      {emailModalBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-purple-500" />
                  Enviar Correo a {emailModalBooking.clientName}
                </h3>
                <p className="text-xs text-gray-400">Destinatario: {emailModalBooking.clientEmail}</p>
              </div>
              <button 
                onClick={() => setEmailModalBooking(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                  Selecciona la Plantilla de Correo
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {EMAIL_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedEmailTplId(tpl.id);
                        setCustomEmailSubject(interpolateEmailTemplate(tpl.subject, emailModalBooking));
                        setCustomEmailBody(interpolateEmailTemplate(tpl.bodyTemplate, emailModalBooking));
                      }}
                      className={clsx(
                        "p-3 rounded-xl text-left border text-xs font-semibold transition-all flex items-center justify-between",
                        selectedEmailTplId === tpl.id 
                          ? "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-700 dark:text-purple-300 font-bold" 
                          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300"
                      )}
                    >
                      <span>{tpl.name}</span>
                      {selectedEmailTplId === tpl.id && <Check className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                  Asunto del Correo
                </label>
                <input
                  type="text"
                  value={customEmailSubject}
                  onChange={e => setCustomEmailSubject(e.target.value)}
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-sans outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider block">
                  Cuerpo del Mensaje (Vista Previa)
                </label>
                <textarea
                  rows={6}
                  value={customEmailBody}
                  onChange={e => setCustomEmailBody(e.target.value)}
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-3 text-xs dark:text-white outline-none font-sans leading-relaxed"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEmailModalBooking(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sendingManualEmail}
                onClick={async () => {
                  setSendingManualEmail(true);
                  try {
                    const customConfig = {
                      ...emailForm,
                      subject: customEmailSubject,
                      bodyTemplate: customEmailBody
                    };
                    const res = await sendBookingConfirmationEmail(emailModalBooking, customConfig, googleForm);
                    if (res.success) {
                      showSaveNotice(`✅ Correo enviado exitosamente a ${emailModalBooking.clientEmail}`);
                      alert(`✅ ¡Correo enviado a ${emailModalBooking.clientEmail}!`);
                    } else {
                      alert(`⚠️ Resultado: ${res.message}`);
                    }
                  } catch (err: any) {
                    alert(`Error enviando correo: ${err.message || 'Error al conectar'}`);
                  } finally {
                    setSendingManualEmail(false);
                    setEmailModalBooking(null);
                  }
                }}
                className="flex-1 bg-[#1464B8] hover:bg-[#10539A] text-white font-bold py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sendingManualEmail ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-4 h-4" />}
                <span>{sendingManualEmail ? "Enviando..." : "Enviar Correo al Cliente"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Crear Cita Manualmente */}
      {manualModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-5 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <Video className="w-5 h-5 text-primary-500" />
                  Agendar Cita Manualmente (Zoom + Notificaciones)
                </h3>
                <p className="text-xs text-gray-400">Genera la sala en Zoom y despacha las notificaciones automáticamente</p>
              </div>
              <button 
                onClick={() => setManualModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!manualClientName || !manualClientEmail || !manualClientPhone) {
                  alert("Por favor completa los datos obligatorios del cliente.");
                  return;
                }
                setCreatingManualBooking(true);
                try {
                  const targetPlatform = platformsList.find(p => p.id === manualPlatformId) || platformsList[0] || {
                    id: "p1", name: "Interpres Digital", slug: "interpres-digital"
                  };

                  const fullPhone = manualClientPhone.trim().startsWith('+')
                    ? manualClientPhone.trim()
                    : `${manualCountryCode} ${manualClientPhone.trim()}`;

                  // 1. Generar reunión de Zoom
                  let zoomResult = { joinUrl: "", startUrl: "", meetingId: "", password: "" };
                  if (zoomForm.enabled && zoomForm.accountId && zoomForm.clientId && zoomForm.clientSecret) {
                    try {
                      zoomResult = await createZoomMeeting(zoomForm, {
                        topic: `Videollamada con ${manualClientName} (${targetPlatform.name})`,
                        date: manualDate,
                        startTime: manualStartTime,
                        durationMinutes: 45,
                        agenda: manualTopic
                      });
                    } catch (e) {
                      console.warn("Error creando Zoom meeting manual:", e);
                    }
                  }

                  // 2. Crear objeto Booking
                  const newBooking: Booking = {
                    id: `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    clientName: manualClientName.trim(),
                    clientEmail: manualClientEmail.trim().toLowerCase(),
                    clientPhone: fullPhone,
                    platformId: targetPlatform.id,
                    platformName: targetPlatform.name,
                    topic: manualTopic.trim() || undefined,
                    date: manualDate,
                    startTime: manualStartTime,
                    endTime: manualEndTime,
                    zoomJoinUrl: zoomResult.joinUrl || `https://zoom.us/j/${Math.floor(10000000000 + Math.random() * 90000000000)}`,
                    zoomStartUrl: zoomResult.startUrl,
                    zoomMeetingId: zoomResult.meetingId,
                    status: 'Programada',
                    createdAt: new Date().toISOString()
                  };

                  // 3. Guardar en Firestore
                  await addBooking(newBooking);

                  // 4. Telegram
                  if (telegramForm.enabled && telegramForm.botToken && telegramForm.chatId) {
                    sendTelegramBookingNotification(telegramForm, newBooking, targetPlatform.name);
                  }

                  // 5. Email
                  sendBookingConfirmationEmail(newBooking, emailForm, googleForm);

                  showSaveNotice(`✅ Cita agendada manualmente con éxito para ${manualClientName}`);
                  alert(`✅ ¡Cita creada y confirmada exitosamente a ${manualClientEmail}!`);

                  setManualClientName('');
                  setManualClientEmail('');
                  setManualClientPhone('');
                  setManualTopic('');
                  setManualModalOpen(false);

                } catch (err: any) {
                  alert(`Error al crear cita: ${err.message || 'Error desconocido'}`);
                } finally {
                  setCreatingManualBooking(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Nombre del Cliente *</label>
                  <input
                    type="text"
                    required
                    value={manualClientName}
                    onChange={e => setManualClientName(e.target.value)}
                    placeholder="Ej. Laura González"
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    value={manualClientEmail}
                    onChange={e => setManualClientEmail(e.target.value)}
                    placeholder="laura@ejemplo.com"
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* WhatsApp con LADA */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">WhatsApp / Teléfono *</label>
                <div className="flex gap-2">
                  <select
                    value={manualCountryCode}
                    onChange={e => setManualCountryCode(e.target.value)}
                    className="bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl px-2.5 py-2.5 text-xs dark:text-white font-semibold outline-none"
                  >
                    {COUNTRY_CODES.map((c, i) => (
                      <option key={i} value={c.code}>{c.flag} {c.code} ({c.country})</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    value={manualClientPhone}
                    onChange={e => setManualClientPhone(e.target.value)}
                    placeholder="415 123 4567"
                    className="flex-1 bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Plataforma Origen</label>
                  <select
                    value={manualPlatformId}
                    onChange={e => setManualPlatformId(e.target.value)}
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                  >
                    {platformsList.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Horario (CDMX)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={manualStartTime}
                      onChange={e => setManualStartTime(e.target.value)}
                      placeholder="12:00"
                      className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2 text-xs dark:text-white text-center outline-none"
                    />
                    <span className="text-xs text-gray-400">-</span>
                    <input
                      type="text"
                      value={manualEndTime}
                      onChange={e => setManualEndTime(e.target.value)}
                      placeholder="12:45"
                      className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2 text-xs dark:text-white text-center outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Tema o Motivo de la Cita</label>
                <textarea
                  rows={2}
                  value={manualTopic}
                  onChange={e => setManualTopic(e.target.value)}
                  placeholder="Ej. Demostración y cotización de servicios digitales"
                  className="w-full bg-[#F6F9FC] dark:bg-[#071B36] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-xl p-2.5 text-xs dark:text-white outline-none"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingManualBooking}
                  className="flex-1 bg-primary-600 hover:bg-primary-500 text-white font-bold py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {creatingManualBooking ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Plus className="w-4 h-4" />}
                  <span>{creatingManualBooking ? "Agendando Cita..." : "Confirmar y Generar Cita"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;
