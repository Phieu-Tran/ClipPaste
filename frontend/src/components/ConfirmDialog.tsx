import { X, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { clsx } from 'clsx';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
  details?: string[];
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
  details,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm duration-200">
      <div className="animate-in zoom-in-95 w-full max-w-md scale-100 rounded-lg border border-border bg-background shadow-xl duration-200">
        <div className="px-6 pb-6 pt-5">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  variant === 'danger'
                    ? 'bg-destructive/10 text-destructive'
                    : variant === 'warning'
                      ? 'bg-yellow-500/10 text-yellow-500'
                      : 'bg-primary/10 text-primary'
                }`}
              >
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <button
              onClick={onCancel}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
          {details && details.length > 0 && (
            <div className="mt-4 space-y-2 rounded-md border border-border bg-card/40 p-3">
              {details.map((detail) => (
                <div key={detail} className="text-xs text-muted-foreground">
                  {detail}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border bg-card/30 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-input bg-transparent px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
              variant === 'danger'
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-primary hover:bg-primary/90'
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
