import type { TFunction } from "i18next";
import { ApiError } from "./errors";

const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  AUTH_EMAIL_ALREADY_REGISTERED: "auth.emailInUse",
  AUTH_INVALID_CREDENTIALS: "auth.invalidCredentials",
  AUTH_LOGIN_RATE_LIMITED: "auth.rateLimited",
  REQUEST_VALIDATION_ERROR: "family.validationFailed",
  USER_NOT_FOUND_BY_EMAIL: "family.memberNotFound",
  FAMILY_MEMBER_ALREADY_EXISTS: "family.memberAlreadyExists",
  EXPENSE_PAYER_NOT_IN_FAMILY: "expense.invalidPayerOrCategory",
  EXPENSE_CATEGORY_INVALID_FOR_FAMILY: "expense.invalidPayerOrCategory",
  RECEIPT_FILE_TOO_LARGE: "receipt.fileTooLarge",
  RECEIPT_FILE_TYPE_UNSUPPORTED: "receipt.invalidFileType",
  email_in_use: "auth.emailInUse",
  invalid_credentials: "auth.invalidCredentials",
  rate_limited: "auth.rateLimited",
  validation_failed: "family.validationFailed",
  member_not_found: "family.memberNotFound",
  member_already_exists: "family.memberAlreadyExists",
  invalid_payer_or_category: "expense.invalidPayerOrCategory",
  invalid_file: "receipt.invalidFileType",
};

function resolveCode(error: unknown): string | null {
  if (error instanceof ApiError) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return null;
}

export function translateApiError(
  t: TFunction,
  error: unknown,
  fallbackKey: string,
): string {
  const code = resolveCode(error);
  if (!code) {
    return t(fallbackKey);
  }

  const translationKey = ERROR_TRANSLATION_KEYS[code];
  if (translationKey) {
    return t(translationKey);
  }

  return `${t(fallbackKey)} (${code})`;
}
