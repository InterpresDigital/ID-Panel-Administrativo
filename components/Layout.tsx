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
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { LOGO_COLOR_URL, LOGO_BLANCO_URL, FAVICON_URL } from '../utils/brandAssets';
import clsx from 'clsx';

const NavItem = ({ to, icon: Icon, label, isCollapsed }: { to: string; icon: any; label: string; isCollapsed: boolean }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group my-1",
        isActive 
          ? "bg-[#1464B8] text-white shadow-lg shadow-[#1464B8]/25" 
          : "text-[#102B4B]/75 dark:text-slate-300 hover:bg-[#F6F9FC] dark:hover:bg-[#102B4B]/60 hover:text-[#1464B8] dark:hover:text-[#38C4D0]"
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
  const { logout } = useAuth();
  const { loading } = useData();

  const horizontalLogoUrl = theme === 'dark' ? LOGO_BLANCO_URL : LOGO_COLOR_URL;
  const collapsedEmblemUrl = FAVICON_URL;

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F6F9FC] dark:bg-[#071B36]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#1464B8] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#102B4B]/70 dark:text-slate-300 font-medium">Cargando base de datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#F6F9FC] dark:bg-[#071B36] text-[#102B4B] dark:text-slate-100 transition-colors duration-300">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-[#071B36]/55 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={clsx(
          "fixed lg:relative z-30 h-full bg-white dark:bg-[#0C2548] border-r border-[#C7D5E2]/80 dark:border-[#1B3C68] transition-all duration-300 flex flex-col",
          isCollapsed ? "w-20" : "w-72",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Floating Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute top-7 -right-3 w-6 h-6 bg-white dark:bg-[#0C2548] border border-[#C7D5E2] dark:border-[#1B3C68] rounded-full items-center justify-center text-[#102B4B]/65 dark:text-slate-300 hover:text-[#1464B8] hover:scale-110 shadow-md cursor-pointer transition-all z-40"
          title={isCollapsed ? "Expandir Menú" : "Colapsar Menú"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <div className="h-20 flex items-center justify-center px-4 border-b border-[#C7D5E2]/60 dark:border-[#1B3C68]">
          <img 
            src={isCollapsed ? collapsedEmblemUrl : horizontalLogoUrl}
            alt="Interpres Digital Labs" 
            className={clsx(
              "object-contain transition-all duration-300", 
              isCollapsed ? "h-10 w-10" : "h-12 w-auto max-w-[215px]"
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
        <header className="lg:hidden h-16 bg-white dark:bg-[#0C2548] border-b border-[#C7D5E2]/80 dark:border-[#1B3C68] flex items-center px-4 justify-between z-10">
          <div className="flex items-center">
            <img 
              src={horizontalLogoUrl}
              alt="Interpres Digital Labs" 
              className="h-10 w-auto object-contain" 
            />
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-[#102B4B] dark:text-slate-200 hover:bg-[#F6F9FC] dark:hover:bg-[#102B4B]/60 rounded-lg"
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



