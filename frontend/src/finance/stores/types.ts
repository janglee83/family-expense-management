export type SnackbarVariant = "success" | "error" | "info" | "warning";

export interface SnackbarMessage {
  message: string;
  variant?: SnackbarVariant;
  durationMs?: number;
}

export type Notify = (message: SnackbarMessage) => void;

export type Translate = (key: string, options?: Record<string, unknown>) => string;
