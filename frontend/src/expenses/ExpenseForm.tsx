import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getFamilyDetail, type FamilyMemberInfo } from "../families/familyApi";
import {
  createCategory,
  createExpense,
  listCategories,
  resolveCategoryDisplayName,
  updateExpense,
  type Category,
  type Expense,
} from "./expenseApi";

interface ExpenseFormProps {
  familyId: string;
  expense?: Expense;
  onSaved: (expense: Expense) => void;
  onCancel?: () => void;
}

const MIN_AMOUNT = 1;

export function ExpenseForm({ familyId, expense, onSaved, onCancel }: ExpenseFormProps) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMemberInfo[]>([]);
  const [payerUserId, setPayerUserId] = useState(expense?.payer_user_id ?? "");
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [isShared, setIsShared] = useState(expense?.is_shared ?? false);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10),
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCategories(familyId), getFamilyDetail(familyId)]).then(
      ([categoryResult, familyDetail]) => {
        if (cancelled) return;
        setCategories(categoryResult);
        setMembers(familyDetail.members);
        setCategoryId((current) => current || categoryResult[0]?.id || "");
        setPayerUserId((current) => current || familyDetail.members[0]?.user_id || "");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  async function handleCreateCategory() {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) return;
    try {
      const category = await createCategory(familyId, trimmedName);
      setCategories((current) => [...current, category]);
      setCategoryId(category.id);
      setNewCategoryName("");
    } catch {
      setError(t("expense.actionFailed"));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT) {
      setError(t("expense.amountMustBePositive"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        payer_user_id: payerUserId,
        category_id: categoryId,
        amount: parsedAmount,
        is_shared: isShared,
        description: description || null,
        expense_date: expenseDate,
      };
      const saved = expense
        ? await updateExpense(familyId, expense.id, input)
        : await createExpense(familyId, input);
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "invalid_payer_or_category"
          ? t("expense.invalidPayerOrCategory")
          : t("expense.actionFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("expense.payer")}
        <select value={payerUserId} onChange={(event) => setPayerUserId(event.target.value)}>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("expense.category")}
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {resolveCategoryDisplayName(category, t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("expense.newCategoryName")}
        <input
          type="text"
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => void handleCreateCategory()}>
        {t("expense.addCategory")}
      </button>
      <label>
        {t("expense.amount")}
        <input
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={isShared}
          onChange={(event) => setIsShared(event.target.checked)}
        />
        {t("expense.shared")}
      </label>
      <label>
        {t("expense.date")}
        <input
          type="date"
          value={expenseDate}
          onChange={(event) => setExpenseDate(event.target.value)}
          required
        />
      </label>
      <label>
        {t("expense.description")}
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {expense ? t("expense.editExpense") : t("expense.addExpense")}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
