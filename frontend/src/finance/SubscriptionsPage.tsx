import { useEffect, useMemo, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { resolveCategoryDisplayName } from "../expenses/expenseApi";
import { formatMoney } from "../utils/currency";
import { type SubscriptionBillingCycle, type SubscriptionStatus } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import { useSubscriptionsStore } from "./stores/subscriptionsStore";

const BILLING_CYCLES: SubscriptionBillingCycle[] = ["weekly", "monthly", "yearly"];
const STATUSES: SubscriptionStatus[] = ["active", "paused", "cancelled"];

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();

  const {
    subscriptions,
    summary,
    accounts,
    categories,
    familyCurrencyCode,
    isLoading,
    isSaving,
    error,
    form,
    setForm,
    load,
    createSubscription,
    changeStatus,
    deleteSubscription,
  } = useSubscriptionsStore();

  useEffect(() => {
    if (!familyId) {
      return;
    }

    void load(familyId, t);
  }, [familyId, load, t]);

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, resolveCategoryDisplayName(category, t)])),
    [categories, t],
  );

  const billingCycleLabel = (cycle: SubscriptionBillingCycle) => t(`finance.billingCycleValues.${cycle}`);
  const subscriptionStatusLabel = (statusValue: SubscriptionStatus) => t(`finance.subscriptionStatusValues.${statusValue}`);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) {
      return;
    }

    void createSubscription(familyId, t, showSnackbar);
  }

  function handleChangeStatus(subscriptionId: string, nextStatus: SubscriptionStatus) {
    if (!familyId) {
      return;
    }

    void changeStatus(familyId, subscriptionId, nextStatus, t, showSnackbar);
  }

  function handleDelete(subscriptionId: string) {
    if (!familyId) {
      return;
    }

    void deleteSubscription(familyId, subscriptionId, t, showSnackbar);
  }

  if (!familyId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("finance.subscriptions")} description={t("finance.subscriptionsDescription")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("finance.subscriptions")} description={t("finance.subscriptionsDescription")} />

        <FinanceNav familyId={familyId} current="subscriptions" />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.totalSubscriptions")}</CardDescription>
              <CardTitle>{String(subscriptions.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.monthlyTotal")}</CardDescription>
              <CardTitle>{formatMoney(summary?.monthly_total ?? 0, familyCurrencyCode)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.yearlyTotal")}</CardDescription>
              <CardTitle>{formatMoney(summary?.yearly_total ?? 0, familyCurrencyCode)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.upcomingCount")}</CardDescription>
              <CardTitle>{String(summary?.upcoming_subscription_ids.length ?? 0)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.createSubscription")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("finance.subscriptionName")} htmlFor="finance-subscription-name" required>
                  <input
                    id="finance-subscription-name"
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm({ name: event.target.value })}
                    required
                  />
                </Field>
                <Field label={t("finance.merchant")} htmlFor="finance-subscription-merchant" required>
                  <input
                    id="finance-subscription-merchant"
                    type="text"
                    value={form.merchant}
                    onChange={(event) => setForm({ merchant: event.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("expense.amount")} htmlFor="finance-subscription-amount" required>
                  <input
                    id="finance-subscription-amount"
                    type="number"
                    min={1}
                    value={form.amount}
                    onChange={(event) => setForm({ amount: event.target.value })}
                    required
                  />
                </Field>
                <Field label={t("finance.billingCycle")} htmlFor="finance-subscription-billing" required>
                  <select
                    id="finance-subscription-billing"
                    value={form.billingCycle}
                    onChange={(event) => setForm({ billingCycle: event.target.value as SubscriptionBillingCycle })}
                  >
                    {BILLING_CYCLES.map((cycle) => (
                      <option key={cycle} value={cycle}>
                        {billingCycleLabel(cycle)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("finance.status")} htmlFor="finance-subscription-status" required>
                  <select
                    id="finance-subscription-status"
                    value={form.status}
                    onChange={(event) => setForm({ status: event.target.value as SubscriptionStatus })}
                  >
                    {STATUSES.map((item) => (
                      <option key={item} value={item}>
                        {subscriptionStatusLabel(item)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("finance.nextBillingDate")} htmlFor="finance-subscription-next-date" required>
                  <input
                    id="finance-subscription-next-date"
                    type="date"
                    value={form.nextBillingDate}
                    onChange={(event) => setForm({ nextBillingDate: event.target.value })}
                    required
                  />
                </Field>
                <Field label={t("finance.cancellationUrl")} htmlFor="finance-subscription-cancel-url">
                  <input
                    id="finance-subscription-cancel-url"
                    type="text"
                    value={form.cancellationUrl}
                    onChange={(event) => setForm({ cancellationUrl: event.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("expense.category")} htmlFor="finance-subscription-category">
                  <select
                    id="finance-subscription-category"
                    value={form.categoryId}
                    onChange={(event) => setForm({ categoryId: event.target.value })}
                  >
                    <option value="">-</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {resolveCategoryDisplayName(category, t)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("finance.linkedAccount")} htmlFor="finance-subscription-account">
                  <select
                    id="finance-subscription-account"
                    value={form.accountId}
                    onChange={(event) => setForm({ accountId: event.target.value })}
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

              <Button type="submit" loading={isSaving}>
                {t("finance.createSubscription")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.subscriptionList")}</CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptions.length === 0 ? (
              <EmptyState title={t("finance.noSubscriptions")} />
            ) : (
              <ul className="space-y-3">
                {subscriptions.map((subscription) => (
                  <li key={subscription.id} className="interactive-row space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{subscription.name}</p>
                      <Badge variant={subscription.status === "active" ? "success" : "warning"}>
                        {subscriptionStatusLabel(subscription.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{subscription.merchant}</p>
                    <p className="font-mono text-sm text-foreground">
                      {formatMoney(subscription.amount, familyCurrencyCode)} / {billingCycleLabel(subscription.billing_cycle)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("finance.nextBillingDate")}: {subscription.next_billing_date}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("expense.category")}: {subscription.category_id ? (categoryNameById[subscription.category_id] ?? subscription.category_id) : "-"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {subscription.status !== "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleChangeStatus(subscription.id, "active")}
                        >
                          {t("finance.activate")}
                        </Button>
                      ) : null}
                      {subscription.status === "active" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleChangeStatus(subscription.id, "paused")}
                        >
                          {t("finance.pause")}
                        </Button>
                      ) : null}
                      {subscription.status !== "cancelled" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleChangeStatus(subscription.id, "cancelled")}
                        >
                          {t("finance.cancelSubscription")}
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(subscription.id)}>
                        {t("family.delete")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </PageFrame>
  );
}
