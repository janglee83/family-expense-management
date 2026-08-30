import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { getFamilyDetail } from "../families/familyApi";
import {
  listCategories,
  listExpenses,
  resolveCategoryDisplayName,
  type Category,
  type Expense,
} from "./expenseApi";

export function ExpenseList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

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
  }, [familyId]);

  function categoryDisplayName(categoryId: string): string {
    const category = categories.find((item) => item.id === categoryId);
    return category ? resolveCategoryDisplayName(category, t) : categoryId;
  }

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <main>
      <h1>{t("expense.myExpenses")}</h1>
      {expenses.length === 0 ? (
        <p>{t("expense.noExpenses")}</p>
      ) : (
        <ul>
          {expenses.map((expense) => (
            <li key={expense.id}>
              {expense.amount} — {categoryDisplayName(expense.category_id)} —{" "}
              {memberNames[expense.payer_user_id] ?? expense.payer_user_id} —{" "}
              {expense.expense_date} (
              {expense.is_shared ? t("expense.shared") : t("expense.personal")})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
