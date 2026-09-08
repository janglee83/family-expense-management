import { API_BASE_URL, apiClient } from "../api/client";
import { buildApiError, throwApiErrorFromResponse } from "../api/errors";
import type { components } from "../api/schema.gen";

export type Account = components["schemas"]["AccountResponse"];
export type AccountType = components["schemas"]["AccountType"];
export type CreateAccountInput = components["schemas"]["CreateAccountRequest"];
export type UpdateAccountInput = components["schemas"]["UpdateAccountRequest"];

export type LedgerTransaction = components["schemas"]["LedgerTransactionResponse"];
export type LedgerTransactionType = components["schemas"]["LedgerTransactionType"];
export type CreateLedgerTransactionInput = components["schemas"]["CreateLedgerTransactionRequest"];

export type Goal = components["schemas"]["GoalResponse"];
export type GoalEntry = components["schemas"]["GoalEntryResponse"];
export type CreateGoalInput = components["schemas"]["CreateGoalRequest"];
export type UpdateGoalInput = components["schemas"]["UpdateGoalRequest"];
export type CreateGoalEntryInput = components["schemas"]["GoalEntryRequest"];

export type Subscription = components["schemas"]["SubscriptionResponse"];
export type SubscriptionSummary = components["schemas"]["SubscriptionSummaryResponse"];
export type CreateSubscriptionInput = components["schemas"]["CreateSubscriptionRequest"];
export type UpdateSubscriptionInput = components["schemas"]["UpdateSubscriptionRequest"];
export type SubscriptionStatus = components["schemas"]["SubscriptionStatus"];
export type SubscriptionBillingCycle = components["schemas"]["SubscriptionBillingCycle"];

export type SplitExpense = components["schemas"]["SplitExpenseResponse"];
export type SplitMethod = components["schemas"]["SplitMethod"];
export type CreateSplitExpenseInput = components["schemas"]["CreateSplitExpenseRequest"];

export type NetWorth = components["schemas"]["NetWorthResponse"];
export type CashFlowSummary = components["schemas"]["CashFlowSummaryResponse"];
export type CashFlowBuckets = components["schemas"]["CashFlowBucketsResponse"];

export type ExpenseExport = components["schemas"]["ExpenseExportResponse"];
export type BackupExport = components["schemas"]["BackupExportResponse"];
export type ExpenseImportPreview = components["schemas"]["ExpenseImportPreviewResponse"];
export type ExpenseImportCommitInput = components["schemas"]["ExpenseImportCommitRequest"];
export type ExpenseImportCommitResult = components["schemas"]["ExpenseImportCommitResponse"];
export type UndoDeleteResult = components["schemas"]["UndoDeleteResponse"];
export type UndoRestoreResult = components["schemas"]["UndoRestoreResponse"];

export async function listAccounts(familyId: string): Promise<Account[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/accounts/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_accounts_failed",
      fallbackMessage: "Failed to list accounts",
    });
  }
  return data;
}

export async function createAccount(familyId: string, input: CreateAccountInput): Promise<Account> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/accounts/", {
    params: { path: { family_id: familyId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_account_failed",
      fallbackMessage: "Failed to create account",
    });
  }
  return data;
}

export async function updateAccount(
  familyId: string,
  accountId: string,
  input: UpdateAccountInput,
): Promise<Account> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/accounts/{account_id}",
    {
      params: { path: { family_id: familyId, account_id: accountId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_account_failed",
      fallbackMessage: "Failed to update account",
    });
  }
  return data;
}

export async function listLedgerTransactions(familyId: string): Promise<LedgerTransaction[]> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/ledger-transactions/",
    {
      params: { path: { family_id: familyId } },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_ledger_failed",
      fallbackMessage: "Failed to list ledger transactions",
    });
  }
  return data;
}

export async function createLedgerTransaction(
  familyId: string,
  input: CreateLedgerTransactionInput,
): Promise<LedgerTransaction> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/ledger-transactions/",
    {
      params: { path: { family_id: familyId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_ledger_failed",
      fallbackMessage: "Failed to create ledger transaction",
    });
  }
  return data;
}

export async function listGoals(familyId: string): Promise<Goal[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/goals/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_goals_failed",
      fallbackMessage: "Failed to list goals",
    });
  }
  return data;
}

export async function createGoal(familyId: string, input: CreateGoalInput): Promise<Goal> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/goals/", {
    params: { path: { family_id: familyId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_goal_failed",
      fallbackMessage: "Failed to create goal",
    });
  }
  return data;
}

export async function updateGoal(familyId: string, goalId: string, input: UpdateGoalInput): Promise<Goal> {
  const { data, error, response } = await apiClient.PATCH("/api/v1/families/{family_id}/goals/{goal_id}", {
    params: { path: { family_id: familyId, goal_id: goalId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_goal_failed",
      fallbackMessage: "Failed to update goal",
    });
  }
  return data;
}

export async function deleteGoal(familyId: string, goalId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE("/api/v1/families/{family_id}/goals/{goal_id}", {
    params: { path: { family_id: familyId, goal_id: goalId } },
  });
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_goal_failed",
      fallbackMessage: "Failed to delete goal",
    });
  }
}

export async function listGoalEntries(familyId: string, goalId: string): Promise<GoalEntry[]> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/goals/{goal_id}/entries",
    {
      params: { path: { family_id: familyId, goal_id: goalId } },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_goal_entries_failed",
      fallbackMessage: "Failed to list goal entries",
    });
  }
  return data;
}

export async function createGoalEntry(
  familyId: string,
  goalId: string,
  input: CreateGoalEntryInput,
): Promise<GoalEntry> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/goals/{goal_id}/entries",
    {
      params: { path: { family_id: familyId, goal_id: goalId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_goal_entry_failed",
      fallbackMessage: "Failed to create goal entry",
    });
  }
  return data;
}

export async function listSubscriptions(familyId: string): Promise<Subscription[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/subscriptions/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_subscriptions_failed",
      fallbackMessage: "Failed to list subscriptions",
    });
  }
  return data;
}

export async function createSubscription(
  familyId: string,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/subscriptions/", {
    params: { path: { family_id: familyId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_subscription_failed",
      fallbackMessage: "Failed to create subscription",
    });
  }
  return data;
}

export async function updateSubscription(
  familyId: string,
  subscriptionId: string,
  input: UpdateSubscriptionInput,
): Promise<Subscription> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/subscriptions/{subscription_id}",
    {
      params: { path: { family_id: familyId, subscription_id: subscriptionId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_subscription_failed",
      fallbackMessage: "Failed to update subscription",
    });
  }
  return data;
}

export async function deleteSubscription(familyId: string, subscriptionId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/subscriptions/{subscription_id}",
    {
      params: { path: { family_id: familyId, subscription_id: subscriptionId } },
    },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_subscription_failed",
      fallbackMessage: "Failed to delete subscription",
    });
  }
}

export async function getSubscriptionSummary(familyId: string): Promise<SubscriptionSummary> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/subscriptions/summary",
    {
      params: { path: { family_id: familyId } },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "subscription_summary_failed",
      fallbackMessage: "Failed to load subscription summary",
    });
  }
  return data;
}

export async function listSplitExpenses(familyId: string): Promise<SplitExpense[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/split-expenses/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_split_expenses_failed",
      fallbackMessage: "Failed to list split expenses",
    });
  }
  return data;
}

export async function createSplitExpense(
  familyId: string,
  input: CreateSplitExpenseInput,
): Promise<SplitExpense> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/split-expenses/", {
    params: { path: { family_id: familyId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_split_expense_failed",
      fallbackMessage: "Failed to create split expense",
    });
  }
  return data;
}

export async function settleSplitExpenseItem(
  familyId: string,
  splitExpenseId: string,
  itemId: string,
  isSettled: boolean,
): Promise<SplitExpense> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/split-expenses/{split_expense_id}/items/{item_id}/settle",
    {
      params: { path: { family_id: familyId, split_expense_id: splitExpenseId, item_id: itemId } },
      body: { is_settled: isSettled },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "settle_split_item_failed",
      fallbackMessage: "Failed to update split item status",
    });
  }
  return data;
}

interface AnalyticsRange {
  startDate?: string;
  endDate?: string;
}

export async function getNetWorth(familyId: string, range: AnalyticsRange): Promise<NetWorth> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/analytics/net-worth", {
    params: {
      path: { family_id: familyId },
      query: { start_date: range.startDate ?? null, end_date: range.endDate ?? null },
    },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "analytics_net_worth_failed",
      fallbackMessage: "Failed to load net worth",
    });
  }
  return data;
}

export async function getCashFlowSummary(familyId: string, range: AnalyticsRange): Promise<CashFlowSummary> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/analytics/cash-flow/summary",
    {
      params: {
        path: { family_id: familyId },
        query: { start_date: range.startDate ?? null, end_date: range.endDate ?? null },
      },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "analytics_cash_flow_summary_failed",
      fallbackMessage: "Failed to load cash flow summary",
    });
  }
  return data;
}

export async function getCashFlowBuckets(
  familyId: string,
  period: "daily" | "weekly" | "monthly",
  range: AnalyticsRange,
): Promise<CashFlowBuckets> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/analytics/cash-flow/buckets",
    {
      params: {
        path: { family_id: familyId },
        query: {
          period,
          start_date: range.startDate ?? null,
          end_date: range.endDate ?? null,
        },
      },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "analytics_cash_flow_buckets_failed",
      fallbackMessage: "Failed to load cash flow buckets",
    });
  }
  return data;
}

export async function exportExpensesJson(familyId: string): Promise<ExpenseExport> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/exports/expenses", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "export_expenses_json_failed",
      fallbackMessage: "Failed to export expenses as JSON",
    });
  }
  return data;
}

export async function exportBackup(familyId: string): Promise<BackupExport> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/exports/backup", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "export_backup_failed",
      fallbackMessage: "Failed to export backup",
    });
  }
  return data;
}

export async function exportExpensesCsv(familyId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/families/${familyId}/exports/expenses.csv`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    await throwApiErrorFromResponse(response, {
      fallbackCode: "export_expenses_csv_failed",
      fallbackMessage: "Failed to export expenses as CSV",
    });
  }
  return response.text();
}

export async function previewExpenseImport(familyId: string, file: File): Promise<ExpenseImportPreview> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/families/${familyId}/imports/expenses/preview`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    await throwApiErrorFromResponse(response, {
      fallbackCode: "preview_import_failed",
      fallbackMessage: "Failed to preview import file",
    });
  }

  return (await response.json()) as ExpenseImportPreview;
}

export async function commitExpenseImport(
  familyId: string,
  input: ExpenseImportCommitInput,
): Promise<ExpenseImportCommitResult> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/imports/expenses/commit",
    {
      params: { path: { family_id: familyId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "commit_import_failed",
      fallbackMessage: "Failed to import expenses",
    });
  }
  return data;
}

export async function deleteExpenseWithUndo(familyId: string, expenseId: string): Promise<UndoDeleteResult> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/undo/expenses/{expense_id}",
    {
      params: { path: { family_id: familyId, expense_id: expenseId } },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_with_undo_failed",
      fallbackMessage: "Failed to delete expense with undo",
    });
  }
  return data;
}

export async function restoreUndoAction(familyId: string, undoToken: string): Promise<UndoRestoreResult> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/undo/{undo_token}/restore",
    {
      params: { path: { family_id: familyId, undo_token: undoToken } },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "restore_undo_failed",
      fallbackMessage: "Failed to restore deleted expense",
    });
  }
  return data;
}
