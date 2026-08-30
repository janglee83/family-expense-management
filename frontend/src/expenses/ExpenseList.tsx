import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import {
  deleteCategory,
  deleteExpense,
  listCategories,
  listExpenses,
  renameCategory,
  resolveCategoryDisplayName,
  type Category,
  type Expense,
} from "./expenseApi";
import { ExpenseForm } from "./ExpenseForm";

export function ExpenseList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [myRole, setMyRole] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;

    Promise.all([listExpenses(familyId), listCategories(familyId), getFamilyDetail(familyId)])
      .then(([expenseResult, categoryResult, familyDetail]) => {
        if (cancelled) return;
        setExpenses(expenseResult);
        setCategories(categoryResult);
        setMemberNames(
          Object.fromEntries(
            familyDetail.members.map((member) => [member.user_id, member.display_name]),
          ),
        );
        setMyRole(familyDetail.members.find((member) => member.user_id === user?.id)?.role);
      })
      .catch(() => {
        if (!cancelled) {
          setExpenses([]);
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [familyId, user?.id]);

  const canManage = myRole === "owner" || myRole === "admin";

  function categoryDisplayName(categoryId: string): string {
    const category = categories.find((item) => item.id === categoryId);
    return category ? resolveCategoryDisplayName(category, t) : categoryId;
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!familyId || !window.confirm(t("expense.confirmDeleteExpense"))) return;
    try {
      await deleteExpense(familyId, expenseId);
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
    } catch {
      setError(t("expense.actionFailed"));
    }
  }

  async function handleRenameCategory(categoryId: string) {
    if (!familyId) return;
    const newName = window.prompt(t("expense.newCategoryName"));
    if (!newName) return;
    try {
      const updated = await renameCategory(familyId, categoryId, newName);
      setCategories((current) =>
        current.map((category) => (category.id === categoryId ? updated : category)),
      );
    } catch {
      setError(t("expense.actionFailed"));
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!familyId) return;
    try {
      await deleteCategory(familyId, categoryId);
      setCategories((current) => current.filter((category) => category.id !== categoryId));
    } catch (err) {
      setError(
        err instanceof Error && err.message === "category_has_expenses"
          ? t("expense.actionFailed")
          : t("expense.actionFailed"),
      );
    }
  }

  if (isLoading || !familyId) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <main>
      <h1>{t("expense.myExpenses")}</h1>
      {isCreating ? (
        <ExpenseForm
          familyId={familyId}
          onSaved={(expense) => {
            setExpenses((current) => [expense, ...current]);
            void listCategories(familyId).then(setCategories);
            setIsCreating(false);
          }}
          onCancel={() => setIsCreating(false)}
        />
      ) : (
        <button onClick={() => setIsCreating(true)}>{t("expense.addExpense")}</button>
      )}
      {expenses.length === 0 ? (
        <p>{t("expense.noExpenses")}</p>
      ) : (
        <ul>
          {expenses.map((expense) => {
            const canEditThis = canManage || expense.created_by_user_id === user?.id;
            if (editingExpenseId === expense.id) {
              return (
                <li key={expense.id}>
                  <ExpenseForm
                    familyId={familyId}
                    expense={expense}
                    onSaved={(updated) => {
                      setExpenses((current) =>
                        current.map((item) => (item.id === updated.id ? updated : item)),
                      );
                      void listCategories(familyId).then(setCategories);
                      setEditingExpenseId(null);
                    }}
                    onCancel={() => setEditingExpenseId(null)}
                  />
                </li>
              );
            }
            return (
              <li key={expense.id}>
                {expense.amount} — {categoryDisplayName(expense.category_id)} —{" "}
                {memberNames[expense.payer_user_id] ?? expense.payer_user_id} —{" "}
                {expense.expense_date} (
                {expense.is_shared ? t("expense.shared") : t("expense.personal")})
                {canEditThis && (
                  <>
                    <button onClick={() => setEditingExpenseId(expense.id)}>
                      {t("expense.editExpense")}
                    </button>
                    <button onClick={() => void handleDeleteExpense(expense.id)}>
                      {t("expense.deleteExpense")}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <ul>
          {categories
            .filter((category) => category.family_id !== null)
            .map((category) => (
              <li key={category.id}>
                {category.name}
                <button onClick={() => void handleRenameCategory(category.id)}>
                  {t("family.rename")}
                </button>
                <button onClick={() => void handleDeleteCategory(category.id)}>
                  {t("family.delete")}
                </button>
              </li>
            ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
