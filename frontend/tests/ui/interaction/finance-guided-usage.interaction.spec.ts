import { expect, test, type Page, type Route } from "@playwright/test";
import { mockAuthLoggedIn } from "../fixtures/apiMocks";
import { TEST_CATEGORIES, TEST_EXPENSES, TEST_FAMILY, TEST_FAMILY_DETAIL, TEST_USER } from "../fixtures/testData";

type AccountRecord = {
  id: string;
  family_id: string;
  created_by_user_id: string;
  name: string;
  account_type: "bank" | "cash" | "investment" | "credit_card" | "loan";
  currency_code: "jpy" | "vnd";
  current_balance: number;
  available_credit: number | null;
  credit_limit: number | null;
  statement_balance: number;
  statement_closing_day: number | null;
  payment_due_day: number | null;
  minimum_payment: number | null;
  is_active: boolean;
};

type LedgerRecord = {
  id: string;
  family_id: string;
  created_by_user_id: string;
  transaction_type: "expense" | "income" | "transfer" | "credit_card_purchase" | "credit_card_payment" | "goal_contribution" | "goal_withdrawal";
  amount: number;
  occurred_on: string;
  category_id: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  description: string | null;
};

type GoalRecord = {
  id: string;
  family_id: string;
  created_by_user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number | null;
  target_date: string | null;
  icon: string | null;
  linked_account_id: string | null;
  is_paused: boolean;
  remaining_amount: number;
  progress_percentage: number;
  estimated_completion_date: string | null;
};

type GoalEntryRecord = {
  id: string;
  family_id: string;
  goal_id: string;
  created_by_user_id: string;
  amount: number;
  entry_type: "contribution" | "withdrawal";
  occurred_on: string;
  note: string | null;
};

type SubscriptionRecord = {
  id: string;
  family_id: string;
  created_by_user_id: string;
  name: string;
  merchant: string;
  amount: number;
  currency_code: "jpy" | "vnd";
  billing_cycle: "weekly" | "monthly" | "yearly";
  next_billing_date: string;
  status: "active" | "paused" | "cancelled";
  category_id: string | null;
  account_id: string | null;
  cancellation_url: string | null;
};

type SplitItemRecord = {
  id: string;
  split_expense_id: string;
  participant_user_id: string;
  amount: number;
  percentage: number | null;
  is_settled: boolean;
};

type SplitRecord = {
  id: string;
  family_id: string;
  created_by_user_id: string;
  expense_id: string;
  method: "equal" | "custom" | "percentage";
  status: "pending" | "settled";
  total_amount: number;
  settled_amount: number;
  outstanding_amount: number;
  items: SplitItemRecord[];
};

type ExpenseRecord = {
  id: string;
  family_id: string;
  payer_user_id: string;
  created_by_user_id: string;
  category_id: string;
  amount: number;
  is_shared: boolean;
  description: string | null;
  expense_date: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function nextUuid(counter: { value: number }): string {
  counter.value += 1;
  return `00000000-0000-0000-0000-${String(counter.value).padStart(12, "0")}`;
}

function computeSubscriptionSummary(subscriptions: SubscriptionRecord[]): {
  monthly_total: number;
  yearly_total: number;
  upcoming_subscription_ids: string[];
} {
  const monthlyEquivalent = (subscription: SubscriptionRecord): number => {
    if (subscription.billing_cycle === "weekly") {
      return Math.round((subscription.amount * 52) / 12);
    }
    if (subscription.billing_cycle === "yearly") {
      return Math.round(subscription.amount / 12);
    }
    return subscription.amount;
  };

  const monthly_total = subscriptions
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + monthlyEquivalent(item), 0);

  const yearly_total = subscriptions
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + monthlyEquivalent(item) * 12, 0);

  const upcoming_subscription_ids = subscriptions
    .filter((item) => item.status === "active")
    .map((item) => item.id)
    .slice(0, 10);

  return { monthly_total, yearly_total, upcoming_subscription_ids };
}

function normalizeGoal(goal: GoalRecord): GoalRecord {
  const remaining_amount = Math.max(goal.target_amount - goal.current_amount, 0);
  const progress_percentage = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;

  return {
    ...goal,
    remaining_amount,
    progress_percentage,
  };
}

async function setupFinanceGuidedMocks(page: Page): Promise<void> {
  const familyId = TEST_FAMILY.id;
  const idCounter = { value: 100 };

  const dashboardFamily = {
    ...TEST_FAMILY,
    currency_code: "jpy" as const,
    monthly_income: 300000,
    monthly_income_enabled: true,
    savings_goal_amount: 50000,
  };

  const familyDetail = {
    ...TEST_FAMILY_DETAIL,
    currency_code: "jpy",
    monthly_income: 300000,
    monthly_income_enabled: true,
    savings_goal_amount: 50000,
  };

  const categories = [...TEST_CATEGORIES];
  const expenses: ExpenseRecord[] = TEST_EXPENSES.map((item) => ({ ...item }));
  const accounts: AccountRecord[] = [];
  const ledgerEntries: LedgerRecord[] = [];
  const goals: GoalRecord[] = [];
  const goalEntriesByGoalId = new Map<string, GoalEntryRecord[]>();
  const subscriptions: SubscriptionRecord[] = [];
  const splits: SplitRecord[] = [];
  const deletedExpenseByToken = new Map<string, ExpenseRecord>();

  await page.route(/\/api\/v1\/families\/(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, 200, [dashboardFamily]);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const familyDetailPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}(?:\\?.*)?$`);
  await page.route(familyDetailPattern, async (route) => {
    await fulfillJson(route, 200, familyDetail);
  });

  const categoriesPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/categories/(?:\\?.*)?$`);
  await page.route(categoriesPattern, async (route) => {
    await fulfillJson(route, 200, categories);
  });

  const expensesPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/expenses/(?:\\?.*)?$`);
  await page.route(expensesPattern, async (route) => {
    await fulfillJson(route, 200, expenses);
  });

  const accountsPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/accounts/(?:\\?.*)?$`);
  await page.route(accountsPattern, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, accounts);
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        account_type: AccountRecord["account_type"];
        currency_code: AccountRecord["currency_code"];
        opening_balance: number;
        credit_limit: number | null;
        statement_closing_day: number | null;
        payment_due_day: number | null;
        minimum_payment: number | null;
      };

      const created: AccountRecord = {
        id: nextUuid(idCounter),
        family_id: familyId,
        created_by_user_id: TEST_USER.id,
        name: body.name,
        account_type: body.account_type,
        currency_code: body.currency_code,
        current_balance: body.opening_balance,
        credit_limit: body.credit_limit,
        statement_closing_day: body.statement_closing_day,
        payment_due_day: body.payment_due_day,
        minimum_payment: body.minimum_payment,
        available_credit:
          body.account_type === "credit_card" && body.credit_limit !== null
            ? Math.max(body.credit_limit - body.opening_balance, 0)
            : null,
        statement_balance: body.opening_balance,
        is_active: true,
      };

      accounts.push(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const accountPatchPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/accounts/([^/?]+)(?:\\?.*)?$`);
  await page.route(accountPatchPattern, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/accounts\/([^/]+)$/);
    const accountId = match?.[1];
    const body = route.request().postDataJSON() as { is_active?: boolean | null };

    const account = accounts.find((item) => item.id === accountId);
    if (!account || typeof body.is_active !== "boolean") {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    account.is_active = body.is_active;
    await fulfillJson(route, 200, account);
  });

  const ledgerPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/ledger-transactions/(?:\\?.*)?$`);
  await page.route(ledgerPattern, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, ledgerEntries);
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        transaction_type: LedgerRecord["transaction_type"];
        amount: number;
        occurred_on: string;
        category_id: string | null;
        source_account_id: string | null;
        destination_account_id: string | null;
        description: string | null;
      };

      const created: LedgerRecord = {
        id: nextUuid(idCounter),
        family_id: familyId,
        created_by_user_id: TEST_USER.id,
        transaction_type: body.transaction_type,
        amount: body.amount,
        occurred_on: body.occurred_on,
        category_id: body.category_id,
        source_account_id: body.source_account_id,
        destination_account_id: body.destination_account_id,
        description: body.description,
      };

      ledgerEntries.unshift(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const goalsPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/goals/(?:\\?.*)?$`);
  await page.route(goalsPattern, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, goals);
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        target_amount: number;
        current_amount: number;
        target_date: string | null;
        monthly_contribution: number | null;
        icon: string | null;
        linked_account_id: string | null;
      };

      const created = normalizeGoal({
        id: nextUuid(idCounter),
        family_id: familyId,
        created_by_user_id: TEST_USER.id,
        name: body.name,
        target_amount: body.target_amount,
        current_amount: body.current_amount,
        target_date: body.target_date,
        monthly_contribution: body.monthly_contribution,
        icon: body.icon,
        linked_account_id: body.linked_account_id,
        is_paused: false,
        remaining_amount: 0,
        progress_percentage: 0,
        estimated_completion_date: null,
      });

      goals.unshift(created);
      goalEntriesByGoalId.set(created.id, []);
      await fulfillJson(route, 201, created);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const goalSinglePattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/goals/([^/?]+)(?:\\?.*)?$`);
  await page.route(goalSinglePattern, async (route) => {
    const method = route.request().method();
    if (method !== "PATCH" && method !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/goals\/([^/]+)$/);
    const goalId = match?.[1];
    const goalIndex = goals.findIndex((goal) => goal.id === goalId);

    if (goalIndex < 0 || !goalId) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    if (method === "PATCH") {
      const body = route.request().postDataJSON() as { is_paused?: boolean | null };
      if (typeof body.is_paused === "boolean") {
        goals[goalIndex] = { ...goals[goalIndex], is_paused: body.is_paused };
      }
      await fulfillJson(route, 200, goals[goalIndex]);
      return;
    }

    goals.splice(goalIndex, 1);
    goalEntriesByGoalId.delete(goalId);
    await route.fulfill({ status: 204, body: "" });
  });

  const goalEntriesPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/goals/([^/?]+)/entries(?:\\?.*)?$`);
  await page.route(goalEntriesPattern, async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/goals\/([^/]+)\/entries$/);
    const goalId = match?.[1];
    if (!goalId) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, goalEntriesByGoalId.get(goalId) ?? []);
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        amount: number;
        entry_type: GoalEntryRecord["entry_type"];
        occurred_on: string;
        note: string | null;
      };

      const entries = goalEntriesByGoalId.get(goalId) ?? [];
      const created: GoalEntryRecord = {
        id: nextUuid(idCounter),
        family_id: familyId,
        goal_id: goalId,
        created_by_user_id: TEST_USER.id,
        amount: body.amount,
        entry_type: body.entry_type,
        occurred_on: body.occurred_on,
        note: body.note,
      };

      entries.unshift(created);
      goalEntriesByGoalId.set(goalId, entries);

      const goalIndex = goals.findIndex((goal) => goal.id === goalId);
      if (goalIndex >= 0) {
        const current = goals[goalIndex];
        const nextCurrent =
          body.entry_type === "withdrawal"
            ? Math.max(current.current_amount - body.amount, 0)
            : current.current_amount + body.amount;
        goals[goalIndex] = normalizeGoal({ ...current, current_amount: nextCurrent });
      }

      await fulfillJson(route, 201, created);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const subscriptionsPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/subscriptions/(?:\\?.*)?$`);
  await page.route(subscriptionsPattern, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, subscriptions);
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        name: string;
        merchant: string;
        amount: number;
        currency_code: SubscriptionRecord["currency_code"];
        billing_cycle: SubscriptionRecord["billing_cycle"];
        next_billing_date: string;
        status: SubscriptionRecord["status"];
        category_id: string | null;
        account_id: string | null;
        cancellation_url: string | null;
      };

      const created: SubscriptionRecord = {
        id: nextUuid(idCounter),
        family_id: familyId,
        created_by_user_id: TEST_USER.id,
        name: body.name,
        merchant: body.merchant,
        amount: body.amount,
        currency_code: body.currency_code,
        billing_cycle: body.billing_cycle,
        next_billing_date: body.next_billing_date,
        status: body.status,
        category_id: body.category_id,
        account_id: body.account_id,
        cancellation_url: body.cancellation_url,
      };

      subscriptions.unshift(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const subscriptionSummaryPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/subscriptions/summary(?:\\?.*)?$`);
  await page.route(subscriptionSummaryPattern, async (route) => {
    await fulfillJson(route, 200, computeSubscriptionSummary(subscriptions));
  });

  const subscriptionSinglePattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/subscriptions/([^/?]+)(?:\\?.*)?$`);
  await page.route(subscriptionSinglePattern, async (route) => {
    const method = route.request().method();
    if (method !== "PATCH" && method !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/subscriptions\/([^/]+)$/);
    const subscriptionId = match?.[1];
    const index = subscriptions.findIndex((item) => item.id === subscriptionId);

    if (index < 0 || !subscriptionId) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    if (method === "PATCH") {
      const body = route.request().postDataJSON() as { status?: SubscriptionRecord["status"] | null };
      if (body.status) {
        subscriptions[index] = { ...subscriptions[index], status: body.status };
      }
      await fulfillJson(route, 200, subscriptions[index]);
      return;
    }

    subscriptions.splice(index, 1);
    await route.fulfill({ status: 204, body: "" });
  });

  const splitExpensesPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/split-expenses/(?:\\?.*)?$`);
  await page.route(splitExpensesPattern, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, splits);
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON() as {
        expense_id: string;
        method: SplitRecord["method"];
        participants: Array<{ participant_user_id: string; amount?: number; percentage?: number }>;
      };

      const sourceExpense = expenses.find((item) => item.id === body.expense_id);
      if (!sourceExpense) {
        await route.fulfill({ status: 422, body: "" });
        return;
      }

      const participantCount = Math.max(body.participants.length, 1);
      const items: SplitItemRecord[] = body.participants.map((participant) => {
        const amount =
          body.method === "custom"
            ? Number(participant.amount ?? 0)
            : body.method === "percentage"
              ? Math.round((sourceExpense.amount * Number(participant.percentage ?? 0)) / 100)
              : Math.round(sourceExpense.amount / participantCount);

        return {
          id: nextUuid(idCounter),
          split_expense_id: "",
          participant_user_id: participant.participant_user_id,
          amount,
          percentage: body.method === "percentage" ? Number(participant.percentage ?? 0) : null,
          is_settled: false,
        };
      });

      const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
      const splitId = nextUuid(idCounter);
      const normalizedItems = items.map((item) => ({ ...item, split_expense_id: splitId }));

      const created: SplitRecord = {
        id: splitId,
        family_id: familyId,
        created_by_user_id: TEST_USER.id,
        expense_id: body.expense_id,
        method: body.method,
        status: "pending",
        total_amount: totalAmount,
        settled_amount: 0,
        outstanding_amount: totalAmount,
        items: normalizedItems,
      };

      splits.unshift(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await route.fulfill({ status: 405, body: "" });
  });

  const splitSettlePattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/split-expenses/([^/?]+)/items/([^/?]+)/settle(?:\\?.*)?$`);
  await page.route(splitSettlePattern, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/split-expenses\/([^/]+)\/items\/([^/]+)\/settle$/);
    const splitId = match?.[1];
    const itemId = match?.[2];
    const body = route.request().postDataJSON() as { is_settled: boolean };

    const split = splits.find((item) => item.id === splitId);
    const splitItem = split?.items.find((item) => item.id === itemId);

    if (!split || !splitItem) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    splitItem.is_settled = body.is_settled;
    split.settled_amount = split.items.filter((item) => item.is_settled).reduce((sum, item) => sum + item.amount, 0);
    split.outstanding_amount = Math.max(split.total_amount - split.settled_amount, 0);
    split.status = split.outstanding_amount === 0 ? "settled" : "pending";

    await fulfillJson(route, 200, split);
  });

  const jsonExportPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/exports/expenses(?:\\?.*)?$`);
  await page.route(jsonExportPattern, async (route) => {
    await fulfillJson(route, 200, {
      items: expenses.map((expense) => ({
        ...expense,
        created_at: "2026-09-04T00:00:00Z",
      })),
    });
  });

  const backupExportPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/exports/backup(?:\\?.*)?$`);
  await page.route(backupExportPattern, async (route) => {
    await fulfillJson(route, 200, {
      expenses: expenses.map((expense) => ({
        ...expense,
        created_at: "2026-09-04T00:00:00Z",
      })),
    });
  });

  const csvExportPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/exports/expenses\\.csv(?:\\?.*)?$`);
  await page.route(csvExportPattern, async (route) => {
    const csvLines = [
      "expense_date,amount,category_id,payer_user_id,is_shared,description",
      ...expenses.map((expense) =>
        [
          expense.expense_date,
          String(expense.amount),
          expense.category_id,
          expense.payer_user_id,
          String(expense.is_shared),
          expense.description ?? "",
        ].join(","),
      ),
    ];

    await route.fulfill({
      status: 200,
      contentType: "text/csv",
      body: `${csvLines.join("\n")}\n`,
    });
  });

  const previewImportPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/imports/expenses/preview(?:\\?.*)?$`);
  await page.route(previewImportPattern, async (route) => {
    const previewRow = {
      payer_user_id: TEST_USER.id,
      category_id: categories[0]?.id ?? "cat-groceries",
      amount: 4567,
      is_shared: true,
      description: "Imported from CSV",
      expense_date: "2026-09-04",
      dedupe_key: "2026-09-04-4567",
      is_duplicate: false,
    };

    await fulfillJson(route, 200, {
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 0,
      rows: [previewRow],
      issues: [],
    });
  });

  const commitImportPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/imports/expenses/commit(?:\\?.*)?$`);
  await page.route(commitImportPattern, async (route) => {
    const body = route.request().postDataJSON() as {
      rows?: Array<{
        payer_user_id: string;
        category_id: string;
        amount: number;
        is_shared: boolean;
        description?: string | null;
        expense_date: string;
      }>;
    };

    const rows = body.rows ?? [];
    for (const row of rows) {
      expenses.unshift({
        id: nextUuid(idCounter),
        family_id: familyId,
        payer_user_id: row.payer_user_id,
        created_by_user_id: TEST_USER.id,
        category_id: row.category_id,
        amount: row.amount,
        is_shared: row.is_shared,
        description: row.description ?? null,
        expense_date: row.expense_date,
      });
    }

    await fulfillJson(route, 200, {
      created_count: rows.length,
      skipped_duplicate_count: 0,
    });
  });

  const deleteWithUndoPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/undo/expenses/([^/?]+)(?:\\?.*)?$`);
  await page.route(deleteWithUndoPattern, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/undo\/expenses\/([^/]+)$/);
    const expenseId = match?.[1];

    const index = expenses.findIndex((item) => item.id === expenseId);
    if (index < 0 || !expenseId) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    const [deleted] = expenses.splice(index, 1);
    const undoToken = `undo-${nextUuid(idCounter)}`;
    deletedExpenseByToken.set(undoToken, deleted);

    await fulfillJson(route, 200, {
      deleted_expense_id: deleted.id,
      undo_token: undoToken,
      expires_at: "2026-09-05T00:00:00Z",
    });
  });

  const restoreUndoPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/undo/([^/?]+)/restore(?:\\?.*)?$`);
  await page.route(restoreUndoPattern, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/undo\/([^/]+)\/restore$/);
    const undoToken = match?.[1];

    if (!undoToken) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    const restored = deletedExpenseByToken.get(undoToken);
    if (!restored) {
      await route.fulfill({ status: 404, body: "" });
      return;
    }

    expenses.unshift(restored);
    deletedExpenseByToken.delete(undoToken);

    await fulfillJson(route, 200, {
      restored_expense_id: restored.id,
    });
  });

  const cashFlowSummaryPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/analytics/cash-flow/summary(?:\\?.*)?$`);
  await page.route(cashFlowSummaryPattern, async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? "0000-01-01";
    const endDate = url.searchParams.get("end_date") ?? "9999-12-31";
    const expense_total = expenses
      .filter((item) => item.expense_date >= startDate && item.expense_date <= endDate)
      .reduce((sum, item) => sum + item.amount, 0);

    await fulfillJson(route, 200, {
      income_total: 0,
      expense_total,
      net_flow: -expense_total,
    });
  });

  const netWorthPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/analytics/net-worth(?:\\?.*)?$`);
  await page.route(netWorthPattern, async (route) => {
    const current_net_worth = accounts.reduce((sum, account) => sum + account.current_balance, 0);
    await fulfillJson(route, 200, {
      current_net_worth,
      previous_net_worth: current_net_worth,
      change_amount: 0,
    });
  });
}

test.describe("Finance guided usage", () => {
  test("walks through the new finance features step by step", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await setupFinanceGuidedMocks(page);

    // Step 1: Create a finance account and add one ledger entry.
    await page.goto(`/families/${TEST_FAMILY.id}/finance/accounts`);
    await expect(page.getByRole("heading", { level: 1, name: "口座と台帳" })).toBeVisible();

    await page.locator("#finance-account-name").fill("生活口座");
    await page.locator("#finance-account-opening").fill("500000");
    await page.getByRole("button", { name: "口座を作成" }).click();

    await expect(page.getByText("口座を作成しました", { exact: true })).toBeVisible();
    await expect(page.locator("#finance-ledger-source")).toContainText("生活口座");

    await page.locator("#finance-ledger-amount").fill("12000");
    await page.locator("#finance-ledger-source").selectOption({ label: "生活口座" });
    await page.locator("#finance-ledger-category").selectOption({ value: TEST_CATEGORIES[0].id });
    await page.locator("#finance-ledger-note").fill("スーパー買い物");
    await page.getByRole("button", { name: "台帳エントリーを追加" }).click();

    await expect(page.getByText("スーパー買い物")).toBeVisible();

    // Step 2: Create a savings goal and add one contribution entry.
    await page.getByRole("link", { name: "目標" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "目標" })).toBeVisible();

    await page.locator("#finance-goal-name").fill("旅行積立");
    await page.locator("#finance-goal-target").fill("300000");
    await page.locator("#finance-goal-current").fill("50000");
    await page.locator("#finance-goal-monthly").fill("10000");
    await page.getByRole("button", { name: "目標を作成" }).click();

    const goalItem = page.locator("li", { hasText: "旅行積立" }).first();
    await expect(goalItem).toBeVisible();
    await goalItem.getByRole("button", { name: "エントリーを追加" }).click();

    const entryDialog = page.getByRole("dialog");
    await entryDialog.locator("#finance-goal-entry-amount").fill("10000");
    await entryDialog.locator("#finance-goal-entry-note").fill("初回積立");
    await entryDialog.getByRole("button", { name: "エントリーを追加" }).click();
    await expect(entryDialog.getByText("初回積立")).toBeVisible();
    await entryDialog.getByRole("button", { name: "閉じる" }).first().click();
    await expect(entryDialog).not.toBeVisible();

    // Step 3: Add one subscription and pause it.
    await page.getByRole("link", { name: "サブスクリプション" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "サブスクリプション" })).toBeVisible();

    await page.locator("#finance-subscription-name").fill("Netflix Premium");
    await page.locator("#finance-subscription-merchant").fill("Netflix");
    await page.locator("#finance-subscription-amount").fill("990");
    await page.getByRole("button", { name: "サブスクを作成" }).click();

    const subscriptionItem = page.locator("li", { hasText: "Netflix Premium" }).first();
    await expect(subscriptionItem).toBeVisible();
    await subscriptionItem.getByRole("button", { name: "一時停止" }).click();
    await expect(subscriptionItem.getByRole("button", { name: "有効化" })).toBeVisible();

    // Step 4: Split one expense and mark one participant as settled.
    await page.getByRole("link", { name: "割り勘" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "割り勘" })).toBeVisible();

    await page.locator("#finance-split-expense").selectOption({ value: TEST_EXPENSES[0].id });
    await page.locator("label", { hasText: TEST_FAMILY_DETAIL.members[0].display_name }).locator('input[type="checkbox"]').check();
    await page.locator("label", { hasText: TEST_FAMILY_DETAIL.members[1].display_name }).locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "割り勘を作成" }).click();

    await expect(page.getByText("未精算", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "精算済みにする" }).first().click();
    await expect(page.getByRole("button", { name: "未精算に戻す" }).first()).toBeVisible();

    // Step 5: Preview + commit import, then delete one expense with undo and restore it.
    await page.getByRole("link", { name: "データ操作" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "データ操作" })).toBeVisible();

    await page.locator("#finance-import-file").setInputFiles({
      name: "expenses.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("expense_date,amount,category_id,payer_user_id,is_shared,description\n"),
    });

    await page.getByRole("button", { name: "取り込みをプレビュー" }).click();
    await expect(page.getByText(/合計:\s*1/)).toBeVisible();

    await page.getByRole("button", { name: "取り込みを確定" }).click();
    await expect(page.getByRole("button", { name: "取り消し付きで削除" })).toHaveCount(2);

    await page.getByRole("button", { name: "取り消し付きで削除" }).first().click();
    await expect(page.locator("#finance-undo-token")).not.toHaveValue("");

    await page.getByRole("button", { name: "復元" }).click();
    await expect(page.locator("#finance-undo-token")).toHaveValue("");

    // Step 6: Verify dashboard transaction ledger reflects imported + restored data.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "ダッシュボード" })).toBeVisible();

    await page.getByRole("tab", { name: "取引" }).click();
    const ledgerTable = page.locator('[data-tour="dashboard-ledger"]');
    await expect(ledgerTable).toContainText("Imported from CSV");
    await expect(ledgerTable).toContainText("Weekly groceries");
    await expect(ledgerTable.locator("tbody tr")).toHaveCount(2);
  });
});
