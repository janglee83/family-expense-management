import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { buildApiError, ApiError } from "./errors";
import { translateApiError } from "./errorI18n";

describe("buildApiError", () => {
  it("parses backend error envelope and applies code mapping", () => {
    const error = buildApiError({
      status: 401,
      payload: {
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      },
      fallbackCode: "login_failed",
      codeMap: {
        AUTH_INVALID_CREDENTIALS: "invalid_credentials",
      },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("invalid_credentials");
    expect(error.status).toBe(401);
    expect(error.backendMessage).toBe("Invalid email or password");
  });

  it("falls back to HTTP status code when payload only has string detail", () => {
    const error = buildApiError({
      status: 404,
      payload: { detail: "Family not found" },
      fallbackCode: "family_not_found",
    });

    expect(error.code).toBe("HTTP_404");
    expect(error.backendMessage).toBe("Family not found");
  });
});

describe("translateApiError", () => {
  const t = ((key: string) => key) as unknown as TFunction;

  it("resolves known mapped code to i18n key", () => {
    const error = new ApiError({
      code: "AUTH_INVALID_CREDENTIALS",
      status: 401,
      backendMessage: "Invalid email or password",
    });

    expect(translateApiError(t, error, "auth.genericError")).toBe("auth.invalidCredentials");
  });

  it("returns fallback + code for unknown codes", () => {
    const error = new ApiError({
      code: "SOME_NEW_BACKEND_ERROR",
      status: 400,
      backendMessage: "Some new backend error",
    });

    expect(translateApiError(t, error, "auth.genericError")).toBe(
      "auth.genericError (SOME_NEW_BACKEND_ERROR)",
    );
  });
});
