import React, { useState } from 'react';
import { 
  Cloud, 
  Plus, 
  Edit2, 
  Trash2, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Briefcase, 
  Cpu, 
  Layers, 
  AlertCircle,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Card } from '../components/ui/Card';
import { useData } from '../context/DataContext';
import { SaaSPlatform, Client, ClientStatus } from '../types';
import clsx from 'clsx';

const Platforms: React.FC = () => {
  const { clients, platforms, addPlatform, updatePlatform, deletePlatform } = useData();
  
  // UI states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<SaaSPlatform | null>(null);
  const [selectedPlatformForView, setSelectedPlatformForView] = useState<SaaSPlatform | null>(null);

  // Form states
  const initialFormState: Omit<SaaSPlatform, 'id' | 'createdAt'> = {
    name: '',
    description: '',
    monthlyPrice: 0,
    status: 'Desarrollo'
  };
  const [formData, setFormData] = useState(initialFormState);

  // Calculations
  const activeClients = clients.filter(c => c.status === ClientStatus.Active);
  
  // Total MRR calculation: For each active client, look at their platformIds. 
  // Sum monthlyPrice of those platforms.
  const mrr = activeClients.reduce((total, client) => {
    if (!client.platformIds) return total;
    const clientPlatformsPrice = client.platformIds.reduce((sum, pId) => {
      const platform = platforms.find(p => p.id === pId);
      return sum + (platform ? platform.monthlyPrice : 0);
    }, 0);
    return total + clientPlatformsPrice;
  }, 0);

  // Total active subscriptions count
  const totalSubscriptions = activeClients.reduce((sum, client) => {
    return sum + (client.platformIds ? client.platformIds.length : 0);
  }, 0);

  // Get active subscribers per platform
  const getSubscribersForPlatform = (platformId: string): Client[] => {
    return clients.filter(c => c.platformIds && c.platformIds.includes(platformId));
  };

  // Prepare chart data
  const chartData = platforms.map(p => ({
    name: p.name,
    suscriptores: getSubscribersForPlatform(p.id).filter(c => c.status === ClientStatus.Active).length,
    precio: p.monthlyPrice
  })).sort((a, b) => b.suscriptores - a.suscriptores);

  // Handlers
  const handleOpenAdd = () => {
    setEditingPlatform(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (platform: SaaSPlatform) => {
    setEditingPlatform(platform);
    setFormData({
      name: platform.name,
      description: platform.description || '',
      monthlyPrice: platform.monthlyPrice,
      status: platform.status
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingPlatform) {
      await updatePlatform({
        ...editingPlatform,
        name: formData.name,
        description: formData.description,
        monthlyPrice: Number(formData.monthlyPrice),
        status: formData.status as any
      });
    } else {
      await addPlatform({
        id: 'plat_' + Math.random().toString(36).substr(2, 9),
        name: formData.name,
        description: formData.description,
        monthlyPrice: Number(formData.monthlyPrice),
        status: formData.status as any,
        createdAt: new Date().toISOString()
      });
    }

    setIsModalOpen(false);
    setFormData(initialFormState);
    setEditingPlatform(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta plataforma SaaS? Los clientes vinculados perderán su suscripción.")) {
      await deletePlatform(id);
      if (selectedPlatformForView?.id === id) {
        setSelectedPlatformForView(null);
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Plataformas SaaS</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Gestión de productos de software y facturación recurrente</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-md shadow-primary-500/10 transition-colors"
        >
          <Plus className="w-5 h-5" /> Registrar SaaS
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-20 h-20 text-emerald-500" />
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl w-fit mb-4">
            <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm uppercase">SaaS MRR</h3>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">${mrr.toLocaleString()}</div>
          <p className="text-xs text-gray-400 mt-1">Ingreso Mensual Recurrente de SaaS</p>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Users className="w-20 h-20 text-purple-500" />
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-xl w-fit mb-4">
            <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm uppercase">Suscripciones Activas</h3>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{totalSubscriptions}</div>
          <p className="text-xs text-gray-400 mt-1">Licencias activas entre todos los clientes</p>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Cpu className="w-20 h-20 text-blue-500" />
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl w-fit mb-4">
            <Cpu className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm uppercase">Plataformas SaaS</h3>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{platforms.length}</div>
          <p className="text-xs text-gray-400 mt-1">Productos de software en portafolio</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: SaaS Cards and Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart */}
          {platforms.length > 0 && (
            <Card className="p-5 flex flex-col h-[320px]">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">Licencias Activas por Producto</h3>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.1} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 11}} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 11}} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="suscriptores" name="Clientes Activos" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={25} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Platforms List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {platforms.map(platform => {
              const subs = getSubscribersForPlatform(platform.id);
              const activeSubsCount = subs.filter(c => c.status === ClientStatus.Active).length;

              return (
                <Card 
                  key={platform.id}
                  onClick={() => setSelectedPlatformForView(platform)}
                  className={clsx(
                    "cursor-pointer border-2 transition-all hover:scale-[1.01] hover:shadow-md",
                    selectedPlatformForView?.id === platform.id ? "border-primary-500 dark:border-primary-600 bg-primary-50/5 dark:bg-primary-950/5" : "border-transparent"
                  )}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl">
                      <Cloud className="w-5 h-5" />
                    </div>
                    
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wider",
                      platform.status === 'Activo' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
                      platform.status === 'Desarrollo' ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" :
                      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    )}>
                      {platform.status}
                    </span>
                  </div>

                  <h3 className="font-bold text-gray-900 dark:text-white text-base">{platform.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 h-8">{platform.description || 'Sin descripción'}</p>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-dark-border text-xs text-gray-500">
                    <div>
                      <span className="block text-[10px] text-gray-400 uppercase font-semibold">Mensualidad</span>
                      <span className="font-bold text-gray-900 dark:text-white text-sm">${platform.monthlyPrice.toLocaleString()}/mes</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 uppercase font-semibold">Suscriptores</span>
                      <span className="font-bold text-gray-900 dark:text-white text-sm">{activeSubsCount} activos</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-1.5 mt-4 pt-2 border-t border-gray-100 dark:border-dark-border" onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={() => handleOpenEdit(platform)}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(platform.id)}
                      className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right column: Subscribers view */}
        <div className="lg:col-span-1">
          {selectedPlatformForView ? (
            <Card className="h-full flex flex-col">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-dark-border pb-4 mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">{selectedPlatformForView.name}</h3>
                  <span className="text-xs text-gray-500">Lista de clientes activos asociados</span>
                </div>
                <button 
                  onClick={() => setSelectedPlatformForView(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {getSubscribersForPlatform(selectedPlatformForView.id).length > 0 ? (
                  getSubscribersForPlatform(selectedPlatformForView.id).map(client => (
                    <div 
                      key={client.id}
                      className="p-3 border border-gray-100 dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-gray-800/30 flex flex-col gap-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900 dark:text-white text-sm">{client.name}</span>
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium",
                          client.status === ClientStatus.Active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        )}>
                          {client.status === ClientStatus.Active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{client.companyName || 'Particular'}</p>
                      <p className="text-[10px] text-gray-400 border-t border-gray-100 dark:border-dark-border pt-1 mt-1">
                        Responsable: <span className="font-medium text-gray-600 dark:text-gray-300">{client.responsiblePerson}</span>
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400 gap-2">
                    <Users className="w-8 h-8 opacity-40" />
                    <span className="text-xs">No hay clientes suscritos a esta plataforma aún.</span>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400 border-dashed border-2">
              <Layers className="w-12 h-12 opacity-30 mb-2" />
              <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm">Visualizar Suscriptores</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-[200px]">Selecciona una plataforma SaaS de la lista para ver qué clientes la tienen contratada.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 no-print animate-fade-in">
          <Card className="max-w-md w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingPlatform ? 'Editar Plataforma SaaS' : 'Registrar Plataforma SaaS'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Nombre del Producto</label>
                <input 
                  required 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  placeholder="Ej. BoostApp, Human Sync AI"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" 
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Descripción</label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  placeholder="Describe las características generales o alcances de la plataforma..."
                  rows={3}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500 resize-none" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Costo Mensual (MXN)</label>
                  <input 
                    required 
                    type="number" 
                    value={formData.monthlyPrice || ''} 
                    onChange={e => setFormData({...formData, monthlyPrice: Number(e.target.value)})} 
                    placeholder="1500"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Estado</label>
                  <select 
                    value={formData.status} 
                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="Desarrollo">Desarrollo</option>
                    <option value="Activo">Activo</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-dark-border mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium shadow-md shadow-primary-500/10 transition-colors"
                >
                  Guardar Plataforma
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Platforms;
