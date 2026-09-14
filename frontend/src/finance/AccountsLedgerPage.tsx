import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { useCategories } from "../expenses/expenseQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { resolveCategoryDisplayName } from "../expenses/expenseApi";
import { formatMoney } from "../utils/currency";
import { type AccountType, type LedgerTransactionType } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import {
  useAccounts,
  useCreateAccount,
  useCreateLedgerTransaction,
  useLedgerTransactions,
  useToggleAccountActive,
} from "./queries/accountsLedgerQueries";
import { useAccountsLedgerStore } from "./stores/accountsLedgerStore";

const ACCOUNT_TYPES: AccountType[] = ["bank", "cash", "investment", "credit_card", "loan"];
const LEDGER_TYPES: LedgerTransactionType[] = [
  "expense",
  "income",
  "transfer",
  "credit_card_purchase",
  "credit_card_payment",
  "goal_contribution",
  "goal_withdrawal",
];

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AccountsLedgerPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const { accountForm, ledgerForm, setAccountForm, setLedgerForm, resetAccountForm, resetLedgerForm } =
    useAccountsLedgerStore();

  const accountsQuery = useAccounts(familyId ?? "");
  const transactionsQuery = useLedgerTransactions(familyId ?? "");
  const categoriesQuery = useCategories(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const accounts = accountsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading =
    accountsQuery.isLoading || transactionsQuery.isLoading || categoriesQuery.isLoading || familyDetailQuery.isLoading;
  const queryError =
    accountsQuery.isError || transactionsQuery.isError || categoriesQuery.isError || familyDetailQuery.isError
      ? t("expense.actionFailed")
      : null;
  const error = queryError ?? formError;

  const createAccountMutation = useCreateAccount(familyId ?? "");
  const toggleAccountActiveMutation = useToggleAccountActive(familyId ?? "");
  const createLedgerMutation = useCreateLedgerTransaction(familyId ?? "");
  const isCreatingAccount = createAccountMutation.isPending;
  const isCreatingLedger = createLedgerMutation.isPending;

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, resolveCategoryDisplayName(category, t)])),
    [categories, t],
  );

  const accountTypeLabel = (type: AccountType) => t(`finance.accountTypeValues.${type}`);
  const ledgerTypeLabel = (type: LedgerTransactionType) => t(`finance.ledgerTypeValues.${type}`);

  function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const opening = Number(accountForm.openingBalance);
    if (!Number.isFinite(opening)) {
      setFormError(t("expense.actionFailed"));
      return;
    }

    setFormError(null);
    createAccountMutation.mutate(
      {
        name: accountForm.accountName.trim(),
        account_type: accountForm.accountType,
        currency_code: familyCurrencyCode === "vnd" ? "vnd" : "jpy",
        opening_balance: opening,
        credit_limit: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.creditLimit) : null,
        statement_closing_day:
          accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.statementClosingDay) : null,
        payment_due_day: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.paymentDueDay) : null,
        minimum_payment: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.minimumPayment) : null,
      },
      {
        onSuccess: () => {
          resetAccountForm();
          showSnackbar({ message: t("finance.accountCreated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleToggleAccountActive(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;

    setFormError(null);
    toggleAccountActiveMutation.mutate(
      { accountId, isActive: !account.is_active },
      {
        onSuccess: () => {
          showSnackbar({
            message: account.is_active ? t("finance.accountDisabled") : t("finance.accountEnabled"),
            variant: "success",
          });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleCreateLedger(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const amount = Number(ledgerForm.ledgerAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t("expense.amountMustBePositive"));
      return;
    }

    setFormError(null);
    createLedgerMutation.mutate(
      {
        transaction_type: ledgerForm.ledgerType,
        amount,
        occurred_on: ledgerForm.ledgerDate,
        description: ledgerForm.ledgerDescription.trim() || null,
        category_id: ledgerForm.ledgerCategoryId || null,
        source_account_id: ledgerForm.sourceAccountId || null,
        destination_account_id: ledgerForm.destinationAccountId || null,
      },
      {
        onSuccess: () => {
          resetLedgerForm();
          showSnackbar({ message: t("finance.ledgerCreated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  if (!familyId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("finance.accountsLedger")} description={t("finance.accountsLedgerDescription")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("finance.accountsLedger")} description={t("finance.accountsLedgerDescription")} />

        <FinanceNav familyId={familyId} current="accounts" />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.totalAccounts")}</CardDescription>
              <CardTitle>{String(accounts.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.activeAccounts")}</CardDescription>
              <CardTitle>{String(accounts.filter((item) => item.is_active).length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.ledgerEntries")}</CardDescription>
              <CardTitle>{String(transactions.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("family.currency")}</CardDescription>
              <CardTitle>{familyCurrencyCode.toUpperCase()}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("finance.createAccount")}</CardTitle>
              <CardDescription>{t("finance.createAccountDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreateAccount}>
                <Field label={t("family.name")} htmlFor="finance-account-name" required>
                  <input
                    id="finance-account-name"
                    type="text"
                    value={accountForm.accountName}
                    onChange={(event) => setAccountForm({ accountName: event.target.value })}
                    required
                  />
                </Field>

                <Field label={t("finance.accountType")} htmlFor="finance-account-type" required>
                  <select
                    id="finance-account-type"
                    value={accountForm.accountType}
                    onChange={(event) => setAccountForm({ accountType: event.target.value as AccountType })}
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {accountTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("finance.openingBalance")} htmlFor="finance-account-opening" required>
                  <input
                    id="finance-account-opening"
                    type="number"
                    value={accountForm.openingBalance}
                    onChange={(event) => setAccountForm({ openingBalance: event.target.value })}
                    required
                  />
                </Field>

                {accountForm.accountType === "credit_card" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("finance.creditLimit")} htmlFor="finance-account-credit-limit">
                      <input
                        id="finance-account-credit-limit"
                        type="number"
                        value={accountForm.creditLimit}
                        onChange={(event) => setAccountForm({ creditLimit: event.target.value })}
                      />
                    </Field>
                    <Field label={t("finance.minimumPayment")} htmlFor="finance-account-minimum-payment">
                      <input
                        id="finance-account-minimum-payment"
                        type="number"
                        value={accountForm.minimumPayment}
                        onChange={(event) => setAccountForm({ minimumPayment: event.target.value })}
                      />
                    </Field>
                    <Field label={t("finance.statementClosingDay")} htmlFor="finance-account-statement-day">
                      <input
                        id="finance-account-statement-day"
                        type="number"
                        min={1}
                        max={31}
                        value={accountForm.statementClosingDay}
                        onChange={(event) => setAccountForm({ statementClosingDay: event.target.value })}
                      />
                    </Field>
                    <Field label={t("finance.paymentDueDay")} htmlFor="finance-account-payment-day">
                      <input
                        id="finance-account-payment-day"
                        type="number"
                        min={1}
                        max={31}
                        value={accountForm.paymentDueDay}
                        onChange={(event) => setAccountForm({ paymentDueDay: event.target.value })}
                      />
                    </Field>
                  </div>
                ) : null}

                <Button type="submit" loading={isCreatingAccount}>
                  {t("finance.createAccount")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.addLedgerEntry")}</CardTitle>
              <CardDescription>{t("finance.addLedgerEntryDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleCreateLedger}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("dashboard.type")} htmlFor="finance-ledger-type" required>
                    <select
                      id="finance-ledger-type"
                      value={ledgerForm.ledgerType}
                      onChange={(event) => setLedgerForm({ ledgerType: event.target.value as LedgerTransactionType })}
                    >
                      {LEDGER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ledgerTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("expense.amount")} htmlFor="finance-ledger-amount" required>
                    <input
                      id="finance-ledger-amount"
                      type="number"
                      min={1}
                      value={ledgerForm.ledgerAmount}
                      onChange={(event) => setLedgerForm({ ledgerAmount: event.target.value })}
                      required
                    />
                  </Field>
                </div>

                <Field label={t("expense.date")} htmlFor="finance-ledger-date" required>
                  <input
                    id="finance-ledger-date"
                    type="date"
                    value={ledgerForm.ledgerDate}
                    onChange={(event) => setLedgerForm({ ledgerDate: event.target.value })}
                    required
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("finance.sourceAccount")} htmlFor="finance-ledger-source">
                    <select
                      id="finance-ledger-source"
                      value={ledgerForm.sourceAccountId}
                      onChange={(event) => setLedgerForm({ sourceAccountId: event.target.value })}
                    >
                      <option value="">-</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("finance.destinationAccount")} htmlFor="finance-ledger-destination">
                    <select
                      id="finance-ledger-destination"
                      value={ledgerForm.destinationAccountId}
                      onChange={(event) => setLedgerForm({ destinationAccountId: event.target.value })}
                    >
                      <option value="">-</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label={t("expense.category")} htmlFor="finance-ledger-category">
                  <select
                    id="finance-ledger-category"
                    value={ledgerForm.ledgerCategoryId}
                    onChange={(event) => setLedgerForm({ ledgerCategoryId: event.target.value })}
                  >
                    <option value="">-</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {resolveCategoryDisplayName(category, t)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("expense.description")} htmlFor="finance-ledger-note">
                  <input
                    id="finance-ledger-note"
                    type="text"
                    value={ledgerForm.ledgerDescription}
                    onChange={(event) => setLedgerForm({ ledgerDescription: event.target.value })}
                  />
                </Field>

                <Button type="submit" loading={isCreatingLedger}>
                  {t("finance.addLedgerEntry")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t("finance.accountList")}</CardTitle>
              <CardDescription>{t("finance.accountListDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <EmptyState title={t("finance.noAccounts")} />
              ) : (
                <ul className="space-y-3">
                  {accounts.map((account) => (
                    <li key={account.id} className="interactive-row space-y-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">{account.name}</p>
                        <Badge variant={account.is_active ? "success" : "warning"}>
                          {account.is_active ? t("finance.active") : t("finance.inactive")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{accountTypeLabel(account.account_type)}</p>
                      <p className="font-mono text-sm text-foreground">
                        {t("finance.currentBalance")}: {formatMoney(account.current_balance, familyCurrencyCode)}
                      </p>
                      {account.available_credit !== null ? (
                        <p className="font-mono text-sm text-muted-foreground">
                          {t("finance.availableCredit")}: {formatMoney(account.available_credit, familyCurrencyCode)}
                        </p>
                      ) : null}

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleAccountActive(account.id)}
                      >
                        {account.is_active ? t("finance.disable") : t("finance.enable")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.recentLedger")}</CardTitle>
              <CardDescription>{t("finance.recentLedgerDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <EmptyState title={t("finance.noLedgerEntries")} />
              ) : (
                <ul className="space-y-3">
                  {transactions.slice(0, 20).map((entry) => (
                    <li key={entry.id} className="interactive-row space-y-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="info">{ledgerTypeLabel(entry.transaction_type)}</Badge>
                        <span className="font-mono text-sm text-foreground">
                          {formatMoney(entry.amount, familyCurrencyCode)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.occurred_on}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("finance.sourceAccount")}: {entry.source_account_id ?? "-"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("finance.destinationAccount")}: {entry.destination_account_id ?? "-"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("expense.category")}: {entry.category_id ? (categoryNameById[entry.category_id] ?? entry.category_id) : "-"}
                      </p>
                      {entry.description ? <p className="text-sm text-foreground">{entry.description}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </PageFrame>
  );
}
