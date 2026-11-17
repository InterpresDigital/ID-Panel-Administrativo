import React, { useState, useMemo, useEffect } from 'react';
import { 
  Clock, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Briefcase, 
  BarChart2, 
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
  User,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useData } from '../context/DataContext';
import { WorkLog, WorkLogType, Client } from '../types';
import clsx from 'clsx';
import { db } from '../services/firebase';
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';

// Date utility to format ISO date string to "DD MMM YYYY" avoiding timezone shifts
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
};

// Formats minutes to a human-readable duration (e.g. "2h 15m" or "45 min")
const formatTimeSpent = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
};

const WorkLogs: React.FC = () => {
  const { clients, addWorkLog, updateWorkLog, deleteWorkLog } = useData();

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [dateRange, setDateRange] = useState('this_month'); // this_month, last_month, all, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<WorkLog | null>(null);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  // Form states
  const [formClient, setFormClient] = useState('');
  const [formType, setFormType] = useState<WorkLogType>(WorkLogType.Development);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTitle, setFormTitle] = useState('');
  const [formHours, setFormHours] = useState<number | ''>('');
  const [formMinutes, setFormMinutes] = useState<number | ''>('');
  const [formDescription, setFormDescription] = useState('');

  // Local Pagination and Firestore state
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [pageSnapshots, setPageSnapshots] = useState<any[]>([]);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexUrl, setIndexUrl] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [allLogsCache, setAllLogsCache] = useState<WorkLog[]>([]);

  const PAGE_SIZE = 15; // Set visible logs to 15 per page

  // Expand / collapse log descriptions
  const toggleExpandLog = (id: string) => {
    const next = new Set(expandedLogIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedLogIds(next);
  };

  // Pre-populate form when opening modal for adding
  const handleOpenAdd = () => {
    setEditingLog(null);
    setFormClient(clients.length > 0 ? clients[0].id : '');
    setFormType(WorkLogType.Development);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTitle('');
    setFormHours('');
    setFormMinutes('');
    setFormDescription('');
    setIsModalOpen(true);
  };

  // Pre-populate form when opening modal for editing
  const handleOpenEdit = (log: WorkLog) => {
    setEditingLog(log);
    setFormClient(log.clientId);
    setFormType(log.type);
    setFormDate(log.date);
    setFormTitle(log.title);
    const hrs = Math.floor(log.timeSpent / 60);
    const mins = log.timeSpent % 60;
    setFormHours(hrs || '');
    setFormMinutes(mins || '');
    setFormDescription(log.description);
    setIsModalOpen(true);
  };

  // Local Cache / Fallback loading function
  const fetchFallbackLogs = async (page: number, reset: boolean) => {
    let logsToFilter = allLogsCache;
    
    if (allLogsCache.length === 0 || reset) {
      const q = query(collection(db, 'work_logs'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      const all: WorkLog[] = [];
      querySnapshot.forEach(docSnap => {
        all.push({ id: docSnap.id, ...docSnap.data() } as WorkLog);
      });
      setAllLogsCache(all);
      logsToFilter = all;
    }

    // Now filter this cache client-side with the current filters
    const filtered = logsToFilter.filter(log => {
      if (selectedClient !== 'all' && log.clientId !== selectedClient) return false;
      if (selectedType !== 'all' && log.type !== selectedType) return false;
      
      const now = new Date();
      if (dateRange === 'this_month') {
        const logTime = new Date(log.date + 'T00:00:00').getTime();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime();
        if (logTime < start || logTime > end) return false;
      } else if (dateRange === 'last_month') {
        const logTime = new Date(log.date + 'T00:00:00').getTime();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), 0).getTime();
        if (logTime < start || logTime > end) return false;
      } else if (dateRange === 'custom') {
        const logTime = new Date(log.date + 'T00:00:00').getTime();
        if (customStartDate) {
          const start = new Date(customStartDate + 'T00:00:00').getTime();
          if (logTime < start) return false;
        }
        if (customEndDate) {
          const end = new Date(customEndDate + 'T00:00:00').getTime();
          if (logTime > end) return false;
        }
      }
      return true;
    });

    let pageLogs: WorkLog[] = [];
    if (!searchQuery.trim()) {
      const startIndex = (page - 1) * PAGE_SIZE;
      pageLogs = filtered.slice(startIndex, startIndex + PAGE_SIZE);
      setHasMore(filtered.length > startIndex + PAGE_SIZE);
    } else {
      const queryStr = searchQuery.toLowerCase();
      const searched = filtered.filter(log => {
        const titleMatch = log.title.toLowerCase().includes(queryStr);
        const descMatch = log.description?.toLowerCase().includes(queryStr) || false;
        const clientNameMatch = log.clientName.toLowerCase().includes(queryStr);
        const clientCompanyMatch = log.clientCompanyName?.toLowerCase().includes(queryStr) || false;
        return titleMatch || descMatch || clientNameMatch || clientCompanyMatch;
      });
      pageLogs = searched;
      setHasMore(false);
    }

    setWorkLogs(pageLogs);
  };

  // Main fetch function with server-side pagination
  const fetchLogs = async (page: number, reset: boolean = false) => {
    setLoadingLogs(true);
    const actualPage = reset ? 1 : page;
    if (reset) {
      setCurrentPage(1);
    }

    try {
      if (!usingFallback) {
        let q = query(
          collection(db, 'work_logs'),
          orderBy('date', 'desc')
        );

        if (selectedClient !== 'all') {
          q = query(q, where('clientId', '==', selectedClient));
        }

        if (selectedType !== 'all') {
          q = query(q, where('type', '==', selectedType));
        }

        // Date bounds
        const now = new Date();
        let startStr = '';
        let endStr = '';

        if (dateRange === 'this_month') {
          startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        } else if (dateRange === 'last_month') {
          startStr = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
          endStr = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        } else if (dateRange === 'custom') {
          startStr = customStartDate;
          endStr = customEndDate;
        }

        if (startStr) {
          q = query(q, where('date', '>=', startStr));
        }
        if (endStr) {
          q = query(q, where('date', '<=', endStr));
        }

        let pageQ = q;
        if (!searchQuery.trim()) {
          pageQ = query(q, limit(PAGE_SIZE));
          if (actualPage > 1) {
            const prevCursor = reset ? null : pageSnapshots[actualPage - 2];
            if (prevCursor) {
              pageQ = query(pageQ, startAfter(prevCursor));
            }
          }
        } else {
          // If searching, load up to 100 to search client-side
          pageQ = query(q, limit(100));
        }

        const querySnapshot = await getDocs(pageQ);
        const fetchedLogs: WorkLog[] = [];
        querySnapshot.forEach(docSnap => {
          fetchedLogs.push({ id: docSnap.id, ...docSnap.data() } as WorkLog);
        });

        const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        if (lastDoc) {
          setPageSnapshots(prev => {
            const next = reset ? [] : [...prev];
            next[actualPage - 1] = lastDoc;
            return next;
          });
        }

        setWorkLogs(fetchedLogs);
        
        if (!searchQuery.trim()) {
          setHasMore(querySnapshot.docs.length === PAGE_SIZE);
        } else {
          setHasMore(false);
        }
      } else {
        await fetchFallbackLogs(actualPage, reset);
      }
    } catch (error: any) {
      console.error("Firestore Paginated Query Error:", error);
      
      // Catch missing index errors
      if (error.code === 'failed-precondition' || (error.message && error.message.includes('index'))) {
        setUsingFallback(true);
        const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
        const url = match ? match[0] : null;
        setIndexError("Esta consulta requiere un índice compuesto en Firestore.");
        setIndexUrl(url);
        
        // Load fallback logs immediately
        await fetchFallbackLogs(actualPage, true);
      } else {
        alert("Ocurrió un error al cargar la bitácora: " + error.message);
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  // Debounced search query to prevent constant firestore requests while typing
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Trigger data fetching on filter or search changes
  useEffect(() => {
    fetchLogs(1, true);
  }, [selectedClient, selectedType, dateRange, customStartDate, customEndDate, debouncedSearchQuery, usingFallback]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClient || !formTitle.trim()) return;

    const totalMinutes = (Number(formHours) * 60) + Number(formMinutes);
    if (totalMinutes <= 0) {
      alert('El tiempo invertido debe ser mayor a 0 minutos.');
      return;
    }

    const selectedClientObj = clients.find(c => c.id === formClient);
    const clientName = selectedClientObj ? selectedClientObj.name : 'Cliente desconocido';
    const clientCompanyName = selectedClientObj ? selectedClientObj.companyName : '';

    if (editingLog) {
      await updateWorkLog({
        ...editingLog,
        clientId: formClient,
        clientName,
        clientCompanyName,
        title: formTitle.trim(),
        description: formDescription.trim(),
        timeSpent: totalMinutes,
        type: formType,
        date: formDate,
      });
    } else {
      await addWorkLog({
        id: 'log_' + Math.random().toString(36).substr(2, 9),
        clientId: formClient,
        clientName,
        clientCompanyName,
        title: formTitle.trim(),
        description: formDescription.trim(),
        timeSpent: totalMinutes,
        type: formType,
        date: formDate,
        createdAt: new Date().toISOString()
      });
    }

    setIsModalOpen(false);
    fetchLogs(currentPage, true); // Refresh logs
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este registro de actividad?')) {
      await deleteWorkLog(id);
      fetchLogs(currentPage, true); // Refresh logs
    }
  };

  // Filter logs logic for client side searching
  const filteredLogs = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return workLogs;
    }
    const queryStr = debouncedSearchQuery.toLowerCase();
    return workLogs.filter(log => {
      const titleMatch = log.title.toLowerCase().includes(queryStr);
      const descMatch = log.description?.toLowerCase().includes(queryStr) || false;
      const clientNameMatch = log.clientName.toLowerCase().includes(queryStr);
      const clientCompanyMatch = log.clientCompanyName?.toLowerCase().includes(queryStr) || false;
      return titleMatch || descMatch || clientNameMatch || clientCompanyMatch;
    });
  }, [workLogs, debouncedSearchQuery]);

  // Aggregate stats based on visible logs (reactively update)
  const stats = useMemo(() => {
    let totalMinutes = 0;
    let devMinutes = 0;
    let maintMinutes = 0;
    
    filteredLogs.forEach(log => {
      totalMinutes += log.timeSpent;
      if (log.type === WorkLogType.Development) {
        devMinutes += log.timeSpent;
      } else if (log.type === WorkLogType.Maintenance) {
        maintMinutes += log.timeSpent;
      }
    });

    return {
      totalTime: totalMinutes,
      devTime: devMinutes,
      maintTime: maintMinutes,
      count: filteredLogs.length
    };
  }, [filteredLogs]);

  // Supervisor Client Breakdown (Sum of time spent per client from visible logs)
  const clientBreakdown = useMemo(() => {
    const clientMap: Record<string, { name: string; companyName?: string; minutes: number; count: number }> = {};
    
    filteredLogs.forEach(log => {
      if (!clientMap[log.clientId]) {
        clientMap[log.clientId] = {
          name: log.clientName,
          companyName: log.clientCompanyName,
          minutes: 0,
          count: 0
        };
      }
      clientMap[log.clientId].minutes += log.timeSpent;
      clientMap[log.clientId].count += 1;
    });

    return Object.entries(clientMap)
      .map(([id, info]) => ({
        id,
        ...info
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [filteredLogs]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Bítacora de Trabajo</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Supervisión, reportes y registro de horas invertidas en proyectos de clientes</p>
        </div>
        
        <button 
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-3 rounded-xl font-medium shadow-lg shadow-primary-500/20 hover:shadow-primary-700/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" /> Registrar Actividad
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="flex items-center gap-4 hover:scale-[1.02] hover:shadow-lg transition-all duration-300">
          <div className="p-3.5 bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400 rounded-2xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tiempo Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{formatTimeSpent(stats.totalTime)}</p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:scale-[1.02] hover:shadow-lg transition-all duration-300">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-2xl">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Desarrollo</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{formatTimeSpent(stats.devTime)}</p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:scale-[1.02] hover:shadow-lg transition-all duration-300">
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Mantenimiento</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{formatTimeSpent(stats.maintTime)}</p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 hover:scale-[1.02] hover:shadow-lg transition-all duration-300">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Actividades</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.count} registros</p>
          </div>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
            <input 
              type="text"
              placeholder="Buscar por título o descripción..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
            />
          </div>

          {/* Client Filter */}
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <select
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
              className="w-full py-2.5 px-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
            >
              <option value="all">Todos los clientes</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName ? `${c.companyName} (${c.name})` : c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="w-full py-2.5 px-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
            >
              <option value="all">Todos los tipos</option>
              <option value={WorkLogType.Development}>Desarrollo</option>
              <option value={WorkLogType.Maintenance}>Mantenimiento</option>
            </select>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
              className="w-full py-2.5 px-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
            >
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes anterior</option>
              <option value="all">Cualquier fecha</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </div>
        </div>

        {/* Custom date range inputs */}
        {dateRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-dark-border animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Desde:</span>
              <input 
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="py-2 px-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Hasta:</span>
              <input 
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="py-2 px-3 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
              />
            </div>
            <button
              onClick={() => {
                setCustomStartDate('');
                setCustomEndDate('');
              }}
              className="text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Limpiar rango
            </button>
          </div>
        )}
      </Card>

      {/* Index creation alert if index error occurs */}
      {indexError && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-sm">Índices de Firestore Requeridos</h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                Para un rendimiento óptimo de las consultas con filtros compuestos, se recomienda activar el índice en Firestore. Mientras tanto, se ha activado un modo de compatibilidad.
              </p>
            </div>
          </div>
          {indexUrl && (
            <a
              href={indexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-md transition-colors cursor-pointer flex-shrink-0 animate-pulse"
            >
              Crear Índice <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </Card>
      )}

      {/* Main Layout Grid (Content Left, Summary Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Side: Logs List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Registros de Actividad ({filteredLogs.length})
            </h2>
            {loadingLogs && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                Cargando...
              </div>
            )}
          </div>
          
          {filteredLogs.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron registros de bitácora</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Prueba a cambiar los filtros o registra una nueva actividad</p>
            </Card>
          ) : (
            filteredLogs.map(log => {
              const isExpanded = expandedLogIds.has(log.id);
              return (
                <Card key={log.id} className="p-5 hover:shadow-md transition-shadow relative group">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2 flex-1">
                      
                      {/* Client Header */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {log.clientCompanyName || log.clientName}
                        </span>
                        {log.clientCompanyName && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            ({log.clientName})
                          </span>
                        )}
                        <span className="text-xs text-gray-300 dark:text-gray-700">•</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(log.date)}
                        </span>
                      </div>

                      {/* Title & Badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                          {log.title}
                        </h3>
                        <span className={clsx(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border w-fit",
                          log.type === WorkLogType.Development
                            ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30"
                            : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30"
                        )}>
                          {log.type}
                        </span>
                      </div>

                      {/* Time indicator (Visual highlight) */}
                      <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-semibold text-sm">
                        <Clock className="w-4 h-4" />
                        <span>Invertido: {formatTimeSpent(log.timeSpent)}</span>
                      </div>

                      {/* Description */}
                      {log.description && (
                        <div className="pt-1">
                          <p className={clsx(
                            "text-gray-600 dark:text-gray-300 text-sm whitespace-pre-line leading-relaxed",
                            !isExpanded && "line-clamp-2"
                          )}>
                            {log.description}
                          </p>
                          {log.description.split('\n').length > 2 || log.description.length > 150 ? (
                            <button 
                              onClick={() => toggleExpandLog(log.id)}
                              className="text-xs text-primary-500 hover:text-primary-600 font-semibold mt-1.5 flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              {isExpanded ? (
                                <>Ver menos <ChevronUp className="w-3 h-3" /></>
                              ) : (
                                <>Ver más <ChevronDown className="w-3 h-3" /></>
                              )}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Actions: Edit & Delete */}
                    <div className="flex items-center gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenEdit(log)}
                        className="p-2 text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-dark-bg rounded-lg transition-colors cursor-pointer"
                        title="Editar Actividad"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(log.id)}
                        className="p-2 text-gray-400 hover:text-rose-500 hover:bg-gray-50 dark:hover:bg-dark-bg rounded-lg transition-colors cursor-pointer"
                        title="Eliminar Actividad"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                </Card>
              );
            })
          )}

          {/* Pagination Controls */}
          {!debouncedSearchQuery.trim() && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-dark-border mt-6">
              <button
                type="button"
                onClick={() => {
                  if (currentPage > 1) {
                    const prevPage = currentPage - 1;
                    setCurrentPage(prevPage);
                    fetchLogs(prevPage, false);
                  }
                }}
                disabled={currentPage === 1 || loadingLogs}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Página {currentPage}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (hasMore) {
                    const nextPage = currentPage + 1;
                    setCurrentPage(nextPage);
                    fetchLogs(nextPage, false);
                  }
                }}
                disabled={!hasMore || loadingLogs}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm cursor-pointer"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Supervisor Panel / Client Time Breakdown */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white px-1">Resumen por Cliente</h2>
          
          <Card className="p-5 space-y-5">
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 rounded-xl border border-blue-100 dark:border-blue-900/30">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                Este desglose agrupa las horas y minutos de las actividades visualizadas. Cambia los filtros (como el rango de fechas) para recalcular los reportes.
              </p>
            </div>

            {clientBreakdown.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No hay desglose disponible con los filtros actuales.
              </div>
            ) : (
              <div className="space-y-4">
                {clientBreakdown.map((item, idx) => {
                  const percentage = stats.totalTime > 0 
                    ? Math.round((item.minutes / stats.totalTime) * 100) 
                    : 0;

                  return (
                    <div key={item.id} className="space-y-1.5 pb-3 border-b border-gray-100 dark:border-dark-border last:border-0 last:pb-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">
                            {item.companyName || item.name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {item.count} actividades
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-gray-800 dark:text-gray-200">
                            {formatTimeSpent(item.minutes)}
                          </p>
                          <p className="text-xs text-primary-500 font-semibold">
                            {percentage}%
                          </p>
                        </div>
                      </div>

                      {/* Simple progress bar */}
                      <div className="w-full h-2 bg-gray-100 dark:bg-dark-bg rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary-500 rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

      </div>

      {/* Register/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl shadow-xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingLog ? 'Editar Actividad' : 'Registrar Actividad'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              
              {/* Client Selection */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formClient}
                  onChange={e => setFormClient(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                >
                  <option value="" disabled>Seleccione un cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.companyName ? `${c.companyName} (${c.name})` : c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type and Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Tipo de Actividad <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as WorkLogType)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                  >
                    <option value={WorkLogType.Development}>Desarrollo</option>
                    <option value={WorkLogType.Maintenance}>Mantenimiento / Post-Desarrollo</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Fecha <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="date"
                    required
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                  />
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Título de la Función / Tarea <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: Integración de checkout, Ajuste de estilos..."
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                />
              </div>

              {/* Time Spent Input (Hours and Minutes) */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Tiempo Invertido <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      required
                      min="0"
                      max="24"
                      value={formHours}
                      onChange={e => {
                        const val = e.target.value;
                        setFormHours(val === '' ? '' : Math.max(0, parseInt(val) || 0));
                      }}
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                    />
                    <span className="text-sm font-medium text-gray-500">horas</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      required
                      min="0"
                      max="59"
                      value={formMinutes}
                      onChange={e => {
                        const val = e.target.value;
                        setFormMinutes(val === '' ? '' : Math.max(0, Math.min(59, parseInt(val) || 0)));
                      }}
                      className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                    />
                    <span className="text-sm font-medium text-gray-500">minutos</span>
                  </div>
                </div>
              </div>

              {/* Description textarea */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Descripción Detallada (Opcional)
                </label>
                <textarea 
                  placeholder="Detalles sobre lo realizado en esta función..."
                  rows={4}
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-dark-bg dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium shadow-md shadow-primary-500/10 hover:shadow-primary-600/20 transition-all cursor-pointer"
                >
                  Guardar
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkLogs;
