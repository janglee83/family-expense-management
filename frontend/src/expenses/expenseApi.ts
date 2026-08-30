import { apiClient } from "../api/client";
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
}

export function resolveCategoryDisplayName(
  category: Category,
  t: (key: string) => string,
): string {
  return category.family_id === null ? t(`category.${category.name}`) : category.name;
}

export async function listCategories(familyId: string): Promise<Category[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/{family_id}/categories/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw new Error("list_categories_failed");
  }
  return data;
}

export async function createCategory(familyId: string, name: string): Promise<Category> {
  const { data, error } = await apiClient.POST("/api/v1/families/{family_id}/categories/", {
    params: { path: { family_id: familyId } },
    body: { name },
  });
  if (error || !data) {
    throw new Error("create_category_failed");
  }
  return data;
}

export async function renameCategory(
  familyId: string,
  categoryId: string,
  name: string,
): Promise<Category> {
  const { data, error } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/categories/{category_id}",
    {
      params: { path: { family_id: familyId, category_id: categoryId } },
      body: { name },
    },
  );
  if (error || !data) {
    throw new Error("rename_category_failed");
  }
  return data;
}

export async function deleteCategory(familyId: string, categoryId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/categories/{category_id}",
    { params: { path: { family_id: familyId, category_id: categoryId } } },
  );
  if (error) {
    if (response.status === 409) {
      throw new Error("category_has_expenses");
    }
    throw new Error("delete_category_failed");
  }
}

export async function listExpenses(familyId: string): Promise<Expense[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/{family_id}/expenses/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw new Error("list_expenses_failed");
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
    if (response.status === 422) {
      throw new Error("invalid_payer_or_category");
    }
    throw new Error("create_expense_failed");
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
    if (response.status === 422) {
      throw new Error("invalid_payer_or_category");
    }
    if (response.status === 403) {
      throw new Error("not_permitted");
    }
    throw new Error("update_expense_failed");
  }
  return data;
}

export async function deleteExpense(familyId: string, expenseId: string): Promise<void> {
  const { error } = await apiClient.DELETE("/api/v1/families/{family_id}/expenses/{expense_id}", {
    params: { path: { family_id: familyId, expense_id: expenseId } },
  });
  if (error) {
    throw new Error("delete_expense_failed");
  }
}
