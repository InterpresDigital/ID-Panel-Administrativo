import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = "interpres_auth_token";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Verificar si ya existe una sesión guardada al cargar la app
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const login = async (password: string): Promise<boolean> => {
    try {
      const authDoc = await getDoc(doc(db, "settings", "auth"));
      let masterPassword = "1234"; // Default fallback
      
      if (authDoc.exists()) {
        masterPassword = authDoc.data().masterPassword || "1234";
      }

      if (password === masterPassword) {
        setIsAuthenticated(true);
        sessionStorage.setItem(SESSION_KEY, 'true'); // Usamos SessionStorage para que expire al cerrar el navegador
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error verifying login password:", e);
      // Fallback in case of network errors
      if (password === "1234") {
        setIsAuthenticated(true);
        sessionStorage.setItem(SESSION_KEY, 'true');
        return true;
      }
      return false;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem(SESSION_KEY);
    // Forzar recarga o redirección limpia
    window.location.href = '/'; 
  };

  if (isLoading) {
    return null; // O un spinner de carga global
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
