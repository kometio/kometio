import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { IconButton } from '../common/icon-button';
import { X } from 'lucide-react';

export type ToastVariant = 'default' | 'destructive' | 'success';

/** The one thing a toast may offer to do next — "Open the copy" — written, not an icon. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextValue {
  /** Adds a toast, which auto-dismisses after a few seconds (and can also be closed by hand). It neither blocks nor asks for confirmation — for errors that MUST stop the user, a dialog remains the right choice. An `action` is what the result makes possible next; taking it closes the toast. */
  toast: (
    message: string,
    variant?: ToastVariant,
    action?: ToastAction,
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 6000;

/**
 * Born from point 12 of the security review: saves that failed silently
 * (`.catch(() => {})` on global and block-type styles) left the user
 * believing everything had gone through. An in-house component rather than
 * a library (an explicit decision) — a simple use case (show a message,
 * auto-dismiss, close by hand) does not justify a new dependency.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (
      message: string,
      variant: ToastVariant = 'default',
      action?: ToastAction,
    ) => {
      const id = `toast-${nextId.current++}`;
      setToasts((prev) => [...prev, { id, message, variant, action }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        // role="status"/aria-live="polite": announced to a screen reader
        // without stealing focus, consistent with the same WCAG 4.1.3 gap
        // reported for Form.astro on the public-site side.
        //
        // A rem clear of each edge, like a dialog: `w-full` against a
        // `right-4` anchor was the whole window wide on a phone, so a
        // toast started 10px off the left edge at 390.
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-4 bottom-4 z-200 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
        >
          {toasts.map((item) => (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg',
                item.variant === 'destructive' &&
                  'border-destructive/50 bg-destructive-surface text-destructive',
                item.variant === 'success' &&
                  'border-success/50 bg-success-surface text-success',
              )}
            >
              <span className="flex-1">{item.message}</span>
              {item.action && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-my-0.5 shrink-0 text-current underline"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </Button>
              )}
              <IconButton
                label={t('toast.dismiss')}
                size="icon-xs"
                className="-my-0.5 -mr-1 text-current"
                onClick={() => dismiss(item.id)}
              >
                <X />
              </IconButton>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
