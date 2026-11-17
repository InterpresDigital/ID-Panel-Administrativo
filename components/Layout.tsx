import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  DollarSign, 
  Menu, 
  X, 
  Moon, 
  Sun, 
  Briefcase,
  FileCheck,
  LogOut, 
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Cloud,
  FileText,
  Download,
  Video,
  Terminal,
  ClipboardList,
  Clock,
  Wrench,
  Cpu
} from 'lucide-react';
import { useTheme } from './ThemeContext';
import { useAuth } from '../context/AuthContext'; // New Import
import { useData } from '../context/DataContext'; // New Import
import clsx from 'clsx';

const NavItem = ({ to, icon: Icon, label, isCollapsed }: { to: string; icon: any; label: string; isCollapsed: boolean }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group my-1",
        isActive 
          ? "bg-primary-500 text-white shadow-lg shadow-primary-500/30" 
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-surface hover:text-primary-600 dark:hover:text-primary-400"
      )
    }
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    <span className={clsx("font-medium whitespace-nowrap overflow-hidden transition-all duration-300", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
      {label}
    </span>
    {!isCollapsed && (
      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current opacity-0 group-hover:opacity-100 transition-opacity" />
    )}
  </NavLink>
);

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth(); // Auth Hook
  const { loading } = useData(); // Loading State

  // Nuevo logotipo provisto por el usuario
  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Cargando base de datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={clsx(
          "fixed lg:relative z-30 h-full bg-white dark:bg-dark-surface border-r border-gray-200 dark:border-dark-border transition-all duration-300 flex flex-col",
          isCollapsed ? "w-20" : "w-72",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Floating Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute top-7 -right-3 w-6 h-6 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-full items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:scale-110 shadow-md cursor-pointer transition-all z-40"
          title={isCollapsed ? "Expandir Menú" : "Colapsar Menú"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <div className="h-20 flex items-center justify-center px-4 border-b border-gray-100 dark:border-dark-border">
          <img 
            src={logoUrl}
            alt="Interpres Logo" 
            className={clsx(
              "object-contain transition-all duration-300", 
              isCollapsed ? "h-8 w-full" : "h-12 w-auto"
            )}
          />
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <div className={clsx("text-xs font-semibold text-gray-400 mb-4 px-2 uppercase tracking-wider", isCollapsed && "text-center")}>
            {isCollapsed ? "Menú" : "Menú Principal"}
          </div>
          <NavItem to="/" icon={LayoutDashboard} label="Panel Principal" isCollapsed={isCollapsed} />
          <NavItem to="/bookings" icon={Video} label="Citas / Agendamiento" isCollapsed={isCollapsed} />
          <NavItem to="/clients" icon={Users} label="Clientes" isCollapsed={isCollapsed} />
          <NavItem to="/platforms" icon={Cloud} label="Plataformas SaaS" isCollapsed={isCollapsed} />
          <NavItem to="/work-logs" icon={Clock} label="Bítacora de Trabajo" isCollapsed={isCollapsed} />
          <NavItem to="/maintenance-logs" icon={Wrench} label="Bitácora Mantenimiento" isCollapsed={isCollapsed} />
          <NavItem to="/control-center" icon={Terminal} label="Command Center" isCollapsed={isCollapsed} />
          <NavItem to="/quotations" icon={FileText} label="Cotizaciones" isCollapsed={isCollapsed} />
          <NavItem to="/agreements" icon={FileSignature} label="Contratos" isCollapsed={isCollapsed} />
          <NavItem to="/legal-documents" icon={FileSignature} label="Documentos Legales" isCollapsed={isCollapsed} />
          <NavItem to="/briefings" icon={ClipboardList} label="Briefings Lumina" isCollapsed={isCollapsed} />
          <NavItem to="/briefings-general" icon={ClipboardList} label="Briefing General" isCollapsed={isCollapsed} />
          <NavItem to="/briefings-ia" icon={Cpu} label="Briefing IA (RFI)" isCollapsed={isCollapsed} />
          <NavItem to="/tasks" icon={Calendar} label="Calendario" isCollapsed={isCollapsed} />
          <NavItem to="/impuestos" icon={FileCheck} label="Impuestos" isCollapsed={isCollapsed} />
          <NavItem to="/finance" icon={DollarSign} label="Finanzas" isCollapsed={isCollapsed} />
          <NavItem to="/configuration" icon={Settings} label="Configuración" isCollapsed={isCollapsed} />
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-dark-border space-y-2">
          {/* Logout Button */}
          <button
            onClick={logout}
            className={clsx(
              "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors",
              isCollapsed ? "justify-center" : ""
            )}
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
            <span className={clsx("font-medium transition-all duration-300", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
              Cerrar Sesión
            </span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={clsx(
              "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-bg transition-colors",
              isCollapsed ? "justify-center" : ""
            )}
            title={theme === 'dark' ? "Modo Claro" : "Modo Oscuro"}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className={clsx("font-medium transition-all duration-300", isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100")}>
              {theme === 'dark' ? "Modo Claro" : "Modo Oscuro"}
            </span>
          </button>

        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header (Mobile Only) */}
        <header className="lg:hidden h-16 bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border flex items-center px-4 justify-between z-10">
          <div className="flex items-center">
            <img 
              src={logoUrl}
              alt="Interpres Logo" 
              className="h-10 w-auto object-contain" 
            />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
             {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;



