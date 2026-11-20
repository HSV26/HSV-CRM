import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: ToastAction;
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info', action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success', action?: ToastAction) => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts((prev) => [...prev, { id, message, type, action }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-2xl shadow-xl border text-xs font-medium transition-all ${
              toast.type === 'success'
                ? 'bg-[#0A1F5C] text-emerald-300 border-[#1D4ED8]'
                : toast.type === 'error'
                ? 'bg-slate-900 text-rose-400 border-rose-500/30'
                : 'bg-[#0A1F5C] text-slate-100 border-[#1D4ED8]'
            }`}
          >
            <div className="flex items-center space-x-3">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="text-white">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismissToast(toast.id);
                  }}
                  className="text-[#93C5FD] hover:text-white underline font-semibold shrink-0 ml-1"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-slate-300 hover:text-white ml-2"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
