import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Booking, BookingSettings, BookingPlatform } from '../types';
import { createZoomMeeting } from '../services/zoomService';
import { sendTelegramBookingNotification } from '../services/telegramService';
import { sendBookingConfirmationEmail } from '../services/emailService';
import { syncBookingToGoogleContacts } from '../services/googleContactsService';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Video, 
  CheckCircle2, 
  User, 
  Mail, 
  Phone, 
  MessageSquare, 
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

const defaultSettings: BookingSettings = {
  availability: {
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    slotDurationMinutes: 45,
    bufferMinutes: 15,
    breakStartTime: "14:00",
    breakEndTime: "15:00"
  },
  platforms: [
    { id: "p1", name: "Interpres Digital", slug: "interpres-digital", color: "#06a0a2", description: "Infraestructura Digital y Agentes de IA" },
    { id: "p2", name: "Lúmina Core", slug: "lumina-core", color: "#930687", description: "Plataforma Inteligente" },
    { id: "p3", name: "TKD Register", slug: "tkd-register", color: "#f59e0b", description: "Plataforma Deportiva" },
    { id: "p4", name: "Otra consulta", slug: "otra-consulta", color: "#6366f1", description: "Asesoría Comercial" }
  ],
  zoomConfig: { accountId: "", clientId: "", clientSecret: "", enabled: false },
  telegramConfig: { botToken: "", chatId: "", enabled: false },
  blackoutDates: []
};

export const COUNTRY_CODES = [
  { country: "México", code: "+52", flag: "🇲🇽" },
  { country: "Estados Unidos / Canadá", code: "+1", flag: "🇺🇸" },
  { country: "Colombia", code: "+57", flag: "🇨🇴" },
  { country: "Chile", code: "+56", flag: "🇨🇱" },
  { country: "Argentina", code: "+54", flag: "🇦🇷" },
  { country: "España", code: "+34", flag: "🇪🇸" },
  { country: "Perú", code: "+51", flag: "🇵🇪" },
  { country: "Guatemala", code: "+502", flag: "🇬🇹" },
  { country: "Ecuador", code: "+593", flag: "🇪🇨" },
  { country: "Costa Rica", code: "+506", flag: "🇨🇷" },
  { country: "Panamá", code: "+507", flag: "🇵🇦" },
  { country: "Rep. Dominicana", code: "+1", flag: "🇩🇴" },
  { country: "Uruguay", code: "+598", flag: "🇺🇾" },
  { country: "Venezuela", code: "+58", flag: "🇻🇪" },
  { country: "El Salvador", code: "+503", flag: "🇸🇻" },
  { country: "Honduras", code: "+504", flag: "🇭🇳" },
  { country: "Nicaragua", code: "+505", flag: "🇳🇮" },
  { country: "Bolivia", code: "+591", flag: "🇧🇴" },
  { country: "Paraguay", code: "+595", flag: "🇵🇾" },
];

export const COMMON_TIMEZONES = [
  // México
  { label: "🇲🇽 México (CDMX / Cancún / Monterrey / Guadalajara) - GMT-6 (Hora Oficial)", zone: "America/Mexico_City" },
  { label: "🇲🇽 México (Tijuana / Mexicali / Baja California) - GMT-8", zone: "America/Tijuana" },
  { label: "🇲🇽 México (Hermosillo / Sonora) - GMT-7", zone: "America/Hermosillo" },
  { label: "🇲🇽 México (Chihuahua / Mazatlán) - GMT-7", zone: "America/Chihuahua" },
  
  // Sudamérica
  { label: "🇨🇴 Colombia (Bogotá / Medellín / Cali) - GMT-5", zone: "America/Bogota" },
  { label: "🇦🇷 Argentina (Buenos Aires / Córdoba / Mendoza) - GMT-3", zone: "America/Argentina/Buenos_Aires" },
  { label: "🇨🇱 Chile (Santiago / Valparaíso) - GMT-3", zone: "America/Santiago" },
  { label: "🇵🇪 Perú (Lima / Arequipa / Cusco) - GMT-5", zone: "America/Lima" },
  { label: "🇪🇨 Ecuador (Quito / Guayaquil / Galápagos) - GMT-5", zone: "America/Guayaquil" },
  { label: "🇻🇪 Venezuela (Caracas / Maracaibo) - GMT-4", zone: "America/Caracas" },
  { label: "🇺🇾 Uruguay (Montevideo) - GMT-3", zone: "America/Montevideo" },
  { label: "🇵🇾 Paraguay (Asunción) - GMT-3", zone: "America/Asuncion" },
  { label: "🇧🇴 Bolivia (La Paz / Santa Cruz) - GMT-4", zone: "America/La_Paz" },
  { label: "🇧🇷 Brasil (San Pablo / Río de Janeiro) - GMT-3", zone: "America/Sao_Paulo" },
  
  // Centroamérica & El Caribe
  { label: "🇬🇹 Guatemala (Ciudad de Guatemala) - GMT-6", zone: "America/Guatemala" },
  { label: "🇨🇷 Costa Rica (San José) - GMT-6", zone: "America/Costa_Rica" },
  { label: "🇵🇦 Panamá (Ciudad de Panamá) - GMT-5", zone: "America/Panama" },
  { label: "🇩🇴 Rep. Dominicana (Santo Domingo) - GMT-4", zone: "America/Santo_Domingo" },
  { label: "🇸🇻 El Salvador (San Salvador) - GMT-6", zone: "America/El_Salvador" },
  { label: "🇭🇳 Honduras (Tegucigalpa) - GMT-6", zone: "America/Tegucigalpa" },
  { label: "🇳🇮 Nicaragua (Managua) - GMT-6", zone: "America/Managua" },
  { label: "🇵🇷 Puerto Rico (San Juan) - GMT-4", zone: "America/Puerto_Rico" },

  // Norteamérica
  { label: "🇺🇸 EE.UU. Este (Nueva York / Miami / Atlanta) - GMT-5", zone: "America/New_York" },
  { label: "🇺🇸 EE.UU. Centro (Chicago / Houston / Dallas) - GMT-6", zone: "America/Chicago" },
  { label: "🇺🇸 EE.UU. Montaña (Denver / Phoenix) - GMT-7", zone: "America/Denver" },
  { label: "🇺🇸 EE.UU. Pacífico (Los Ángeles / San Francisco) - GMT-8", zone: "America/Los_Angeles" },
  { label: "🇨🇦 Canadá Este (Toronto / Montreal) - GMT-5", zone: "America/Toronto" },
  { label: "🇨🇦 Canadá Pacífico (Vancouver) - GMT-8", zone: "America/Vancouver" },

  // Europa & Asia
  { label: "🇪🇸 España (Madrid / Barcelona / Valencia) - GMT+1", zone: "Europe/Madrid" },
  { label: "🇪🇸 España (Islas Canarias) - GMT+0", zone: "Atlantic/Canary" },
  { label: "🇬🇧 Reino Unido (Londres) - GMT+0", zone: "Europe/London" },
  { label: "🇫🇷 Francia (París) / 🇩🇪 Alemania (Berlín) / 🇮🇹 Italia - GMT+1", zone: "Europe/Paris" },
];

const PublicBooking: React.FC = () => {
  const { platformSlug } = useParams<{ platformSlug?: string }>();

  const [settings, setSettings] = useState<BookingSettings>(defaultSettings);
  const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedPlatform, setSelectedPlatform] = useState<BookingPlatform | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  
  // User info & Timezone
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState('+52');
  const [clientPhone, setClientPhone] = useState('');
  const [clientTimezone, setClientTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
    } catch {
      return 'America/Mexico_City';
    }
  });
  const [topic, setTopic] = useState('');

  // Month Selector State & Helper
  const [monthOffset, setMonthOffset] = useState<number>(0);

  const getDaysForMonthView = () => {
    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const monthName = targetDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Day of week offset (Monday = 0 ... Sunday = 6)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysList = [];

    // Empty padding slots
    for (let i = 0; i < startDayOfWeek; i++) {
      daysList.push(null);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let day = 1; day <= totalDays; day++) {
      const monthStr = (month + 1).toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      const isoDate = `${year}-${monthStr}-${dayStr}`;

      const dateObj = new Date(`${isoDate}T00:00:00`);
      const dayOfWeek = dateObj.getDay();

      let isWorkingDay = false;
      if (settings.availability.dailySchedules && settings.availability.dailySchedules.length > 0) {
        const daySched = settings.availability.dailySchedules.find(d => d.dayOfWeek === dayOfWeek);
        isWorkingDay = Boolean(daySched && daySched.enabled && daySched.timeRanges && daySched.timeRanges.length > 0);
      } else {
        isWorkingDay = settings.availability.daysOfWeek.includes(dayOfWeek);
      }

      const isBlackout = settings.blackoutDates.includes(isoDate);
      const isPast = isoDate < todayStr;
      const isAvailable = isWorkingDay && !isBlackout && !isPast;

      daysList.push({
        dayNum: day,
        isoDate,
        isAvailable,
        isPast,
        isToday: isoDate === todayStr
      });
    }

    return {
      monthLabel: capitalizedMonth,
      daysList
    };
  };

  // Processing state
  const [submitting, setSubmitting] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load settings and existing bookings
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Settings (Sanitize secrets out of public state)
        const settingsDoc = await getDoc(doc(db, "settings", "booking_settings"));
        let currentSettings = defaultSettings;
        if (settingsDoc.exists()) {
          const rawData = settingsDoc.data() as BookingSettings;
          currentSettings = {
            ...defaultSettings,
            availability: rawData.availability || defaultSettings.availability,
            platforms: rawData.platforms || defaultSettings.platforms,
            blackoutDates: rawData.blackoutDates || defaultSettings.blackoutDates,
            // Mantener tokens vacíos en la memoria pública de navegación
            zoomConfig: { accountId: '', clientId: '', clientSecret: '', enabled: rawData.zoomConfig?.enabled || false },
            telegramConfig: { botToken: '', chatId: '', enabled: rawData.telegramConfig?.enabled || false }
          };
        }
        setSettings(currentSettings);

        // Match platform slug if provided; otherwise select first platform (Interpres Digital)
        if (platformSlug) {
          const normalizedSlug = platformSlug.toLowerCase() === 'consulta-directa' ? 'otra-consulta' : platformSlug.toLowerCase();
          const matched = currentSettings.platforms.find(p => p.slug.toLowerCase() === normalizedSlug);
          if (matched) {
            setSelectedPlatform(matched);
          } else {
            setSelectedPlatform(currentSettings.platforms[0] || null);
          }
        } else {
          setSelectedPlatform(currentSettings.platforms[0] || null);
        }

        // Fetch existing bookings to prevent double-booking
        const bookingsSnap = await getDocs(collection(db, "bookings"));
        const bList: Booking[] = [];
        bookingsSnap.forEach(d => {
          const b = d.data() as Booking;
          if (b.status !== 'Cancelada') {
            bList.push(b);
          }
        });
        setExistingBookings(bList);
      } catch (err) {
        console.error("Error al cargar datos públicos de agendamiento:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [platformSlug]);

  // Generate available time slots for a given date
  const generateAvailableSlots = (dateStr: string) => {
    if (!dateStr || !settings) return [];

    const { availability, blackoutDates } = settings;
    if (blackoutDates.includes(dateStr)) return [];

    // Verify day of week
    const dateObj = new Date(`${dateStr}T00:00:00`);
    const dayOfWeek = dateObj.getDay(); // 0=Sun, 1=Mon...

    // Obtener franjas horarias específicas para este día de la semana o fecha específica
    let activeRanges: { startTime: string; endTime: string }[] = [];
    let customDateOverridden = false;

    if (availability.customDateSchedules && availability.customDateSchedules.length > 0) {
      const customSched = availability.customDateSchedules.find(c => c.date === dateStr);
      if (customSched) {
        customDateOverridden = true;
        if (!customSched.enabled || !customSched.timeRanges || customSched.timeRanges.length === 0) {
          return []; // Forzado a estar cerrado en esta fecha
        }
        activeRanges = customSched.timeRanges;
      }
    }

    if (!customDateOverridden) {
      if (availability.dailySchedules && availability.dailySchedules.length > 0) {
        const daySched = availability.dailySchedules.find(d => d.dayOfWeek === dayOfWeek);
        if (!daySched || !daySched.enabled || !daySched.timeRanges || daySched.timeRanges.length === 0) {
          return []; // Día no disponible o cerrado
        }
        activeRanges = daySched.timeRanges;
      } else {
        if (!availability.daysOfWeek.includes(dayOfWeek)) return [];
        activeRanges = (availability.timeRanges && availability.timeRanges.length > 0)
          ? availability.timeRanges
          : [{ startTime: availability.startTime || '09:00', endTime: availability.endTime || '18:00' }];
      }
    }

    const slots: { startTime: string; endTime: string }[] = [];

    const parseMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const formatMinutes = (totalMinutes: number) => {
      const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
      const m = (totalMinutes % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    const duration = availability.slotDurationMinutes || 45;
    const buffer = availability.bufferMinutes || 15;

    const todayStr = new Date().toISOString().split('T')[0];
    const nowInMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    activeRanges.forEach(range => {
      const rangeStartMin = parseMinutes(range.startTime);
      const rangeEndMin = parseMinutes(range.endTime);
      let currentMin = rangeStartMin;

      while (currentMin + duration <= rangeEndMin) {
        const slotStart = currentMin;
        const slotEnd = currentMin + duration;

        // Verificar si la hora ya pasó para el día de hoy
        let isPast = false;
        if (dateStr === todayStr && slotStart <= nowInMinutes + 30) {
          isPast = true;
        }

        // Verificar conflicto con citas agendadas
        const formattedSlotStart = formatMinutes(slotStart);
        const formattedSlotEnd = formatMinutes(slotEnd);

        const hasConflict = existingBookings.some(b => {
          if (b.date !== dateStr) return false;
          const bStart = parseMinutes(b.startTime);
          const bEnd = parseMinutes(b.endTime);
          return slotStart < bEnd && slotEnd > bStart;
        });

        if (!isPast && !hasConflict) {
          // Evitar duplicar slots si se solapan por error de configuración
          const exists = slots.some(s => s.startTime === formattedSlotStart && s.endTime === formattedSlotEnd);
          if (!exists) {
            slots.push({
              startTime: formattedSlotStart,
              endTime: formattedSlotEnd
            });
          }
        }

        currentMin = slotEnd + buffer;
      }
    });

    return slots;
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlatform || !selectedDate || !selectedSlot || !clientName || !clientEmail || !clientPhone) {
      setErrorMsg("Por favor completa todos los campos requeridos.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // Obtener credenciales de Zoom y Telegram al momento de enviar para ejecución
      const settingsDoc = await getDoc(doc(db, "settings", "booking_settings"));
      const latestSettings = settingsDoc.exists() ? (settingsDoc.data() as BookingSettings) : settings;

      // 1. Generar videollamada con la API de Zoom
      const zoomResult = await createZoomMeeting(latestSettings.zoomConfig, {
        topic: `Videollamada con ${clientName} (${selectedPlatform.name})`,
        date: selectedDate,
        startTime: selectedSlot.startTime,
        durationMinutes: latestSettings.availability.slotDurationMinutes || 45,
        agenda: topic
      });

      const fullPhone = clientPhone.trim().startsWith('+') 
        ? clientPhone.trim() 
        : `${selectedCountryCode} ${clientPhone.trim()}`;

      // 2. Crear objeto Booking
      const bookingId = `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newBooking: Booking = {
        id: bookingId,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim().toLowerCase(),
        clientPhone: fullPhone,
        platformId: selectedPlatform.id,
        platformName: selectedPlatform.name,
        topic: topic.trim() || undefined,
        date: selectedDate,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        zoomJoinUrl: zoomResult.joinUrl,
        zoomStartUrl: zoomResult.startUrl,
        zoomMeetingId: zoomResult.meetingId,
        zoomPassword: zoomResult.password,
        status: 'Programada',
        createdAt: new Date().toISOString()
      };

      // 3. Guardar en Firestore
      await setDoc(doc(db, "bookings", bookingId), newBooking);

      // 4. Enviar notificación instantánea a Telegram
      await sendTelegramBookingNotification(latestSettings.telegramConfig, newBooking);

      // 5. Enviar correo de confirmación automático al cliente (Vía Google Gmail API oficial)
      await sendBookingConfirmationEmail(newBooking, latestSettings.emailConfig, latestSettings.googleConfig);

      // 6. Sincronizar con Google Contacts automáticamente
      if (latestSettings.googleConfig?.enabled && latestSettings.googleConfig?.connected) {
        const syncRes = await syncBookingToGoogleContacts(newBooking, latestSettings.googleConfig);
        if (syncRes.freshToken) {
          const updatedSettings = {
            ...latestSettings,
            googleConfig: {
              ...latestSettings.googleConfig,
              accessToken: syncRes.freshToken,
              tokenObtainedAt: Date.now()
            }
          };
          await setDoc(doc(db, "settings", "booking_settings"), updatedSettings);
        }
      }

      // 7. Actualizar interfaz
      setCreatedBooking(newBooking);
    } catch (err: any) {
      console.error("Error al procesar la cita:", err);
      setErrorMsg("Ocurrió un error al procesar tu reservación. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  // Date range generation (Next 30 days)
  const getUpcomingDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const isoDate = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      
      let isAvailable = false;
      if (settings.availability.customDateSchedules && settings.availability.customDateSchedules.length > 0) {
        const customSched = settings.availability.customDateSchedules.find(c => c.date === isoDate);
        if (customSched) {
          isAvailable = customSched.enabled && customSched.timeRanges && customSched.timeRanges.length > 0;
        } else {
          // No hay override para esta fecha, usar recurrentes
          if (settings.availability.dailySchedules && settings.availability.dailySchedules.length > 0) {
            const daySched = settings.availability.dailySchedules.find(ds => ds.dayOfWeek === dayOfWeek);
            isAvailable = Boolean(daySched && daySched.enabled && daySched.timeRanges && daySched.timeRanges.length > 0);
          } else {
            isAvailable = settings.availability.daysOfWeek.includes(dayOfWeek);
          }
        }
      } else {
        if (settings.availability.dailySchedules && settings.availability.dailySchedules.length > 0) {
          const daySched = settings.availability.dailySchedules.find(ds => ds.dayOfWeek === dayOfWeek);
          isAvailable = Boolean(daySched && daySched.enabled && daySched.timeRanges && daySched.timeRanges.length > 0);
        } else {
          isAvailable = settings.availability.daysOfWeek.includes(dayOfWeek);
        }
      }

      if (isAvailable && !settings.blackoutDates.includes(isoDate)) {
        dates.push({
          isoDate,
          dayName: d.toLocaleDateString('es-MX', { weekday: 'short' }),
          dayNum: d.getDate(),
          monthName: d.toLocaleDateString('es-MX', { month: 'short' })
        });
      }
    }
    return dates;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium animate-pulse">Cargando disponibilidad de agenda...</p>
        </div>
      </div>
    );
  }

  // Pantalla de Confirmación de Cita Exitosa
  if (createdBooking) {
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Videollamada: ${createdBooking.platformName}`)}&dates=${createdBooking.date.replace(/-/g, '')}T${createdBooking.startTime.replace(':', '')}00Z/${createdBooking.date.replace(/-/g, '')}T${createdBooking.endTime.replace(':', '')}00Z&details=${encodeURIComponent(`Enlace de Zoom: ${createdBooking.zoomJoinUrl}\nCliente: ${createdBooking.clientName}`)}&location=${encodeURIComponent(createdBooking.zoomJoinUrl || '')}`;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-primary-950/20 text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-primary-500 to-indigo-500"></div>

          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider">
              ¡Cita Confirmada!
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Tu videollamada ha sido agendada</h1>
            <p className="text-slate-400 text-xs sm:text-sm">Hemos generado la sala de Zoom y enviado una notificación a nuestro equipo.</p>
          </div>

          {/* Details Card */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 text-left space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Plataforma</span>
                <span className="font-bold text-white text-sm">{createdBooking.platformName}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Cliente</span>
                <span className="font-bold text-white text-sm">{createdBooking.clientName}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Fecha</span>
                <span className="font-bold text-emerald-400 text-sm">{createdBooking.date}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Horario</span>
                <span className="font-bold text-primary-400 text-sm">{createdBooking.startTime} - {createdBooking.endTime} (CDMX)</span>
              </div>
            </div>

            {createdBooking.zoomJoinUrl && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-slate-400 text-xs font-semibold block mb-2">Enlace de la Videollamada (Zoom):</span>
                <a
                  href={createdBooking.zoomJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 bg-primary-600/20 hover:bg-primary-600/30 border border-primary-500/40 text-primary-300 p-3 rounded-xl transition-all text-xs font-bold group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Video className="w-4 h-4 text-primary-400 flex-shrink-0" />
                    <span className="truncate">{createdBooking.zoomJoinUrl}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-primary-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                </a>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
            >
              <CalendarIcon className="w-4 h-4 text-primary-400" />
              Agregar a Google Calendar
            </a>
            <button
              onClick={() => {
                setCreatedBooking(null);
                setSelectedDate('');
                setSelectedSlot(null);
              }}
              className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-600/20"
            >
              Agendar Otra Cita
            </button>
          </div>

          <div className="pt-2 border-t border-slate-850">
            <a
              href={`/#/cancel-booking/${createdBooking.id}`}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold underline"
            >
              ¿Necesitas modificar o cancelar esta reservación? Haz clic aquí
            </a>
          </div>
        </div>
      </div>
    );
  }

  const availableSlots = selectedDate ? generateAvailableSlots(selectedDate) : [];
  const upcomingDates = getUpcomingDates();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans flex items-center justify-center">
      <div className="max-w-4xl w-full bg-slate-900 border border-slate-850 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Sidebar Info */}
        <div className="lg:col-span-5 bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-slate-850 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            {/* Logotipo Oficial de Interpres Digital */}
            <div className="mb-3">
              <img 
                src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png" 
                alt="Interpres Digital" 
                className="h-10 w-auto max-w-[200px] object-contain"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Agendamiento Online
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
              Reserva tu Videollamada
            </h1>

            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Selecciona el día y horario de tu preferencia para conversar con nuestro equipo. La sala de Zoom se generará automáticamente.
            </p>

            {/* Platform Selector Badge */}
            {selectedPlatform && (
              <div className="pt-2">
                <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider block mb-1">Plataforma Seleccionada</span>
                <div 
                  className="p-3 rounded-xl border flex items-center gap-3 bg-slate-950/50"
                  style={{ borderColor: `${selectedPlatform.color}40` }}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedPlatform.color }}></div>
                  <div>
                    <span className="font-bold text-sm text-white block">{selectedPlatform.name}</span>
                    {selectedPlatform.description && <span className="text-xs text-slate-400 block">{selectedPlatform.description}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-6 border-t border-slate-800 text-xs text-slate-400">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Duración: <strong>{settings.availability.slotDurationMinutes || 45} minutos</strong></span>
            </div>
            <div className="flex items-center gap-2.5">
              <Video className="w-4 h-4 text-primary-400 flex-shrink-0" />
              <span>Plataforma: <strong>Zoom Video HD</strong></span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Confirmación instantánea</span>
            </div>
          </div>
        </div>

        {/* Right Content Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 space-y-6">
          <form onSubmit={handleBookingSubmit} className="space-y-6">
            
            {/* Step 1: Select Platform (if multiple and not fixed by slug) */}
            {settings.platforms.length > 1 && !platformSlug && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">1. Selecciona la Plataforma o Motivo</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {settings.platforms.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlatform(p)}
                      className={`p-3 rounded-xl border text-left transition-all text-xs flex items-center justify-between ${
                        selectedPlatform?.id === p.id 
                          ? 'bg-primary-600/20 border-primary-500 text-white font-bold ring-2 ring-primary-500/20' 
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }}></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Calendario Mensual Interactivo */}
            {(() => {
              const currentMonthData = getDaysForMonthView();

              return (
                <div className="space-y-3 bg-slate-950/40 p-4 rounded-3xl border border-slate-850">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-primary-400" />
                      Selecciona una Fecha
                    </label>

                    {/* Navegador de Meses */}
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        disabled={monthOffset <= 0}
                        onClick={() => setMonthOffset(prev => Math.max(0, prev - 1))}
                        className="text-slate-400 hover:text-white disabled:opacity-30 text-xs font-bold px-1"
                      >
                        ◀
                      </button>
                      <span className="text-xs font-extrabold text-white min-w-[110px] text-center">
                        {currentMonthData.monthLabel}
                      </span>
                      <button
                        type="button"
                        disabled={monthOffset >= 3}
                        onClick={() => setMonthOffset(prev => Math.min(3, prev + 1))}
                        className="text-slate-400 hover:text-white disabled:opacity-30 text-xs font-bold px-1"
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  {/* Días de la semana header */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider py-1 border-b border-slate-800/60">
                    <div>Lun</div>
                    <div>Mar</div>
                    <div>Mié</div>
                    <div>Jue</div>
                    <div>Vie</div>
                    <div>Sáb</div>
                    <div>Dom</div>
                  </div>

                  {/* Cuadrícula de días del mes */}
                  <div className="grid grid-cols-7 gap-1.5 pt-1">
                    {currentMonthData.daysList.map((dayItem, idx) => {
                      if (!dayItem) {
                        return <div key={`empty_${idx}`} className="h-10"></div>;
                      }

                      const isSelected = selectedDate === dayItem.isoDate;

                      return (
                        <button
                          key={dayItem.isoDate}
                          type="button"
                          disabled={!dayItem.isAvailable}
                          onClick={() => {
                            setSelectedDate(dayItem.isoDate);
                            setSelectedSlot(null);
                          }}
                          className={`h-11 rounded-xl text-center flex flex-col items-center justify-center transition-all border text-xs relative ${
                            isSelected
                              ? 'bg-primary-600 border-primary-400 text-white font-extrabold shadow-lg shadow-primary-600/30 scale-105 z-10'
                              : dayItem.isAvailable
                              ? 'bg-slate-900 hover:bg-slate-800 border-slate-750 text-slate-200 font-bold hover:border-slate-600'
                              : 'bg-slate-950/30 border-transparent text-slate-700 cursor-not-allowed font-normal'
                          }`}
                        >
                          <span className="text-xs font-bold">{dayItem.dayNum}</span>
                          {dayItem.isToday && !isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute bottom-1"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Step 3: Select Timezone & Time Slot (Expanded Vertical Grid) */}
            {selectedDate && (
              <div className="space-y-4 pt-2 border-t border-slate-800 animate-fade-in">
                <div className="space-y-1 bg-slate-950/60 p-3 rounded-2xl border border-slate-850">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>Zona Horaria del Cliente:</span>
                    </label>
                    <span className="text-xxs font-bold text-sky-400">CDMX: Hora Centro México</span>
                  </div>
                  <select
                    value={clientTimezone}
                    onChange={e => setClientTimezone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 text-white text-xs rounded-xl p-2 font-medium outline-none focus:border-sky-500"
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz.zone} value={tz.zone}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    Horarios Disponibles para el <span className="text-emerald-400">{selectedDate}</span>
                  </label>
                  <span className="text-xxs text-slate-400 font-semibold">{availableSlots.length} horarios libres</span>
                </div>

                {availableSlots.length === 0 ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>No hay horarios disponibles para esta fecha. Intenta seleccionando otro día en el calendario.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
                    {availableSlots.map((slot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-3 rounded-2xl border text-xs font-semibold text-center transition-all ${
                          selectedSlot?.startTime === slot.startTime 
                            ? 'bg-emerald-600 border-emerald-500 text-white font-extrabold shadow-lg shadow-emerald-600/30 scale-105' 
                            : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-sm font-bold">{slot.startTime} - {slot.endTime}</div>
                        <div className="text-[10px] opacity-70 font-normal">Hora CDMX</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Client Info Form */}
            {selectedSlot && (
              <div className="space-y-4 pt-4 border-t border-slate-800 animate-fade-in">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  Tus Datos de Contacto
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Nombre Completo *</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Correo Electrónico *</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        value={clientEmail}
                        onChange={e => setClientEmail(e.target.value)}
                        placeholder="juan@ejemplo.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                </div>

                {/* WhatsApp con Selector de Clave LADA Internacional */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-semibold text-slate-400">WhatsApp / Teléfono de Contacto *</label>
                    <span className="text-[10px] text-emerald-400 font-semibold">📍 Clave LADA Internacional</span>
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={selectedCountryCode}
                      onChange={e => setSelectedCountryCode(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs text-white outline-none focus:border-primary-500 font-semibold"
                    >
                      {COUNTRY_CODES.map((c, i) => (
                        <option key={i} value={c.code}>
                          {c.flag} {c.code} ({c.country})
                        </option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="tel"
                        required
                        value={clientPhone}
                        onChange={e => setClientPhone(e.target.value)}
                        placeholder="415 123 4567"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white outline-none focus:border-primary-500 font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    Selecciona tu país para incluir la clave LADA internacional y recibir confirmación directa en WhatsApp.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Tema o Motivo de la Cita (Opcional)</label>
                  <div className="relative">
                    <MessageSquare className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <textarea
                      rows={2}
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="Escribe brevemente qué te gustaría tratar en la reunión..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-primary-500 resize-none"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-primary-600/30 flex items-center justify-center gap-2 text-xs sm:text-sm uppercase tracking-wider"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Generando Sala de Zoom y Confirmando...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar y Reservar Cita</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default PublicBooking;
