import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Client, ClientStatus } from '../types';
import { 
  Sparkles, ClipboardList, User, Mail, Phone, Globe, FileText, CheckCircle2, 
  MapPin, Clock, Calendar, Share2, Plus, Trash2, HelpCircle, ArrowRight, ArrowLeft, Loader2
} from 'lucide-react';
import clsx from 'clsx';

// Initial state for the briefing
const INITIAL_ANSWERS = {
  // Step 1: Contact
  clientName: '',
  businessName: '',
  email: '',
  whatsapp: '',
  hasWebsite: 'No',
  websiteUrl: '',

  // Step 2: Invoice
  requiresInvoice: 'No',
  taxName: '',
  taxRfc: '',
  taxRegime: '',
  taxPostalCode: '',
  taxCfdiUse: 'G03 - Gastos en general',
  taxEmail: '',

  // Step 3: Profile
  establishmentType: 'Spa',
  customEstablishmentType: '',
  description: '',
  operatingTime: 'Próxima apertura',
  targetAudience: [] as string[],
  idealClient: '',
  brandPerception: [] as string[],
  aiAvatarName: '',

  // Step 4: Visuals
  hasBrandManual: 'No',
  colorPrimary: '#6366f1',
  colorSecondary: '#10b981',
  colorComplementary: '#f59e0b',
  colorPrimaryHex: '#6366f1',
  colorSecondaryHex: '#10b981',
  colorComplementaryHex: '#f59e0b',
  colorsAvoid: '',
  visualStyle: [] as string[],
  visualReferences: '',

  // Step 5: Hours & Socials
  streetNum: '',
  colonia: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'México',
  mapsLink: '',
  socialInstagram: '',
  socialFacebook: '',
  socialTiktok: '',
  socialYoutube: '',
  socialOther: '',
  publicData: ['WhatsApp', 'Dirección', 'Horarios'] as string[],
  bookingWhatsapp: '',
  publicEmail: '',
  weeklyHours: {
    Lunes: { type: 'hours', from: '09:00', to: '19:00' },
    Martes: { type: 'hours', from: '09:00', to: '19:00' },
    Miércoles: { type: 'hours', from: '09:00', to: '19:00' },
    Jueves: { type: 'hours', from: '09:00', to: '19:00' },
    Viernes: { type: 'hours', from: '09:00', to: '19:00' },
    Sábado: { type: 'hours', from: '09:00', to: '15:00' },
    Domingo: { type: 'closed', from: '', to: '' }
  } as Record<string, { type: 'hours' | 'closed' | 'appointment'; from: string; to: string }>,
  hasMultipleBranches: 'No' as 'Sí' | 'No',
  primaryBranchName: '',
  branches: [] as Array<{
    id: string;
    branchName: string;
    streetNum: string;
    colonia: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    mapsLink: string;
    bookingWhatsapp: string;
    publicEmail: string;
    socialInstagram: string;
    socialFacebook: string;
    socialTiktok: string;
    weeklyHours: Record<string, { type: 'hours' | 'closed' | 'appointment'; from: string; to: string }>;
  }>
};

const ESTABLISHMENT_TYPES = [
  'Estética / Belleza', 'Salón de belleza', 'Salud / Médica', 'Educación / Academias',
  'Restaurantes / Alimentos', 'Bienes Raíces / Real Estate', 'Servicios Profesionales',
  'E-commerce / Comercio Electrónico', 'Gimnasios / Fitness', 'Tecnología / Software', 'Otro'
];

const OPERATING_TIMES = [
  'Próxima apertura', 'Menos de 1 año', 'De 1 a 3 años', 'De 4 a 7 años', 'Más de 7 años'
];

const TARGET_AUDIENCE_OPTIONS = [
  'Mujeres', 'Hombres', 'Público mixto', 'Adolescentes', 
  'Adultos jóvenes', 'Adultos', 'Público premium', 'Público corporativo', 'Novias y eventos', 'Otro'
];

const PERCEPTION_VALUES = [
  'Confianza', 'Profesionalismo', 'Exclusividad', 'Bienestar', 'Relajación', 
  'Elegancia', 'Cercanía', 'Innovación', 'Belleza', 'Naturalidad', 'Lujo', 
  'Calidez', 'Modernidad', 'Resultados', 'Otro'
];

const VISUAL_STYLES = [
  'Elegante', 'Minimalista', 'Moderno', 'Natural', 'Orgánico', 'Femenino', 
  'Sofisticado', 'Clínico', 'Premium', 'Cálido', 'Juvenil', 'Colorido', 
  'Espiritual', 'Tecnológico', 'Otro'
];

const TAX_REGIMES = [
  '601 - General de Ley Personas Morales',
  '603 - Personas Morales con Fines no Lucrativos',
  '605 - Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606 - Arrendamiento',
  '612 - Personas Físicas con Actividades Empresariales y Profesionales',
  '621 - Incorporación Fiscal',
  '625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626 - Régimen Simplificado de Confianza (RESICO)'
];

const CFDI_USES = [
  'G01 - Adquisición de mercancías',
  'G02 - Devoluciones, descuentos o bonificaciones',
  'G03 - Gastos en general',
  'I01 - Construcciones',
  'I02 - Mobiliario y equipo de oficina por inversiones',
  'D01 - Honorarios médicos, dentales y gastos hospitalarios',
  'D02 - Gastos médicos por incapacidad o discapacidad',
  'D03 - Gastos funerales',
  'D04 - Donativos',
  'D10 - Pagos por servicios educativos (colegiaturas)'
];

const PUBLIC_DATA_OPTIONS = [
  'Teléfono', 'WhatsApp', 'Correo electrónico', 'Dirección', 'Horarios', 'Redes sociales', 'Ubicación en Google Maps'
];

const PublicGeneralBriefing: React.FC = () => {
  const { clientId } = useParams<{ clientId?: string }>();
  const [searchParams] = useSearchParams();
  const linkedId = clientId || searchParams.get('id');

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState(INITIAL_ANSWERS);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Prefill details if linked client is provided
  useEffect(() => {
    if (!linkedId) return;

    const fetchClient = async () => {
      setLoading(true);
      try {
        const docSnap = await getDoc(doc(db, 'clients', linkedId));
        if (docSnap.exists()) {
          const clientData = docSnap.data() as Client;
          setAnswers(prev => ({
            ...prev,
            clientName: clientData.name || '',
            businessName: clientData.companyName || '',
            email: clientData.email || '',
            whatsapp: clientData.whatsapp || clientData.phone || '',
            websiteUrl: clientData.website || '',
            hasWebsite: clientData.website ? 'Sí' : 'No',
            taxRfc: clientData.rfc || '',
            requiresInvoice: clientData.rfc ? 'Sí' : 'No'
          }));
        }
      } catch (err) {
        console.error("Error cargando cliente vinculado:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [linkedId]);

  const handleInputChange = (field: string, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCheckboxToggle = (field: 'targetAudience' | 'brandPerception' | 'visualStyle' | 'publicData', option: string, maxSelection?: number) => {
    setAnswers(prev => {
      const currentList = prev[field] as string[];
      if (currentList.includes(option)) {
        return { ...prev, [field]: currentList.filter(item => item !== option) };
      } else {
        if (maxSelection && currentList.length >= maxSelection) {
          alert(`Puedes seleccionar un máximo de ${maxSelection} opciones.`);
          return prev;
        }
        return { ...prev, [field]: [...currentList, option] };
      }
    });
  };

  const handleHourChange = (day: string, field: 'type' | 'from' | 'to', value: string) => {
    setAnswers(prev => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          [field]: value
        }
      }
    }));
  };

  const DEFAULT_BRANCH_HOURS = {
    Lunes: { type: 'hours' as const, from: '09:00', to: '19:00' },
    Martes: { type: 'hours' as const, from: '09:00', to: '19:00' },
    Miércoles: { type: 'hours' as const, from: '09:00', to: '19:00' },
    Jueves: { type: 'hours' as const, from: '09:00', to: '19:00' },
    Viernes: { type: 'hours' as const, from: '09:00', to: '19:00' },
    Sábado: { type: 'hours' as const, from: '09:00', to: '15:00' },
    Domingo: { type: 'closed' as const, from: '', to: '' }
  };

  const handleAddBranch = () => {
    const newBranch = {
      id: Math.random().toString(36).substring(2, 9),
      branchName: '',
      streetNum: '',
      colonia: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'México',
      mapsLink: '',
      bookingWhatsapp: '',
      publicEmail: '',
      socialInstagram: '',
      socialFacebook: '',
      socialTiktok: '',
      weeklyHours: JSON.parse(JSON.stringify(DEFAULT_BRANCH_HOURS))
    };
    setAnswers(prev => ({
      ...prev,
      branches: [...prev.branches, newBranch]
    }));
  };

  const handleRemoveBranch = (id: string) => {
    setAnswers(prev => ({
      ...prev,
      branches: prev.branches.filter(b => b.id !== id)
    }));
  };

  const handleBranchInputChange = (id: string, field: string, value: any) => {
    setAnswers(prev => ({
      ...prev,
      branches: prev.branches.map(b => b.id === id ? { ...b, [field]: value } : b)
    }));
  };

  const handleBranchHourChange = (id: string, day: string, field: 'type' | 'from' | 'to', value: string) => {
    setAnswers(prev => ({
      ...prev,
      branches: prev.branches.map(b => {
        if (b.id !== id) return b;
        return {
          ...b,
          weeklyHours: {
            ...b.weeklyHours,
            [day]: {
              ...b.weeklyHours[day],
              [field]: value
            }
          }
        };
      })
    }));
  };

  const handleNext = () => {
    // Basic validation per step
    if (step === 1) {
      if (!answers.clientName.trim() || !answers.businessName.trim() || !answers.email.trim() || !answers.whatsapp.trim()) {
        alert("Por favor completa todos los campos requeridos del Paso 1.");
        return;
      }
    }
    if (step === 2 && answers.requiresInvoice === 'Sí') {
      if (!answers.taxName.trim() || !answers.taxRfc.trim() || !answers.taxPostalCode.trim() || !answers.taxEmail.trim()) {
        alert("Por favor completa los datos de facturación obligatorios.");
        return;
      }
    }
    if (step === 3) {
      if (answers.establishmentType === 'Otro' && !answers.customEstablishmentType.trim()) {
        alert("Por favor especifica el tipo de establecimiento.");
        return;
      }
      if (!answers.description.trim()) {
        alert("Por favor describe brevemente tu establecimiento.");
        return;
      }
    }
    if (step === 5) {
      if (!answers.streetNum.trim() || !answers.colonia.trim() || !answers.city.trim() || !answers.state.trim() || !answers.postalCode.trim()) {
        alert("Por favor escribe la dirección de la sucursal principal.");
        return;
      }
      if (!answers.bookingWhatsapp.trim()) {
        alert("Por favor ingresa un WhatsApp para reservaciones de la sucursal principal.");
        return;
      }
      if (answers.hasMultipleBranches === 'Sí') {
        if (!answers.primaryBranchName.trim()) {
          alert("Por favor escribe el nombre de la sucursal principal.");
          return;
        }
        for (let i = 0; i < answers.branches.length; i++) {
          const b = answers.branches[i];
          if (!b.branchName.trim()) {
            alert(`Por favor escribe el nombre para la Sucursal #${i + 2}.`);
            return;
          }
          if (!b.streetNum.trim() || !b.colonia.trim() || !b.city.trim() || !b.state.trim() || !b.postalCode.trim()) {
            alert(`Por favor escribe la dirección completa para la sucursal "${b.branchName}".`);
            return;
          }
          if (!b.bookingWhatsapp.trim()) {
            alert(`Por favor ingresa el WhatsApp de reservaciones para la sucursal "${b.branchName}".`);
            return;
          }
        }
      }
    }

    setStep(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let finalClientId = linkedId;

      // 1. Create or update Client profile in 'clients' collection
      const clientPayload = {
        name: answers.clientName.trim(),
        companyName: answers.businessName.trim(),
        email: answers.email.trim().toLowerCase(),
        phone: answers.whatsapp.trim(),
        whatsapp: answers.whatsapp.trim(),
        website: answers.hasWebsite === 'Sí' ? answers.websiteUrl.trim() : '',
        rfc: answers.requiresInvoice === 'Sí' ? answers.taxRfc.trim().toUpperCase() : '',
        businessName: answers.requiresInvoice === 'Sí' ? answers.taxName.trim() : '',
        address: `${answers.streetNum}, Col. ${answers.colonia}, ${answers.city}, ${answers.state}, CP ${answers.postalCode}, ${answers.country}`,
        status: ClientStatus.Active, // Si completa el briefing, se establece como Activo
        responsiblePerson: 'Soporte Lumina',
        contactMethod: 'WhatsApp' as const,
        contractStartDate: new Date().toISOString().split('T')[0],
        serviceType: 'Sitio Web / Plataforma General',
        briefingType: 'general',
        aiAvatarName: answers.aiAvatarName.trim(),
        hasMultipleBranches: answers.hasMultipleBranches,
        primaryBranchName: answers.primaryBranchName.trim(),
        branches: answers.branches
      };

      if (finalClientId) {
        // Update existing client
        await setDoc(doc(db, 'clients', finalClientId), clientPayload, { merge: true });
      } else {
        // Create new client doc (use a generated id or auto)
        const clientsRef = collection(db, 'clients');
        const docRef = await addDoc(clientsRef, clientPayload);
        finalClientId = docRef.id;
        // Merge ID back
        await setDoc(doc(db, 'clients', finalClientId), { id: finalClientId }, { merge: true });
      }

      // 2. Save complete Briefing answers in 'briefings' collection
      const briefingPayload = {
        clientId: finalClientId,
        clientName: answers.clientName,
        businessName: answers.businessName,
        email: answers.email,
        whatsapp: answers.whatsapp,
        briefingType: 'general',
        answers: {
          ...answers,
          establishmentType: answers.establishmentType === 'Otro' ? answers.customEstablishmentType : answers.establishmentType
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'briefings'), briefingPayload);

      // 3. Optional Telegram Notification
      // We will look up if telegram notifications are configured in booking_settings
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "booking_settings"));
        if (settingsSnap.exists()) {
          const rawData = settingsSnap.data();
          const tg = rawData.telegramConfig;
          if (tg?.enabled && tg.botToken && tg.chatId) {
            const text = `🌸 *Nuevo Briefing General de Desarrollo*\n\n*Cliente:* ${answers.clientName}\n*Negocio:* ${answers.businessName}\n*Establecimiento:* ${answers.establishmentType === 'Otro' ? answers.customEstablishmentType : answers.establishmentType}\n*WhatsApp:* ${answers.whatsapp}\n\nDetalles del briefing disponibles en el panel administrativo.`;
            await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tg.chatId,
                text,
                parse_mode: 'Markdown'
              })
            });
          }
        }
      } catch (tgErr) {
        console.error("Error sending Telegram briefing alert:", tgErr);
      }

      setSuccess(true);
    } catch (err) {
      console.error("Error al enviar briefing:", err);
      alert("Ocurrió un error al enviar el formulario. Por favor inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-dark-bg text-gray-500">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="font-semibold text-sm">Cargando perfil de cliente...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6 text-white text-center">
        <div className="max-w-md w-full bg-slate-900/60 backdrop-blur-md rounded-3xl p-8 border border-indigo-500/20 shadow-2xl space-y-6 animate-scale-up">
          <div className="mb-2">
            <img 
              src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png" 
              alt="Lúmina Core Logo" 
              className="h-10 mx-auto object-contain"
            />
          </div>
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase tracking-wider">¡Briefing Guardado!</h2>
            <p className="text-sm text-slate-300">
              Muchas gracias por completar la información. Hemos registrado tu establecimiento y tus preferencias visuales para personalizar tu sitio web o plataforma digital.
            </p>
          </div>
          <p className="text-xs text-slate-400">Nuestro equipo de diseño y desarrollo comenzará a trabajar con tus colores y estilos visuales.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 text-white pb-20">
      {/* Header Banner */}
      <div className="max-w-3xl mx-auto pt-12 px-6">
        <div className="text-center space-y-3">
          <div className="mb-2">
            <img 
              src="https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png" 
              alt="Lúmina Core Logo" 
              className="h-14 mx-auto object-contain hover:scale-105 transition-transform duration-300"
            />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-white">
            Briefing General de Desarrollo
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Configura y personaliza la identidad de tu marca para tu nueva página web o plataforma digital a la medida.
          </p>
        </div>

        {/* Step progress bar */}
        <div className="mt-8 bg-slate-950/60 backdrop-blur-md border border-indigo-500/30 p-5 rounded-2xl flex items-center justify-between gap-2 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
          {[1, 2, 3, 4, 5].map((num) => (
            <React.Fragment key={num}>
              <div className="flex items-center">
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border transition-all duration-300",
                  step >= num 
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/35" 
                    : "bg-slate-950/40 border-slate-800 text-slate-500"
                )}>
                  {num}
                </div>
              </div>
              {num < 5 && <div className={clsx("flex-1 h-0.5 rounded-full transition-all duration-300", step > num ? "bg-indigo-600" : "bg-slate-800")} />}
            </React.Fragment>
          ))}
        </div>

        {/* Active step title label */}
        <div className="mt-4 text-center text-xs font-black uppercase tracking-widest text-indigo-400">
          Paso {step} de 5: {
            step === 1 ? "Información de Contacto" :
            step === 2 ? "Datos de Facturación" :
            step === 3 ? "Perfil del Establecimiento" :
            step === 4 ? "Identidad de Marca y Estilos" :
            "Ubicación, Horarios y Redes"
          }
        </div>

        {/* Form panel */}
        <div className="mt-6 bg-slate-950/75 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-indigo-500/40 shadow-[0_0_40px_rgba(99,102,241,0.25)] space-y-8">
          
          {/* STEP 1: CONTACT INFO */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide text-indigo-300">
                  <User className="w-5 h-5" />
                  Paso 1: Información de Contacto
                </h3>
                <p className="text-xxs text-slate-400 mt-1">Ingresa tus datos personales y comerciales para iniciar tu registro.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Nombre de la persona</label>
                  <input
                    required
                    type="text"
                    value={answers.clientName}
                    onChange={e => handleInputChange('clientName', e.target.value)}
                    placeholder="Escribe tu nombre completo"
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Nombre del negocio / Establecimiento</label>
                  <input
                    required
                    type="text"
                    value={answers.businessName}
                    onChange={e => handleInputChange('businessName', e.target.value)}
                    placeholder="Ej. Spa Armonía y Bienestar"
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Correo electrónico</label>
                    <input
                      required
                      type="email"
                      value={answers.email}
                      onChange={e => handleInputChange('email', e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">WhatsApp de contacto</label>
                    <input
                      required
                      type="tel"
                      value={answers.whatsapp}
                      onChange={e => handleInputChange('whatsapp', e.target.value)}
                      placeholder="10 dígitos con código del país (ej. +52 5512345678)"
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800/40">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Tu marca cuenta con sitio web actualmente?</label>
                  <div className="flex gap-4">
                    {['Sí', 'No'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleInputChange('hasWebsite', opt)}
                        className={clsx(
                          "px-6 py-2.5 rounded-xl border text-xs font-bold transition-all",
                          answers.hasWebsite === opt 
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {answers.hasWebsite === 'Sí' && (
                  <div className="space-y-2 animate-fade-in">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">URL del sitio web</label>
                    <input
                      type="url"
                      value={answers.websiteUrl}
                      onChange={e => handleInputChange('websiteUrl', e.target.value)}
                      placeholder="https://ejemplo.com"
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-600/20"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: INVOICE INFO */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide text-indigo-300">
                  <FileText className="w-5 h-5" />
                  Paso 2: Datos de Facturación
                </h3>
                <p className="text-xxs text-slate-400 mt-1">Especifique si requiere facturación fiscal para la personalización de la plataforma.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Requiere Factura?</label>
                  <div className="flex gap-4">
                    {['Sí', 'No'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleInputChange('requiresInvoice', opt)}
                        className={clsx(
                          "px-6 py-2.5 rounded-xl border text-xs font-bold transition-all",
                          answers.requiresInvoice === opt 
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {answers.requiresInvoice === 'Sí' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Razón Social</label>
                        <input
                          required
                          type="text"
                          value={answers.taxName}
                          onChange={e => handleInputChange('taxName', e.target.value)}
                          placeholder="Nombre comercial o razón social exacta"
                          className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">RFC</label>
                        <input
                          required
                          type="text"
                          value={answers.taxRfc}
                          onChange={e => handleInputChange('taxRfc', e.target.value.toUpperCase())}
                          placeholder="RFC de 12 o 13 dígitos sin espacios"
                          className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Régimen Fiscal</label>
                      <select
                        value={answers.taxRegime}
                        onChange={e => handleInputChange('taxRegime', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                      >
                        <option value="">Selecciona tu régimen fiscal...</option>
                        {TAX_REGIMES.map(reg => (
                          <option key={reg} value={reg}>{reg}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Código Postal Fiscal</label>
                        <input
                          required
                          type="text"
                          value={answers.taxPostalCode}
                          onChange={e => handleInputChange('taxPostalCode', e.target.value)}
                          placeholder="Código postal de tu domicilio fiscal"
                          className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Uso de CFDI</label>
                        <select
                          value={answers.taxCfdiUse}
                          onChange={e => handleInputChange('taxCfdiUse', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                        >
                          {CFDI_USES.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Correo para envío de factura</label>
                      <input
                        required
                        type="email"
                        value={answers.taxEmail}
                        onChange={e => handleInputChange('taxEmail', e.target.value)}
                        placeholder="facturas@tuempresa.com"
                        className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 py-3 bg-slate-950/20 border border-slate-800 text-slate-400 hover:bg-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Atrás</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PROFILE & ESTABLISHMENT DETAILS */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide text-indigo-300">
                  <ClipboardList className="w-5 h-5" />
                  Paso 3: Información General del Negocio
                </h3>
                <p className="text-xxs text-slate-400 mt-1">Cuéntanos sobre tu negocio, servicios y el público al que te diriges.</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Giro / Industria del negocio</label>
                    <select
                      value={answers.establishmentType}
                      onChange={e => handleInputChange('establishmentType', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                    >
                      {ESTABLISHMENT_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Tiempo operando</label>
                    <select
                      value={answers.operatingTime}
                      onChange={e => handleInputChange('operatingTime', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                    >
                      {OPERATING_TIMES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {answers.establishmentType === 'Otro' && (
                  <div className="space-y-2 animate-fade-in">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Especifica tu giro o industria</label>
                    <input
                      required
                      type="text"
                      value={answers.customEstablishmentType}
                      onChange={e => handleInputChange('customEstablishmentType', e.target.value)}
                      placeholder="Ej. Clínica capilar, Spa holístico"
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Describe brevemente tu negocio o proyecto</label>
                    <span className="text-[10px] text-slate-500">{answers.description.length}/500</span>
                  </div>
                  <textarea
                    required
                    rows={4}
                    maxLength={500}
                    value={answers.description}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder="Cuéntanos qué tipo de experiencia ofreces, cuál es tu especialidad y qué hace diferente a tu negocio..."
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold resize-none"
                  />
                  <p className="text-[10px] text-slate-500">Cuéntanos qué tipo de experiencia ofreces y qué te diferencia.</p>
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿A qué tipo de clientes atiendes principalmente? (Selección múltiple)</label>
                  <div className="flex flex-wrap gap-2">
                    {TARGET_AUDIENCE_OPTIONS.map(opt => {
                      const selected = answers.targetAudience.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleCheckboxToggle('targetAudience', opt)}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all",
                            selected 
                              ? "bg-indigo-600/80 border-indigo-500 text-white"
                              : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Describe brevemente a tu cliente ideal</label>
                    <span className="text-[10px] text-slate-500">{answers.idealClient.length}/300</span>
                  </div>
                  <textarea
                    required
                    rows={3}
                    maxLength={300}
                    value={answers.idealClient}
                    onChange={e => handleInputChange('idealClient', e.target.value)}
                    placeholder="Por ejemplo: mujeres de 25 a 50 años interesadas en cuidado personal, bienestar y experiencias premium..."
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold resize-none"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Qué quieres que una persona perciba al conocer tu marca? (Máximo 5)</label>
                  <div className="flex flex-wrap gap-2">
                    {PERCEPTION_VALUES.map(opt => {
                      const selected = answers.brandPerception.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleCheckboxToggle('brandPerception', opt, 5)}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all",
                            selected 
                              ? "bg-indigo-600/80 border-indigo-500 text-white shadow-lg"
                              : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* AI Avatar Name */}
                <div className="space-y-2 pt-4 border-t border-slate-800/40">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Nombre del Avatar de Inteligencia Artificial (Opcional)</label>
                  <input
                    type="text"
                    value={answers.aiAvatarName}
                    onChange={e => handleInputChange('aiAvatarName', e.target.value)}
                    placeholder="Ej. Valentina, Sofía, Kiara..."
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                  />
                  <p className="text-[10px] text-slate-500">Este nombre será asignado al avatar interactivo de IA de tu negocio.</p>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 py-3 bg-slate-950/20 border border-slate-800 text-slate-400 hover:bg-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Atrás</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: VISUALS & IDENTITY */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide text-indigo-300">
                  <Sparkles className="w-5 h-5" />
                  Paso 4: Identidad de Marca y Estilos
                </h3>
                <p className="text-xxs text-slate-400 mt-1">Configura las directrices gráficas, paleta de colores y referencias estéticas.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Tu marca cuenta con manual de identidad?</label>
                  <div className="flex gap-4">
                    {['Sí', 'No'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleInputChange('hasBrandManual', opt)}
                        className={clsx(
                          "px-6 py-2.5 rounded-xl border text-xs font-bold transition-all",
                          answers.hasBrandManual === opt 
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-800/40">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Cuáles son los colores principales de tu marca?</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Primary color */}
                    <div className="space-y-2 p-4 bg-slate-950/30 rounded-2xl border border-slate-800">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block text-slate-400">Color Principal</span>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={answers.colorPrimary}
                          onChange={e => {
                            handleInputChange('colorPrimary', e.target.value);
                            handleInputChange('colorPrimaryHex', e.target.value);
                          }}
                          className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-slate-800"
                        />
                        <input
                          type="text"
                          value={answers.colorPrimaryHex}
                          onChange={e => {
                            handleInputChange('colorPrimaryHex', e.target.value);
                            if (e.target.value.match(/^#[0-9A-F]{6}$/i)) {
                              handleInputChange('colorPrimary', e.target.value);
                            }
                          }}
                          placeholder="#FFFFFF"
                          className="w-24 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-center font-bold text-xxs"
                        />
                      </div>
                    </div>

                    {/* Secondary color */}
                    <div className="space-y-2 p-4 bg-slate-950/30 rounded-2xl border border-slate-800">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block text-slate-400">Color Secundario</span>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={answers.colorSecondary}
                          onChange={e => {
                            handleInputChange('colorSecondary', e.target.value);
                            handleInputChange('colorSecondaryHex', e.target.value);
                          }}
                          className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-slate-800"
                        />
                        <input
                          type="text"
                          value={answers.colorSecondaryHex}
                          onChange={e => {
                            handleInputChange('colorSecondaryHex', e.target.value);
                            if (e.target.value.match(/^#[0-9A-F]{6}$/i)) {
                              handleInputChange('colorSecondary', e.target.value);
                            }
                          }}
                          placeholder="#FFFFFF"
                          className="w-24 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-center font-bold text-xxs"
                        />
                      </div>
                    </div>

                    {/* Complementary color */}
                    <div className="space-y-2 p-4 bg-slate-950/30 rounded-2xl border border-slate-800">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block text-slate-400">Color Complementario</span>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={answers.colorComplementary}
                          onChange={e => {
                            handleInputChange('colorComplementary', e.target.value);
                            handleInputChange('colorComplementaryHex', e.target.value);
                          }}
                          className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-slate-800"
                        />
                        <input
                          type="text"
                          value={answers.colorComplementaryHex}
                          onChange={e => {
                            handleInputChange('colorComplementaryHex', e.target.value);
                            if (e.target.value.match(/^#[0-9A-F]{6}$/i)) {
                              handleInputChange('colorComplementary', e.target.value);
                            }
                          }}
                          placeholder="#FFFFFF"
                          className="w-24 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-center font-bold text-xxs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Hay algún color que NO quieras que utilicemos?</label>
                  <input
                    type="text"
                    value={answers.colorsAvoid}
                    onChange={e => handleInputChange('colorsAvoid', e.target.value)}
                    placeholder="Ej. Amarillo chillón, rosa fosforescente..."
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Cómo describirías el estilo visual de tu marca? (Máximo 3)</label>
                  <div className="flex flex-wrap gap-2">
                    {VISUAL_STYLES.map(opt => {
                      const selected = answers.visualStyle.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleCheckboxToggle('visualStyle', opt, 3)}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all",
                            selected 
                              ? "bg-indigo-600/80 border-indigo-500 text-white shadow-lg"
                              : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Comparte referencias visuales del estilo que buscas</label>
                  <textarea
                    rows={4}
                    value={answers.visualReferences}
                    onChange={e => handleInputChange('visualReferences', e.target.value)}
                    placeholder="Puedes incluir enlaces a perfiles de Instagram, sitios web que te gusten, o ideas gráficas..."
                    className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold resize-none"
                  />
                  <p className="text-[10px] text-slate-500">Puedes incluir enlaces de páginas web, perfiles de Instagram, fotografías o marcas que te gusten.</p>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 py-3 bg-slate-950/20 border border-slate-800 text-slate-400 hover:bg-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Atrás</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: DIGITAL PRESENCE & HOURS */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide text-indigo-300">
                  <MapPin className="w-5 h-5" />
                  Paso 5: Dirección, Horarios y Redes
                </h3>
                <p className="text-xxs text-slate-400 mt-1">Completa la información de contacto físico, redes digitales y horarios de servicio.</p>
              </div>

              <div className="space-y-6">
                
                {/* Multiple Branches Toggle */}
                <div className="space-y-3 p-4 bg-slate-950/20 border border-slate-800 rounded-2xl">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">¿Tu negocio cuenta con múltiples sucursales?</label>
                  <div className="flex gap-4">
                    {['Sí', 'No'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleInputChange('hasMultipleBranches', opt)}
                        className={clsx(
                          "px-6 py-2.5 rounded-xl border text-xs font-bold transition-all",
                          answers.hasMultipleBranches === opt 
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Si tienes más de un establecimiento, podrás capturar la dirección, horarios y datos de contacto independientes de cada uno.
                  </p>
                </div>

                {answers.hasMultipleBranches === 'Sí' && (
                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Nombre de la sucursal principal</label>
                    <input
                      required
                      type="text"
                      value={answers.primaryBranchName}
                      onChange={e => handleInputChange('primaryBranchName', e.target.value)}
                      placeholder="Ej. Matriz Centro, Sucursal Poniente..."
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                )}

                {/* Physical Address Fields */}
                <div className="space-y-4">
                  <span className="text-xxs font-extrabold uppercase tracking-wider block text-indigo-400/80">
                    {answers.hasMultipleBranches === 'Sí' ? `Dirección de Sucursal: ${answers.primaryBranchName || 'Principal'}` : 'Dirección del establecimiento'}
                  </span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] text-slate-400">Calle y Número</label>
                      <input
                        required
                        type="text"
                        value={answers.streetNum}
                        onChange={e => handleInputChange('streetNum', e.target.value)}
                        placeholder="Ej. Av. Chapultepec 456, Int 10"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">Colonia</label>
                      <input
                        required
                        type="text"
                        value={answers.colonia}
                        onChange={e => handleInputChange('colonia', e.target.value)}
                        placeholder="Ej. Americana"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">Ciudad</label>
                      <input
                        required
                        type="text"
                        value={answers.city}
                        onChange={e => handleInputChange('city', e.target.value)}
                        placeholder="Ej. Guadalajara"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">Estado</label>
                      <input
                        required
                        type="text"
                        value={answers.state}
                        onChange={e => handleInputChange('state', e.target.value)}
                        placeholder="Ej. Jalisco"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">Código Postal</label>
                      <input
                        required
                        type="text"
                        value={answers.postalCode}
                        onChange={e => handleInputChange('postalCode', e.target.value)}
                        placeholder="Ej. 44160"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">País</label>
                      <input
                        required
                        type="text"
                        value={answers.country}
                        onChange={e => handleInputChange('country', e.target.value)}
                        placeholder="Ej. México"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400">Enlace de Google Maps (Ubicación)</label>
                    <input
                      type="url"
                      value={answers.mapsLink}
                      onChange={e => handleInputChange('mapsLink', e.target.value)}
                      placeholder="https://maps.app.goo.gl/..."
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Opening Hours Selector */}
                <div className="space-y-4 pt-4 border-t border-slate-800/40">
                  <span className="text-xxs font-extrabold uppercase tracking-wider block text-indigo-400/80">Horarios de atención</span>
                  
                  {/* Desktop view (768px and wider) */}
                  <div className="hidden md:block bg-slate-950/40 rounded-2xl border border-slate-800 overflow-hidden">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          <th className="px-4 py-3 text-left">Día</th>
                          <th className="px-4 py-3 text-left">Estado / Disponibilidad</th>
                          <th className="px-4 py-3 text-left">Horas de apertura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(answers.weeklyHours).map(day => {
                          const sched = answers.weeklyHours[day];
                          return (
                            <tr key={day} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/30 text-xxs font-semibold">
                              <td className="px-4 py-3 font-bold text-indigo-300">{day}</td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleHourChange(day, 'type', 'hours')}
                                    className={clsx(
                                      "px-2.5 py-1 rounded-lg border font-bold text-[10px] transition-all",
                                      sched.type === 'hours' ? "bg-indigo-600/80 border-indigo-500 text-white" : "bg-slate-950/20 border-slate-800 text-slate-500"
                                    )}
                                  >
                                    Establecer Horas
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHourChange(day, 'type', 'appointment')}
                                    className={clsx(
                                      "px-2.5 py-1 rounded-lg border font-bold text-[10px] transition-all",
                                      sched.type === 'appointment' ? "bg-amber-600/80 border-amber-500 text-white" : "bg-slate-950/20 border-slate-800 text-slate-500"
                                    )}
                                  >
                                    Solo Cita
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHourChange(day, 'type', 'closed')}
                                    className={clsx(
                                      "px-2.5 py-1 rounded-lg border font-bold text-[10px] transition-all",
                                      sched.type === 'closed' ? "bg-rose-600/80 border-rose-500 text-white" : "bg-slate-950/20 border-slate-800 text-slate-500"
                                    )}
                                  >
                                    Cerrado
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {sched.type === 'hours' ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="time"
                                      value={sched.from}
                                      onChange={e => handleHourChange(day, 'from', e.target.value)}
                                      className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-white font-bold text-center w-20 outline-none focus:border-indigo-500"
                                    />
                                    <span>a</span>
                                    <input
                                      type="time"
                                      value={sched.to}
                                      onChange={e => handleHourChange(day, 'to', e.target.value)}
                                      className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-white font-bold text-center w-20 outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                ) : sched.type === 'appointment' ? (
                                  <span className="text-amber-500 font-bold uppercase text-[10px]">Solo bajo agendamiento</span>
                                ) : (
                                  <span className="text-rose-500 font-bold uppercase text-[10px]">No disponible / Cerrado</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile and Tablet view (under 768px) */}
                  <div className="block md:hidden space-y-3">
                    {Object.keys(answers.weeklyHours).map(day => {
                      const sched = answers.weeklyHours[day];
                      return (
                        <div key={day} className="bg-slate-950/40 p-4 rounded-2xl border border-indigo-500/20 shadow-md space-y-3 text-xxs font-semibold">
                          <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                            <span className="font-bold text-sm text-indigo-300">{day}</span>
                            {sched.type === 'hours' && (
                              <span className="text-indigo-400 font-bold text-[10px] uppercase">Establecer Horas</span>
                            )}
                            {sched.type === 'appointment' && (
                              <span className="text-amber-500 font-bold text-[10px] uppercase">Solo Cita</span>
                            )}
                            {sched.type === 'closed' && (
                              <span className="text-rose-500 font-bold text-[10px] uppercase">Cerrado</span>
                            )}
                          </div>
                          
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleHourChange(day, 'type', 'hours')}
                              className={clsx(
                                "flex-1 py-2 rounded-lg border font-bold text-[9px] text-center transition-all",
                                sched.type === 'hours' ? "bg-indigo-600/80 border-indigo-500 text-white" : "bg-slate-950/20 border-slate-800 text-slate-500"
                              )}
                            >
                              Horas
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHourChange(day, 'type', 'appointment')}
                              className={clsx(
                                "flex-1 py-2 rounded-lg border font-bold text-[9px] text-center transition-all",
                                sched.type === 'appointment' ? "bg-amber-600/80 border-amber-500 text-white" : "bg-slate-950/20 border-slate-800 text-slate-500"
                              )}
                            >
                              Solo Cita
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHourChange(day, 'type', 'closed')}
                              className={clsx(
                                "flex-1 py-2 rounded-lg border font-bold text-[9px] text-center transition-all",
                                sched.type === 'closed' ? "bg-rose-600/80 border-rose-500 text-white" : "bg-slate-950/20 border-slate-800 text-slate-500"
                              )}
                            >
                              Cerrado
                            </button>
                          </div>

                          {sched.type === 'hours' && (
                            <div className="flex items-center justify-center gap-3 pt-1">
                              <div className="space-y-1">
                                <span className="block text-[9px] text-slate-500 uppercase">Desde</span>
                                <input
                                  type="time"
                                  value={sched.from}
                                  onChange={e => handleHourChange(day, 'from', e.target.value)}
                                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-white font-bold text-center w-24 outline-none focus:border-indigo-500"
                                />
                              </div>
                              <span className="self-end pb-2.5 text-slate-400">a</span>
                              <div className="space-y-1">
                                <span className="block text-[9px] text-slate-500 uppercase">Hasta</span>
                                <input
                                  type="time"
                                  value={sched.to}
                                  onChange={e => handleHourChange(day, 'to', e.target.value)}
                                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-white font-bold text-center w-24 outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Social media connections */}
                <div className="space-y-4 pt-4 border-t border-slate-800/40">
                  <span className="text-xxs font-extrabold uppercase tracking-wider block text-indigo-400/80">Redes sociales</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">Instagram</label>
                      <input
                        type="url"
                        value={answers.socialInstagram}
                        onChange={e => handleInputChange('socialInstagram', e.target.value)}
                        placeholder="https://instagram.com/tu_marca"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">Facebook</label>
                      <input
                        type="url"
                        value={answers.socialFacebook}
                        onChange={e => handleInputChange('socialFacebook', e.target.value)}
                        placeholder="https://facebook.com/tu_marca"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">TikTok</label>
                      <input
                        type="url"
                        value={answers.socialTiktok}
                        onChange={e => handleInputChange('socialTiktok', e.target.value)}
                        placeholder="https://tiktok.com/@tu_marca"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400">YouTube</label>
                      <input
                        type="url"
                        value={answers.socialYoutube}
                        onChange={e => handleInputChange('socialYoutube', e.target.value)}
                        placeholder="https://youtube.com/c/tu_canal"
                        className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400">Otra red social</label>
                    <input
                      type="url"
                      value={answers.socialOther}
                      onChange={e => handleInputChange('socialOther', e.target.value)}
                      placeholder="https://pinterest.com/..."
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Public contact info checkboxes */}
                <div className="space-y-3 pt-4 border-t border-slate-800/40">
                  <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Datos que deseas mostrar públicamente en tu web</label>
                  <div className="flex flex-wrap gap-2">
                    {PUBLIC_DATA_OPTIONS.map(opt => {
                      const selected = answers.publicData.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleCheckboxToggle('publicData', opt)}
                          className={clsx(
                            "px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all",
                            selected 
                              ? "bg-indigo-600/80 border-indigo-500 text-white"
                              : "bg-slate-950/20 border-slate-800 text-slate-400 hover:bg-slate-900"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800/40">
                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Número de WhatsApp para reservaciones o atención</label>
                    <input
                      required
                      type="tel"
                      value={answers.bookingWhatsapp}
                      onChange={e => handleInputChange('bookingWhatsapp', e.target.value)}
                      placeholder="Ej. +52 415 179 0204"
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider">Correo público de contacto</label>
                    <input
                      type="email"
                      value={answers.publicEmail}
                      onChange={e => handleInputChange('publicEmail', e.target.value)}
                      placeholder="info@tuespacioso.com"
                      className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Sucursales Adicionales List */}
                {answers.hasMultipleBranches === 'Sí' && (
                  <div className="space-y-6 pt-6 border-t border-slate-800/40">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-extrabold uppercase tracking-wider block text-indigo-400/80">Sucursales Adicionales</span>
                      <button
                        type="button"
                        onClick={handleAddBranch}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xxs flex items-center gap-1.5 active:scale-95 transition-all shadow-md"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Añadir Sucursal</span>
                      </button>
                    </div>

                    {answers.branches.length === 0 ? (
                      <div className="text-center py-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/10 text-slate-500 text-xs">
                        No has añadido sucursales adicionales todavía. Presiona "Añadir Sucursal" para agregar otra.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {answers.branches.map((branch, index) => (
                          <div key={branch.id} className="bg-slate-950/25 rounded-3xl border border-indigo-500/10 shadow-inner p-6 space-y-6">
                            <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
                              <span className="font-extrabold text-xs uppercase text-indigo-300">Sucursal #{index + 2}: {branch.branchName || 'Nueva Sucursal'}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBranch(branch.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                title="Eliminar Sucursal"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Branch Name */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-slate-400">Nombre de la sucursal</label>
                              <input
                                required
                                type="text"
                                value={branch.branchName}
                                onChange={e => handleBranchInputChange(branch.id, 'branchName', e.target.value)}
                                placeholder="Ej. Sucursal Polanco, Sucursal Providencia..."
                                className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                              />
                            </div>

                            {/* Physical Address Fields for Branch */}
                            <div className="space-y-4 pt-2">
                              <span className="text-xxs font-extrabold uppercase tracking-wider block text-indigo-400/60">Dirección de la sucursal</span>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-1.5">
                                  <label className="text-[10px] text-slate-400">Calle y Número</label>
                                  <input
                                    required
                                    type="text"
                                    value={branch.streetNum}
                                    onChange={e => handleBranchInputChange(branch.id, 'streetNum', e.target.value)}
                                    placeholder="Ej. Av. Insurgentes Sur 123"
                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400">Colonia</label>
                                  <input
                                    required
                                    type="text"
                                    value={branch.colonia}
                                    onChange={e => handleBranchInputChange(branch.id, 'colonia', e.target.value)}
                                    placeholder="Ej. Del Valle"
                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400">Ciudad</label>
                                  <input
                                    required
                                    type="text"
                                    value={branch.city}
                                    onChange={e => handleBranchInputChange(branch.id, 'city', e.target.value)}
                                    placeholder="Ej. CDMX"
                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400">Estado</label>
                                  <input
                                    required
                                    type="text"
                                    value={branch.state}
                                    onChange={e => handleBranchInputChange(branch.id, 'state', e.target.value)}
                                    placeholder="Ej. CDMX"
                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400">CP</label>
                                  <input
                                    required
                                    type="text"
                                    value={branch.postalCode}
                                    onChange={e => handleBranchInputChange(branch.id, 'postalCode', e.target.value)}
                                    placeholder="Ej. 03100"
                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400">País</label>
                                  <input
                                    required
                                    type="text"
                                    value={branch.country}
                                    onChange={e => handleBranchInputChange(branch.id, 'country', e.target.value)}
                                    placeholder="Ej. México"
                                    className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-400">Enlace de Google Maps (Ubicación)</label>
                                <input
                                  type="url"
                                  value={branch.mapsLink}
                                  onChange={e => handleBranchInputChange(branch.id, 'mapsLink', e.target.value)}
                                  placeholder="https://maps.app.goo.gl/..."
                                  className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                />
                              </div>
                            </div>

                            {/* Contact data specific to branch */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                              <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-400">WhatsApp para reservaciones de esta sucursal</label>
                                <input
                                  required
                                  type="tel"
                                  value={branch.bookingWhatsapp}
                                  onChange={e => handleBranchInputChange(branch.id, 'bookingWhatsapp', e.target.value)}
                                  placeholder="Ej. +52 5598765432"
                                  className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-400">Correo público de esta sucursal</label>
                                <input
                                  type="email"
                                  value={branch.publicEmail}
                                  onChange={e => handleBranchInputChange(branch.id, 'publicEmail', e.target.value)}
                                  placeholder="Ej. polanco@tuespacioso.com"
                                  className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xs font-semibold text-white"
                                />
                              </div>
                            </div>

                            {/* Branch social media overrides (Optional) */}
                            <div className="space-y-4 pt-2 border-t border-slate-800/40">
                              <span className="text-xxs font-extrabold uppercase tracking-wider block text-indigo-400/60">Redes sociales específicas (Si varían)</span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[9px] text-slate-400">Instagram</label>
                                  <input
                                    type="url"
                                    value={branch.socialInstagram}
                                    onChange={e => handleBranchInputChange(branch.id, 'socialInstagram', e.target.value)}
                                    placeholder="Dejar vacío si usa el principal"
                                    className="w-full px-2 py-1.5 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xxs text-white"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-slate-400">Facebook</label>
                                  <input
                                    type="url"
                                    value={branch.socialFacebook}
                                    onChange={e => handleBranchInputChange(branch.id, 'socialFacebook', e.target.value)}
                                    placeholder="Dejar vacío si usa el principal"
                                    className="w-full px-2 py-1.5 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xxs text-white"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] text-slate-400">TikTok</label>
                                  <input
                                    type="url"
                                    value={branch.socialTiktok}
                                    onChange={e => handleBranchInputChange(branch.id, 'socialTiktok', e.target.value)}
                                    placeholder="Dejar vacío si usa el principal"
                                    className="w-full px-2 py-1.5 bg-slate-950/40 border border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-xxs text-white"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Hours for Branch */}
                            <div className="space-y-4 pt-2 border-t border-slate-800/40">
                              <span className="text-xxs font-extrabold uppercase tracking-wider block text-indigo-400/60">Horarios de atención de esta sucursal</span>
                              
                              {/* Desktop Table */}
                              <div className="hidden md:block bg-slate-950/40 rounded-2xl border border-slate-800 overflow-hidden">
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                      <th className="px-4 py-2 text-left">Día</th>
                                      <th className="px-4 py-2 text-left">Estado / Disponibilidad</th>
                                      <th className="px-4 py-2 text-left">Horas de apertura</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Object.keys(branch.weeklyHours).map(day => {
                                      const sched = branch.weeklyHours[day];
                                      return (
                                        <tr key={day} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/30 text-xxs font-semibold">
                                          <td className="px-4 py-2 font-bold text-indigo-300">{day}</td>
                                          <td className="px-4 py-2">
                                            <div className="flex gap-1.5">
                                              {['hours', 'appointment', 'closed'].map(type => (
                                                <button
                                                  key={type}
                                                  type="button"
                                                  onClick={() => handleBranchHourChange(branch.id, day, 'type', type)}
                                                  className={clsx(
                                                    "px-2 py-1 rounded-md border font-bold text-[9px] transition-all",
                                                    sched.type === type 
                                                      ? type === 'hours' ? "bg-indigo-600/80 border-indigo-500 text-white"
                                                        : type === 'appointment' ? "bg-amber-600/80 border-amber-500 text-white"
                                                        : "bg-rose-600/80 border-rose-500 text-white"
                                                      : "bg-slate-950/20 border-slate-800 text-slate-500"
                                                  )}
                                                >
                                                  {type === 'hours' ? 'Horas' : type === 'appointment' ? 'Cita' : 'Cerrado'}
                                                </button>
                                              ))}
                                            </div>
                                          </td>
                                          <td className="px-4 py-2">
                                            {sched.type === 'hours' ? (
                                              <div className="flex items-center gap-1.5">
                                                <input
                                                  type="time"
                                                  value={sched.from}
                                                  onChange={e => handleBranchHourChange(branch.id, day, 'from', e.target.value)}
                                                  className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-white font-bold text-center w-16"
                                                />
                                                <span>a</span>
                                                <input
                                                  type="time"
                                                  value={sched.to}
                                                  onChange={e => handleBranchHourChange(branch.id, day, 'to', e.target.value)}
                                                  className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-white font-bold text-center w-16"
                                                />
                                              </div>
                                            ) : sched.type === 'appointment' ? (
                                              <span className="text-amber-500 font-bold uppercase text-[9px]">Solo bajo agendamiento</span>
                                            ) : (
                                              <span className="text-rose-500 font-bold uppercase text-[9px]">No disponible / Cerrado</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile View */}
                              <div className="block md:hidden space-y-2.5">
                                {Object.keys(branch.weeklyHours).map(day => {
                                  const sched = branch.weeklyHours[day];
                                  return (
                                    <div key={day} className="bg-slate-950/40 p-3 rounded-xl border border-indigo-500/10 space-y-2 text-xxs font-semibold">
                                      <div className="flex justify-between items-center">
                                        <span className="font-bold text-indigo-300">{day}</span>
                                        <span className={clsx(
                                          "text-[9px] font-bold uppercase",
                                          sched.type === 'hours' ? "text-indigo-400" : sched.type === 'appointment' ? "text-amber-500" : "text-rose-500"
                                        )}>{sched.type === 'hours' ? 'Horas' : sched.type === 'appointment' ? 'Solo Cita' : 'Cerrado'}</span>
                                      </div>
                                      <div className="flex gap-1">
                                        {['hours', 'appointment', 'closed'].map(type => (
                                          <button
                                            key={type}
                                            type="button"
                                            onClick={() => handleBranchHourChange(branch.id, day, 'type', type)}
                                            className={clsx(
                                              "flex-1 py-1 rounded border font-bold text-[9px] text-center transition-all",
                                              sched.type === type 
                                                ? type === 'hours' ? "bg-indigo-600/80 border-indigo-500 text-white"
                                                  : type === 'appointment' ? "bg-amber-600/80 border-amber-500 text-white"
                                                  : "bg-rose-600/80 border-rose-500 text-white"
                                                : "bg-slate-950/20 border-slate-800 text-slate-500"
                                            )}
                                          >
                                            {type === 'hours' ? 'Horas' : type === 'appointment' ? 'Cita' : 'Cerrado'}
                                          </button>
                                        ))}
                                      </div>
                                      {sched.type === 'hours' && (
                                        <div className="flex items-center justify-center gap-2 pt-1">
                                          <input
                                            type="time"
                                            value={sched.from}
                                            onChange={e => handleBranchHourChange(branch.id, day, 'from', e.target.value)}
                                            className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white font-bold text-center w-20"
                                          />
                                          <span>a</span>
                                          <input
                                            type="time"
                                            value={sched.to}
                                            onChange={e => handleBranchHourChange(branch.id, day, 'to', e.target.value)}
                                            className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white font-bold text-center w-20"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={submitting}
                  className="px-6 py-3 bg-slate-950/20 border border-slate-800 text-slate-400 hover:bg-slate-900 font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Atrás</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-600/35"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando Briefing...</span>
                    </>
                  ) : (
                    <>
                      <ClipboardList className="w-4 h-4" />
                      <span>Enviar Briefing</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PublicGeneralBriefing;
