
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../components/ThemeContext';
import { LOGO_COLOR_URL, LOGO_BLANCO_URL } from '../utils/brandAssets';
import { Lock, ArrowRight, AlertCircle, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

const Login: React.FC = () => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const logoUrl = theme === 'dark' ? LOGO_BLANCO_URL : LOGO_COLOR_URL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyingCaptcha(true);
    try {
      const success = await login(password);
      
      if (success) {
        navigate('/');
      } else {
        setError('Credenciales incorrectas');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setPassword('');
      }
    } finally {
      setVerifyingCaptcha(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#F6F9FC] dark:bg-[#071B36] transition-colors duration-500 relative overflow-hidden px-4">
      
      {/* Background Decorator */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#1464B8]/10 rounded-full blur-[110px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#00A9B7]/12 rounded-full blur-[110px]" />
      </div>

      {/* Theme Toggle (Top Right) */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2.5 rounded-full bg-white dark:bg-[#0C2548] border border-[#C7D5E2]/80 dark:border-[#1B3C68] hover:scale-105 transition-all text-[#102B4B] dark:text-slate-200 shadow-sm"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className={clsx(
        "w-full max-w-md p-8 sm:p-10 rounded-3xl bg-white dark:bg-[#0C2548]/95 backdrop-blur-xl shadow-[0_24px_60px_-15px_rgba(16,43,75,0.12)] border border-[#C7D5E2]/80 dark:border-[#1B3C68] relative z-10 transition-transform duration-200",
        isShaking && "animate-[shake_0.5s_ease-in-out]"
      )}>
        
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-9">
          <img 
            src={logoUrl} 
            alt="Interpres Digital Labs" 
            className="h-16 w-auto object-contain mb-6"
          />
          <h1 className="font-display text-2xl font-bold text-[#102B4B] dark:text-white tracking-tight">
            Acceso Administrativo
          </h1>
          <p className="text-[#102B4B]/65 dark:text-slate-300 text-sm mt-2">
            Ingresa tu clave maestra para continuar
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className={clsx("h-5 w-5 transition-colors duration-300", error ? "text-rose-500" : "text-[#102B4B]/45 dark:text-slate-400 group-focus-within:text-[#1464B8]")} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                }}
                className={clsx(
                  "block w-full pl-11 pr-12 py-4 rounded-xl bg-[#F6F9FC] dark:bg-[#071B36] border outline-none transition-all duration-300 font-medium placeholder-[#102B4B]/40 dark:placeholder-slate-400 text-[#102B4B] dark:text-white",
                  error 
                    ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10" 
                    : "border-[#C7D5E2] dark:border-[#1B3C68] focus:border-[#1464B8] focus:ring-4 focus:ring-[#1464B8]/10"
                )}
                placeholder="Contraseña Maestra"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#102B4B]/45 hover:text-[#102B4B] dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-rose-500 text-sm pl-2 animate-fade-in">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!password}
            className="group w-full flex items-center justify-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-[#1464B8] to-[#00A9B7] hover:from-[#10539A] hover:to-[#008C99] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1464B8] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#1464B8]/25 hover:scale-[1.01] active:scale-[0.99]"
          >
            Entrar al Panel
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-xs text-[#102B4B]/50 dark:text-slate-400">
                Sistema seguro • Interpres Digital Labs
            </p>
        </div>
      </div>
      
      {/* Inline styles for shake animation since we are using custom keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default Login;
