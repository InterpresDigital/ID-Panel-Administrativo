
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../components/ThemeContext';
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

  // Nuevo logotipo provisto por el usuario
  const logoUrl = "https://pub-de208707a70b434880056475d98329db.r2.dev/INTERPRES%20DIGITAL/PNG/8.png";

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
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0f172a] transition-colors duration-500 relative overflow-hidden">
      
      {/* Background Decorator */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Theme Toggle (Top Right) */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2 rounded-full bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition-all text-gray-600 dark:text-gray-300"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className={clsx(
        "w-full max-w-md p-8 rounded-3xl bg-white/80 dark:bg-[#1e293b]/80 backdrop-blur-xl shadow-2xl border border-white/20 dark:border-gray-700 relative z-10 transition-transform duration-200",
        isShaking && "animate-[shake_0.5s_ease-in-out]"
      )}>
        
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-10">
          <img 
            src={logoUrl} 
            alt="Interpres Logo" 
            className="h-16 w-auto object-contain mb-6 drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Acceso Administrativo
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
            Ingresa tu clave maestra para continuar
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className={clsx("h-5 w-5 transition-colors duration-300", error ? "text-rose-500" : "text-gray-400 group-focus-within:text-primary-500")} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                }}
                className={clsx(
                  "block w-full pl-11 pr-12 py-4 rounded-xl bg-gray-50 dark:bg-[#0f172a] border outline-none transition-all duration-300 font-medium placeholder-gray-400 dark:text-white",
                  error 
                    ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10" 
                    : "border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10"
                )}
                placeholder="Contraseña Maestra"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-colors"
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
            className="group w-full flex items-center justify-center gap-2 py-4 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-primary-600 to-primary-800 hover:from-primary-700 hover:to-primary-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50 hover:scale-[1.02] active:scale-[0.98]"
          >
            Entrar al Panel
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500">
                Sistema seguro • Interpres Digital v1.0
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
