import React, { useState } from 'react';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Briefcase, 
  Sparkles,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { Card } from '../components/ui/Card';
import { generateBusinessInsights } from '../services/geminiService';
import clsx from 'clsx';
import { useData } from '../context/DataContext';
import { TransactionType, ClientStatus } from '../types';

const StatCard = ({ title, value, subtext, icon: Icon, trend }: any) => (
  <Card className="relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
       <Icon className="w-24 h-24 text-primary-500 transform rotate-12 translate-x-4 -translate-y-4" />
    </div>
    <div className="relative z-10">
      <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl w-fit mb-4">
        <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
      </div>
      <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm uppercase tracking-wide">{title}</h3>
      <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1 mb-2">{value}</div>
      <div className={clsx("text-sm font-medium flex items-center gap-1", trend >= 0 ? "text-emerald-500" : "text-rose-500")}>
        <TrendingUp className={clsx("w-4 h-4", trend < 0 && "rotate-180")} />
        {Math.abs(trend)}% vs mes anterior
      </div>
    </div>
  </Card>
);

const Dashboard: React.FC = () => {
  const { clients, transactions, bookings } = useData();
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Calcular citas de hoy y mañana para la alerta del dashboard
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

  const todayBookings = (bookings || []).filter(b => b.date === todayStr && b.status === 'Programada');
  const tomorrowBookings = (bookings || []).filter(b => b.date === tomorrowStr && b.status === 'Programada');

  // Real calculations
  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.status === ClientStatus.Active).length;
  const totalRevenue = transactions
    .filter(t => t.type === TransactionType.Income)
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate Average Deal Size
  const incomeCount = transactions.filter(t => t.type === TransactionType.Income).length;
  const avgDeal = incomeCount > 0 ? totalRevenue / incomeCount : 0;

  // Calculate Top Clients by Revenue
  const clientRevenueMap = transactions
    .filter(t => t.type === TransactionType.Income && t.clientId)
    .reduce((acc, t) => {
      const clientName = clients.find(c => c.id === t.clientId)?.name || 'Desconocido';
      acc[clientName] = (acc[clientName] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const topClientsData = Object.entries(clientRevenueMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Top 5

  // Calculate critical/expiring contracts (within 30 days or expired)
  const criticalClients = clients
    .map(client => {
      if (!client.contractEndDate) return null;
      const endDate = new Date(client.contractEndDate);
      const today = new Date();
      endDate.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { client, diffDays };
    })
    .filter((item): item is { client: any; diffDays: number } => item !== null && item.diffDays <= 30)
    .sort((a, b) => a.diffDays - b.diffDays);

  const handleGenerateInsights = async () => {
    setLoadingInsights(true);
    const result = await generateBusinessInsights(clients, transactions);
    setInsights(result);
    setLoadingInsights(false);
  };

  // Simple aggregation for Area chart
  const areaChartData = [
    { 
      name: 'Total', 
      income: totalRevenue, 
      expense: transactions.filter(t => t.type === TransactionType.Expense).reduce((s, t) => s + t.amount, 0) 
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Panel Ejecutivo</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Visión general del rendimiento de tu negocio</p>
        </div>
        
        <button 
          onClick={handleGenerateInsights}
          disabled={loadingInsights}
          className="flex items-center gap-2 bg-gradient-to-r from-primary-600 to-primary-800 hover:from-primary-700 hover:to-primary-900 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-primary-500/20 transition-all disabled:opacity-70 no-print"
        >
          {loadingInsights ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          {insights ? 'Actualizar Insights' : 'Análisis de Negocio IA'}
        </button>
      </div>

      {/* Widget de Alerta de Videollamadas Pendientes (Hoy y Mañana) */}
      {(todayBookings.length > 0 || tomorrowBookings.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          {/* Citas de Hoy */}
          <div className={clsx(
            "p-5 rounded-2xl border transition-all space-y-3 shadow-sm",
            todayBookings.length > 0 
              ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-200" 
              : "bg-white dark:bg-gray-800 border-gray-100 dark:border-dark-border text-gray-700 dark:text-gray-300"
          )}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span>🔴 VIDEOLLAMADAS PENDIENTES HOY ({todayBookings.length})</span>
              </div>
              <span className="text-xxs font-extrabold uppercase px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                {todayStr}
              </span>
            </div>

            {todayBookings.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">No tienes videollamadas programadas para hoy.</p>
            ) : (
              <div className="space-y-2">
                {todayBookings.map(b => (
                  <div key={b.id} className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center justify-between gap-2 shadow-xs">
                    <div>
                      <div className="font-bold text-xs text-gray-900 dark:text-white">{b.clientName}</div>
                      <div className="text-xxs font-semibold text-rose-600 dark:text-rose-400">{b.startTime} - {b.endTime} CDMX | {b.platformName}</div>
                    </div>
                    {b.zoomJoinUrl && (
                      <a
                        href={b.zoomStartUrl || b.zoomJoinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xxs font-bold flex items-center gap-1 shadow-xs transition-colors flex-shrink-0"
                      >
                        <span>🎥 Unirse a Zoom</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Citas de Mañana */}
          <div className={clsx(
            "p-5 rounded-2xl border transition-all space-y-3 shadow-sm",
            tomorrowBookings.length > 0 
              ? "bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200" 
              : "bg-white dark:bg-gray-800 border-gray-100 dark:border-dark-border text-gray-700 dark:text-gray-300"
          )}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-xs">
                <span>🟡 VIDEOLLAMADAS PARA MAÑANA ({tomorrowBookings.length})</span>
              </div>
              <span className="text-xxs font-extrabold uppercase px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                {tomorrowStr}
              </span>
            </div>

            {tomorrowBookings.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">No tienes videollamadas programadas para mañana.</p>
            ) : (
              <div className="space-y-2">
                {tomorrowBookings.map(b => (
                  <div key={b.id} className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30 flex items-center justify-between gap-2 shadow-xs">
                    <div>
                      <div className="font-bold text-xs text-gray-900 dark:text-white">{b.clientName}</div>
                      <div className="text-xxs font-semibold text-amber-600 dark:text-amber-400">{b.startTime} - {b.endTime} CDMX | {b.platformName}</div>
                    </div>
                    {b.zoomJoinUrl && (
                      <a
                        href={b.zoomStartUrl || b.zoomJoinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xxs font-bold flex items-center gap-1 shadow-xs transition-colors flex-shrink-0"
                      >
                        <span>🎥 Ver Enlace Zoom</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {insights && (
        <Card className="border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white dark:bg-primary-900 rounded-full shadow-sm">
              <Sparkles className="w-6 h-6 text-primary-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Análisis Gemini</h3>
              <div 
                className="prose prose-sm prose-blue dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: insights }}
              />
            </div>
          </div>
        </Card>
      )}

      {criticalClients.length > 0 && (
        <div className="grid grid-cols-1 gap-4 animate-fade-in">
          <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-600 bg-amber-50/10 dark:bg-amber-950/10 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Alertas de Vencimiento de Contratos</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Los siguientes clientes tienen contratos que están por vencer o ya expiraron. Requieren atención inmediata.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {criticalClients.map(({ client, diffDays }) => (
                <div key={client.id} className={clsx(
                  "p-4 rounded-2xl border flex flex-col justify-between gap-3 bg-white dark:bg-dark-surface shadow-sm",
                  diffDays < 0 ? "border-rose-100 dark:border-rose-950/30" : "border-amber-100 dark:border-amber-950/30"
                )}>
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white line-clamp-1">{client.name}</span>
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0",
                        diffDays < 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      )}>
                        {diffDays < 0 ? 'Vencido' : `Vence en ${diffDays} d`}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{client.companyName || 'Particular'}</p>
                    <p className="text-[10px] text-gray-400 mt-2">Fin de Contrato: <span className="font-medium text-gray-600 dark:text-gray-300">{client.contractEndDate}</span></p>
                    {client.deliveryDate && <p className="text-[10px] text-gray-400">Fecha de Entrega: <span className="font-medium text-gray-600 dark:text-gray-300">{client.deliveryDate}</span></p>}
                  </div>
                  <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-dark-border">
                    <a 
                      href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs font-bold text-primary-500 hover:underline flex items-center gap-1"
                    >
                      Contactar por WhatsApp <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Ingresos Totales" 
          value={`$${totalRevenue.toLocaleString()}`} 
          icon={DollarSign} 
          trend={12.5}
        />
        <StatCard 
          title="Clientes Totales" 
          value={totalClients} 
          icon={Users} 
          trend={5.2}
        />
        <StatCard 
          title="Proyectos Activos" 
          value={activeClients} 
          icon={Briefcase} 
          trend={0}
        />
        <StatCard 
          title="Ticket Promedio" 
          value={`$${avgDeal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} 
          icon={TrendingUp} 
          trend={8.4}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           <Card className="h-[400px] flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Trayectoria Financiera Global</h3>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={areaChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.1} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} tickFormatter={(value) => `$${value}`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ color: '#1e293b' }}
                    />
                    <Area type="monotone" dataKey="income" name="Ingresos" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                    <Area type="monotone" dataKey="expense" name="Gastos" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
           </Card>

           {/* Top Clients Chart */}
           <Card className="h-[400px] flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Top Clientes por Facturación</h3>
              <div className="flex-1 w-full min-h-0">
                {topClientsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={topClientsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#374151" opacity={0.1} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} tick={{fill: '#9ca3af', fontSize: 12}} />
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" name="Facturación" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                   <div className="flex h-full items-center justify-center text-gray-400">
                     Falta información de clientes en transacciones
                   </div>
                )}
              </div>
           </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Actividad Reciente</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {transactions.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center", t.type === TransactionType.Income ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600')}>
                      {t.type === TransactionType.Income ? <ArrowRight className="w-5 h-5 -rotate-45" /> : <ArrowRight className="w-5 h-5 rotate-45" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-1">{t.description}</p>
                      <p className="text-xs text-gray-500">{t.date}</p>
                    </div>
                  </div>
                  <div className={clsx("font-semibold text-sm", t.type === TransactionType.Income ? 'text-emerald-600' : 'text-rose-600')}>
                    {t.type === TransactionType.Income ? '+' : '-'}${t.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;