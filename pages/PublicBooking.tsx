import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Booking, BookingSettings, BookingPlatform } from '../types';
import { createZoomMeeting } from '../services/zoomService';
import { sendTelegramBookingNotification } from '../services/telegramService';
import { sendBookingConfirmationEmail } from '../services/emailService';
import { syncBookingToGoogleContacts } from '../services/googleContactsService';
import { LOGO_BLANCO_URL, LOGO_COLOR_URL } from '../utils/brandAssets';
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
  AlertCircle,
  Cpu,
  Layers,
  Globe,
  TrendingUp,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Bot
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
    { id: "p1", name: "Interpres Digital", slug: "interpres-digital", color: "#1464B8", description: "Desarrollo de Software y Automatizaciones" },
    { id: "p5", name: "Consultoría IA", slug: "consultoria-ia", color: "#00A9B7", description: "Diagnóstico Estratégico y Arquitectura de IA" },
    { id: "p2", name: "Lúmina Core", slug: "lumina-core", color: "#930687", description: "Plataforma Inteligente" },
    { id: "p6", name: "Bacco iA", slug: "bacco-ia", color: "#8B1E3F", description: "Plataforma Inteligente con IA" },
    { id: "p3", name: "TKD Register", slug: "tkd-register", color: "#D97706", description: "Plataforma Deportiva" },
    { id: "p4", name: "Check-up financiero", slug: "check-up-financiero", color: "#102B4B", description: "Diagnóstico Financiero" }
  ],
  zoomConfig: { accountId: "", clientId: "", clientSecret: "", enabled: false },
  telegramConfig: { botToken: "", chatId: "", enabled: false },
  blackoutDates: []
};

const getPlatformIcon = (slug?: string, name?: string) => {
  const key = `${slug || ''} ${name || ''}`.toLowerCase();
  if (key.includes('consultoria') || key.includes('consultoría')) return Cpu;
  if (key.includes('bacco')) return Bot;
  if (key.includes('lumina') || key.includes('lúmina')) return Sparkles;
  if (key.includes('tkd')) return Award;
  if (key.includes('financiero') || key.includes('check-up')) return TrendingUp;
  if (key.includes('interpres')) return Layers;
  return Globe;
};

const formatHumanDate = (isoDate: string): string => {
  if (!isoDate) return '';
  try {
    const d = new Date(`${isoDate}T00:00:00`);
    const formatted = d.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return isoDate;
  }
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
          let normalizedPlatforms = (rawData.platforms || defaultSettings.platforms).map(p => {
            if (p.slug === 'otra-consulta' || p.name.toLowerCase() === 'otra consulta') {
              return { ...p, name: 'Check-up financiero', slug: 'check-up-financiero', color: '#102B4B', description: 'Diagnóstico Financiero' };
            }
            if (p.slug === 'interpres-digital') {
              return { ...p, color: '#1464B8', description: p.description || 'Desarrollo de Software y Automatizaciones' };
            }
            return p;
          });
          // Asegurar que las opciones oficiales "Consultoría IA" y "Bacco iA" estén siempre disponibles
          if (!normalizedPlatforms.some(p => p.slug === 'consultoria-ia')) {
            const consultoriaOption: BookingPlatform = {
              id: 'p5',
              name: 'Consultoría IA',
              slug: 'consultoria-ia',
              color: '#00A9B7',
              description: 'Diagnóstico Estratégico y Arquitectura de IA'
            };
            const idxInterpres = normalizedPlatforms.findIndex(p => p.slug === 'interpres-digital');
            if (idxInterpres >= 0) {
              normalizedPlatforms = [
                ...normalizedPlatforms.slice(0, idxInterpres + 1),
                consultoriaOption,
                ...normalizedPlatforms.slice(idxInterpres + 1)
              ];
            } else {
              normalizedPlatforms = [consultoriaOption, ...normalizedPlatforms];
            }
          }
          if (!normalizedPlatforms.some(p => p.slug === 'bacco-ia' || p.name.toLowerCase() === 'bacco ia')) {
            const baccoOption: BookingPlatform = {
              id: 'p6',
              name: 'Bacco iA',
              slug: 'bacco-ia',
              color: '#8B1E3F',
              description: 'Plataforma Inteligente con IA'
            };
            const idxLumina = normalizedPlatforms.findIndex(p => p.slug === 'lumina-core');
            if (idxLumina >= 0) {
              normalizedPlatforms = [
                ...normalizedPlatforms.slice(0, idxLumina + 1),
                baccoOption,
                ...normalizedPlatforms.slice(idxLumina + 1)
              ];
            } else {
              normalizedPlatforms = [...normalizedPlatforms, baccoOption];
            }
          }
          currentSettings = {
            ...defaultSettings,
            availability: rawData.availability || defaultSettings.availability,
            platforms: normalizedPlatforms,
            blackoutDates: rawData.blackoutDates || defaultSettings.blackoutDates,
            // Mantener tokens vacíos en la memoria pública de navegación
            zoomConfig: { accountId: '', clientId: '', clientSecret: '', enabled: rawData.zoomConfig?.enabled || false },
            telegramConfig: { botToken: '', chatId: '', enabled: rawData.telegramConfig?.enabled || false }
          };
        }
        setSettings(currentSettings);

        // Match platform slug if provided; otherwise select first platform (Interpres Digital)
        if (platformSlug) {
          const lowerSlug = platformSlug.toLowerCase();
          const normalizedSlug =
            lowerSlug === 'consulta-directa' || lowerSlug === 'otra-consulta'
              ? 'check-up-financiero'
              : lowerSlug;
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
      <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#1464B8] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#102B4B]/70 text-sm font-medium animate-pulse">Cargando disponibilidad de agenda...</p>
        </div>
      </div>
    );
  }

  // Pantalla de Confirmación de Cita Exitosa
  if (createdBooking) {
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Videollamada: ${createdBooking.platformName}`)}&dates=${createdBooking.date.replace(/-/g, '')}T${createdBooking.startTime.replace(':', '')}00Z/${createdBooking.date.replace(/-/g, '')}T${createdBooking.endTime.replace(':', '')}00Z&details=${encodeURIComponent(`Enlace de Zoom: ${createdBooking.zoomJoinUrl}\nCliente: ${createdBooking.clientName}`)}&location=${encodeURIComponent(createdBooking.zoomJoinUrl || '')}`;

    return (
      <div className="min-h-screen bg-[#F6F9FC] text-[#102B4B] flex items-center justify-center px-6 py-12 font-sans">
        <div className="max-w-xl w-full bg-white border border-[#C7D5E2] rounded-3xl p-6 sm:p-9 shadow-xl text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#1464B8] via-[#00A9B7] to-[#1464B8]"></div>

          <img
            src={LOGO_COLOR_URL}
            alt="Interpres Digital Labs"
            className="h-12 w-auto mx-auto object-contain"
          />

          <div className="w-16 h-16 bg-[#00A9B7]/10 text-[#00A9B7] border border-[#00A9B7]/30 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3.5 py-1 bg-[#00A9B7]/10 border border-[#00A9B7]/30 rounded-full text-[#00A9B7] text-xs font-bold uppercase tracking-wider">
              ¡Cita Confirmada!
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#102B4B] tracking-tight">
              Tu videollamada ha sido agendada
            </h1>
            <p className="text-[#102B4B]/70 text-sm">
              Hemos generado tu sala de Zoom y enviado la confirmación a nuestro equipo especialista.
            </p>
          </div>

          {/* Details Card */}
          <div className="bg-[#F6F9FC] border border-[#C7D5E2] rounded-2xl p-5 text-left space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#102B4B]/60 font-semibold block">Servicio / Plataforma</span>
                <span className="font-bold text-[#102B4B] text-sm">{createdBooking.platformName}</span>
              </div>
              <div>
                <span className="text-[#102B4B]/60 font-semibold block">Cliente</span>
                <span className="font-bold text-[#102B4B] text-sm">{createdBooking.clientName}</span>
              </div>
              <div>
                <span className="text-[#102B4B]/60 font-semibold block">Fecha</span>
                <span className="font-bold text-[#00A9B7] text-sm">{createdBooking.date}</span>
              </div>
              <div>
                <span className="text-[#102B4B]/60 font-semibold block">Horario</span>
                <span className="font-bold text-[#1464B8] text-sm">{createdBooking.startTime} - {createdBooking.endTime} (CDMX)</span>
              </div>
            </div>

            {createdBooking.zoomJoinUrl && (
              <div className="pt-3 border-t border-[#C7D5E2]">
                <span className="text-[#102B4B]/70 text-xs font-semibold block mb-2">Enlace de la Videollamada (Zoom):</span>
                <a
                  href={createdBooking.zoomJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 bg-[#1464B8]/10 hover:bg-[#1464B8]/15 border border-[#1464B8]/30 text-[#1464B8] p-3 rounded-xl transition-all text-xs font-bold group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Video className="w-4 h-4 text-[#1464B8] flex-shrink-0" />
                    <span className="truncate">{createdBooking.zoomJoinUrl}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#1464B8] group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
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
              className="flex-1 bg-[#F6F9FC] hover:bg-[#E5EFF9] text-[#102B4B] font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-[#C7D5E2] transition-colors"
            >
              <CalendarIcon className="w-4 h-4 text-[#1464B8]" />
              Agregar a Google Calendar
            </a>
            <button
              onClick={() => {
                setCreatedBooking(null);
                setSelectedDate('');
                setSelectedSlot(null);
              }}
              className="bg-[#1464B8] hover:bg-[#10539B] text-white font-bold py-3 px-5 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-md shadow-[#1464B8]/20"
            >
              Agendar Otra Cita
            </button>
          </div>

          <div className="pt-2 border-t border-[#C7D5E2]/70">
            <a
              href={`/#/cancel-booking/${createdBooking.id}`}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold underline"
            >
              ¿Necesitas modificar o cancelar esta reservación? Haz clic aquí
            </a>
          </div>
        </div>
      </div>
    );
  }

  const availableSlots = selectedDate ? generateAvailableSlots(selectedDate) : [];
  const SelectedHeroIcon = getPlatformIcon(selectedPlatform?.slug, selectedPlatform?.name);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E6EFF8] via-[#F2F7FC] to-[#E2F1F5] text-[#102B4B] px-3 py-6 sm:px-6 sm:py-10 lg:py-14 font-sans flex items-center justify-center relative overflow-hidden">
      {/* Ambient Editorial Glows */}
      <div className="pointer-events-none absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-[#1464B8]/12 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[480px] h-[480px] rounded-full bg-[#00A9B7]/14 blur-[110px]" />

      <div className="relative z-10 max-w-[1220px] w-full bg-white border border-[#BFD0E2] rounded-[28px] shadow-[0_30px_80px_-20px_rgba(7,27,54,0.18)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* Left Immersive Executive Column (#071B36 -> #0D2E5C) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#071B36] via-[#0A254A] to-[#0F3466] text-white p-7 sm:p-10 flex flex-col justify-between gap-8 relative overflow-hidden">
          {/* Subtle Decorative Orbs inside Dark Panel */}
          <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#00A9B7]/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-12 -left-20 w-56 h-56 rounded-full bg-[#1464B8]/25 blur-3xl" />

          <div className="relative z-10 space-y-6">
            {/* Official White Logo */}
            <div className="flex items-center justify-between gap-3">
              <img 
                src={LOGO_BLANCO_URL} 
                alt="Interpres Digital Labs" 
                className="h-12 sm:h-14 w-auto max-w-[245px] object-contain"
              />
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#00A9B7]/18 border border-[#00A9B7]/45 rounded-full text-[#7CE8F0] text-[11px] font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#5FD9E4]" />
              <span>Sesión Ejecutiva Online</span>
            </div>

            <div className="space-y-3">
              <h1 className="font-display text-[32px] sm:text-[40px] font-extrabold text-white tracking-tight leading-[1.1]">
                Reserva tu Videollamada
              </h1>
              <p className="text-slate-200/90 text-sm sm:text-[15px] leading-relaxed">
                Elige el área o plataforma de tu interés, selecciona el día y horario que mejor se adapte a tu agenda y recibe tu acceso directo a Zoom al instante.
              </p>
            </div>

            {/* Live Interactive Booking Summary Card */}
            <div className="bg-[#0C274E]/90 backdrop-blur-md border border-white/15 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-lg">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#7CE8F0]">
                  Resumen de tu Selección
                </span>
                <span className="text-[10px] font-semibold text-slate-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                  {selectedSlot ? 'Paso 3 de 3' : selectedDate ? 'Paso 2 de 3' : 'Paso 1 de 3'}
                </span>
              </div>

              {/* Selected Platform */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1464B8] to-[#00A9B7] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <SelectedHeroIcon className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block">
                    Línea o Plataforma
                  </span>
                  <span className="font-display font-bold text-sm text-white block truncate">
                    {selectedPlatform?.name || 'Interpres Digital'}
                  </span>
                  {selectedPlatform?.description && (
                    <span className="text-xs text-slate-300/90 block truncate">
                      {selectedPlatform.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Selected Date */}
              <div className="flex items-start gap-3 pt-2 border-t border-white/10">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  selectedDate ? 'bg-[#00A9B7]/20 border-[#00A9B7]/50 text-[#7CE8F0]' : 'bg-white/5 border-white/10 text-slate-400'
                }`}>
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block">
                    Fecha Elegida
                  </span>
                  <span className={`text-xs sm:text-sm font-bold block ${selectedDate ? 'text-white' : 'text-slate-400 italic font-normal'}`}>
                    {selectedDate ? formatHumanDate(selectedDate) : 'Selecciona un día disponible'}
                  </span>
                </div>
              </div>

              {/* Selected Time */}
              <div className="flex items-start gap-3 pt-2 border-t border-white/10">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  selectedSlot ? 'bg-[#00A9B7]/20 border-[#00A9B7]/50 text-[#7CE8F0]' : 'bg-white/5 border-white/10 text-slate-400'
                }`}>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 block">
                    Horario (Hora Centro México)
                  </span>
                  <span className={`text-xs sm:text-sm font-bold block ${selectedSlot ? 'text-[#7CE8F0]' : 'text-slate-400 italic font-normal'}`}>
                    {selectedSlot ? `${selectedSlot.startTime} – ${selectedSlot.endTime} hrs (CDMX)` : 'Elige un bloque horario'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trust & Format Footer */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 pt-5 border-t border-white/15 text-xs text-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5 text-[#5FD9E4]" />
              </div>
              <span>Duración estimada: <strong className="text-white">{settings.availability.slotDurationMinutes || 45} min</strong></span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Video className="w-3.5 h-3.5 text-[#66B2FF]" />
              </div>
              <span>Sala privada <strong className="text-white">Zoom Video HD</strong></span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-[#5FD9E4]" />
              </div>
              <span>Confirmación inmediata por correo</span>
            </div>
          </div>
        </div>

        {/* Right Interactive Column */}
        <div className="lg:col-span-7 p-5 sm:p-8 md:p-10 bg-white">
          <form onSubmit={handleBookingSubmit} className="space-y-7">
            
            {/* Step 1: Select Platform (Symmetrical 2x3 Executive Cards) */}
            {settings.platforms.length > 1 && !platformSlug && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="font-display text-xs sm:text-[13px] font-extrabold text-[#071B36] uppercase tracking-wider flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#1464B8] text-white text-[11px] font-extrabold inline-flex items-center justify-center shadow-xs">
                      1
                    </span>
                    <span>Selecciona la Plataforma o Motivo</span>
                  </label>
                  <span className="text-[11px] font-semibold text-[#102B4B]/55 hidden sm:inline">
                    {settings.platforms.length} opciones disponibles
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {settings.platforms.map(p => {
                    const isSelected = selectedPlatform?.id === p.id;
                    const PlatformIcon = getPlatformIcon(p.slug, p.name);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlatform(p)}
                        className={`group p-3.5 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between gap-3 ${
                          isSelected 
                            ? 'bg-gradient-to-r from-[#071B36] via-[#0E3568] to-[#1464B8] border-[#1464B8] text-white shadow-lg shadow-[#1464B8]/20 scale-[1.01]' 
                            : 'bg-[#F6F9FC] border-[#C7D5E2] text-[#102B4B] hover:bg-[#EDF4FB] hover:border-[#1464B8]/70'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-white/15 text-[#7CE8F0] border border-white/20'
                              : 'bg-white text-[#1464B8] border border-[#C7D5E2] group-hover:border-[#1464B8]/50 shadow-2xs'
                          }`}>
                            <PlatformIcon className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <span className={`font-display text-[13px] sm:text-sm font-extrabold block truncate ${
                              isSelected ? 'text-white' : 'text-[#071B36]'
                            }`}>
                              {p.name}
                            </span>
                            {p.description && (
                              <span className={`block text-[11px] truncate mt-0.5 ${
                                isSelected ? 'text-slate-200' : 'text-[#102B4B]/65'
                              }`}>
                                {p.description}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-[#00A9B7] border-[#7CE8F0] text-white shadow-xs'
                            : 'border-[#B5C7DA] bg-white group-hover:border-[#1464B8]'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: High-Contrast Monthly Calendar */}
            {(() => {
              const currentMonthData = getDaysForMonthView();

              return (
                <div className="space-y-4 bg-[#F6F9FC] p-4 sm:p-6 rounded-3xl border border-[#C7D5E2]">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <label className="font-display text-xs sm:text-[13px] font-extrabold text-[#071B36] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#1464B8] text-white text-[11px] font-extrabold inline-flex items-center justify-center shadow-xs">
                        2
                      </span>
                      <span>Selecciona una Fecha</span>
                    </label>

                    {/* Month Switcher */}
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-[#B8CCE0] shadow-2xs">
                      <button
                        type="button"
                        disabled={monthOffset <= 0}
                        onClick={() => setMonthOffset(prev => Math.max(0, prev - 1))}
                        className="p-1 rounded-lg text-[#102B4B] hover:bg-[#F0F6FC] hover:text-[#1464B8] disabled:opacity-25 transition-colors"
                        aria-label="Mes anterior"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="font-display text-xs sm:text-[13px] font-extrabold text-[#071B36] min-w-[135px] text-center">
                        {currentMonthData.monthLabel}
                      </span>
                      <button
                        type="button"
                        disabled={monthOffset >= 3}
                        onClick={() => setMonthOffset(prev => Math.min(3, prev + 1))}
                        className="p-1 rounded-lg text-[#102B4B] hover:bg-[#F0F6FC] hover:text-[#1464B8] disabled:opacity-25 transition-colors"
                        aria-label="Mes siguiente"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Calendar White Sheet */}
                  <div className="bg-white rounded-2xl border border-[#C7D5E2] p-3 sm:p-4 shadow-2xs space-y-2.5">
                    {/* Weekday Header */}
                    <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] sm:text-[11px] font-extrabold text-[#102B4B]/70 uppercase tracking-wider pb-2 border-b border-[#E2EBF3]">
                      <div>Lun</div>
                      <div>Mar</div>
                      <div>Mié</div>
                      <div>Jue</div>
                      <div>Vie</div>
                      <div>Sáb</div>
                      <div>Dom</div>
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1.5 pt-1">
                      {currentMonthData.daysList.map((dayItem, idx) => {
                        if (!dayItem) {
                          return <div key={`empty_${idx}`} className="h-10 sm:h-11"></div>;
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
                            className={`h-10 sm:h-11 rounded-xl text-center flex flex-col items-center justify-center transition-all border relative ${
                              isSelected
                                ? 'bg-gradient-to-br from-[#1464B8] to-[#00A9B7] border-[#1464B8] text-white font-extrabold shadow-md shadow-[#1464B8]/30 scale-[1.04] z-10'
                                : dayItem.isAvailable
                                ? 'bg-[#EAF3FC] hover:bg-[#1464B8] border-[#96C0EA] hover:border-[#1464B8] text-[#071B36] hover:text-white font-extrabold shadow-2xs cursor-pointer'
                                : 'bg-[#F8FAFC] border-transparent text-[#94A8BE] cursor-not-allowed font-medium'
                            }`}
                          >
                            <span className="text-xs sm:text-[13px] leading-none">{dayItem.dayNum}</span>
                            {dayItem.isAvailable && !isSelected && (
                              <span className={`w-1.5 h-1.5 rounded-full mt-1 ${dayItem.isToday ? 'bg-[#00A9B7]' : 'bg-[#1464B8]/60'}`}></span>
                            )}
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white mt-1"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Visual Legend */}
                    <div className="flex flex-wrap items-center justify-end gap-4 pt-2 border-t border-[#EDF2F7] text-[11px] font-semibold text-[#102B4B]/70">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#EAF3FC] border border-[#96C0EA] inline-block" />
                        Disponible
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-gradient-to-br from-[#1464B8] to-[#00A9B7] inline-block" />
                        Seleccionado
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#F8FAFC] border border-[#E2EBF3] inline-block" />
                        No disponible
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Step 3: Select Timezone & Time Slot */}
            {selectedDate && (
              <div className="space-y-4 pt-2 border-t border-[#C7D5E2]/80 animate-fade-in">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <label className="font-display text-xs sm:text-[13px] font-extrabold text-[#071B36] uppercase tracking-wider flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#00A9B7] text-white text-[11px] font-extrabold inline-flex items-center justify-center shadow-xs">
                      3
                    </span>
                    <span>Elige un Horario Disponible</span>
                  </label>
                  <span className="px-2.5 py-1 rounded-full bg-[#EAF3FC] text-[#1464B8] text-[11px] font-extrabold">
                    {availableSlots.length} bloques libres
                  </span>
                </div>

                <div className="space-y-1.5 bg-[#F6F9FC] p-3.5 rounded-2xl border border-[#C7D5E2]">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-[#102B4B] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#1464B8]" />
                      <span>Tu Zona Horaria de Referencia:</span>
                    </label>
                    <span className="text-[11px] font-bold text-[#008995]">Horarios en Hora Centro México</span>
                  </div>
                  <select
                    value={clientTimezone}
                    onChange={e => setClientTimezone(e.target.value)}
                    className="w-full bg-white border border-[#C7D5E2] text-[#102B4B] text-xs rounded-xl p-2.5 font-semibold outline-none focus:border-[#1464B8]"
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz.zone} value={tz.zone}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                {availableSlots.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-800 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>No quedan horarios libres en esta fecha. Por favor selecciona otro día resaltado en azul en el calendario.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {availableSlots.map((slot, idx) => {
                      const active = selectedSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-3.5 rounded-2xl border text-center transition-all ${
                            active
                              ? 'bg-gradient-to-r from-[#071B36] to-[#1464B8] border-[#1464B8] text-white shadow-lg shadow-[#1464B8]/25 scale-[1.02]' 
                              : 'bg-[#F6F9FC] border-[#C7D5E2] text-[#071B36] hover:bg-[#EAF3FC] hover:border-[#1464B8]'
                          }`}
                        >
                          <div className="text-sm font-extrabold">{slot.startTime} – {slot.endTime}</div>
                          <div className={`text-[10px] mt-0.5 font-semibold ${active ? 'text-[#7CE8F0]' : 'text-[#102B4B]/60'}`}>
                            Hora CDMX
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Client Info Form */}
            {selectedSlot && (
              <div className="space-y-4 pt-4 border-t border-[#C7D5E2]/80 animate-fade-in bg-[#F6F9FC] p-4 sm:p-6 rounded-3xl border">
                <h3 className="font-display text-xs sm:text-[13px] font-extrabold text-[#071B36] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#00A9B7] text-white text-[11px] font-extrabold inline-flex items-center justify-center shadow-xs">
                    4
                  </span>
                  <span>Tus Datos para Enviar el Acceso Zoom</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#102B4B]">Nombre Completo *</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full bg-white border border-[#C7D5E2] rounded-xl pl-10 pr-3 py-2.5 text-xs text-[#102B4B] placeholder:text-[#102B4B]/40 outline-none focus:border-[#1464B8]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#102B4B]">Correo Electrónico *</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={clientEmail}
                        onChange={e => setClientEmail(e.target.value)}
                        placeholder="juan@empresa.com"
                        className="w-full bg-white border border-[#C7D5E2] rounded-xl pl-10 pr-3 py-2.5 text-xs text-[#102B4B] placeholder:text-[#102B4B]/40 outline-none focus:border-[#1464B8]"
                      />
                    </div>
                  </div>
                </div>

                {/* WhatsApp con Selector de Clave LADA Internacional */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-[#102B4B]">WhatsApp / Teléfono de Contacto *</label>
                    <span className="text-[10px] text-[#008995] font-bold">Clave LADA Internacional</span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={selectedCountryCode}
                      onChange={e => setSelectedCountryCode(e.target.value)}
                      className="bg-white border border-[#C7D5E2] rounded-xl px-3 py-2.5 text-xs text-[#102B4B] outline-none focus:border-[#1464B8] font-semibold"
                    >
                      {COUNTRY_CODES.map((c, i) => (
                        <option key={i} value={c.code}>
                          {c.flag} {c.code} ({c.country})
                        </option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                      <input
                        type="tel"
                        required
                        value={clientPhone}
                        onChange={e => setClientPhone(e.target.value)}
                        placeholder="415 123 4567"
                        className="w-full bg-white border border-[#C7D5E2] rounded-xl pl-10 pr-3 py-2.5 text-xs text-[#102B4B] placeholder:text-[#102B4B]/40 outline-none focus:border-[#1464B8] font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#102B4B]">Tema o Motivo de la Reunión (Opcional)</label>
                  <div className="relative">
                    <MessageSquare className="w-4 h-4 text-[#102B4B]/45 absolute left-3.5 top-3" />
                    <textarea
                      rows={2}
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="Cuéntanos brevemente el objetivo de tu proyecto o consulta..."
                      className="w-full bg-white border border-[#C7D5E2] rounded-xl pl-10 pr-3 py-2.5 text-xs text-[#102B4B] placeholder:text-[#102B4B]/40 outline-none focus:border-[#1464B8] resize-none"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-[#071B36] via-[#1464B8] to-[#00A9B7] hover:from-[#0A254A] hover:to-[#008C99] disabled:opacity-50 text-white font-extrabold py-4 px-6 rounded-2xl transition-all shadow-lg shadow-[#1464B8]/25 flex items-center justify-center gap-2 text-xs sm:text-sm uppercase tracking-wider cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Generando Sala de Zoom y Confirmando...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar y Reservar Videollamada</span>
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
