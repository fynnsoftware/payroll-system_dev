'use client';

// 🌟 Toast แบบง่าย ใช้แทน alert() ตาม coding convention ของโปรเจกต์
// (Toast notifications ... should be used for user feedback instead of raw alert())
import { useEffect, useState, createContext, useContext, ReactNode, useCallback } from 'react';
import { BiCheckCircle, BiErrorCircle, BiInfoCircle, BiX } from 'react-icons/bi';

type ToastType = 'success' | 'error' | 'info';
interface ToastMessage { id: number; type: ToastType; message: string; }

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast ต้องใช้ภายใน <ToastProvider>');
  return ctx;
}

const STYLES: Record<ToastType, { bg: string; icon: ReactNode }> = {
  success: { bg: 'bg-emerald-600', icon: <BiCheckCircle className="text-xl" /> },
  error: { bg: 'bg-red-600', icon: <BiErrorCircle className="text-xl" /> },
  info: { bg: 'bg-blue-600', icon: <BiInfoCircle className="text-xl" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2 w-full max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-300 ${STYLES[t.type].bg}`}
          >
            {STYLES[t.type].icon}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="opacity-80 hover:opacity-100">
              <BiX className="text-lg" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
