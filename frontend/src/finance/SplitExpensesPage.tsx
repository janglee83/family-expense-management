import { useEffect, useMemo, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { type SplitExpense, type SplitMethod } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import { useSplitExpensesStore } from "./stores/splitExpensesStore";

const SPLIT_METHODS: SplitMethod[] = ["equal", "custom", "percentage"];

export function SplitExpensesPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { familyId } = useParams<{ familyId: string }>();

  const {
    family,
    expenses,
    splits,
    isLoading,
    error,
    load,
    toggleSettle,
    groups,
    groupPreview,
    isPreviewLoading,
    isGroupSaving,
    groupForm,
    setGroupForm,
    toggleGroupParticipant,
    setGroupCustomAmount,
    setGroupPercentage,
    previewGroup,
    createGroup,
    toggleGroupParticipantSettle,
  } = useSplitExpensesStore();

  useEffect(() => {
    if (!familyId) {
      return;
    }

    void load(familyId, t);
  }, [familyId, load, t]);

  const currencyCode = family?.currency_code ?? "jpy";

  const memberNameById = useMemo(
    () => Object.fromEntries((family?.members ?? []).map((member) => [member.user_id, member.display_name])),
    [family?.members],
  );

  const expenseById = useMemo(() => Object.fromEntries(expenses.map((expense) => [expense.id, expense])), [expenses]);

  const splitMethodLabel = (methodValue: SplitMethod) => t(`finance.splitMethodValues.${methodValue}`);
  const splitStatusLabel = (statusValue: SplitExpense["status"]) => t(`finance.splitStatusValues.${statusValue}`);

  function handleToggleSettle(splitId: string, itemId: string, currentState: boolean) {
    if (!familyId) {
      return;
    }

    void toggleSettle(familyId, splitId, itemId, currentState, t, showSnackbar);
  }

  function handlePreviewGroup() {
    if (!familyId) {
      return;
    }

    void previewGroup(familyId, t);
  }

  function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) {
      return;
    }

    void createGroup(familyId, t, showSnackbar);
  }

  function handleToggleGroupParticipantSettle(groupId: string, participantId: string, currentState: boolean) {
    if (!familyId) {
      return;
    }

    void toggleGroupParticipantSettle(familyId, groupId, participantId, currentState, t, showSnackbar);
  }

  if (!familyId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("finance.splitExpenses")} description={t("finance.splitExpensesDescription")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("finance.splitExpenses")} description={t("finance.splitExpensesDescription")} />

        <FinanceNav familyId={familyId} current="splits" />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.totalSplits")}</CardDescription>
              <CardTitle>{String(splits.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.pendingSplits")}</CardDescription>
              <CardTitle>{String(splits.filter((split) => split.status === "pending").length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.settledSplits")}</CardDescription>
              <CardTitle>{String(splits.filter((split) => split.status === "settled").length)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.splitByMonth")}</CardTitle>
            <CardDescription>{t("finance.splitByMonthDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Field label={t("finance.selectMonth")} htmlFor="finance-split-group-month">
                <input
                  id="finance-split-group-month"
                  type="month"
                  value={groupForm.month}
                  onChange={(event) => setGroupForm({ month: event.target.value })}
                />
              </Field>

              <Button type="button" variant="outline" loading={isPreviewLoading} onClick={handlePreviewGroup}>
                {t("finance.previewMonth")}
              </Button>

              {groupPreview ? (
                groupPreview.expenses.length === 0 ? (
                  <EmptyState title={t("finance.noEligibleExpensesForMonth")} />
                ) : (
                  <form className="space-y-4" onSubmit={handleCreateGroup}>
                    <div className="surface-card space-y-2 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{t("finance.groupIncludedExpenses")}</span>
                        <span className="font-mono text-foreground">
                          {t("finance.groupTotal")}: {formatMoney(groupPreview.total_amount, currencyCode)}
                        </span>
                      </div>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {groupPreview.expenses.map((expense) => (
                          <li key={expense.id} className="flex items-center justify-between gap-2">
                            <span>{expense.expense_date} {expense.description ? `• ${expense.description}` : ""}</span>
                            <span className="font-mono">{formatMoney(expense.amount, currencyCode)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Field label={t("finance.splitMethod")} htmlFor="finance-split-group-method" required>
                      <select
                        id="finance-split-group-method"
                        value={groupForm.method}
                        onChange={(event) => setGroupForm({ method: event.target.value as SplitMethod })}
                      >
                        {SPLIT_METHODS.map((item) => (
                          <option key={item} value={item}>
                            {splitMethodLabel(item)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <fieldset className="space-y-3 rounded-md border border-border/80 p-3">
                      <legend className="px-1 text-sm font-medium text-foreground">{t("finance.participants")}</legend>
                      {family?.members.map((member) => (
                        <label key={member.user_id} className="flex flex-wrap items-center gap-3">
                          <input
                            type="checkbox"
                            checked={groupForm.participantIds.includes(member.user_id)}
                            onChange={() => toggleGroupParticipant(member.user_id)}
                          />
                          <span className="text-sm text-foreground">{member.display_name}</span>
                          {groupForm.method === "custom" && groupForm.participantIds.includes(member.user_id) ? (
                            <input
                              type="number"
                              className="max-w-36"
                              min={0}
                              placeholder={t("expense.amount")}
                              value={groupForm.customAmountByParticipant[member.user_id] ?? ""}
                              onChange={(event) => setGroupCustomAmount(member.user_id, event.target.value)}
                            />
                          ) : null}
                          {groupForm.method === "percentage" && groupForm.participantIds.includes(member.user_id) ? (
                            <input
                              type="number"
                              className="max-w-28"
                              min={0}
                              max={100}
                              placeholder="%"
                              value={groupForm.percentageByParticipant[member.user_id] ?? ""}
                              onChange={(event) => setGroupPercentage(member.user_id, event.target.value)}
                            />
                          ) : null}
                        </label>
                      ))}
                    </fieldset>

                    <Button type="submit" loading={isGroupSaving}>
                      {t("finance.createGroupSplit")}
                    </Button>
                  </form>
                )
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.groupSplitList")}</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <EmptyState title={t("finance.noGroupSplits")} />
            ) : (
              <ul className="space-y-4">
                {groups.map((group) => (
                  <li key={group.id} className="interactive-row space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={group.status === "settled" ? "success" : "warning"}>
                          {splitStatusLabel(group.status)}
                        </Badge>
                        <Badge variant="info">{splitMethodLabel(group.method)}</Badge>
                        <span className="text-sm text-muted-foreground">{group.period_start.slice(0, 7)}</span>
                      </div>
                      <span className="font-mono text-sm text-foreground">
                        {formatMoney(group.total_amount, currencyCode)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("finance.outstanding")}: {formatMoney(group.outstanding_amount, currencyCode)}
                    </p>
                    <ul className="space-y-2">
                      {group.participants.map((participant) => (
                        <li key={participant.id} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {memberNameById[participant.participant_user_id] ?? participant.participant_user_id}
                              {participant.participant_user_id === user?.id ? ` (${t("finance.you")})` : ""}
                            </span>
                            <span className="font-mono text-foreground">
                              {formatMoney(participant.amount, currencyCode)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <Badge variant={participant.is_settled ? "success" : "warning"}>
                              {participant.is_settled ? t("finance.settled") : t("finance.unsettled")}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleToggleGroupParticipantSettle(group.id, participant.id, participant.is_settled)
                              }
                            >
                              {participant.is_settled ? t("finance.markUnsettled") : t("finance.markSettled")}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.splitList")}</CardTitle>
          </CardHeader>
          <CardContent>
            {splits.length === 0 ? (
              <EmptyState title={t("finance.noSplits")} />
            ) : (
              <ul className="space-y-4">
                {splits.map((split) => {
                  const sourceExpense = expenseById[split.expense_id];
                  return (
                    <li key={split.id} className="interactive-row space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={split.status === "settled" ? "success" : "warning"}>
                            {splitStatusLabel(split.status)}
                          </Badge>
                          <Badge variant="info">{splitMethodLabel(split.method)}</Badge>
                        </div>
                        <span className="font-mono text-sm text-foreground">{formatMoney(split.total_amount, currencyCode)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("finance.expense")}: {sourceExpense?.expense_date ?? "-"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("finance.outstanding")}: {formatMoney(split.outstanding_amount, currencyCode)}
                      </p>
                      <ul className="space-y-2">
                        {split.items.map((item) => (
                          <li key={item.id} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-foreground">
                                {memberNameById[item.participant_user_id] ?? item.participant_user_id}
                                {item.participant_user_id === user?.id ? ` (${t("finance.you")})` : ""}
                              </span>
                              <span className="font-mono text-foreground">{formatMoney(item.amount, currencyCode)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <Badge variant={item.is_settled ? "success" : "warning"}>
                                {item.is_settled ? t("finance.settled") : t("finance.unsettled")}
                              </Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleSettle(split.id, item.id, item.is_settled)}
                              >
                                {item.is_settled ? t("finance.markUnsettled") : t("finance.markSettled")}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </PageFrame>
  );
}
