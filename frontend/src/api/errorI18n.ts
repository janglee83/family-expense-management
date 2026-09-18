import { ApiError } from "./errors";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const ERROR_TRANSLATION_KEYS: Record<string, string> = {
  AUTH_EMAIL_ALREADY_REGISTERED: "auth.emailInUse",
  AUTH_INVALID_CREDENTIALS: "auth.invalidCredentials",
  AUTH_LOGIN_RATE_LIMITED: "auth.rateLimited",
  FAMILY_MEMBERSHIP_REQUIRED: "family.notMember",
  REQUEST_VALIDATION_ERROR: "family.validationFailed",
  USER_NOT_FOUND_BY_EMAIL: "family.memberNotFound",
  FAMILY_MEMBER_ALREADY_EXISTS: "family.memberAlreadyExists",
  EXPENSE_PAYER_NOT_IN_FAMILY: "expense.invalidPayerOrCategory",
  EXPENSE_CATEGORY_INVALID_FOR_FAMILY: "expense.invalidPayerOrCategory",
  SPLIT_EXPENSE_ALREADY_EXISTS: "finance.splitExpenseAlreadyExists",
  SPLIT_PARTICIPANT_NOT_IN_FAMILY: "finance.splitParticipantNotInFamily",
  SPLIT_CUSTOM_AMOUNT_MISMATCH: "finance.splitCustomAmountMismatch",
  SPLIT_PERCENTAGE_AMOUNT_MISMATCH: "finance.splitPercentageAmountMismatch",
  SPLIT_EXPENSE_NOT_FOUND: "finance.splitExpenseNotFound",
  SPLIT_EXPENSE_ITEM_NOT_FOUND: "finance.splitItemNotFound",
  SPLIT_GROUP_NO_ELIGIBLE_EXPENSES: "finance.splitGroupNoEligibleExpenses",
  SPLIT_GROUP_INVALID_PERIOD: "finance.splitGroupInvalidPeriod",
  SPLIT_EXPENSE_GROUP_NOT_FOUND: "finance.splitGroupNotFound",
  SPLIT_GROUP_PAYER_NOT_IN_PARTICIPANTS: "finance.splitGroupPayerNotInParticipants",
  SPLIT_EXPENSE_GROUP_SETTLEMENT_NOT_FOUND: "finance.splitGroupSettlementNotFound",
  UNDO_ACTION_NOT_FOUND: "finance.undoActionNotFound",
  UNDO_ACTION_EXPIRED: "finance.undoActionExpired",
  UNDO_ACTION_ALREADY_USED: "finance.undoActionAlreadyUsed",
  RECEIPT_FILE_TOO_LARGE: "receipt.fileTooLarge",
  RECEIPT_FILE_TYPE_UNSUPPORTED: "receipt.invalidFileType",
  TRIP_NOT_FOUND: "trip.notFound",
  TRIP_ITEM_NOT_FOUND: "trip.itemNotFound",
  TRIP_INVALID_DATE_RANGE: "trip.dateRangeInvalid",
  TRIP_ITEM_DATE_OUT_OF_RANGE: "trip.itemDateOutOfRange",
  TRIP_PARTICIPANT_NOT_IN_FAMILY: "trip.participantNotInFamily",
  EXPENSE_TRIP_INVALID_FOR_FAMILY: "trip.invalidTripForExpense",
  EXPENSE_TRIP_ITEM_INVALID_FOR_TRIP: "trip.invalidItemForExpense",
  EXPENSE_TRIP_ITEM_REQUIRES_TRIP: "trip.itemRequiresTrip",
  not_a_member: "family.notMember",
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
  t: TranslateFn,
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
