import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { resolveCategoryDisplayName, type Expense } from "./expenseApi";
import { useCategories, useCreateExpense, useUpdateExpense } from "./expenseQueries";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { resolveCategoryIconSymbol } from "./categoryIcons";
import { currencyLocale } from "../utils/currency";

interface ExpenseFormProps {
  familyId: string;
  expense?: Expense;
  currencyCode?: string;
  onSaved: (expense: Expense) => void;
  onCancel?: () => void;
}

const MIN_AMOUNT = 1;
const MAX_INT_32 = 2_147_483_647;

function toDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatDigitsAsAmount(value: string, currencyCode: string): string {
  const digits = toDigits(value);
  if (!digits) {
    return "";
  }
  return Number(digits).toLocaleString(currencyLocale(currencyCode));
}

export function ExpenseForm({ familyId, expense, currencyCode, onSaved, onCancel }: ExpenseFormProps) {
  const { t } = useTranslation();
  const categoriesQuery = useCategories(familyId);
  const familyDetailQuery = useFamilyDetail(familyId);
  const categories = categoriesQuery.data ?? [];
  const members = familyDetailQuery.data?.members ?? [];
  const activeCurrencyCode = currencyCode ?? familyDetailQuery.data?.currency_code ?? "jpy";
  const [payerUserId, setPayerUserId] = useState(expense?.payer_user_id ?? "");
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [amountInput, setAmountInput] = useState(
    expense ? formatDigitsAsAmount(String(expense.amount), currencyCode ?? "jpy") : "",
  );
  const [isShared, setIsShared] = useState(expense?.is_shared ?? false);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const createExpenseMutation = useCreateExpense(familyId);
  const updateExpenseMutation = useUpdateExpense(familyId);
  const isSubmitting = createExpenseMutation.isPending || updateExpenseMutation.isPending;
  const initialLoadError =
    categoriesQuery.isError || familyDetailQuery.isError ? t("expense.actionFailed") : null;
  const payerId = `expense-payer-${familyId}`;
  const categoryIdInput = `expense-category-${familyId}`;
  const amountId = `expense-amount-${familyId}`;
  const sharedId = `expense-shared-${familyId}`;
  const dateId = `expense-date-${familyId}`;
  const descriptionId = `expense-description-${familyId}`;
  const effectivePayerUserId = payerUserId || members[0]?.user_id || "";
  const effectiveCategoryId = categoryId || categories[0]?.id || "";
  const displayError = error || initialLoadError;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(toDigits(amountInput));
    if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT) {
      setError(t("expense.amountMustBePositive"));
      return;
    }
    if (parsedAmount > MAX_INT_32) {
      setError(t("expense.amountTooLarge"));
      return;
    }

    setError(null);
    const input = {
      payer_user_id: effectivePayerUserId,
      category_id: effectiveCategoryId,
      amount: parsedAmount,
      is_shared: isShared,
      description: description || null,
      expense_date: expenseDate,
    };

    const mutationOptions = {
      onSuccess: onSaved,
      onError: (err: unknown) => {
        setError(translateApiError(t, err, "expense.actionFailed"));
      },
    };

    if (expense) {
      updateExpenseMutation.mutate({ expenseId: expense.id, input }, mutationOptions);
    } else {
      createExpenseMutation.mutate(input, mutationOptions);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="grid gap-4 rounded-lg border border-border/80 bg-muted/25 p-4 md:grid-cols-2">
        <Field label={t("expense.payer")} htmlFor={payerId} required>
          <select
            id={payerId}
            value={effectivePayerUserId}
            className="min-h-10"
            onChange={(event) => setPayerUserId(event.target.value)}
          >
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("expense.category")} htmlFor={categoryIdInput} required>
          <select
            id={categoryIdInput}
            value={effectiveCategoryId}
            className="min-h-10"
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {resolveCategoryIconSymbol(category.icon, category.name)} {resolveCategoryDisplayName(category, t)}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid gap-4 rounded-lg border border-border/80 bg-muted/25 p-4 md:grid-cols-2">
        <Field label={t("expense.amount")} htmlFor={amountId} required>
          <input
            id={amountId}
            type="text"
            inputMode="numeric"
            value={amountInput}
            onChange={(event) =>
              setAmountInput(formatDigitsAsAmount(event.target.value, activeCurrencyCode))
            }
            placeholder="12,345"
            required
          />
        </Field>

        <Field label={t("expense.date")} htmlFor={dateId} required>
          <input
            id={dateId}
            type="date"
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
            required
          />
        </Field>

        <Field label={t("expense.description")} htmlFor={descriptionId} className="md:col-span-2">
          <input
            id={descriptionId}
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="rounded-md border border-border bg-card/80 px-3 py-2 transition-colors hover:border-primary/35 md:col-span-2">
          <label
            htmlFor={sharedId}
            className="flex items-center gap-2 text-sm font-medium text-foreground"
            data-field="shared"
          >
            <input
              id={sharedId}
              type="checkbox"
              className="peer"
              checked={isShared}
              onChange={(event) => setIsShared(event.target.checked)}
            />
            <span className="transition-colors peer-checked:text-primary">{t("expense.shared")}</span>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="submit"
          className="w-full sm:w-auto"
          loading={isSubmitting}
          loadingLabel={t("common.loading")}
        >
          {expense ? t("expense.editExpense") : t("expense.addExpense")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>

      {displayError ? (
        <Alert variant="error" role="alert">
          {displayError}
        </Alert>
      ) : null}
    </form>
  );
}
