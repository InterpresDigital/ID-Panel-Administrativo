import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  MessageCircle, 
  Mail, 
  Phone, 
  User,
  X,
  Edit2,
  Trash2,
  Save,
  FileText,
  Megaphone,
  Globe,
  Cloud,
  AlertTriangle,
  MapPin,
  Users,
  UserCheck,
  ClipboardList,
  Cpu
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Client, ClientStatus } from '../types';
import { ACQUISITION_SOURCES } from '../constants';
import clsx from 'clsx';
import { generateClientEmail } from '../services/geminiService';
import { useData } from '../context/DataContext';
import { db } from '../services/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { getAppBaseUrl } from '../utils/urlUtils';
import { bulkSyncClientsToSheet } from '../services/sheetsService';
import { syncClientToGoogleContacts, bulkSyncClientsToGoogleContacts } from '../services/googleContactsService';
import { Loader2, CheckCircle2 } from 'lucide-react';

const Clients: React.FC = () => {
  const { clients, platforms, addClient, updateClient, deleteClient, bookingSettings, updateBookingSettings } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [syncingClientId, setSyncingClientId] = useState<string | null>(null);

  // Briefings state & load
  const [briefings, setBriefings] = useState<{ id: string; clientId: string; briefingType?: string }[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'briefings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all: { id: string; clientId: string; briefingType?: string }[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        all.push({ 
          id: docSnap.id, 
          clientId: data.clientId, 
          briefingType: data.briefingType 
        });
      });
      setBriefings(all);
    }, (error) => {
      console.error("Error al cargar briefings en clientes:", error);
    });
    return () => unsubscribe();
  }, []);

  const handleBulkSync = async () => {
    if (clients.length === 0) {
      alert("No hay clientes para sincronizar.");
      return;
    }

    if (!confirm(`¿Deseas sincronizar los ${clients.length} clientes actuales con Google Sheets?`)) {
      return;
    }

    setIsSyncing(true);
    try {
      const result = await bulkSyncClientsToSheet(clients);
      alert(`Sincronización completada:\n- Éxito: ${result.success}\n- Error: ${result.failed}`);
    } catch (error) {
      console.error("Error in bulk sync", error);
      alert("Hubo un error durante la sincronización masiva.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkSyncContacts = async () => {
    if (clients.length === 0) {
      alert("No hay clientes para sincronizar.");
      return;
    }

    const googleConfig = bookingSettings?.googleConfig;
    if (!googleConfig?.enabled || !googleConfig?.connected) {
      alert("⚠️ Para sincronizar contactos, primero debes vincular tu cuenta de Google Workspace en la sección de Agenda -> Integraciones.");
      return;
    }

    if (!confirm(`¿Deseas sincronizar los ${clients.length} clientes con Google Contacts?`)) {
      return;
    }

    setIsSyncingContacts(true);
    try {
      const result = await bulkSyncClientsToGoogleContacts(clients, googleConfig, (index, total, name, success, errorMsg) => {
        console.log(`[Google Contacts Bulk Sync] ${index}/${total} - ${name}: ${success ? 'Éxito' : 'Fallo (' + errorMsg + ')'}`);
      });

      if (result.freshToken) {
        await updateBookingSettings({
          ...bookingSettings,
          googleConfig: {
            ...googleConfig,
            accessToken: result.freshToken,
            tokenObtainedAt: Date.now()
          }
        });
      }

      alert(`Sincronización de Google Contacts completada:\n- Éxito: ${result.success}\n- Error: ${result.failed}`);
    } catch (error) {
      console.error("Error in bulk sync contacts", error);
      alert("Hubo un error durante la sincronización masiva con Google Contacts.");
    } finally {
      setIsSyncingContacts(false);
    }
  };

  const handleSingleSyncContact = async (client: Client) => {
    const googleConfig = bookingSettings?.googleConfig;
    if (!googleConfig?.enabled || !googleConfig?.connected) {
      alert("⚠️ Primero debes vincular tu cuenta de Google Workspace en Agenda -> Integraciones.");
      return;
    }

    setSyncingClientId(client.id);
    try {
      const res = await syncClientToGoogleContacts(client, googleConfig);
      
      if (res.freshToken) {
        await updateBookingSettings({
          ...bookingSettings,
          googleConfig: {
            ...googleConfig,
            accessToken: res.freshToken,
            tokenObtainedAt: Date.now()
          }
        });
      }

      if (res.success && res.resourceName) {
        const updated = { ...client, googleContactResourceName: res.resourceName };
        await updateClient(updated);
        alert("✓ Contacto sincronizado exitosamente con Google Workspace.");
      } else {
        alert(`❌ No se pudo sincronizar el contacto: ${res.message}`);
      }
    } catch (error: any) {
      console.error("Error syncing single contact", error);
      alert(`Ocurrió un error al sincronizar el contacto: ${error.message || error}`);
    } finally {
      setSyncingClientId(null);
    }
  };
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Confirm Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  // Form State
  const initialFormState: Client = {
    id: '',
    name: '',
    companyName: '',
    email: '',
    phone: '',
    whatsapp: '',
    address: '',
    serviceType: '',
    responsiblePerson: '',
    contactMethod: 'Email',
    acquisitionSource: '',
    contractStartDate: new Date().toISOString().split('T')[0],
    contractEndDate: '',
    status: ClientStatus.Lead,
    notes: '',
    rfc: '',
    website: '',
    deliveryDate: '',
    platformIds: [],
    legalRepresentative: ''
  };
  const [formData, setFormData] = useState<Client>(initialFormState);

  // Email Gen State
  const [selectedClientForEmail, setSelectedClientForEmail] = useState<Client | null>(null);
  const [emailPurpose, setEmailPurpose] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

  const filteredClients = clients.filter(c => 
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.companyName && c.companyName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData({ ...initialFormState, id: crypto.randomUUID() });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      ...client,
      name: client.businessName || client.name
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData: Client = {
      ...formData,
      businessName: formData.name
    };
    if (editingClient) {
      updateClient(finalData);
    } else {
      addClient(finalData);
    }
    setIsModalOpen(false);
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Ensure click doesn't bubble up
    if (!id) {
      alert("Error: ID del cliente no válido.");
      return;
    }
    setConfirmConfig({
      isOpen: true,
      title: 'Eliminar Cliente',
      message: '¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.',
      action: async () => {
        try {
          await deleteClient(id);
        } catch (err) {
          console.error("Error al eliminar cliente:", err);
          alert("Ocurrió un error al eliminar el cliente.");
        }
      }
    });
  };

  const handleGenerateDraft = async () => {
    if (!selectedClientForEmail || !emailPurpose) return;
    setIsGeneratingEmail(true);
    const draft = await generateClientEmail(selectedClientForEmail, emailPurpose);
    setGeneratedEmail(draft);
    setIsGeneratingEmail(false);
  };

  const getContractStatus = (endDateStr?: string) => {
    if (!endDateStr) return { status: 'none', days: 0 };
    const endDate = new Date(endDateStr);
    const today = new Date();
    endDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { status: 'expired', days: Math.abs(diffDays) };
    } else if (diffDays <= 30) {
      return { status: 'expiring', days: diffDays };
    }
    return { status: 'ok', days: diffDays };
  };

  const getStatusLabel = (status: ClientStatus) => {
    switch (status) {
      case ClientStatus.Active: return 'Activo';
      case ClientStatus.Inactive: return 'Inactivo';
      case ClientStatus.Lead: return 'Prospecto';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Confirm Modal */}
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.action}
        confirmText="Sí, Eliminar"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Gestión de Clientes</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Administra relaciones, vigencias y servicios</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleBulkSyncContacts}
            disabled={isSyncingContacts}
            className={clsx(
              "flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-500/30 transition-all active:scale-95",
              isSyncingContacts && "opacity-75 cursor-not-allowed"
            )}
          >
            {isSyncingContacts ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
            {isSyncingContacts ? 'Sincronizando...' : 'Sincronizar Contactos'}
          </button>
          <button 
            onClick={handleBulkSync}
            disabled={isSyncing}
            className={clsx(
              "flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-500/30 transition-all active:scale-95",
              isSyncing && "opacity-75 cursor-not-allowed"
            )}
          >
            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Todo'}
          </button>
          <button 
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-primary-500/30 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Nuevo Cliente
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4 bg-white dark:bg-dark-surface p-2 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm max-w-md">
        <Search className="w-5 h-5 text-gray-400 ml-2" />
        <input 
          type="text" 
          placeholder="Buscar clientes o empresas..." 
          className="bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 w-full text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredClients.map(client => {
          const contractStatus = getContractStatus(client.contractEndDate);
          return (
            <Card 
              key={client.id} 
              className={clsx(
                "group relative border-t-4 hover:shadow-2xl transition-all duration-300 flex flex-col h-full",
                contractStatus.status === 'expired' ? "border-t-rose-500 bg-rose-50/5 dark:bg-rose-950/5 shadow-rose-100/50 dark:shadow-none" :
                contractStatus.status === 'expiring' ? "border-t-amber-500 bg-amber-50/5 dark:bg-amber-950/5 shadow-amber-100/50 dark:shadow-none" :
                "border-t-transparent hover:border-t-primary-500"
              )}
            >
              {contractStatus.status === 'expired' && (
                <div className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400 rounded-xl text-xxs font-bold uppercase tracking-wider justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" /> Contrato Vencido Hace {contractStatus.days} Días
                </div>
              )}
              {contractStatus.status === 'expiring' && (
                <div className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 rounded-xl text-xxs font-bold uppercase tracking-wider justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 animate-bounce" /> Vence en {contractStatus.days} Días
                </div>
              )}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300">
                    {(client.name || client.companyName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{client.name || client.companyName || 'Cliente Sin Nombre'}</h3>
                    <p className="text-sm text-gray-500">{client.companyName || 'Particular'}</p>
                    {client.legalRepresentative && (
                      <p className="text-xs text-gray-400">Representante: {client.legalRepresentative}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={clsx(
                    "px-2.5 py-1 rounded-full text-xs font-semibold",
                    client.status === ClientStatus.Active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                    client.status === ClientStatus.Inactive ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" :
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {getStatusLabel(client.status)}
                  </span>
                </div>
              </div>

            <div className="space-y-3 mb-6 flex-1">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Mail className="w-4 h-4 text-gray-400" /> {client.email}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Phone className="w-4 h-4 text-gray-400" /> {client.phone}
              </div>
              {client.whatsapp && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MessageCircle className="w-4 h-4 text-emerald-500" /> {client.whatsapp}
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="w-4 h-4 text-gray-400" /> {client.address}
                </div>
              )}
              {client.rfc && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <FileText className="w-4 h-4 text-gray-400" /> RFC: {client.rfc}
                </div>
              )}
              {client.website && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Globe className="w-4 h-4 text-gray-400" /> 
                  <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary-500">
                    {client.website}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="w-4 h-4 text-gray-400" /> Resp: {client.responsiblePerson}
              </div>
              
              {/* Nuevo Campo Visualizado */}
              {client.acquisitionSource && (
                <div className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400">
                  <Megaphone className="w-4 h-4" /> 
                  <span className="font-medium">{client.acquisitionSource}</span>
                </div>
              )}

               <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg text-xs space-y-1">
                 <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {client.serviceType}
                 </div>
                 <div className="text-gray-500 flex justify-between">
                    <span>Inicio: {client.contractStartDate}</span>
                    {client.contractEndDate && <span>Fin: {client.contractEndDate}</span>}
                 </div>
                 {client.deliveryDate && (
                    <div className="text-gray-500 border-t border-gray-100 dark:border-dark-border pt-1 mt-1 flex justify-between">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Entrega de Proyecto:</span>
                      <span>{client.deliveryDate}</span>
                    </div>
                  )}
                  {client.platformIds && client.platformIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-gray-100 dark:border-dark-border">
                      {client.platformIds.map(pId => {
                        const platform = platforms.find(p => p.id === pId);
                        if (!platform) return null;
                        return (
                          <span key={pId} className="px-2 py-0.5 bg-primary-100 text-primary-800 dark:bg-primary-950/30 dark:text-primary-400 rounded-md text-[10px] font-semibold flex items-center gap-1">
                            <Cloud className="w-3 h-3" /> {platform.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
               </div>
               {client.notes && (
                 <p className="text-xs text-gray-500 italic mt-2 line-clamp-2">"{client.notes}"</p>
               )}
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-dark-border flex items-center justify-end gap-2">
                 <button 
                  onClick={() => handleSingleSyncContact(client)}
                  disabled={syncingClientId === client.id}
                  className={clsx(
                    "p-2 rounded-lg transition-colors",
                    client.googleContactResourceName 
                      ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" 
                      : "text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  )} 
                  title={client.googleContactResourceName ? "Contacto Sincronizado en Google (Clic para volver a sincronizar)" : "Sincronizar con Google Contacts"}
                >
                  {syncingClientId === client.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : client.googleContactResourceName ? (
                    <UserCheck className="w-4 h-4" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                </button>
                 <button 
                  onClick={() => setSelectedClientForEmail(client)}
                  className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors" title="Redactar Email con IA">
                   <MessageCircle className="w-4 h-4" />
                 </button>
                 {/* Briefing Lumina Core */}
                 {(() => {
                    const hasBrief = briefings.find(
                      b => b.clientId === client.id && b.briefingType !== 'general' && b.briefingType !== 'ai-agent'
                    );
                    if (hasBrief) {
                      return (
                        <a
                          href={`/#/briefings?id=${hasBrief.id}`}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                          title="Ver Respuestas del Briefing Lumina Core"
                        >
                          <ClipboardList className="w-4 h-4" />
                        </a>
                      );
                    } else {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const origin = (typeof window !== 'undefined' && window.location) 
                              ? window.location.origin 
                              : 'https://panel.interpresdigital.com';
                            const personalUrl = `${origin}/#/briefing/lumina-core/${client.id}`;
                            navigator.clipboard.writeText(personalUrl);
                            alert(`¡Enlace personalizado de Briefing Lumina Core para ${client.name} copiado al portapapeles!\n\n${personalUrl}`);
                          }}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                          title="Copiar Enlace de Briefing Lumina Core Personalizado"
                        >
                          <ClipboardList className="w-4 h-4 opacity-50" />
                        </button>
                      );
                    }
                  })()}

                 {/* Briefing General */}
                 {(() => {
                    const hasBrief = briefings.find(b => b.clientId === client.id && b.briefingType === 'general');
                    if (hasBrief) {
                      return (
                        <a
                          href={`/#/briefings-general?id=${hasBrief.id}`}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                          title="Ver Respuestas del Briefing General"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                      );
                    } else {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const origin = (typeof window !== 'undefined' && window.location) 
                              ? window.location.origin 
                              : 'https://panel.interpresdigital.com';
                            const personalUrl = `${origin}/#/briefing/general/${client.id}`;
                            navigator.clipboard.writeText(personalUrl);
                            alert(`¡Enlace personalizado de Briefing General para ${client.name} copiado al portapapeles!\n\n${personalUrl}`);
                          }}
                          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                          title="Copiar Enlace de Briefing General Personalizado"
                        >
                          <FileText className="w-4 h-4 opacity-50" />
                        </button>
                      );
                    }
                  })()}

                 {/* Briefing IA */}
                 {(() => {
                    const hasAiBrief = briefings.find(b => b.clientId === client.id && b.briefingType === 'ai-agent');
                    if (hasAiBrief) {
                      return (
                        <a
                          href={`/#/briefings-ia?id=${hasAiBrief.id}`}
                          className="p-2 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
                          title="Ver Respuestas del Briefing IA y Cotizador"
                        >
                          <Cpu className="w-4 h-4" />
                        </a>
                      );
                    } else {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const origin = (typeof window !== 'undefined' && window.location)
                              ? window.location.origin
                              : 'https://panel.interpresdigital.com';
                            const personalUrl = `${origin}/#/briefing/ia/${client.id}`;
                            navigator.clipboard.writeText(personalUrl);
                            alert(`¡Enlace personalizado de Briefing IA para ${client.name} copiado al portapapeles!\n\n${personalUrl}`);
                          }}
                          className="p-2 text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
                          title="Copiar Enlace de Briefing IA Personalizado"
                        >
                          <Cpu className="w-4 h-4 opacity-50" />
                        </button>
                      );
                    }
                  })()}
                 <button 
                   onClick={() => handleOpenEdit(client)}
                   className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors" title="Editar">
                   <Edit2 className="w-4 h-4" />
                 </button>
                 <button 
                   onClick={(e) => handleDeleteClick(client.id, e)}
                   className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors" title="Eliminar">
                   <Trash2 className="w-4 h-4" />
                 </button>
            </div>
          </Card>
        );})}
      </div>

      {/* Add/Edit Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-dark-border pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingClient ? 'Editar Información del Cliente' : 'Nuevo Cliente'}
                </h2>
                <button onClick={() => setIsModalOpen(false)}>
                  <X className="w-6 h-6 text-gray-400 hover:text-gray-600" />
                </button>
             </div>
             
             <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {/* Basic Info */}
                   <div className="space-y-1">
                     <label className="text-xs font-semibold text-gray-500 uppercase">Nombre Comercial</label>
                     <input type="text" value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. Grupo Soch" />
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs font-semibold text-gray-500 uppercase">Razón Social</label>
                     <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. Grupo Soch Mexico S. de L.R de C.V. (Opcional)" />
                   </div>
                  
                  {/* Contact */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. correo@cliente.com" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Teléfono</label>
                    <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">WhatsApp</label>
                    <input type="tel" value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. +52 1..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">RFC del Cliente</label>
                    <input type="text" value={formData.rfc || ''} onChange={e => setFormData({...formData, rfc: e.target.value.toUpperCase()})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. ABCD123456XYZ" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Sitio Web (Cliente)</label>
                    <input type="text" value={formData.website || ''} onChange={e => setFormData({...formData, website: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. cliente.com" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Representante Legal (Cliente)</label>
                    <input type="text" value={formData.legalRepresentative || ''} onChange={e => setFormData({...formData, legalRepresentative: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. Lic. Juan Pérez" />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Dirección Comercial / Fiscal</label>
                    <input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. Av. Reforma 123, Centro" />
                  </div>

                  {/* Service & Resp */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Servicio Contratado</label>
                    <input type="text" value={formData.serviceType} onChange={e => setFormData({...formData, serviceType: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. Consultoría Digital (Opcional)" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Responsable (Interno)</label>
                    <input type="text" value={formData.responsiblePerson} onChange={e => setFormData({...formData, responsiblePerson: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" placeholder="Ej. Nombre del responsable (Opcional)" />
                  </div>
                  
                  {/* Dates */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Inicio de Contrato</label>
                    <input type="date" value={formData.contractStartDate} onChange={e => setFormData({...formData, contractStartDate: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Fin de Contrato (Opcional)</label>
                    <input type="date" value={formData.contractEndDate} onChange={e => setFormData({...formData, contractEndDate: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Fecha de Entrega (Opcional)</label>
                    <input type="date" value={formData.deliveryDate || ''} onChange={e => setFormData({...formData, deliveryDate: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  
                  {/* SaaS Platforms Checkboxes */}
                  {platforms.length > 0 && (
                    <div className="col-span-1 md:col-span-2 space-y-2 border-t border-gray-100 dark:border-dark-border pt-4 mt-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase block">Plataformas SaaS Contratadas</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {platforms.map(p => {
                          const isChecked = formData.platformIds?.includes(p.id) || false;
                          return (
                            <label 
                              key={p.id} 
                              className={clsx(
                                "flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-colors",
                                isChecked 
                                  ? "bg-primary-50/50 border-primary-200 text-primary-700 dark:bg-primary-950/20 dark:border-primary-900 dark:text-primary-300 font-semibold" 
                                  : "bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:border-dark-border dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                              )}
                            >
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const currentIds = formData.platformIds || [];
                                  let newIds: string[];
                                  if (e.target.checked) {
                                    newIds = [...currentIds, p.id];
                                  } else {
                                    newIds = currentIds.filter(id => id !== p.id);
                                  }
                                  setFormData({ ...formData, platformIds: newIds });
                                }}
                                className="w-3.5 h-3.5 accent-primary-600 rounded text-primary-600"
                              />
                              <span>{p.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Status, Method & Source */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase">Estatus</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as ClientStatus})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500">
                        <option value={ClientStatus.Active}>Activo</option>
                        <option value={ClientStatus.Inactive}>Inactivo</option>
                        <option value={ClientStatus.Lead}>Prospecto</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase">Método de Contacto</label>
                      <select value={formData.contactMethod} onChange={e => setFormData({...formData, contactMethod: e.target.value as any})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="Email">Email</option>
                        <option value="Phone">Teléfono</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="LinkedIn">LinkedIn</option>
                      </select>
                   </div>
                   
                   {/* Campo Nuevo en el Formulario */}
                   <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase">Origen del Cliente</label>
                      <select value={formData.acquisitionSource || ''} onChange={e => setFormData({...formData, acquisitionSource: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">Seleccionar...</option>
                        {ACQUISITION_SOURCES.map(source => (
                          <option key={source} value={source}>{source}</option>
                        ))}
                      </select>
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs font-semibold text-gray-500 uppercase">Notas Adicionales</label>
                   <textarea rows={3} value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" />
                </div>

                <button type="submit" className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                  <Save className="w-5 h-5" />
                  {editingClient ? 'Guardar Cambios' : 'Registrar Cliente'}
                </button>
             </form>
          </Card>
        </div>
      )}
      
      {/* Email Modal */}
      {selectedClientForEmail && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
           <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-dark-border pb-4">
               <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                 <MessageCircle className="w-5 h-5 text-primary-500" />
                 Redactar Email para {selectedClientForEmail.name}
               </h2>
               <button onClick={() => {
                 setSelectedClientForEmail(null);
                 setGeneratedEmail('');
                 setEmailPurpose('');
               }}>
                 <X className="w-6 h-6 text-gray-400 hover:text-gray-600" />
               </button>
             </div>
 
             <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Propósito del Email</label>
                  <textarea 
                     className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-xl p-3 focus:ring-2 focus:ring-primary-500 outline-none transition-all dark:text-white"
                     rows={3}
                     placeholder="Ej: Seguimiento sobre la renovación del contrato..."
                     value={emailPurpose}
                     onChange={(e) => setEmailPurpose(e.target.value)}
                  />
                </div>
 
                <button 
                  onClick={handleGenerateDraft}
                  disabled={isGeneratingEmail || !emailPurpose}
                  className="w-full bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
                >
                  {isGeneratingEmail ? 'La IA está escribiendo...' : 'Generar Borrador'}
                </button>
 
                {generatedEmail && (
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Borrador Generado</label>
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-dark-border">
                      <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-300 font-mono leading-relaxed">
                        {generatedEmail}
                      </p>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <button 
                        onClick={() => navigator.clipboard.writeText(generatedEmail)}
                        className="text-sm text-primary-600 font-medium hover:underline"
                      >
                        Copiar al Portapapeles
                      </button>
                    </div>
                  </div>
                )}
             </div>
           </Card>
         </div>
      )}
    </div>
  );
};

export default Clients;