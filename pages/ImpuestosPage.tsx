import React, { useState } from 'react';
import { 
  FileCheck, 
  Plus, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  X,
  Edit2,
  Trash2,
  Filter,
  Download,
  Loader2
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useData } from '../context/DataContext';
import { TaxRecord, TaxPeriodType, TaxStatus } from '../types';
import { TAX_CATEGORIES } from '../constants';
import clsx from 'clsx';
import { generateTaxPDF } from '../utils/pdfGenerator';

// Local interface to allow empty string in amount for better UX
interface TaxFormState extends Omit<TaxRecord, 'amount'> {
  amount: number | string;
}

const Taxes: React.FC = () => {
  const { taxes, addTaxRecord, updateTaxRecord, deleteTaxRecord } = useData();
  
  // Filters - Default to 2026 as requested
  const [yearFilter, setYearFilter] = useState<string>('2026');
  const [typeFilter, setTypeFilter] = useState<'All' | TaxPeriodType>('All');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const initialForm: TaxFormState = {
    id: '',
    type: 'Monthly',
    periodLabel: '2026-01', // Default to Jan 2026
    amount: '', // Start empty to remove default '0'
    status: 'Pending',
    category: TAX_CATEGORIES[0],
    notes: ''
  };
  const [formData, setFormData] = useState<TaxFormState>(initialForm);

  // Confirm Delete
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({ isOpen: false, title: '', message: '', action: () => {} });

  // --- Filtering Logic ---
  const filteredTaxes = taxes.filter(t => {
    // Check Year
    const recordYear = t.type === 'Monthly' ? t.periodLabel.substring(0, 4) : t.periodLabel;
    if (yearFilter !== 'All' && recordYear !== yearFilter) return false;
    
    // Check Type
    if (typeFilter !== 'All' && t.type !== typeFilter) return false;

    return true;
  });

  // --- Stats Calculations ---
  const totalPaid = filteredTaxes.filter(t => t.status === 'Paid').reduce((sum, t) => sum + t.amount, 0);
  const totalPending = filteredTaxes.filter(t => t.status === 'Pending').reduce((sum, t) => sum + t.amount, 0);
  const pendingCount = filteredTaxes.filter(t => t.status === 'Pending').length;

  // --- Handlers ---
  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ 
      ...initialForm, 
      id: crypto.randomUUID(),
      periodLabel: '2026-01' // Ensure defaults to 2026
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: TaxRecord) => {
    setEditingId(record.id);
    setFormData(record);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse amount
    const finalAmount = formData.amount === '' ? 0 : Number(formData.amount);
    const finalData: TaxRecord = { ...formData, amount: finalAmount };
    
    if (editingId) {
      updateTaxRecord(finalData);
    } else {
      addTaxRecord(finalData);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Eliminar Registro',
      message: '¿Estás seguro de eliminar este registro de impuestos?',
      action: () => deleteTaxRecord(id)
    });
  };

  const handleExportPDF = async () => {
      setIsGeneratingPdf(true);
      setTimeout(async () => {
        try {
          await generateTaxPDF({
            taxes: filteredTaxes,
            totalPaid,
            totalPending,
            periodLabel: yearFilter === 'All' ? 'Histórico Completo' : `Año ${yearFilter}`
          });
        } catch (error) {
          console.error("Error generating Tax PDF", error);
          alert("Error al generar el reporte PDF");
        } finally {
          setIsGeneratingPdf(false);
        }
      }, 50);
    };

  // --- Helpers ---
  const formatPeriod = (label: string, type: TaxPeriodType) => {
    if (type === 'Annual') return `Ejercicio ${label}`;
    // Assume YYYY-MM
    const [year, month] = label.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  };

  const getYearsList = () => {
    // Explicitly start with 2026 and 2025
    const years = new Set<string>(['2026', '2025']);
    
    taxes.forEach(t => {
        const y = t.type === 'Monthly' ? t.periodLabel.substring(0, 4) : t.periodLabel;
        years.add(y);
    });
    return Array.from(years).sort().reverse();
  };

  return (
    <div className="space-y-6">
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.action}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Impuestos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Control de declaraciones mensuales y anuales</p>
        </div>
        <div className="flex gap-2">
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
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-primary-500/30 transition-all active:scale-95"
            >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Registrar</span>
            </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-none shadow-lg">
           <div className="flex items-start justify-between">
              <div>
                 <p className="text-emerald-100 font-medium text-sm uppercase tracking-wider">Pagado ({yearFilter === 'All' ? 'Histórico' : yearFilter})</p>
                 <h3 className="text-3xl font-bold mt-2">${totalPaid.toLocaleString()}</h3>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
           </div>
           <div className="mt-4 text-emerald-100 text-sm">Impuestos liquidados</div>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-none shadow-lg">
           <div className="flex items-start justify-between">
              <div>
                 <p className="text-amber-100 font-medium text-sm uppercase tracking-wider">Pendiente de Pago</p>
                 <h3 className="text-3xl font-bold mt-2">${totalPending.toLocaleString()}</h3>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
           </div>
           <div className="mt-4 text-amber-100 text-sm">{pendingCount} declaraciones pendientes</div>
        </Card>

        <Card className="bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border">
            <div className="flex items-start justify-between">
               <div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm uppercase tracking-wider">Próximo Vencimiento</p>
                  <h3 className="text-xl font-bold mt-2 text-gray-900 dark:text-white">17 de Cada Mes</h3>
               </div>
               <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                 <Calendar className="w-6 h-6 text-primary-600 dark:text-primary-400" />
               </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
               Fecha límite estándar para declaraciones mensuales (México).
            </div>
        </Card>
      </div>

      {/* Filters & List */}
      <Card noPadding className="overflow-hidden">
         <div className="p-5 border-b border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-gray-800/30 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-semibold uppercase">Filtros:</span>
            </div>
            
            <select 
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none dark:text-white"
            >
              <option value="All">Todos los Años</option>
              {getYearsList().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <div className="flex gap-1 p-1 bg-gray-200 dark:bg-dark-border rounded-lg">
               <button 
                 onClick={() => setTypeFilter('All')}
                 className={clsx("px-3 py-1 text-xs font-medium rounded-md transition-all", typeFilter === 'All' ? "bg-white dark:bg-dark-surface shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700")}
               >
                 Todo
               </button>
               <button 
                 onClick={() => setTypeFilter('Monthly')}
                 className={clsx("px-3 py-1 text-xs font-medium rounded-md transition-all", typeFilter === 'Monthly' ? "bg-white dark:bg-dark-surface shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700")}
               >
                 Mensuales
               </button>
               <button 
                 onClick={() => setTypeFilter('Annual')}
                 className={clsx("px-3 py-1 text-xs font-medium rounded-md transition-all", typeFilter === 'Annual' ? "bg-white dark:bg-dark-surface shadow text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700")}
               >
                 Anuales
               </button>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
               <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 font-semibold uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4">Periodo</th>
                    <th className="px-6 py-4">Concepto</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Fecha Pago</th>
                    <th className="px-6 py-4 text-right">Monto</th>
                    <th className="px-6 py-4"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                 {filteredTaxes.map((tax) => (
                   <tr key={tax.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white capitalize">
                        {formatPeriod(tax.periodLabel, tax.type)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs border border-gray-200 dark:border-gray-700">
                          {tax.category}
                        </span>
                        {tax.notes && <p className="text-xs text-gray-400 mt-1">{tax.notes}</p>}
                      </td>
                      <td className="px-6 py-4">
                         {tax.status === 'Paid' ? (
                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                             <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                           </span>
                         ) : (
                           <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                             <AlertCircle className="w-3.5 h-3.5" /> Pendiente
                           </span>
                         )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {tax.status === 'Paid' && tax.paymentDate ? tax.paymentDate : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                        ${tax.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <button onClick={() => handleOpenEdit(tax)} className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                             <Edit2 className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleDelete(tax.id)} className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors">
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                   </tr>
                 ))}
                 {filteredTaxes.length === 0 && (
                   <tr>
                     <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        No hay registros fiscales para los filtros seleccionados.
                     </td>
                   </tr>
                 )}
               </tbody>
            </table>
         </div>
      </Card>

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-lg">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-dark-border pb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingId ? 'Editar Registro' : 'Nuevo Registro Fiscal'}
                </h2>
                <button type="button" onClick={() => setIsModalOpen(false)}><X className="w-6 h-6 text-gray-400" /></button>
             </div>
             
             <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Type Selection */}
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Tipo Declaración</label>
                      <select 
                        value={formData.type} 
                        onChange={e => {
                          const newType = e.target.value as TaxPeriodType;
                          // Reset period format when switching type
                          const newPeriod = newType === 'Monthly' 
                             ? '2026-01' 
                             : '2026';
                          
                          setFormData({...formData, type: newType, periodLabel: newPeriod});
                        }} 
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                      >
                        <option value="Monthly">Mensual</option>
                        <option value="Annual">Anual</option>
                      </select>
                   </div>
                   
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Periodo</label>
                      {formData.type === 'Monthly' ? (
                        <input 
                          type="month" 
                          required
                          value={formData.periodLabel}
                          onChange={e => setFormData({...formData, periodLabel: e.target.value})}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                        />
                      ) : (
                        <input 
                          type="number" 
                          min="2000"
                          max="2099"
                          step="1"
                          required
                          value={formData.periodLabel}
                          onChange={e => setFormData({...formData, periodLabel: e.target.value})}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                        />
                      )}
                   </div>
                </div>

                <div className="space-y-1">
                   <label className="text-xs uppercase font-semibold text-gray-500">Concepto / Impuesto</label>
                   <select 
                      value={formData.category}
                      onChange={e => setFormData({...formData, category: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                   >
                     {TAX_CATEGORIES.map(cat => (
                       <option key={cat} value={cat}>{cat}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1">
                   <label className="text-xs uppercase font-semibold text-gray-500">Monto a Pagar</label>
                   <input 
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={e => setFormData({...formData, amount: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none font-bold"
                      placeholder="0.00"
                   />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                   <div className="space-y-1">
                      <label className="text-xs uppercase font-semibold text-gray-500">Estado</label>
                      <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                         <button
                           type="button"
                           onClick={() => setFormData({...formData, status: 'Pending', paymentDate: undefined})}
                           className={clsx("flex-1 py-2 text-sm font-medium rounded-md transition-all", formData.status === 'Pending' ? "bg-white dark:bg-dark-surface shadow text-amber-600" : "text-gray-500")}
                         >
                           Pendiente
                         </button>
                         <button
                           type="button"
                           onClick={() => setFormData({...formData, status: 'Paid', paymentDate: new Date().toISOString().split('T')[0]})}
                           className={clsx("flex-1 py-2 text-sm font-medium rounded-md transition-all", formData.status === 'Paid' ? "bg-white dark:bg-dark-surface shadow text-emerald-600" : "text-gray-500")}
                         >
                           Pagado
                         </button>
                      </div>
                   </div>

                   {formData.status === 'Paid' && (
                     <div className="space-y-1 animate-fade-in">
                        <label className="text-xs uppercase font-semibold text-gray-500">Fecha de Pago</label>
                        <input 
                          type="date"
                          required
                          value={formData.paymentDate || ''}
                          onChange={e => setFormData({...formData, paymentDate: e.target.value})}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                        />
                     </div>
                   )}
                </div>

                <div className="space-y-1">
                   <label className="text-xs uppercase font-semibold text-gray-500">Notas (Opcional)</label>
                   <textarea 
                     rows={2}
                     value={formData.notes || ''}
                     onChange={e => setFormData({...formData, notes: e.target.value})}
                     className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-dark-border rounded-lg p-2.5 text-sm dark:text-white outline-none"
                   />
                </div>

                <button type="submit" className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold mt-4">
                  Guardar Registro
                </button>
             </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Taxes;
