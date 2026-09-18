import { apiClient } from "../api/client";
import { buildApiError } from "../api/errors";
import type { components } from "../api/schema.gen";

export type Category = components["schemas"]["CategoryResponse"];
export type Expense = components["schemas"]["ExpenseResponse"];

export interface ExpenseInput {
  payer_user_id: string;
  category_id: string;
  amount: number;
  is_shared: boolean;
  description?: string | null;
  expense_date: string;
  trip_id?: string | null;
  trip_itinerary_item_id?: string | null;
}

export function resolveCategoryDisplayName(
  category: Category,
  t: (key: string) => string,
): string {
  return category.family_id === null ? t(`category.${category.name}`) : category.name;
}

export async function listCategories(familyId: string): Promise<Category[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/categories/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_categories_failed",
      fallbackMessage: "Failed to list categories",
    });
  }
  return data;
}

export async function createCategory(
  familyId: string,
  name: string,
  icon?: string,
): Promise<Category> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/categories/", {
    params: { path: { family_id: familyId } },
    body: { name, icon: icon ?? null },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_category_failed",
      fallbackMessage: "Failed to create category",
    });
  }
  return data;
}

export async function renameCategory(
  familyId: string,
  categoryId: string,
  name: string,
): Promise<Category> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/categories/{category_id}",
    {
      params: { path: { family_id: familyId, category_id: categoryId } },
      body: { name },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "rename_category_failed",
      fallbackMessage: "Failed to rename category",
    });
  }
  return data;
}

export async function deleteCategory(familyId: string, categoryId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/categories/{category_id}",
    { params: { path: { family_id: familyId, category_id: categoryId } } },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_category_failed",
      fallbackMessage: "Failed to delete category",
      codeMap: {
        CATEGORY_HAS_EXPENSES: "category_has_expenses",
      },
    });
  }
}

export async function listExpenses(familyId: string): Promise<Expense[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/expenses/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_expenses_failed",
      fallbackMessage: "Failed to list expenses",
    });
  }
  return data;
}

export async function createExpense(familyId: string, input: ExpenseInput): Promise<Expense> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/expenses/",
    {
      params: { path: { family_id: familyId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_expense_failed",
      fallbackMessage: "Failed to create expense",
      codeMap: {
        EXPENSE_PAYER_NOT_IN_FAMILY: "invalid_payer_or_category",
        EXPENSE_CATEGORY_INVALID_FOR_FAMILY: "invalid_payer_or_category",
      },
    });
  }
  return data;
}

export async function updateExpense(
  familyId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/expenses/{expense_id}",
    {
      params: { path: { family_id: familyId, expense_id: expenseId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_expense_failed",
      fallbackMessage: "Failed to update expense",
      codeMap: {
        EXPENSE_PAYER_NOT_IN_FAMILY: "invalid_payer_or_category",
        EXPENSE_CATEGORY_INVALID_FOR_FAMILY: "invalid_payer_or_category",
        PERMISSION_DENIED: "not_permitted",
      },
    });
  }
  return data;
}

export async function deleteExpense(familyId: string, expenseId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/expenses/{expense_id}",
    {
      params: { path: { family_id: familyId, expense_id: expenseId } },
    },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_expense_failed",
      fallbackMessage: "Failed to delete expense",
    });
  }
}
