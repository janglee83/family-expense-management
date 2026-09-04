type ErrorCodeMap = Record<string, string>;

interface ParsedBackendError {
  code: string;
  message: string;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBackendError(status: number, payload: unknown): ParsedBackendError | null {
  if (isRecord(payload)) {
    const envelope = payload.error;
    if (isRecord(envelope)) {
      const code = envelope.code;
      const message = envelope.message;
      if (typeof code === "string" && typeof message === "string") {
        return {
          code,
          message,
          details: envelope.details,
        };
      }
    }

    const detail = payload.detail;
    if (typeof detail === "string") {
      return { code: `HTTP_${status}`, message: detail };
    }
    if (Array.isArray(detail)) {
      return {
        code: "REQUEST_VALIDATION_ERROR",
        message: "Request validation failed",
        details: detail,
      };
    }
  }

  if (typeof payload === "string") {
    return { code: `HTTP_${status}`, message: payload };
  }

  return null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly backendMessage: string;

  constructor(args: { code: string; status: number; backendMessage: string; details?: unknown }) {
    super(args.code);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.backendMessage = args.backendMessage;
  }
}

export function buildApiError(args: {
  status: number;
  payload: unknown;
  fallbackCode: string;
  fallbackMessage?: string;
  codeMap?: ErrorCodeMap;
}): ApiError {
  const parsed = parseBackendError(args.status, args.payload);
  const backendCode = parsed?.code ?? args.fallbackCode;
  const mappedCode = args.codeMap?.[backendCode] ?? backendCode;
  return new ApiError({
    code: mappedCode,
    status: args.status,
    backendMessage: parsed?.message ?? args.fallbackMessage ?? "Request failed",
    details: parsed?.details,
  });
}

export async function throwApiErrorFromResponse(
  response: Response,
  args: {
    fallbackCode: string;
    fallbackMessage?: string;
    codeMap?: ErrorCodeMap;
  },
): Promise<never> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  throw buildApiError({
    status: response.status,
    payload,
    fallbackCode: args.fallbackCode,
    fallbackMessage: args.fallbackMessage,
    codeMap: args.codeMap,
  });
}
