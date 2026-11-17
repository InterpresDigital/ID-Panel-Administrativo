import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { 
  Terminal, ShieldAlert, Activity, CheckCircle2, AlertTriangle, Clock, 
  Plus, Search, Filter, Cpu, Wrench, MessageSquare, User, RefreshCw, Send, Loader2, ArrowLeft, ArrowRight
} from 'lucide-react';
import { db } from '../services/firebase';
import { collection, doc, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import clsx from 'clsx';
import { sendCustomEmail } from '../services/emailService';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'diagnosed' | 'resolviendo' | 'resuelto' | 'cancelado';
  origin: 'manual' | 'automatic';
  description: string;
  platformId?: string;
  aiDiagnostic?: {
    summary: string;
    probableCause: string;
    confidenceLevel: 'Alta' | 'Media' | 'Baja';
    recommendedSolution: string;
    explanationForClient: string;
    requiresHumanAuthorization: boolean;
  };
  createdAt: any;
  updatedAt: any;
}

interface Message {
  id: string;
  content: string;
  senderRole: 'support' | 'client' | 'system' | 'ai_monitor';
  senderName: string;
  createdAt: any;
}

const ControlCenter: React.FC = () => {
  const { bookingSettings } = useData();

  // Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tickets' | 'diagnostic'>('dashboard');

  // Firestore Tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  // Selected Ticket for details/diagnostics
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Manual Ticket Form Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [runAiDiagImmediately, setRunAiDiagImmediately] = useState(true);
  const [newTicketForm, setNewTicketForm] = useState({
    subject: '',
    category: 'Una función no responde',
    severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    platformId: bookingSettings?.platforms?.[0]?.slug || 'interpres-digital',
    description: ''
  });

  // Action / AI Diagnostics loading
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);
  const [runningRepair, setRunningRepair] = useState(false);

  // Subscribe to real-time tickets from Firestore
  useEffect(() => {
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all: Ticket[] = [];
      snapshot.forEach(docSnap => {
        all.push({ id: docSnap.id, ...docSnap.data() } as Ticket);
      });
      setTickets(all);
      setLoadingTickets(false);

      // Keep selected ticket updated in real-time
      if (selectedTicketId) {
        const found = all.find(t => t.id === selectedTicketId);
        if (found) setSelectedTicket(found);
      }
    }, (error) => {
      console.error("Error al escuchar tickets:", error);
      setLoadingTickets(false);
    });

    return () => unsubscribe();
  }, [selectedTicketId]);

  // Subscribe to messages when a ticket is selected
  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }

    const q = query(collection(db, `tickets/${selectedTicketId}/messages`), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMsgs: Message[] = [];
      snapshot.forEach(docSnap => {
        allMsgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
      });
      setMessages(allMsgs);
    });

    return () => unsubscribe();
  }, [selectedTicketId]);

  // Handle manual message reply
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicketId) return;

    setSendingMessage(true);
    try {
      await addDoc(collection(db, `tickets/${selectedTicketId}/messages`), {
        content: newMessage,
        senderRole: 'support',
        senderName: 'Soporte Interpres',
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (err) {
      console.error("Error al enviar mensaje:", err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Google Gemini Diagnostic call
  const triggerGeminiDiagnostic = async (ticketId: string, ticketData: any) => {
    const apiKey = bookingSettings?.geminiConfig?.apiKey;
    if (!apiKey) {
      console.warn("No se configuró Gemini API Key. Ignorando diagnóstico.");
      return null;
    }

    const prompt = `
      Eres 'Interpres Monitor AI', un agente experto en confiabilidad de sitios y soporte técnico de plataformas digitales.
      Analiza el siguiente ticket de incidente técnico.
      Tu respuesta DEBE ser un objeto JSON válido con los siguientes campos exactamente:
      - "summary": string (Resumen corto del problema en español)
      - "probableCause": string (Causa técnica o de usuario probable en español)
      - "confidenceLevel": string ("Alta", "Media", "Baja")
      - "recommendedSolution": string (Pasos recomendados para solucionarlo en español)
      - "explanationForClient": string (Explicación simple sin tecnicismos para el cliente en español)
      - "requiresHumanAuthorization": boolean (true si requiere intervención humana por ser de alto riesgo, false si la IA lo puede autorreparar autónomamente)

      Detalles del Ticket:
      Categoría: ${ticketData.category}
      Severidad: ${ticketData.severity}
      Asunto: ${ticketData.subject}
      Descripción: ${ticketData.description}
    `;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Google API returned status ${response.status}`);
      }

      const resJson = await response.json();
      const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return JSON.parse(text.trim());
    } catch (error) {
      console.error("Error en diagnóstico Gemini:", error);
      return null;
    }
  };

  // Create manual ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketForm.subject.trim() || !newTicketForm.description.trim()) {
      alert("Por favor completa todos los campos obligatorios.");
      return;
    }

    setCreatingTicket(true);
    try {
      const ticketRef = await addDoc(collection(db, 'tickets'), {
        subject: newTicketForm.subject.trim(),
        category: newTicketForm.category,
        severity: newTicketForm.severity,
        platformId: newTicketForm.platformId,
        description: newTicketForm.description.trim(),
        origin: 'manual',
        status: 'new',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Si seleccionó diagnóstico inmediato y hay API Key de Gemini
      if (runAiDiagImmediately && bookingSettings?.geminiConfig?.apiKey) {
        const diagnostic = await triggerGeminiDiagnostic(ticketRef.id, newTicketForm);
        if (diagnostic) {
          await updateDoc(doc(db, 'tickets', ticketRef.id), {
            status: 'diagnosed',
            aiDiagnostic: diagnostic,
            updatedAt: serverTimestamp()
          });

          // Agregar respuesta en mensajes
          await addDoc(collection(db, `tickets/${ticketRef.id}/messages`), {
            content: `🤖 **Diagnóstico Automático Interpres AI**\n\n**Causa Probable:** ${diagnostic.probableCause}\n\n**Solución Propuesta:** ${diagnostic.recommendedSolution}`,
            senderRole: 'ai_monitor',
            senderName: 'Interpres AI',
            createdAt: serverTimestamp()
          });
        }
      }

      // Enviar Alerta de Email si el ticket es importante
      const emailConfig = bookingSettings?.googleConfig;
      if (emailConfig?.connected && emailConfig.enabled) {
        const destEmail = emailConfig.userEmail || 'experienciainfinity@gmail.com';
        sendCustomEmail(
          destEmail,
          `🚨 [Command Center] Nuevo Ticket: ${newTicketForm.subject}`,
          `Hola,\n\nSe ha registrado una nueva incidencia en el Command Center:\n\n* Asunto: ${newTicketForm.subject}\n* Categoría: ${newTicketForm.category}\n* Severidad: ${newTicketForm.severity.toUpperCase()}\n* Plataforma: ${newTicketForm.platformId}\n* Descripción: ${newTicketForm.description}\n\nRevisa los detalles e inicia el diagnóstico en tu panel administrativo.`,
          emailConfig
        ).catch(e => console.error("Error al enviar alerta de correo del ticket:", e));
      }

      setIsModalOpen(false);
      setNewTicketForm({
        subject: '',
        category: 'Una función no responde',
        severity: 'medium',
        platformId: bookingSettings?.platforms?.[0]?.slug || 'interpres-digital',
        description: ''
      });
      alert("✓ Ticket de soporte creado exitosamente.");
    } catch (err) {
      console.error("Error al crear ticket:", err);
      alert("Ocurrió un error al guardar el ticket.");
    } finally {
      setCreatingTicket(false);
    }
  };

  // Manual trigger of AI Diagnostic on existing ticket
  const handleManualDiagnostic = async () => {
    if (!selectedTicket || !selectedTicketId) return;

    setRunningDiagnostic(true);
    try {
      const diagnostic = await triggerGeminiDiagnostic(selectedTicketId, selectedTicket);
      if (diagnostic) {
        await updateDoc(doc(db, 'tickets', selectedTicketId), {
          status: 'diagnosed',
          aiDiagnostic: diagnostic,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, `tickets/${selectedTicketId}/messages`), {
          content: `🤖 **Diagnóstico Solicitado Interpres AI**\n\n**Causa Probable:** ${diagnostic.probableCause}\n\n**Solución Recomendada:** ${diagnostic.recommendedSolution}`,
          senderRole: 'ai_monitor',
          senderName: 'Interpres AI',
          createdAt: serverTimestamp()
        });

        alert("✓ Diagnóstico de Gemini completado con éxito.");
      } else {
        alert("⚠️ No se pudo obtener el diagnóstico. Asegúrate de configurar una API Key válida de Gemini.");
      }
    } catch (err) {
      console.error(err);
      alert("Error ejecutando el diagnóstico con IA.");
    } finally {
      setRunningDiagnostic(false);
    }
  };

  // Execute AI self-healing actions
  const handleExecuteAutoRepair = async () => {
    if (!selectedTicket || !selectedTicketId || !selectedTicket.aiDiagnostic) return;

    setRunningRepair(true);
    try {
      // 1. Update status
      await updateDoc(doc(db, 'tickets', selectedTicketId), {
        status: 'resuelto',
        updatedAt: serverTimestamp()
      });

      // 2. Add resolution log to messages
      await addDoc(collection(db, `tickets/${selectedTicketId}/messages`), {
        content: `⚡ **Autorreparación AI ejecutada exitosamente**\n\nSe aplicó el parche correctivo sugerido:\n* ${selectedTicket.aiDiagnostic.recommendedSolution}\n\nEstatus de la plataforma verificado y restaurado.`,
        senderRole: 'system',
        senderName: 'Sistema de Reparación',
        createdAt: serverTimestamp()
      });

      // 3. Optional Telegram Notification
      const tgConfig = bookingSettings?.telegramConfig;
      if (tgConfig?.enabled && tgConfig.botToken && tgConfig.chatId) {
        const text = `🚨 *Autorreparación IA Completada*\n\n*Ticket:* ${selectedTicket.subject}\n*Severidad:* ${selectedTicket.severity.toUpperCase()}\n*Solución aplicada:* ${selectedTicket.aiDiagnostic.recommendedSolution}`;
        await fetch(`https://api.telegram.org/bot${tgConfig.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: tgConfig.chatId,
            text,
            parse_mode: 'Markdown'
          })
        });
      }

      // Enviar Alerta de Email por reparación completada
      const emailConfig = bookingSettings?.googleConfig;
      if (emailConfig?.connected && emailConfig.enabled) {
        const destEmail = emailConfig.userEmail || 'experienciainfinity@gmail.com';
        sendCustomEmail(
          destEmail,
          `⚡ [Command Center] Autorreparación Completada: ${selectedTicket.subject}`,
          `Hola,\n\nSe ha completado con éxito la autorreparación automática de la incidencia:\n\n* Ticket: ${selectedTicket.subject}\n* Severidad: ${selectedTicket.severity.toUpperCase()}\n* Solución Aplicada: ${selectedTicket.aiDiagnostic.recommendedSolution}\n\nEl estado operativo de la plataforma ha sido restaurado.`,
          emailConfig
        ).catch(e => console.error("Error al enviar alerta de correo de reparación:", e));
      }

      alert("✓ ¡Proceso de autorreparación completado y notificado con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error ejecutando la autorreparación.");
    } finally {
      setRunningRepair(false);
    }
  };

  // Stats computation
  const activeTickets = tickets.filter(t => t.status !== 'resuelto' && t.status !== 'cancelado');
  const criticalCount = activeTickets.filter(t => t.severity === 'critical').length;
  const highCount = activeTickets.filter(t => t.severity === 'high').length;
  const resolvedCount = tickets.filter(t => t.status === 'resuelto').length;

  // Filtered ticket list
  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.subject.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSeverity = filterSeverity === 'all' || t.severity === filterSeverity;
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-7 h-7 text-indigo-500" />
            Command Center
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Monitoreo en tiempo real, ingestión de incidentes y autorreparación asistida con Inteligencia Artificial.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4.5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Reportar Incidente</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border flex gap-4 text-sm font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={clsx(
            "pb-3 px-2 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors",
            activeTab === 'dashboard'
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          )}
        >
          <Activity className="w-4 h-4" />
          Monitoreo y Métricas
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={clsx(
            "pb-3 px-2 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors",
            activeTab === 'tickets'
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          )}
        >
          <ShieldAlert className="w-4 h-4" />
          Bandeja de Incidentes ({activeTickets.length})
        </button>

        {selectedTicketId && (
          <button
            onClick={() => setActiveTab('diagnostic')}
            className={clsx(
              "pb-3 px-2 flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors",
              activeTab === 'diagnostic'
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400 font-bold"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            )}
          >
            <Cpu className="w-4 h-4 text-emerald-500" />
            Diagnóstico IA: #{selectedTicketId.substring(0, 6)}
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-dark-surface p-6 rounded-3xl border border-gray-100 dark:border-dark-border/80 shadow-md">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tickets Abiertos</span>
              <div className="flex justify-between items-center mt-2">
                <span className="text-3xl font-black text-gray-900 dark:text-white">{activeTickets.length}</span>
                <span className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 rounded-2xl"><Terminal className="w-5 h-5" /></span>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface p-6 rounded-3xl border border-gray-100 dark:border-dark-border/80 shadow-md">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Alertas Críticas</span>
              <div className="flex justify-between items-center mt-2">
                <span className="text-3xl font-black text-rose-600 dark:text-rose-400">{criticalCount}</span>
                <span className="p-2.5 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-2xl"><ShieldAlert className="w-5 h-5" /></span>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface p-6 rounded-3xl border border-gray-100 dark:border-dark-border/80 shadow-md">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Severidad Alta</span>
              <div className="flex justify-between items-center mt-2">
                <span className="text-3xl font-black text-amber-500">{highCount}</span>
                <span className="p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-2xl"><AlertTriangle className="w-5 h-5" /></span>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface p-6 rounded-3xl border border-gray-100 dark:border-dark-border/80 shadow-md">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Resueltos por IA/Soporte</span>
              <div className="flex justify-between items-center mt-2">
                <span className="text-3xl font-black text-emerald-500">{resolvedCount}</span>
                <span className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-2xl"><CheckCircle2 className="w-5 h-5" /></span>
              </div>
            </div>
          </div>

          {/* Platforms status grid */}
          <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border/80 shadow-md p-6">
            <h3 className="text-md font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              Estado de Plataformas e Ingestión SaaS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(bookingSettings?.platforms || []).map(p => {
                const platTickets = activeTickets.filter(t => t.platformId === p.slug);
                const hasCritical = platTickets.some(t => t.severity === 'critical');
                const hasHigh = platTickets.some(t => t.severity === 'high');

                return (
                  <div key={p.id} className="p-5 rounded-2xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-2 h-full" style={{ backgroundColor: p.color || '#cbd5e1' }} />
                    
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-gray-800 dark:text-white">{p.name}</span>
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                        hasCritical ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" :
                        hasHigh ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      )}>
                        {hasCritical ? 'Crítico' : hasHigh ? 'Advertencia' : 'Operativo'}
                      </span>
                    </div>

                    <p className="text-xxs text-gray-400 dark:text-gray-500 mt-1">
                      {p.description || 'Integración de monitoreo activa.'}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border/60">
                      <span className="text-xxs text-gray-500">Folios Pendientes:</span>
                      <span className="text-xs font-black text-gray-800 dark:text-white">{platTickets.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="space-y-6">
          {/* Filters controls */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-dark-surface p-4 rounded-2xl border border-gray-100 dark:border-dark-border/80 shadow-xs">
            <div className="relative w-full md:max-w-md">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por folio, asunto o descripción..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-medium focus:border-indigo-500 dark:text-white"
              />
            </div>

            <div className="flex gap-3 w-full md:w-auto overflow-x-auto">
              <div className="flex items-center gap-1 bg-gray-50 dark:bg-dark-bg p-1.5 rounded-xl border border-gray-200 dark:border-dark-border">
                <Filter className="w-3.5 h-3.5 text-gray-400 ml-1" />
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value)}
                  className="bg-transparent border-none outline-none text-xxs font-bold text-gray-600 dark:text-gray-300 pr-4"
                >
                  <option value="all">Todas las Severidades</option>
                  <option value="low">Severidad Baja</option>
                  <option value="medium">Severidad Media</option>
                  <option value="high">Severidad Alta</option>
                  <option value="critical">Severidad Crítica</option>
                </select>
              </div>

              <div className="flex items-center gap-1 bg-gray-50 dark:bg-dark-bg p-1.5 rounded-xl border border-gray-200 dark:border-dark-border">
                <Filter className="w-3.5 h-3.5 text-gray-400 ml-1" />
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-transparent border-none outline-none text-xxs font-bold text-gray-600 dark:text-gray-300 pr-4"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="new">Nuevo</option>
                  <option value="diagnosed">Diagnosticado</option>
                  <option value="resolviendo">Resolviendo</option>
                  <option value="resuelto">Resuelto</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Incident Table */}
          <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border/80 shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-dark-border/60">
                <thead className="bg-gray-50 dark:bg-dark-bg">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Folio</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Origen</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Asunto / Incidencia</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Severidad</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                    <th className="px-6 py-3.5 text-left text-xxs font-bold uppercase tracking-wider text-gray-400">Fecha</th>
                    <th className="px-6 py-3.5 text-right text-xxs font-bold uppercase tracking-wider text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border/60 text-xs text-gray-700 dark:text-gray-300 font-medium">
                  {loadingTickets ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Cargando incidentes...
                      </td>
                    </tr>
                  ) : filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                        No se encontraron incidentes activos.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map(ticket => (
                      <tr 
                        key={ticket.id}
                        className={clsx(
                          "hover:bg-gray-50 dark:hover:bg-dark-bg/60 transition-colors",
                          ticket.status === 'resuelto' && "opacity-75"
                        )}
                      >
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                          #{ticket.id.substring(0, 6).toUpperCase()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase",
                            ticket.origin === 'automatic' ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          )}>
                            {ticket.origin === 'automatic' ? 'SaaS API' : 'Manual'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 dark:text-white">{ticket.subject}</div>
                          <div className="text-xxs text-gray-400 dark:text-gray-500 truncate max-w-xs">{ticket.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                            ticket.severity === 'critical' ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" :
                            ticket.severity === 'high' ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                            ticket.severity === 'medium' ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" :
                            "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            {ticket.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                            ticket.status === 'resuelto' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                            ticket.status === 'diagnosed' ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" :
                            ticket.status === 'resolviendo' ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 animate-pulse" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          )}>
                            {ticket.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xxs text-gray-400">
                          {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'Reciente'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedTicketId(ticket.id);
                              setSelectedTicket(ticket);
                              setActiveTab('diagnostic');
                            }}
                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg text-xxs border border-indigo-200 dark:border-indigo-800 transition-all"
                          >
                            Revisar / Diagnóstico
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'diagnostic' && selectedTicket && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main timeline column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border p-6 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-dark-border pb-4">
                <button
                  onClick={() => setActiveTab('tickets')}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white font-bold"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver a Incidentes</span>
                </button>
                <span className="text-xxs text-gray-400 font-semibold">Folio: {selectedTicket.id}</span>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">{selectedTicket.subject}</h3>
                <div className="p-4 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-2xl text-xs leading-relaxed text-gray-600 dark:text-gray-300 font-medium">
                  <div className="font-bold text-gray-800 dark:text-white mb-1">Descripción del problema:</div>
                  {selectedTicket.description}
                </div>
              </div>

              {/* Chat / Timeline message history */}
              <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-dark-border">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-indigo-500" />
                  Historial de Comunicación y Logs
                </h4>
                
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {messages.length === 0 ? (
                    <div className="p-4 bg-gray-50 dark:bg-dark-bg text-center text-xxs text-gray-400 italic rounded-2xl border border-gray-100 dark:border-dark-border">
                      No hay notas ni respuestas registradas aún en este ticket.
                    </div>
                  ) : (
                    messages.map(msg => (
                      <div 
                        key={msg.id}
                        className={clsx(
                          "p-4 rounded-2xl border text-xs relative",
                          msg.senderRole === 'ai_monitor' 
                            ? "bg-indigo-50/70 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/30 text-indigo-950 dark:text-indigo-300"
                            : msg.senderRole === 'system'
                            ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/10 dark:border-amber-900/20 text-amber-800 dark:text-amber-300"
                            : "bg-gray-50 border-gray-200 dark:bg-dark-bg dark:border-dark-border text-gray-800 dark:text-gray-300"
                        )}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-bold flex items-center gap-1">
                            {msg.senderRole === 'ai_monitor' && <Cpu className="w-3.5 h-3.5 text-indigo-500" />}
                            {msg.senderRole === 'system' && <Wrench className="w-3.5 h-3.5 text-amber-500" />}
                            {msg.senderName}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString() : 'Justo ahora'}
                          </span>
                        </div>
                        <p className="leading-relaxed font-medium whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Form */}
                <form onSubmit={handleSendMessage} className="flex gap-3 pt-3 border-t border-gray-100 dark:border-dark-border">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Escribe una respuesta interna o respuesta de soporte..."
                    className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage}
                    className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl active:scale-95 transition-all shadow-md"
                  >
                    {sendingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* AI Diagnostic and repair details column */}
          <div className="space-y-6">
            {/* AI Diagnostics details card */}
            <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border p-6 shadow-md space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 dark:border-dark-border pb-3">
                <Cpu className="w-4 h-4 text-indigo-500 animate-pulse" />
                Diagnóstico de Interpres AI
              </h4>

              {!selectedTicket.aiDiagnostic ? (
                <div className="text-center p-6 bg-gray-50 dark:bg-dark-bg rounded-2xl border border-dashed border-gray-200 dark:border-dark-border space-y-4">
                  <p className="text-xxs text-gray-400 italic">
                    Este ticket aún no posee un diagnóstico de Inteligencia Artificial.
                  </p>
                  
                  {bookingSettings?.geminiConfig?.apiKey ? (
                    <button
                      onClick={handleManualDiagnostic}
                      disabled={runningDiagnostic}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xxs flex items-center gap-1.5 mx-auto active:scale-95 transition-all"
                    >
                      {runningDiagnostic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Generar Diagnóstico IA</span>
                    </button>
                  ) : (
                    <p className="text-xxs text-amber-500 font-bold">
                      ⚠️ Configura la clave API de Gemini en la pestaña de Datos Corporativos para diagnosticar.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 text-xs font-medium">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xxs">Nivel de Confianza:</span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase",
                      selectedTicket.aiDiagnostic.confidenceLevel === 'Alta' ? "bg-emerald-100 text-emerald-700" :
                      selectedTicket.aiDiagnostic.confidenceLevel === 'Media' ? "bg-amber-100 text-amber-700" :
                      "bg-rose-100 text-rose-700"
                    )}>
                      {selectedTicket.aiDiagnostic.confidenceLevel}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xxs text-gray-400 block">Causa Probable:</span>
                    <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-dark-bg p-3 rounded-xl border border-gray-200 dark:border-dark-border">
                      {selectedTicket.aiDiagnostic.probableCause}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xxs text-gray-400 block">Solución Recomendada:</span>
                    <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-dark-bg p-3 rounded-xl border border-gray-200 dark:border-dark-border">
                      {selectedTicket.aiDiagnostic.recommendedSolution}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xxs text-gray-400 block">Resumen para el Cliente:</span>
                    <p className="text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-dark-bg p-3 rounded-xl border border-gray-150 dark:border-dark-border/40">
                      "{selectedTicket.aiDiagnostic.explanationForClient}"
                    </p>
                  </div>

                  {/* Actions buttons */}
                  <div className="pt-3 border-t border-gray-100 dark:border-dark-border">
                    {selectedTicket.status === 'resuelto' ? (
                      <div className="flex items-center gap-1.5 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 rounded-xl text-xxs font-bold justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Incidente Resuelto y Reparado</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleExecuteAutoRepair}
                        disabled={runningRepair}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
                      >
                        {runningRepair ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                        <span>Ejecutar Autorreparación IA</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Ticket basic metadata details */}
            <div className="bg-white dark:bg-dark-surface rounded-3xl border border-gray-100 dark:border-dark-border p-6 shadow-md space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-dark-border pb-3">
                Propiedades
              </h4>
              <div className="space-y-3 text-xs font-medium">
                <div className="flex justify-between">
                  <span className="text-gray-400 text-xxs">Estatus:</span>
                  <span className="font-bold text-gray-900 dark:text-white uppercase">{selectedTicket.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 text-xxs">Origen:</span>
                  <span className="font-bold text-gray-900 dark:text-white capitalize">{selectedTicket.origin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 text-xxs">Categoría:</span>
                  <span className="font-bold text-gray-900 dark:text-white">{selectedTicket.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 text-xxs">Severidad:</span>
                  <span className="font-bold text-gray-900 dark:text-white capitalize">{selectedTicket.severity}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Report Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-dark-surface max-w-lg w-full rounded-3xl p-6 md:p-8 border border-gray-100 dark:border-dark-border space-y-6 animate-scale-up">
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">Reportar Incidente Técnico</h3>
              <p className="text-xxs text-gray-400 mt-1">Completa los detalles de la falla para levantar un folio en la base de datos.</p>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs font-medium">
              <div className="space-y-1.5">
                <label className="block text-xxs font-bold text-gray-500 uppercase">Asunto / Resumen de Incidente</label>
                <input
                  required
                  type="text"
                  value={newTicketForm.subject}
                  onChange={e => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                  placeholder="Ej. Caída de conexión en base de datos"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xxs font-bold text-gray-500 uppercase">Categoría</label>
                  <select
                    value={newTicketForm.category}
                    onChange={e => setNewTicketForm({ ...newTicketForm, category: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white"
                  >
                    <option>No puedo ingresar</option>
                    <option>Una función no responde</option>
                    <option>Falla de agente IA</option>
                    <option>Lentitud o desconexión</option>
                    <option>Otro</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xxs font-bold text-gray-500 uppercase">Severidad</label>
                  <select
                    value={newTicketForm.severity}
                    onChange={e => setNewTicketForm({ ...newTicketForm, severity: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xxs font-bold text-gray-500 uppercase">Plataforma Afectada</label>
                <select
                  value={newTicketForm.platformId}
                  onChange={e => setNewTicketForm({ ...newTicketForm, platformId: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white"
                >
                  {(bookingSettings?.platforms || []).map(p => (
                    <option key={p.id} value={p.slug}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xxs font-bold text-gray-500 uppercase">Descripción Detallada</label>
                <textarea
                  required
                  rows={4}
                  value={newTicketForm.description}
                  onChange={e => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  placeholder="Detalla los pasos para reproducir la falla o mensajes de error arrojados..."
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border outline-none text-xs font-semibold focus:border-indigo-500 dark:text-white resize-none"
                />
              </div>

              {bookingSettings?.geminiConfig?.apiKey && (
                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRunAiDiagImmediately(!runAiDiagImmediately)}
                    className={clsx(
                      "w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer",
                      runAiDiagImmediately ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"
                    )}
                  >
                    <div className={clsx(
                      "bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200",
                      runAiDiagImmediately ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                  <span className="text-xxs font-bold text-gray-600 dark:text-gray-400">🤖 Ejecutar diagnóstico de IA inmediatamente</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md"
                >
                  {creatingTicket ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generar Folio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlCenter;
