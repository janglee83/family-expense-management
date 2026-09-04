import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { createFamily, type CurrencyCode, type Family, type FamilyType } from "./familyApi";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

const MAX_INT_32 = 2_147_483_647;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      setError(t("family.invalidMemberEmail"));
      return;
    }
    if (memberEmails.includes(normalized)) {
      setError(t("family.memberAlreadyInDraft"));
      return;
    }

    setError(null);
    setMemberEmails((current) => [...current, normalized]);
    setMemberEmailInput("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("family.nameRequired"));
      return;
    }

    const parsedIncome = parseIntegerFromFormatted(monthlyIncome);
    const parsedSavingsGoal = parseIntegerFromFormatted(savingsGoalAmount);
    if (familyType === "solo" && parsedSavingsGoal === null) {
      setError(t("family.savingsGoalRequiredForSolo"));
      return;
    }
    if (monthlyIncomeEnabled && parsedIncome === null) {
      setError(t("family.monthlyIncomeRequiredWhenEnabled"));
      return;
    }
    if (!monthlyIncomeEnabled && parsedIncome !== null) {
      setError(t("family.monthlyIncomeMustBeEmptyWhenDisabled"));
      return;
    }
    if (parsedIncome !== null && (parsedIncome < 1 || parsedIncome > MAX_INT_32)) {
      setError(t("family.invalidMonthlyIncome"));
      return;
    }
    if (parsedSavingsGoal !== null && (parsedSavingsGoal < 1 || parsedSavingsGoal > MAX_INT_32)) {
      setError(t("family.invalidSavingsGoal"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const family = await createFamily({
        name: trimmedName,
        family_type: familyType,
        currency_code: currencyCode,
        monthly_income_enabled: monthlyIncomeEnabled,
        member_emails: familyType === "shared" ? memberEmails : [],
        monthly_income: monthlyIncomeEnabled ? parsedIncome : null,
        savings_goal_amount: parsedSavingsGoal,
      });
      onCreated(family);
      setName("");
      setFamilyType("shared");
      setCurrencyCode("jpy");
      setMonthlyIncomeEnabled(false);
      setMonthlyIncome("");
      setSavingsGoalAmount("");
      setMemberEmailInput("");
      setMemberEmails([]);
    } catch (err) {
      setError(translateApiError(t, err, "family.actionFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-tour="family-create-form">
      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
        <h2 className="type-h3">{t("family.name")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("family.name")} htmlFor={nameId} required className="md:col-span-2">
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
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
            >
              <input
                id={incomeId}
                type="text"
                inputMode="numeric"
                value={monthlyIncome}
                onChange={(event) =>
                  setMonthlyIncome(formatNumberWithCommas(event.target.value, currencyCode))
                }
                placeholder={currencyCode === "vnd" ? "20.000.000" : "200,000"}
                required
              />
            </Field>
          ) : null}

          {familyType === "solo" ? (
            <Field
              label={t("family.savingsGoalWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor={savingsGoalId}
              required
            >
              <input
                id={savingsGoalId}
                type="text"
                inputMode="numeric"
                value={savingsGoalAmount}
                onChange={(event) =>
                  setSavingsGoalAmount(formatNumberWithCommas(event.target.value, currencyCode))
                }
                placeholder={currencyCode === "vnd" ? "20.000.000" : "200,000"}
                required
              />
            </Field>
          ) : null}
        </div>
      </section>

      {familyType === "shared" ? (
        <section className="space-y-3 rounded-lg border border-border/80 bg-muted/25 p-4">
          <Field label={t("family.memberEmail")} htmlFor={emailId}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={emailId}
                type="email"
                value={memberEmailInput}
                onChange={(event) => setMemberEmailInput(event.target.value)}
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
          loading={isSubmitting}
          loadingLabel={t("common.loading")}
        >
          {t("family.create")}
        </Button>
      </div>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}
