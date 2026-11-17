import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDestructive = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full flex-shrink-0 ${isDestructive ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {message}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-lg ${
              isDestructive 
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30' 
                : 'bg-primary-600 hover:bg-primary-700 shadow-primary-500/30'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};