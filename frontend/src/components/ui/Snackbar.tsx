/* eslint-disable react-refresh/only-export-components */
import { Toast, ToastRoot, ToastViewport } from "./primitives";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./Button";
import { cn } from "./cn";

type SnackbarVariant = "success" | "error" | "info" | "warning";

interface SnackbarOptions {
  message: string;
  variant?: SnackbarVariant;
  durationMs?: number;
}

interface SnackbarItem extends SnackbarOptions {
  id: string;
}

interface SnackbarContextValue {
  showSnackbar: (options: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const VARIANT_CLASSES: Record<SnackbarVariant, string> = {
  info: "border-info/45 bg-info/95 text-info-foreground",
  success: "border-success/45 bg-success/95 text-success-foreground",
  warning: "border-warning/50 bg-warning/95 text-warning-foreground",
  error: "border-destructive/45 bg-destructive/95 text-destructive-foreground",
};

const DEFAULT_DURATION_MS = 2400;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<SnackbarItem[]>([]);
  const [activeSnackbar, setActiveSnackbar] = useState<SnackbarItem | null>(null);

  const showSnackbar = useCallback((options: SnackbarOptions) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setQueue((current) => [...current, { id, ...options }]);
  }, []);

  useEffect(() => {
    if (activeSnackbar || queue.length === 0) {
      return;
    }

    setActiveSnackbar(queue[0]);
    setQueue((current) => current.slice(1));
  }, [activeSnackbar, queue]);

  useEffect(() => {
    if (!activeSnackbar) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveSnackbar(null);
    }, activeSnackbar.durationMs ?? DEFAULT_DURATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeSnackbar]);

  const value = useMemo(
    () => ({
      showSnackbar,
    }),
    [showSnackbar],
  );

  return (
    <Toast.Provider swipeDirection="right">
      <SnackbarContext.Provider value={value}>
        {children}

        {activeSnackbar ? (
          <ToastRoot
            open={Boolean(activeSnackbar)}
            duration={activeSnackbar.durationMs ?? DEFAULT_DURATION_MS}
            onOpenChange={(open) => {
              if (!open) {
                setActiveSnackbar(null);
              }
            }}
            className={cn(VARIANT_CLASSES[activeSnackbar.variant ?? "info"])}
          >
            <Toast.Title className="text-sm font-medium">{activeSnackbar.message}</Toast.Title>
            <Toast.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                X
              </Button>
            </Toast.Close>
          </ToastRoot>
        ) : null}

        <ToastViewport />
      </SnackbarContext.Provider>
    </Toast.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used inside SnackbarProvider");
  }
  return context;
}
