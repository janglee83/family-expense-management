import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { type CurrencyCode, type Family, type FamilyType } from "./familyApi";
import { useCreateFamily } from "./familyQueries";
import { isEmailLike } from "../utils/validators";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

const MAX_INT_32 = 2_147_483_647;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function localeForCurrency(currencyCode: CurrencyCode): string {
  return currencyCode === "vnd" ? "vi-VN" : "ja-JP";
}

function formatNumberWithCommas(rawValue: string, currencyCode: CurrencyCode): string {
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  return Number(digits).toLocaleString(localeForCurrency(currencyCode));
}

function parseIntegerFromFormatted(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

export function CreateFamilyForm({ onCreated }: { onCreated: (family: Family) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [familyType, setFamilyType] = useState<FamilyType>("shared");
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>("jpy");
  const [monthlyIncomeEnabled, setMonthlyIncomeEnabled] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [savingsGoalAmount, setSavingsGoalAmount] = useState("");
  const [memberEmailInput, setMemberEmailInput] = useState("");
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    memberEmail?: string;
    monthlyIncome?: string;
    savingsGoal?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const createFamilyMutation = useCreateFamily();
  const nameId = "create-family-name";
  const typeId = "create-family-type";
  const currencyId = "create-family-currency";
  const monthlyIncomeEnabledId = "create-family-income-enabled";
  const incomeId = "create-family-income";
  const savingsGoalId = "create-family-savings-goal";
  const emailId = "create-family-member-email";

  function addMemberEmail() {
    const normalized = normalizeEmail(memberEmailInput);
    if (!normalized) {
      return;
    }
    if (!isEmailLike(normalized)) {
      setFieldErrors((current) => ({ ...current, memberEmail: t("family.invalidMemberEmail") }));
      return;
    }
    if (memberEmails.includes(normalized)) {
      setFieldErrors((current) => ({ ...current, memberEmail: t("family.memberAlreadyInDraft") }));
      return;
    }

    setFieldErrors((current) => ({ ...current, memberEmail: undefined }));
    setMemberEmails((current) => [...current, normalized]);
    setMemberEmailInput("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const errors: typeof fieldErrors = {};
    if (!trimmedName) {
      errors.name = t("family.nameRequired");
    }

    const parsedIncome = parseIntegerFromFormatted(monthlyIncome);
    const parsedSavingsGoal = parseIntegerFromFormatted(savingsGoalAmount);
    if (familyType === "solo" && parsedSavingsGoal === null) {
      errors.savingsGoal = t("family.savingsGoalRequiredForSolo");
    } else if (monthlyIncomeEnabled && parsedIncome === null) {
      errors.monthlyIncome = t("family.monthlyIncomeRequiredWhenEnabled");
    } else if (!monthlyIncomeEnabled && parsedIncome !== null) {
      errors.monthlyIncome = t("family.monthlyIncomeMustBeEmptyWhenDisabled");
    } else if (parsedIncome !== null && (parsedIncome < 1 || parsedIncome > MAX_INT_32)) {
      errors.monthlyIncome = t("family.invalidMonthlyIncome");
    } else if (parsedSavingsGoal !== null && (parsedSavingsGoal < 1 || parsedSavingsGoal > MAX_INT_32)) {
      errors.savingsGoal = t("family.invalidSavingsGoal");
    }

    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    createFamilyMutation.mutate(
      {
        name: trimmedName,
        family_type: familyType,
        currency_code: currencyCode,
        monthly_income_enabled: monthlyIncomeEnabled,
        member_emails: familyType === "shared" ? memberEmails : [],
        monthly_income: monthlyIncomeEnabled ? parsedIncome : null,
        savings_goal_amount: parsedSavingsGoal,
      },
      {
        onSuccess: (family) => {
          onCreated(family);
          setName("");
          setFamilyType("shared");
          setCurrencyCode("jpy");
          setMonthlyIncomeEnabled(false);
          setMonthlyIncome("");
          setSavingsGoalAmount("");
          setMemberEmailInput("");
          setMemberEmails([]);
          setFieldErrors({});
        },
        onError: (err) => {
          setFormError(translateApiError(t, err, "family.actionFailed"));
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-tour="family-create-form" noValidate>
      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
        <h2 className="type-h3">{t("family.name")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("family.name")} htmlFor={nameId} required className="md:col-span-2" error={fieldErrors.name}>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
            />
          </Field>

          <Field label={t("family.type")} htmlFor={typeId} required>
            <select
              id={typeId}
              value={familyType}
              onChange={(event) => setFamilyType(event.target.value as FamilyType)}
              className="min-h-10"
            >
              <option value="shared">{t("family.typeShared")}</option>
              <option value="solo">{t("family.typeSolo")}</option>
            </select>
          </Field>

          <Field label={t("family.currency")} htmlFor={currencyId} required>
            <select
              id={currencyId}
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.target.value as CurrencyCode)}
              className="min-h-10"
            >
              <option value="jpy">{t("family.currencyJpy")}</option>
              <option value="vnd">{t("family.currencyVnd")}</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
        <label
          htmlFor={monthlyIncomeEnabledId}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <input
            id={monthlyIncomeEnabledId}
            type="checkbox"
            checked={monthlyIncomeEnabled}
            onChange={(event) => {
              setMonthlyIncomeEnabled(event.target.checked);
              if (!event.target.checked) {
                setMonthlyIncome("");
              }
            }}
          />
          <span>{t("family.enableMonthlyIncome")}</span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          {monthlyIncomeEnabled ? (
            <Field
              label={t("family.monthlyIncomeWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor={incomeId}
              required
              error={fieldErrors.monthlyIncome}
            >
              <input
                id={incomeId}
                type="text"
                inputMode="numeric"
                value={monthlyIncome}
                onChange={(event) => {
                  setMonthlyIncome(formatNumberWithCommas(event.target.value, currencyCode));
                  setFieldErrors((current) => ({ ...current, monthlyIncome: undefined }));
                }}
                placeholder={currencyCode === "vnd" ? "20.000.000" : "200,000"}
              />
            </Field>
          ) : null}

          {familyType === "solo" ? (
            <Field
              label={t("family.savingsGoalWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor={savingsGoalId}
              required
              error={fieldErrors.savingsGoal}
            >
              <input
                id={savingsGoalId}
                type="text"
                inputMode="numeric"
                value={savingsGoalAmount}
                onChange={(event) => {
                  setSavingsGoalAmount(formatNumberWithCommas(event.target.value, currencyCode));
                  setFieldErrors((current) => ({ ...current, savingsGoal: undefined }));
                }}
                placeholder={currencyCode === "vnd" ? "20.000.000" : "200,000"}
              />
            </Field>
          ) : null}
        </div>
      </section>

      {familyType === "shared" ? (
        <section className="space-y-3 rounded-lg border border-border/80 bg-muted/25 p-4">
          <Field label={t("family.memberEmail")} htmlFor={emailId} error={fieldErrors.memberEmail}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={emailId}
                type="email"
                value={memberEmailInput}
                onChange={(event) => {
                  setMemberEmailInput(event.target.value);
                  setFieldErrors((current) => ({ ...current, memberEmail: undefined }));
                }}
                placeholder="member@example.com"
              />
              <Button type="button" variant="secondary" onClick={addMemberEmail}>
                {t("family.addMember")}
              </Button>
            </div>
          </Field>

          {memberEmails.length > 0 ? (
            <ul className="space-y-2">
              {memberEmails.map((email) => (
                <li
                  key={email}
                  className="interactive-row flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm text-foreground">{email}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMemberEmails((current) => current.filter((item) => item !== email))
                    }
                  >
                    {t("family.removeMember")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t("family.noDraftMembers")}</p>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="submit"
          className="w-full sm:w-auto"
          loading={createFamilyMutation.isPending}
          loadingLabel={t("common.loading")}
        >
          {t("family.create")}
        </Button>
      </div>

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
