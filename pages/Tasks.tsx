
import React, { useState, useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths, 
  isToday,
  parseISO,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  CheckCircle2, 
  Circle, 
  AlertCircle,
  MoreVertical,
  Trash2,
  Edit2
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { Task, TaskStatus } from '../types';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import clsx from 'clsx';

// --- Google Calendar Helper ---
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

const Tasks: React.FC = () => {
  const { tasks, clients, addTask, updateTask, deleteTask } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);

  // Load Google Identity Services script
  React.useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGapiLoaded(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    }
  }, []);

  const syncTasksWithCalendar = async (accessToken: string) => {
    try {
      // 1. Fetch upcoming events from Google Calendar
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + (new Date()).toISOString() + '&showDeleted=false&singleEvents=true&maxResults=10&orderBy=startTime', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.error) {
        console.error("Google API Error:", data.error);
        alert(`Error de Google Calendar: ${data.error.message || 'Error desconocido'}. Asegúrate de que la API de Google Calendar esté habilitada en tu proyecto de Google Cloud.`);
        return;
      }

      if (data.items) {
        let importedCount = 0;
        data.items.forEach((event: any) => {
          // Check if task already exists (by googleEventId)
          const exists = tasks.some(t => t.googleEventId === event.id);
          if (!exists && event.start && event.end) {
            const startDate = event.start.dateTime || event.start.date;
            const endDate = event.end.dateTime || event.end.date;
            
            const newTask: Task = {
              id: crypto.randomUUID(),
              title: event.summary || '(Sin título)',
              description: event.description || '',
              startDate: format(parseISO(startDate), 'yyyy-MM-dd'),
              startTime: startDate.includes('T') ? format(parseISO(startDate), 'HH:mm') : '09:00',
              endDate: format(parseISO(endDate), 'yyyy-MM-dd'),
              endTime: endDate.includes('T') ? format(parseISO(endDate), 'HH:mm') : '10:00',
              status: TaskStatus.ToDo,
              googleEventId: event.id
            };
            addTask(newTask);
            importedCount++;
          }
        });
        
        if (importedCount > 0) {
          alert(`Se han importado ${importedCount} eventos de tu Google Calendar.`);
        } else {
          alert("Sincronización completada. No se encontraron nuevos eventos para importar.");
        }
      }
    } catch (error) {
      console.error("Error syncing with Google Calendar:", error);
      alert("Hubo un error al sincronizar con Google Calendar.");
    }
  };

  const handleGoogleSync = () => {
    // Use Vite env var or fallback to hardcoded ID
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '526151535596-clb9r4mjnbq3604v6u4k0amhdpjuhfv0.apps.googleusercontent.com';
    
    if (!clientId) {
      alert("⚠️ Configuración requerida:\n\nPara conectar tu cuenta de Google, necesitas crear un 'ID de Cliente OAuth' en Google Cloud Console.\n\n1. Ve a console.cloud.google.com\n2. Crea un proyecto y habilita la 'Google Calendar API'\n3. Crea credenciales OAuth (Aplicación Web)\n4. Agrega 'http://localhost:3000' y tu dominio de Firebase a los orígenes autorizados.\n5. Copia el Client ID y agrégalo a tu archivo .env así:\n\nVITE_GOOGLE_CLIENT_ID=tu-client-id-aqui");
      return;
    }

    if (!isGapiLoaded || !window.google) {
      alert("El servicio de conexión con Google está cargando. Por favor intenta en unos segundos.");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          console.error("Google OAuth Error:", tokenResponse);
          alert(`Error de autorización: ${tokenResponse.error}`);
          return;
        }
        if (tokenResponse && tokenResponse.access_token) {
          syncTasksWithCalendar(tokenResponse.access_token);
        } else {
          alert("No se pudo obtener el token de acceso.");
        }
      },
    });

    tokenClient.requestAccessToken();
  };

  // Form State
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    clientId: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    status: TaskStatus;
  }>({
    title: '',
    description: '',
    clientId: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endDate: format(new Date(), 'yyyy-MM-dd'),
    endTime: '10:00',
    status: TaskStatus.ToDo
  });

  // Calendar Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const selectedDateTasks = useMemo(() => {
    if (!selectedDate) return [];
    return tasks.filter(task => {
      const taskStart = parseISO(task.startDate);
      const taskEnd = parseISO(task.endDate);
      // Check if selected date is within the task range
      return (isSameDay(selectedDate, taskStart) || isSameDay(selectedDate, taskEnd) || (selectedDate > taskStart && selectedDate < taskEnd));
    });
  }, [selectedDate, tasks]);

  // Handlers
  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setFormData(prev => ({ 
      ...prev, 
      startDate: format(day, 'yyyy-MM-dd'),
      endDate: format(day, 'yyyy-MM-dd')
    }));
  };

  const openAddModal = () => {
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      clientId: '',
      startDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00',
      endDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      endTime: '10:00',
      status: TaskStatus.ToDo
    });
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      clientId: task.clientId || '',
      startDate: task.startDate,
      startTime: task.startTime || '09:00',
      endDate: task.endDate,
      endTime: task.endTime || '10:00',
      status: task.status
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newTask: Task = {
      id: editingTask ? editingTask.id : crypto.randomUUID(),
      title: formData.title,
      description: formData.description,
      clientId: formData.clientId || undefined,
      startDate: formData.startDate,
      startTime: formData.startTime,
      endDate: formData.endDate,
      endTime: formData.endTime,
      status: formData.status
    };

    if (editingTask) {
      updateTask(newTask);
    } else {
      addTask(newTask);
    }
    setIsModalOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteTask(deleteId);
      setDeleteId(null);
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.ToDo: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
      case TaskStatus.InProgress: return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case TaskStatus.Done: return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.ToDo: return <Circle className="w-4 h-4" />;
      case TaskStatus.InProgress: return <Clock className="w-4 h-4" />;
      case TaskStatus.Done: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendario de Tareas</h1>
          <p className="text-gray-500 dark:text-gray-400">Gestiona tus actividades y pendientes</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleGoogleSync}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" alt="Google Calendar" className="w-5 h-5" />
            Sincronizar
          </button>
          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors shadow-lg shadow-primary-500/30 text-sm font-medium"
          >
            <Plus className="w-5 h-5" />
            Nueva Tarea
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: es })}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors">
                  Hoy
                </button>
                <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                <div key={day} className="bg-gray-50 dark:bg-dark-surface p-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
              
              {calendarDays.map((day, idx) => {
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const dayTasks = tasks.filter(t => {
                   const taskStart = parseISO(t.startDate);
                   const taskEnd = parseISO(t.endDate);
                   return (isSameDay(day, taskStart) || isSameDay(day, taskEnd) || (day > taskStart && day < taskEnd));
                });
                const isTodayDate = isToday(day);

                return (
                  <div 
                    key={idx}
                    onClick={() => handleDayClick(day)}
                    className={clsx(
                      "min-h-[100px] bg-white dark:bg-dark-surface p-2 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 relative group",
                      !isCurrentMonth && "bg-gray-50/50 dark:bg-dark-bg/50 text-gray-400",
                      isSelected && "ring-2 ring-inset ring-primary-500 z-10"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <span className={clsx(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        isTodayDate 
                          ? "bg-primary-600 text-white" 
                          : "text-gray-700 dark:text-gray-300"
                      )}>
                        {format(day, 'd')}
                      </span>
                      {dayTasks.length > 0 && (
                        <span className="text-xs font-bold text-gray-400">{dayTasks.length}</span>
                      )}
                    </div>
                    
                    <div className="mt-2 space-y-1">
                      {dayTasks.slice(0, 3).map(task => (
                        <div key={task.id} className={clsx("text-[10px] px-1.5 py-0.5 rounded truncate", getStatusColor(task.status))}>
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-[10px] text-gray-400 pl-1">
                          + {dayTasks.length - 3} más
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Task List / Details */}
        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <div className="mb-4 pb-4 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedDate ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : 'Selecciona una fecha'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {selectedDateTasks.length} tareas programadas
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {selectedDateTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                  <CalendarIcon className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">No hay tareas para este día</p>
                  <button onClick={openAddModal} className="mt-2 text-primary-600 hover:underline text-sm">
                    Crear tarea
                  </button>
                </div>
              ) : (
                selectedDateTasks.map(task => (
                  <div key={task.id} className="group p-3 rounded-xl border border-gray-100 dark:border-dark-border hover:border-primary-200 dark:hover:border-primary-900/50 bg-gray-50 dark:bg-dark-bg/50 hover:bg-white dark:hover:bg-dark-surface transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div className={clsx("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium", getStatusColor(task.status))}>
                        {getStatusIcon(task.status)}
                        {task.status}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(task)} className="p-1.5 text-gray-400 hover:text-primary-500 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(task.id)} className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    
                    <h4 className="font-medium text-gray-900 dark:text-white mb-1">{task.title}</h4>
                    
                    {task.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.startTime} - {task.endTime}
                      </div>
                      {task.clientId && (
                        <div className="flex items-center gap-1 max-w-[120px] truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          {clients.find(c => c.id === task.clientId)?.name || 'Cliente desconocido'}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingTask ? 'Editar Tarea' : 'Nueva Tarea'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  placeholder="Ej: Reunión de seguimiento"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={e => setFormData({...formData, startDate: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={e => setFormData({...formData, startTime: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha Término</label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={e => setFormData({...formData, endDate: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora Término</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={e => setFormData({...formData, endTime: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente (Opcional)</label>
                <select
                  value={formData.clientId}
                  onChange={e => setFormData({...formData, clientId: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name} - {client.companyName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(TaskStatus).map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFormData({...formData, status})}
                      className={clsx(
                        "px-2 py-2 rounded-lg text-xs font-medium border transition-all",
                        formData.status === status
                          ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                          : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all resize-none"
                  placeholder="Detalles adicionales..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors font-medium shadow-lg shadow-primary-500/30"
                >
                  {editingTask ? 'Guardar Cambios' : 'Crear Tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Eliminar Tarea"
        message="¿Estás seguro de que deseas eliminar esta tarea? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

export default Tasks;
