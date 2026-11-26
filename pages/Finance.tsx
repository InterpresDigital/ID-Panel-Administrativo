
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Wallet,
  Settings,
  Trash2,
  X,
  Tag,
  Printer,
  Calendar,
  Filter,
  Download,
  Loader2,
  Edit2,
  CheckCircle2,
  PieChart as PieChartIcon,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Transaction, TransactionType } from '../types';
import clsx from 'clsx';
import { useData } from '../context/DataContext';
import { generateFinancialPDF } from '../utils/pdfGenerator'; // Import new module
import { bulkSyncTransactionsToSheet, syncFinancesAndTaxesToGoogleSheets } from '../services/sheetsService';

const COLORS = ['#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#6366f1'];

const CATEGORY_COLORS = [
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#84cc16', // Lime
  '#d946ef', // Fuchsia
  '#0ea5e9', // Sky
  '#eab308', // Yellow
  '#22c55e', // Green
  '#a855f7', // Purple
  '#fb7185', // Coral
  '#0284c7', // Ocean
  '#64748b', // Slate
  '#4f46e5', // Deep Indigo
  '#16a34a', // Forest
  '#ea580c', // Rust
  '#db2777', // Magenta
  '#7c3aed', // Grape
];

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year' | '2025' | 'custom';

// Local interface for form state to allow empty string in amount
interface TransactionFormState extends Omit<Transaction, 'amount'> {
  amount: number | string;
  entity: string;
  locationType: 'Nacional' | 'Internacional';
  paymentMethod: 'Efectivo' | 'Transferencia' | 'Tarjeta de Débito' | 'Tarjeta de Crédito' | 'Cuenta' | 'Otro';
}

const Finance: React.FC = () => {
  const { 
    transactions, 
    taxes,
    bookingSettings,
    addTransaction, 
    updateTransaction,
    deleteTransaction, 
    incomeCategories, 
    expenseCategories,
    addCategory,
    updateCategory,
    deleteCategory 
  } = useData();

  // --- Filter States ---
  const [filterType, setFilterType] = useState<'All' | TransactionType>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  // --- UI States ---
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false); // State for button loading
  const [showTransModal, setShowTransModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  // --- Form States ---
  const initialTransState: TransactionFormState = {
    id: '',
    date: new Date().toISOString().split('T')[0],
    amount: '', // Changed to empty string to avoid default 0
    type: TransactionType.Expense,
    category: '',
    description: '',
    entity: '',
    locationType: 'Nacional',
    paymentMethod: 'Transferencia',
  };
  const [transForm, setTransForm] = useState<TransactionFormState>(initialTransState);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>(TransactionType.Expense);
  const [editingCategoryState, setEditingCategoryState] = useState<{ type: TransactionType, oldName: string, newName: string } | null>(null);

  // --- Helpers for Date Filtering ---
  const getDateRangeLabel = () => {
    switch (dateFilter) {
      case 'today': return 'de Hoy';
      case 'week': return 'de esta Semana';
      case 'month': return 'de este Mes';
      case 'year': return 'de este Año (2026)';
      case '2025': return 'del Año 2025';
      case 'custom': return `del ${customStart} al ${customEnd}`;
      default: return 'Histórico Completo';
    }
  };

  const getFilteredDataByDate = () => {
    const today = new Date();
    today.setHours(0,0,0,0);

    return transactions.filter(t => {
      const tDate = new Date(t.date + 'T00:00:00'); // Fix timezone issues by appending time
      
      switch (dateFilter) {
        case 'today':
          return tDate.getTime() === today.getTime();
        case 'week': {
          const firstDay = new Date(today);
          firstDay.setDate(today.getDate() - today.getDay()); // Sunday
          const lastDay = new Date(today);
          lastDay.setDate(today.getDate() + (6 - today.getDay())); // Saturday
          return tDate >= firstDay && tDate <= lastDay;
        }
        case 'month':
          return tDate.getMonth() === today.getMonth() && tDate.getFullYear() === today.getFullYear();
        case 'year':
          return tDate.getFullYear() === today.getFullYear();
        case '2025':
          return tDate.getFullYear() === 2025;
        case 'custom': {
          if (!customStart || !customEnd) return true;
          const start = new Date(customStart + 'T00:00:00');
          const end = new Date(customEnd + 'T00:00:00');
          return tDate >= start && tDate <= end;
        }
        case 'all':
        default:
          return true;
      }
    });
  };

  // --- Memoized Calculations ---
  const dateFilteredTransactions = useMemo(() => getFilteredDataByDate(), [transactions, dateFilter, customStart, customEnd]);

  const totalIncome = dateFilteredTransactions.filter(t => t.type === TransactionType.Income).reduce((a, b) => a + b.amount, 0);
  const totalExpenses = dateFilteredTransactions.filter(t => t.type === TransactionType.Expense).reduce((a, b) => a + b.amount, 0);
  const netBalance = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0;
  const estimatedTax = Math.max(0, netBalance * 0.30);

  // Chart Calculations
  const chartData = useMemo(() => {
    const grouped = dateFilteredTransactions.reduce((acc, t) => {
      // If viewing 2025 or All, seeing Month-Year is useful. If viewing specific year/month, just date/month is fine.
      let key = t.date.substring(0, 7); // Default YYYY-MM
      
      if (dateFilter === 'today' || dateFilter === 'week' || dateFilter === 'custom') {
         key = t.date;
      }
      
      if (!acc[key]) acc[key] = { name: key, Income: 0, Expense: 0, Net: 0 };
      if (t.type === TransactionType.Income) acc[key].Income += t.amount;
      else acc[key].Expense += t.amount;
      acc[key].Net = acc[key].Income - acc[key].Expense;
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
  }, [dateFilteredTransactions, dateFilter]);

  const barChartData = chartData.length > 0 ? chartData : [{ name: 'Sin Datos', Income: 0, Expense: 0 }];

  const [distributionType, setDistributionType] = useState<'All' | TransactionType>(TransactionType.Expense);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const distributionFilteredTransactions = useMemo(() => {
    if (distributionType === 'All') return dateFilteredTransactions;
    return dateFilteredTransactions.filter(t => t.type === distributionType);
  }, [dateFilteredTransactions, distributionType]);

  const categoryData = useMemo(() => {
    const grouped = distributionFilteredTransactions.reduce((acc, curr) => {
      const catName = curr.category?.trim() || 'Sin Concepto';
      const existing = acc.find(i => i.name.toLowerCase() === catName.toLowerCase());
      if (existing) {
        existing.value += curr.amount;
        existing.count += 1;
      } else {
        acc.push({ name: catName, value: curr.amount, count: 1 });
      }
      return acc;
    }, [] as { name: string; value: number; count: number }[]);

    return grouped.sort((a, b) => b.value - a.value);
  }, [distributionFilteredTransactions]);

  const totalDistributionAmount = useMemo(() => {
    return categoryData.reduce((sum, item) => sum + item.value, 0);
  }, [categoryData]);

  const finalTableData = dateFilteredTransactions.filter(t => {
    if (filterType === 'All') return true;
    return t.type === filterType;
  });


  // --- Handlers ---
  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse amount to ensure it is a number
    const finalAmount = transForm.amount === '' ? 0 : Number(transForm.amount);
    
    if (editingId) {
      updateTransaction({ ...transForm, amount: finalAmount, id: editingId });
    } else {
      addTransaction({ ...transForm, amount: finalAmount, id: crypto.randomUUID() });
    }
    
    setShowTransModal(false);
    setTransForm(initialTransState);
    setEditingId(null);
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingId(t.id);
    setTransForm({
      ...t,
      amount: t.amount,
      entity: t.entity || '',
      locationType: t.locationType || 'Nacional',
      paymentMethod: t.paymentMethod || 'Transferencia'
    });
    setShowTransModal(true);
  };

  const handleDeleteTransaction = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
        isOpen: true,
        title: 'Eliminar Transacción',
        message: '¿Estás seguro de que deseas eliminar este registro financiero?',
        action: () => deleteTransaction(id)
    });
  };

  const handleAddCategory = () => {
    if (newCatName.trim()) {
      addCategory(newCatType, newCatName.trim());
      setNewCatName('');
    }
  };

  const handleUpdateCategory = () => {
    if (editingCategoryState && editingCategoryState.newName.trim()) {
      updateCategory(editingCategoryState.type, editingCategoryState.oldName, editingCategoryState.newName.trim());
      setEditingCategoryState(null);
    }
  };

  const handleDeleteCategory = (type: TransactionType, cat: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
        isOpen: true,
        title: 'Eliminar Concepto',
        message: `¿Estás seguro de que deseas eliminar la categoría "${cat}"?`,
        action: () => deleteCategory(type, cat)
    });
  }

  const [isSyncing, setIsSyncing] = useState(false);

  const handleBulkSync = async () => {
    if (transactions.length === 0) {
      alert("No hay transacciones para sincronizar.");
      return;
    }

    if (!confirm(`¿Deseas sincronizar las ${transactions.length} transacciones actuales y declaraciones fiscales con Google Sheets?`)) {
      return;
    }

    setIsSyncing(true);
    try {
      if (bookingSettings?.googleConfig?.enabled && bookingSettings?.googleConfig?.connected) {
        const res = await syncFinancesAndTaxesToGoogleSheets(bookingSettings.googleConfig, transactions, taxes || []);
        if (res.success) {
          alert(res.message);
          if (res.spreadsheetUrl && window.confirm("¿Deseas abrir la hoja de cálculo en Google Sheets ahora mismo?")) {
            window.open(res.spreadsheetUrl, '_blank');
          }
          return;
        }
      }

      // Fallback: Webhook Apps Script
      const result = await bulkSyncTransactionsToSheet(transactions);
      alert(`Sincronización vía Apps Script completada:\n- Éxito: ${result.success}\n- Error: ${result.failed}\n\nNota: Para sincronización directa en vivo a tu Google Drive, verifica tu conexión de Google Workspace en Configuración.`);
    } catch (error) {
      console.error("Error in bulk sync", error);
      alert("Hubo un error durante la sincronización masiva con Google Sheets.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportPDF = async () => {
    setIsGeneratingPdf(true);
    // Use setTimeout to ensure UI updates to loading state before heavy lifting (if any)
    setTimeout(async () => {
      try {
        await generateFinancialPDF({
          transactions: dateFilteredTransactions, // Use currently filtered data
          totalIncome,
          totalExpenses,
          netBalance,
          periodLabel: getDateRangeLabel()
        });
      } catch (error) {
        console.error("Error generating PDF", error);
        alert("Error al generar el PDF");
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 50);
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

       {/* Custom Print Header (Only for legacy print if used, but we are using module now) */}
       <div className="hidden print:block mb-8">
         <div className="flex items-center justify-between border-b-2 border-gray-900 pb-6">
            <div className="flex items-center gap-6">
               <img 
                 src="/logos/interpres-color.png?v=20261126" 
                 alt="Interpres Digital Labs Logo" 
                 className="h-12 w-auto object-contain"
               />
               <div>
                  <h1 className="text-3xl font-bold text-gray-900">Reporte Financiero</h1>
                  <p className="text-gray-500 mt-1 uppercase font-semibold text-sm">
                    Periodo: {getDateRangeLabel()}
                  </p>
               </div>
            </div>
         </div>
       </div>

       {/* Screen Header */}
       <div className="flex flex-col gap-6 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Finanzas</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Gestión de ingresos, gastos y reportes</p>
          </div>
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={handleBulkSync}
              disabled={isSyncing}
              className={clsx(
                "flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-md active:scale-95",
                isSyncing && "opacity-75 cursor-not-allowed"
              )}
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              <span className="hidden sm:inline">
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Todo'}
              </span>
            </button>
            <button 
              type="button"
              onClick={handleExportPDF}
              disabled={isGeneratingPdf}
              className={clsx(
                "flex items-center gap-2 bg-gray-800 hover:bg-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-md active:scale-95",
                isGeneratingPdf && "opacity-75 cursor-not-allowed"
              )}
            >
              {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              <span className="hidden sm:inline">
                {isGeneratingPdf ? 'Generando...' : 'Descargar PDF'}
              </span>
            </button>
            <button 
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl font-medium transition-all"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                setEditingId(null);
                setTransForm(initialTransState);
                setShowTransModal(true);
              }}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-primary-500/30 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Nueva</span>
            </button>
          </div>
        </div>

        {/* --- DATE FILTERS TOOLBAR --- */}
        <Card noPadding className="p-2 flex flex-col md:flex-row items-center gap-2 overflow-x-auto bg-gray-50 dark:bg-gray-900 border-none">
           <div className="flex items-center gap-2 px-2 text-gray-500">
             <Filter className="w-4 h-4" />
             <span className="text-xs font-bold uppercase tracking-wider">Filtrar por Fecha:</span>
           </div>
           
           <div className="flex gap-1">
              {[
                { id: 'all', label: 'Todo' },
                { id: 'today', label: 'Hoy' },
                { id: 'week', label: 'Semana' },
                { id: 'month', label: 'Este Mes' },
                { id: 'year', label: 'Este Año' },
                { id: '2025', label: '2025' }, // Added 2025 filter
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setDateFilter(filter.id as DateFilter)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                    dateFilter === filter.id 
                      ? "bg-white dark:bg-dark-surface text-primary-600 shadow-sm ring-1 ring-gray-200 dark:ring-dark-border" 
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800"
                  )}
                >
                  {filter.label}
                </button>
              ))}
              <button
                 onClick={() => setDateFilter('custom')}
                 className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 whitespace-nowrap",
                  dateFilter === 'custom'
                    ? "bg-white dark:bg-dark-surface text-primary-600 shadow-sm ring-1 ring-gray-200 dark:ring-dark-border" 
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-800"
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                Personalizado
              </button>
           </div>

           {dateFilter === 'custom' && (
             <div className="flex items-center gap-2 ml-2 animate-fade-in">
               <input 
                 type="date" 
                 value={customStart}
                 onChange={e => setCustomStart(e.target.value)}
                 className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1 text-sm dark:text-white outline-none focus:ring-1 focus:ring-primary-500"
               />
               <span className="text-gray-400">-</span>
               <input 
                 type="date" 
                 value={customEnd}
                 onChange={e => setCustomEnd(e.target.value)}
                 className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1 text-sm dark:text-white outline-none focus:ring-1 focus:ring-primary-500"
               />
             </div>
           )}
        </Card>
      </div>

      {/* Accountant Summary (Tax & Net) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white border-none shadow-xl relative overflow-hidden card-print-border">
           <div className="absolute top-0 right-0 p-8 opacity-5">
              <Wallet className="w-64 h-64" />
           </div>
           <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-8">
              <div>
                 <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Ingresos ({getDateRangeLabel()})</p>
                 <p className="text-2xl font-bold text-emerald-400">${totalIncome.toLocaleString()}</p>
              </div>
              <div>
                 <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Gastos ({getDateRangeLabel()})</p>
                 <p className="text-2xl font-bold text-rose-400">${totalExpenses.toLocaleString()}</p>
              </div>
              <div>
                 <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Beneficio Neto</p>
                 <p className="text-2xl font-bold text-white">${netBalance.toLocaleString()}</p>
                 <p className={clsx("text-xs font-medium", profitMargin > 20 ? "text-emerald-400" : "text-amber-400")}>Margen: {profitMargin.toFixed(1)}%</p>
              </div>
              <div className="border-l border-slate-700 pl-8">
                 <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Est. Impuestos (~30%)</p>
                 <p className="text-2xl font-bold text-blue-300">${estimatedTax.toLocaleString()}</p>
                 <p className="text-xs text-slate-500 mt-1">*Sobre beneficio neto</p>
              </div>
           </div>
        </Card>
      </div>

      {/* Main Charts */}
      {/* 
        CRITICAL FIXES FOR PRINTING:
        1. debounce={200}: Prevents Recharts from crashing during the layout shift to print mode.
        2. style={{ minHeight: '300px' }}: Ensures the container exists before the chart loads.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:block">
        {/* Income vs Expenses Bar */}
        <Card className="card-print-border print:mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Comparativa ({getDateRangeLabel()})</h3>
          <div className="w-full h-[300px]" style={{ minHeight: '300px' }}>
             <ResponsiveContainer width="100%" height="100%" debounce={200}>
               <BarChart data={barChartData} barSize={40}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.1} />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                 <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                 <Legend />
                 <Bar dataKey="Income" name="Ingresos" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                 <Bar dataKey="Expense" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </Card>

        {/* Net Flow Line Chart */}
        <Card className="card-print-border print:mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Tendencia Neta</h3>
          <div className="w-full h-[300px]" style={{ minHeight: '300px' }}>
             <ResponsiveContainer width="100%" height="100%" debounce={200}>
               <LineChart data={chartData.length > 0 ? chartData : [{name: 'Actual', Net: netBalance}]}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.1} />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                 <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                 <Legend />
                 <Line type="monotone" dataKey="Net" name="Beneficio Neto" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} activeDot={{r: 6}} />
               </LineChart>
             </ResponsiveContainer>
          </div>
        </Card>
      </div>
      
      {/* Distribution Chart - Redesigned without legend overflow */}
      <Card className="card-print-border print:mb-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100 dark:border-dark-border">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <PieChartIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Distribución por Concepto</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Desglose y porcentaje por categoría ({getDateRangeLabel()}) • <span className="font-semibold text-gray-700 dark:text-gray-300">{categoryData.length} conceptos activos</span>
                </p>
              </div>
            </div>
          </div>

          {/* Distribution Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-dark-bg p-1 rounded-xl no-print self-start sm:self-auto border border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={() => setDistributionType(TransactionType.Expense)}
              className={clsx(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                distributionType === TransactionType.Expense
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              Gastos
            </button>
            <button
              type="button"
              onClick={() => setDistributionType(TransactionType.Income)}
              className={clsx(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                distributionType === TransactionType.Income
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              Ingresos
            </button>
            <button
              type="button"
              onClick={() => setDistributionType('All')}
              className={clsx(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                distributionType === 'All'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              Todos
            </button>
          </div>
        </div>

        {categoryData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Donut Chart with Center KPI */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
              <div className="w-full h-[280px] relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" debounce={200}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      innerRadius={75}
                      outerRadius={110}
                      paddingAngle={categoryData.length > 1 ? 2 : 0}
                      dataKey="value"
                      onMouseEnter={(_, index) => setHoveredCategory(categoryData[index]?.name || null)}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      {categoryData.map((entry, index) => {
                        const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                        const isHovered = hoveredCategory === entry.name;
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={color} 
                            opacity={hoveredCategory ? (isHovered ? 1 : 0.35) : 1}
                            stroke={isHovered ? '#ffffff' : 'transparent'}
                            strokeWidth={isHovered ? 2 : 0}
                            className="transition-all duration-200 cursor-pointer"
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0];
                          const percentage = totalDistributionAmount > 0 
                            ? ((Number(data.value) / totalDistributionAmount) * 100).toFixed(1) 
                            : '0';
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-2xl border border-slate-700 text-xs space-y-1 z-50">
                              <div className="flex items-center gap-2 font-bold">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.payload.fill || data.color }} />
                                <span>{data.name}</span>
                              </div>
                              <div className="flex justify-between items-center gap-4 text-slate-300">
                                <span>Monto:</span>
                                <span className="font-extrabold text-white">${Number(data.value).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between items-center gap-4 text-slate-300">
                                <span>Porcentaje:</span>
                                <span className="font-extrabold text-emerald-400">{percentage}%</span>
                              </div>
                              {data.payload.count && (
                                <div className="flex justify-between items-center gap-4 text-slate-300">
                                  <span>Movimientos:</span>
                                  <span className="font-semibold text-slate-200">{data.payload.count}</span>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Donut Center KPI Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                    Total {distributionType === TransactionType.Expense ? 'Gastos' : distributionType === TransactionType.Income ? 'Ingresos' : 'Flujo'}
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    ${totalDistributionAmount.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 mt-0.5">
                    {categoryData.length} {categoryData.length === 1 ? 'concepto' : 'conceptos'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Scrollable Category Breakdown List (Strictly within Card boundaries) */}
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 pb-2 border-b border-gray-100 dark:border-dark-border">
                <span>Concepto / Participación</span>
                <span>% / Monto Total</span>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pt-2 pr-2">
                {categoryData.map((item, idx) => {
                  const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                  const percentage = totalDistributionAmount > 0 
                    ? ((item.value / totalDistributionAmount) * 100).toFixed(1) 
                    : '0';
                  const isHovered = hoveredCategory === item.name;

                  return (
                    <div
                      key={item.name}
                      onMouseEnter={() => setHoveredCategory(item.name)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={clsx(
                        "p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5",
                        isHovered 
                          ? "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800 shadow-sm scale-[1.01]" 
                          : "bg-gray-50/50 dark:bg-dark-bg/40 border-gray-150/70 dark:border-dark-border/70 hover:bg-gray-100/60 dark:hover:bg-dark-bg"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span 
                            className="w-3 h-3 rounded-full flex-shrink-0 shadow-xs" 
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                            ({item.count} {item.count === 1 ? 'mov' : 'movs'})
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-dark-border shadow-2xs">
                            {percentage}%
                          </span>
                          <span className="text-xs font-black text-gray-900 dark:text-white">
                            ${item.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Visual Mini Progress Bar */}
                      <div className="w-full bg-gray-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${Math.max(2, Number(percentage))}%`, 
                            backgroundColor: color 
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-gray-100 dark:bg-dark-bg rounded-2xl text-gray-400 mb-3">
              <PieChartIcon className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Sin transacciones registradas</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              No hay movimientos de {distributionType === TransactionType.Expense ? 'gastos' : distributionType === TransactionType.Income ? 'ingresos' : 'finanzas'} en el periodo seleccionado.
            </p>
          </div>
        )}
      </Card>

      {/* Transactions Table */}
      <Card noPadding className="overflow-hidden card-print-border">
        <div className="p-6 border-b border-gray-100 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Transacciones ({dateFilter === 'all' ? 'Todas' : getDateRangeLabel()})
          </h3>
          <div className="flex items-center gap-2 no-print">
            <button 
              onClick={() => setFilterType('All')}
              className={clsx("px-4 py-2 text-sm font-medium rounded-lg transition-colors", filterType === 'All' ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800")}
            >
              Todo
            </button>
            <button 
              onClick={() => setFilterType(TransactionType.Income)}
              className={clsx("px-4 py-2 text-sm font-medium rounded-lg transition-colors", filterType === TransactionType.Income ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800")}
            >
              Ingresos
            </button>
            <button 
              onClick={() => setFilterType(TransactionType.Expense)}
              className={clsx("px-4 py-2 text-sm font-medium rounded-lg transition-colors", filterType === TransactionType.Expense ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800")}
            >
              Gastos
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600 dark:text-gray-400">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-200 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Empresa / Persona</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4">Medio de Pago</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 w-10 no-print"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {finalTableData.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">{t.date}</td>
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{t.entity || '-'}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{t.description}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300">
                        {t.category}
                      </span>
                      {t.type === TransactionType.Expense && t.locationType === 'Internacional' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 uppercase tracking-wider">
                          Internacional
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">
                    {t.paymentMethod || '-'}
                  </td>
                  <td className={clsx("px-6 py-4 text-right font-bold", t.type === TransactionType.Income ? 'text-emerald-600' : 'text-rose-600')}>
                    {t.type === TransactionType.Income ? '+' : '-'}${t.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right no-print">
                    <div className="flex items-center justify-end gap-2">
                        <button 
                          type="button" 
                          onClick={() => handleEditTransaction(t)}
                          className="text-gray-400 hover:text-primary-500 transition-colors p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          type="button" 
                          onClick={(e) => handleDeleteTransaction(t.id, e)} 
                          className="text-gray-400 hover:text-rose-500 transition-colors p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
              {finalTableData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    No se encontraron transacciones en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Transaction Modal (Hidden on Print) */}
      {showTransModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print animate-fade-in">
          <Card className="w-full max-w-lg">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingId ? 'Editar Transacción' : 'Nueva Transacción'}
                </h2>
                <button type="button" onClick={() => setShowTransModal(false)}><X className="w-6 h-6 text-gray-400" /></button>
             </div>
             <form onSubmit={handleSaveTransaction} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Tipo</label>
                      <select 
                        value={transForm.type} 
                        onChange={e => {
                          setTransForm({...transForm, type: e.target.value as TransactionType, category: ''});
                        }} 
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                      >
                        <option value={TransactionType.Income}>Ingreso</option>
                        <option value={TransactionType.Expense}>Gasto</option>
                      </select>
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Monto</label>
                      <input 
                        required 
                        type="number" 
                        min="0"
                        step="0.01"
                        value={transForm.amount} 
                        onChange={e => setTransForm({...transForm, amount: e.target.value})} 
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none" 
                        placeholder="0.00"
                      />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Fecha</label>
                      <input 
                        required 
                        type="date" 
                        value={transForm.date} 
                        onChange={e => setTransForm({...transForm, date: e.target.value})} 
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none" 
                      />
                   </div>
                   {transForm.type === TransactionType.Expense && (
                     <div className="space-y-1">
                        <label className="text-xs uppercase font-semibold text-gray-500">Ubicación</label>
                        <select 
                          value={transForm.locationType || 'Nacional'} 
                          onChange={e => setTransForm({...transForm, locationType: e.target.value as 'Nacional' | 'Internacional'})} 
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                        >
                          <option value="Nacional">Nacional</option>
                          <option value="Internacional">Internacional</option>
                        </select>
                     </div>
                   )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Empresa / Persona</label>
                      <input 
                        type="text" 
                        placeholder="Ej: Cliente ABC, Proveedor XYZ"
                        value={transForm.entity || ''} 
                        onChange={e => setTransForm({...transForm, entity: e.target.value})} 
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none" 
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Medio de Pago</label>
                      <select 
                        value={transForm.paymentMethod || 'Transferencia'} 
                        onChange={e => setTransForm({...transForm, paymentMethod: e.target.value as any})} 
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                        <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                        <option value="Cuenta">Cuenta</option>
                        <option value="Otro">Otro</option>
                      </select>
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs uppercase font-semibold text-gray-500">Descripción</label>
                   <input 
                     required 
                     type="text" 
                     placeholder="Ej: Pago de cliente X"
                     value={transForm.description} 
                     onChange={e => setTransForm({...transForm, description: e.target.value})} 
                     className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none" 
                   />
                </div>

                <div className="space-y-1">
                   <label className="text-xs uppercase font-semibold text-gray-500">Concepto (Categoría)</label>
                   <select 
                      required
                      value={transForm.category} 
                      onChange={e => setTransForm({...transForm, category: e.target.value})} 
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                    >
                      <option value="">Seleccionar Concepto...</option>
                      {(transForm.type === TransactionType.Income ? incomeCategories : expenseCategories).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                   </select>
                   <p className="text-xs text-gray-400 mt-1">* Gestiona conceptos en el botón de configuración</p>
                </div>

                <button type="submit" className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold mt-4">
                    {editingId ? 'Guardar Cambios' : 'Guardar'}
                </button>
             </form>
          </Card>
        </div>
      )}

      {/* Category Management Modal (Hidden on Print) */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print animate-fade-in">
          <Card className="w-full max-w-lg h-[600px] flex flex-col">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-dark-border pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                   <Tag className="w-5 h-5" />
                   Gestionar Conceptos
                </h2>
                <button type="button" onClick={() => setShowCategoryModal(false)}><X className="w-6 h-6 text-gray-400" /></button>
             </div>
             
             {/* Add New */}
             <div className="flex gap-2 mb-6">
               <select 
                 value={newCatType} 
                 onChange={e => setNewCatType(e.target.value as TransactionType)}
                 className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2 text-sm dark:text-white"
               >
                 <option value={TransactionType.Income}>Ingreso</option>
                 <option value={TransactionType.Expense}>Gasto</option>
               </select>
               <input 
                 type="text" 
                 placeholder="Nuevo concepto..." 
                 value={newCatName}
                 onChange={e => setNewCatName(e.target.value)}
                 className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2 text-sm dark:text-white"
               />
               <button onClick={handleAddCategory} className="bg-primary-600 text-white px-4 rounded-lg font-medium hover:bg-primary-700 transition-colors">Agregar</button>
             </div>

             <div className="flex-1 overflow-y-auto space-y-6 pr-2">
               <div>
                 <h4 className="text-sm font-bold text-emerald-600 mb-2 uppercase tracking-wide">Conceptos de Ingreso</h4>
                 <div className="space-y-2">
                   {incomeCategories.map(cat => (
                     <div key={cat} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group">
                       {editingCategoryState?.oldName === cat && editingCategoryState?.type === TransactionType.Income ? (
                         <div className="flex items-center gap-2 w-full">
                           <input 
                             autoFocus
                             type="text" 
                             value={editingCategoryState.newName}
                             onChange={e => setEditingCategoryState({...editingCategoryState, newName: e.target.value})}
                             className="flex-1 bg-white dark:bg-dark-surface border border-primary-500 rounded px-2 py-1 text-sm dark:text-white outline-none"
                           />
                           <button onClick={handleUpdateCategory} className="text-emerald-600 hover:text-emerald-700 p-1"><CheckCircle2 className="w-4 h-4" /></button>
                           <button onClick={() => setEditingCategoryState(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4" /></button>
                         </div>
                       ) : (
                         <>
                           <span className="text-sm dark:text-gray-300">{cat}</span>
                           <div className="flex items-center gap-1">
                             <button 
                               type="button"
                               onClick={() => setEditingCategoryState({ type: TransactionType.Income, oldName: cat, newName: cat })}
                               className="text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 p-1.5 rounded-full transition-colors"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               type="button"
                               onClick={(e) => handleDeleteCategory(TransactionType.Income, cat, e)} 
                               className="text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 p-1.5 rounded-full transition-colors"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                         </>
                       )}
                     </div>
                   ))}
                 </div>
               </div>

               <div>
                 <h4 className="text-sm font-bold text-rose-600 mb-2 uppercase tracking-wide">Conceptos de Gasto</h4>
                 <div className="space-y-2">
                   {expenseCategories.map(cat => (
                     <div key={cat} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group">
                       {editingCategoryState?.oldName === cat && editingCategoryState?.type === TransactionType.Expense ? (
                         <div className="flex items-center gap-2 w-full">
                           <input 
                             autoFocus
                             type="text" 
                             value={editingCategoryState.newName}
                             onChange={e => setEditingCategoryState({...editingCategoryState, newName: e.target.value})}
                             className="flex-1 bg-white dark:bg-dark-surface border border-primary-500 rounded px-2 py-1 text-sm dark:text-white outline-none"
                           />
                           <button onClick={handleUpdateCategory} className="text-emerald-600 hover:text-emerald-700 p-1"><CheckCircle2 className="w-4 h-4" /></button>
                           <button onClick={() => setEditingCategoryState(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4" /></button>
                         </div>
                       ) : (
                         <>
                           <span className="text-sm dark:text-gray-300">{cat}</span>
                           <div className="flex items-center gap-1">
                             <button 
                               type="button"
                               onClick={() => setEditingCategoryState({ type: TransactionType.Expense, oldName: cat, newName: cat })}
                               className="text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 p-1.5 rounded-full transition-colors"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               type="button"
                               onClick={(e) => handleDeleteCategory(TransactionType.Expense, cat, e)} 
                               className="text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 p-1.5 rounded-full transition-colors"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                         </>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
             </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Finance;




