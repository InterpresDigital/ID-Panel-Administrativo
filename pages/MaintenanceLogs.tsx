import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { MaintenanceLog, Client, ClientStatus } from '../types';
import { Card } from '../components/ui/Card';
import { 
  DollarSign, Plus, Search, Filter, Calendar, TrendingUp, TrendingDown, 
  CheckCircle2, AlertTriangle, Trash2, Edit3, ArrowUpRight, ArrowDownRight, 
  BarChart3, ShieldCheck, FileText, Building, Check, X, Sparkles, Cpu, Layers,
  UserCheck, Settings2, Receipt
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';
import clsx from 'clsx';

export const MaintenanceLogs: React.FC = () => {
  const { clients, updateClient, maintenanceLogs, addMaintenanceLog, updateMaintenanceLog, deleteMaintenanceLog } = useData();

  // Active Clients only (exclude Leads and Inactive)
  const activeClients = useMemo(() => {
    return clients.filter(c => c.status === ClientStatus.Active);
  }, [clients]);

  // Profile Search & Filter State
  const [profileSearchTerm, setProfileSearchTerm] = useState('');
  const [profileFeeFilter, setProfileFeeFilter] = useState<'all' | 'configured' | 'unconfigured'>('all');

  const filteredActiveClients = useMemo(() => {
    return activeClients.filter(client => {
      const nameMatch = (client.name || '').toLowerCase().includes(profileSearchTerm.toLowerCase()) ||
                        (client.companyName || '').toLowerCase().includes(profileSearchTerm.toLowerCase()) ||
                        (client.businessName || '').toLowerCase().includes(profileSearchTerm.toLowerCase());
      
      const hasFee = (client.monthlyMaintenanceFee || 0) > 0;
      let feeMatch = true;
      if (profileFeeFilter === 'configured') feeMatch = hasFee;
      if (profileFeeFilter === 'unconfigured') feeMatch = !hasFee;

      return nameMatch && feeMatch;
    });
  }, [activeClients, profileSearchTerm, profileFeeFilter]);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState('');
  const [selectedYearFilter, setSelectedYearFilter] = useState('');

  // Modal State for Monthly Consumption
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<MaintenanceLog | null>(null);

  // Modal State for Editing Client Fixed Fee
  const [editingClientFee, setEditingClientFee] = useState<Client | null>(null);
  const [clientFixedFeeInput, setClientFixedFeeInput] = useState<number | ''>('');

  // Form Fields for Monthly Consumption Log
  const [clientId, setClientId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [monthlyFee, setMonthlyFee] = useState<number>(0);
  const [actualCost, setActualCost] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [syncToFinances, setSyncToFinances] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Calculations for Form
  const numFee = Number(monthlyFee) || 0;
  const numCost = Number(actualCost) || 0;
  const computedBalance = numFee - numCost; // Positivo (A favor), Negativo (En contra)
  const computedMargin = numFee > 0 ? (numCost / numFee) * 100 : 0;

  // Handle Client Change in Log Modal to Auto-populate Fee
  const handleClientSelect = (selectedId: string) => {
    setClientId(selectedId);
    const found = clients.find(c => c.id === selectedId);
    if (found) {
      setMonthlyFee(found.monthlyMaintenanceFee || 0);
    } else {
      setMonthlyFee(0);
    }
  };

  // Open Log Modal for specific client
  const handleOpenCreateForClient = (client: Client) => {
    setEditingLog(null);
    setClientId(client.id);
    setMonthlyFee(client.monthlyMaintenanceFee || 0);
    setPeriod(new Date().toISOString().substring(0, 7));
    setActualCost('');
    setNotes('');
    setSyncToFinances(true);
    setIsModalOpen(true);
  };

  const handleOpenCreateGeneric = () => {
    setEditingLog(null);
    setClientId('');
    setMonthlyFee(0);
    setPeriod(new Date().toISOString().substring(0, 7));
    setActualCost('');
    setNotes('');
    setSyncToFinances(true);
    setIsModalOpen(true);
  };

  const handleOpenEditLog = (log: MaintenanceLog) => {
    setEditingLog(log);
    setClientId(log.clientId);
    setPeriod(log.period);
    setMonthlyFee(log.monthlyFee);
    setActualCost(log.actualCost);
    setNotes(log.notes || '');
    setSyncToFinances(log.syncToFinances);
    setIsModalOpen(true);
  };

  const resetLogForm = () => {
    setEditingLog(null);
    setClientId('');
    setMonthlyFee(0);
    setPeriod(new Date().toISOString().substring(0, 7));
    setActualCost('');
    setNotes('');
    setSyncToFinances(true);
    setIsModalOpen(false);
  };

  // Submit Monthly Log
  const handleSubmitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      alert("Por favor selecciona un cliente.");
      return;
    }
    if (!period) {
      alert("Por favor selecciona el período (Año-Mes).");
      return;
    }

    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    setSubmitting(true);
    try {
      const logData: MaintenanceLog = {
        id: editingLog ? editingLog.id : `maint_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        clientId: client.id,
        clientName: client.name,
        clientCompanyName: client.companyName || client.businessName || client.name,
        period,
        monthlyFee: numFee,
        actualCost: numCost,
        balance: computedBalance,
        marginPercentage: computedMargin,
        notes: notes.trim(),
        syncToFinances,
        expenseTransactionId: editingLog?.expenseTransactionId,
        createdAt: editingLog ? editingLog.createdAt : new Date().toISOString()
      };

      if (editingLog) {
        await updateMaintenanceLog(logData);
      } else {
        await addMaintenanceLog(logData);
      }

      resetLogForm();
    } catch (err) {
      console.error("Error al guardar consumo de mantenimiento:", err);
      alert("Ocurrió un error al guardar el registro.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Editing Fixed Fee of a Client
  const handleOpenEditFeeModal = (client: Client) => {
    setEditingClientFee(client);
    setClientFixedFeeInput(client.monthlyMaintenanceFee || '');
  };

  const handleSaveClientFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClientFee) return;

    const newFee = Number(clientFixedFeeInput) || 0;
    try {
      await updateClient({
        ...editingClientFee,
        monthlyMaintenanceFee: newFee
      });
      setEditingClientFee(null);
    } catch (err) {
      console.error("Error al actualizar cuota fija del cliente:", err);
      alert("No se pudo actualizar la cuota fija del cliente.");
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (window.confirm("¿Estás seguro de eliminar este registro? Si estaba sincronizado a Finanzas, se removerá el gasto correspondiente.")) {
      await deleteMaintenanceLog(id);
    }
  };

  // Unique Years for Filter
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    maintenanceLogs.forEach(log => {
      if (log.period) years.add(log.period.substring(0, 4));
    });
    return Array.from(years).sort().reverse();
  }, [maintenanceLogs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return maintenanceLogs.filter(log => {
      const matchesSearch = 
        log.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.clientCompanyName && log.clientCompanyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.notes && log.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesClient = !selectedClientFilter || log.clientId === selectedClientFilter;
      const matchesYear = !selectedYearFilter || log.period.startsWith(selectedYearFilter);

      return matchesSearch && matchesClient && matchesYear;
    });
  }, [maintenanceLogs, searchTerm, selectedClientFilter, selectedYearFilter]);

  // Global Financial Stats
  const stats = useMemo(() => {
    const totalFees = filteredLogs.reduce((acc, log) => acc + log.monthlyFee, 0);
    const totalCosts = filteredLogs.reduce((acc, log) => acc + log.actualCost, 0);
    const totalBalance = totalFees - totalCosts;
    const avgMargin = totalFees > 0 ? (totalCosts / totalFees) * 100 : 0;

    return { totalFees, totalCosts, totalBalance, avgMargin };
  }, [filteredLogs]);

  // Chart Data Preparation (Grouped by Period YYYY-MM)
  const chartData = useMemo(() => {
    const periodMap: Record<string, { period: string; cuota: number; consumo: number; saldo: number }> = {};
    const sorted = [...filteredLogs].sort((a, b) => a.period.localeCompare(b.period));

    sorted.forEach(log => {
      if (!periodMap[log.period]) {
        periodMap[log.period] = { period: log.period, cuota: 0, consumo: 0, saldo: 0 };
      }
      periodMap[log.period].cuota += log.monthlyFee;
      periodMap[log.period].consumo += log.actualCost;
      periodMap[log.period].saldo += log.balance;
    });

    return Object.values(periodMap);
  }, [filteredLogs]);

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-dark-surface p-6 rounded-2xl border border-gray-100 dark:border-dark-border shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Bitácora Económica de Consumos de Mantenimiento</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Configura la cuota fija mensual por cliente y captura fácilmente los consumos reales de APIs y servidores de cada mes.
          </p>
        </div>

        <button
          onClick={handleOpenCreateGeneric}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nuevo Consumo Mensual
        </button>
      </div>

      {/* KPI Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Monthly Fees */}
        <Card className="p-5 space-y-2 border-l-4 border-l-blue-500">
          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
            <span className="text-xxs font-bold uppercase tracking-wider">Cuotas Fijas Acordadas ($)</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
            ${stats.totalFees.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-400">Cuotas fijas asignadas en perfiles</p>
        </Card>

        {/* Total Actual Costs (Expenses) */}
        <Card className="p-5 space-y-2 border-l-4 border-l-rose-500">
          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
            <span className="text-xxs font-bold uppercase tracking-wider">Consumo APIs / Servidores ($ Gasto)</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-lg">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            ${stats.totalCosts.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-400">Costo real pagado en servidores y APIs</p>
        </Card>

        {/* Total Balance (Profit or Deficit) */}
        <Card className="p-5 space-y-2 border-l-4 border-l-emerald-500">
          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
            <span className="text-xxs font-bold uppercase tracking-wider">Saldo Neto (A Favor / En Contra)</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className={clsx("text-2xl font-extrabold", stats.totalBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            ${stats.totalBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-gray-400">
            {stats.totalBalance >= 0 ? '✓ Saldo acumulado a favor' : '⚠️ Déficit en consumos'}
          </p>
        </Card>

        {/* Avg Coverage */}
        <Card className="p-5 space-y-2 border-l-4 border-l-amber-500">
          <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
            <span className="text-xxs font-bold uppercase tracking-wider">Consumo / Cuota (%)</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
            {stats.avgMargin.toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-400">Proporción gastada respecto a cuotas</p>
        </Card>

      </div>

      {/* Client Maintenance Profiles Section */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 dark:border-dark-border pb-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-500" />
            Perfiles de Mantenimiento por Cliente (Cuotas Mensuales Fijas)
          </h2>
          <span className="text-xxs text-gray-400 font-semibold">
            Mostrando {filteredActiveClients.length} de {activeClients.length} Clientes Activos
          </span>
        </div>

        {/* Profiles Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre..."
              value={profileSearchTerm}
              onChange={e => setProfileSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={profileFeeFilter}
              onChange={e => setProfileFeeFilter(e.target.value as any)}
              className="bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs rounded-xl px-3 py-1.5 outline-none dark:text-white w-full sm:w-auto"
            >
              <option value="all">Todos los perfiles</option>
              <option value="configured">Con cuota fija configurada</option>
              <option value="unconfigured">Sin cuota configurada ($0)</option>
            </select>

            {(profileSearchTerm || profileFeeFilter !== 'all') && (
              <button
                onClick={() => {
                  setProfileSearchTerm('');
                  setProfileFeeFilter('all');
                }}
                className="text-xxs text-rose-500 hover:underline font-semibold cursor-pointer whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {filteredActiveClients.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">
            No se encontraron clientes que coincidan con la búsqueda o filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredActiveClients.map(client => {
            const hasFee = (client.monthlyMaintenanceFee || 0) > 0;
            return (
              <div 
                key={client.id}
                className="p-4 rounded-xl bg-gray-50/70 dark:bg-dark-bg/60 border border-gray-200/70 dark:border-dark-border space-y-3 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white line-clamp-1">
                      {client.companyName || client.name}
                    </h3>
                    <p className="text-[10px] text-gray-400">{client.name}</p>
                  </div>
                  <button
                    onClick={() => handleOpenEditFeeModal(client)}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Editar Cuota Fija Mensual"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Editar Cuota
                  </button>
                </div>

                <div className="flex justify-between items-end pt-1 border-t border-gray-200/40 dark:border-dark-border">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Cuota Fija Mensual</span>
                    <p className={clsx("text-base font-extrabold", hasFee ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400")}>
                      ${(client.monthlyMaintenanceFee || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenCreateForClient(client)}
                    className="flex items-center gap-1 text-xxs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 px-2.5 py-1.5 rounded-lg font-bold hover:bg-indigo-100 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Registrar Consumo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </Card>

      {/* Comparative Analytics Chart */}
      {chartData.length > 0 && (
        <Card className="p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-dark-border pb-3">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Estadísticas Comparativas de Mantenimiento Mes a Mes
            </h3>
            <span className="text-xxs text-gray-400 font-bold uppercase">Cuota Fija vs. Consumo Real</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  formatter={(val: any) => [`$${Number(val).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, '']}
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="cuota" name="Cuota Acordada ($)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="consumo" name="Consumo Real ($ Gasto)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saldo" name="Saldo Neto ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Filters Bar */}
      <Card className="p-4 flex flex-col md:flex-row gap-3 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente o conceptos de consumo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Client Filter */}
          <select
            value={selectedClientFilter}
            onChange={e => setSelectedClientFilter(e.target.value)}
            className="bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs rounded-xl px-3 py-2 outline-none dark:text-white"
          >
            <option value="">Todos los clientes activos</option>
            {activeClients.map(c => (
              <option key={c.id} value={c.id}>
                {c.companyName || c.name}
              </option>
            ))}
          </select>

          {/* Year Filter */}
          <select
            value={selectedYearFilter}
            onChange={e => setSelectedYearFilter(e.target.value)}
            className="bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs rounded-xl px-3 py-2 outline-none dark:text-white"
          >
            <option value="">Todos los años</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {(searchTerm || selectedClientFilter || selectedYearFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedClientFilter('');
                setSelectedYearFilter('');
              }}
              className="text-xxs text-rose-500 hover:underline font-semibold cursor-pointer"
            >
              Limpiar Filtros
            </button>
          )}
        </div>
      </Card>

      {/* Main Table / History List */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-dark-border flex justify-between items-center bg-gray-50/50 dark:bg-dark-surface">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-500" />
            Historial de Consumos y Saldos ({filteredLogs.length})
          </h2>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Cpu className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto animate-bounce" />
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">No hay consumos de mantenimiento registrados.</p>
            <p className="text-xs text-gray-400">Selecciona un cliente de arriba para registrar el consumo del mes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 dark:border-dark-border text-[10px] font-extrabold uppercase text-gray-400 tracking-wider bg-gray-50/50 dark:bg-dark-surface">
                  <th className="p-3">Período</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Cuota Fija ($)</th>
                  <th className="p-3">Consumo Real APIs ($ Gasto)</th>
                  <th className="p-3">Saldo Neto ($)</th>
                  <th className="p-3">Consumo / Cuota (%)</th>
                  <th className="p-3 text-center">Gasto en Finanzas</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border text-xs">
                {filteredLogs.map(log => {
                  const isProfit = log.balance >= 0;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-dark-surface/50 transition-colors">
                      <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {log.period}
                      </td>
                      <td className="p-3 font-semibold text-gray-900 dark:text-white">
                        {log.clientCompanyName || log.clientName}
                        {log.notes && (
                          <p className="text-[10px] text-gray-400 line-clamp-1 font-normal">{log.notes}</p>
                        )}
                      </td>
                      <td className="p-3 font-bold text-blue-600 dark:text-blue-400">
                        ${log.monthlyFee.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 font-bold text-rose-600 dark:text-rose-400">
                        ${log.actualCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={clsx("p-3 font-extrabold", isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {isProfit ? '+' : ''}${log.balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 font-semibold">
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          log.marginPercentage <= 50 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" :
                          log.marginPercentage <= 90 ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400" :
                          "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                        )}>
                          {log.marginPercentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {log.syncToFinances && log.actualCost > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Registrado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                            No Sincronizado
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditLog(log)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg cursor-pointer transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500 rounded-lg cursor-pointer transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal Registrar Consumo Mensual */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-dark-surface rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-dark-border space-y-5 animate-scale-up">
            
            <div className="flex justify-between items-center border-b pb-3 dark:border-dark-border">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-500" />
                {editingLog ? 'Editar Consumo del Mes' : 'Registrar Consumo de Mantenimiento'}
              </h3>
              <button onClick={resetLogForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitLog} className="space-y-4">
              
              {/* Select Client */}
              <div className="space-y-1">
                <label className="text-xxs font-bold text-gray-500 uppercase tracking-wider">Cliente *</label>
                <select
                  required
                  value={clientId}
                  onChange={e => handleClientSelect(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white font-semibold"
                >
                  <option value="">Selecciona un cliente activo...</option>
                  {activeClients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.companyName || c.name} ({c.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Period (YYYY-MM) */}
              <div className="space-y-1">
                <label className="text-xxs font-bold text-gray-500 uppercase tracking-wider">Período (Mes/Año) *</label>
                <input
                  required
                  type="month"
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white font-mono"
                />
              </div>

              {/* Amounts Grid */}
              <div className="grid grid-cols-2 gap-3">
                
                {/* Monthly Fee (Auto-populated from Client Profile) */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xxs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                      Cuota Fija ($)
                    </label>
                    <span className="text-[9px] text-gray-400 font-semibold">(Por Perfil)</span>
                  </div>
                  <input
                    readOnly
                    type="number"
                    value={monthlyFee}
                    className="w-full bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-2.5 text-xs font-extrabold text-blue-700 dark:text-blue-300 outline-none cursor-not-allowed"
                  />
                </div>

                {/* Actual Cost Input */}
                <div className="space-y-1">
                  <label className="text-xxs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    Consumo Real APIs ($ Gasto) *
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={actualCost}
                    onChange={e => setActualCost(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-2.5 text-xs font-bold text-rose-700 dark:text-rose-300 outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

              </div>

              {/* Live Balance Preview */}
              <div className="p-3 bg-gray-50 dark:bg-dark-bg rounded-xl border border-gray-200 dark:border-dark-border flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Saldo Resultante:</span>
                  <p className={clsx("font-extrabold text-sm", computedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {computedBalance >= 0 ? '+' : ''}${computedBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Consumo de Cuota:</span>
                  <p className="font-bold text-xs text-indigo-600 dark:text-indigo-400">
                    {computedMargin.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Notes / Concept breakdown */}
              <div className="space-y-1">
                <label className="text-xxs font-bold text-gray-500 uppercase tracking-wider">Desglose de APIs y Servidores Pagados</label>
                <textarea
                  rows={3}
                  placeholder="Ej: OpenAI \$40, Firebase \$15, Google Maps \$10..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              {/* Sync Expense Only to Finances Checkbox */}
              <label className="flex items-center gap-2 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-150/40 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncToFinances}
                  onChange={e => setSyncToFinances(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                  Registrar este consumo real únicamente como Gasto en Finanzas
                </span>
              </label>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetLogForm}
                  className="w-1/3 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-2/3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : (editingLog ? '✓ Actualizar Consumo' : '✓ Guardar Consumo')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Cuota Fija Mensual de Cliente */}
      {editingClientFee && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-dark-surface rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 dark:border-dark-border space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b pb-3 dark:border-dark-border">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-500" />
                Configurar Cuota Fija
              </h3>
              <button onClick={() => setEditingClientFee(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClientFee} className="space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">
                  {editingClientFee.companyName || editingClientFee.name}
                </p>
                <p className="text-[10px] text-gray-400">Establece la cuota que paga mensualmente este cliente</p>
              </div>

              <div className="space-y-1">
                <label className="text-xxs font-bold text-gray-500 uppercase">Cuota Mensual Fija ($ MXN)</label>
                <input
                  autoFocus
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={clientFixedFeeInput}
                  onChange={e => setClientFixedFeeInput(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl p-2.5 text-sm font-extrabold text-indigo-600 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClientFee(null)}
                  className="w-1/2 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Guardar Cuota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default MaintenanceLogs;
