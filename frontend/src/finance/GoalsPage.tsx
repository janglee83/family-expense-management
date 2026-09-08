import { useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { type GoalEntry } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import { useGoalsStore } from "./stores/goalsStore";

function toDateInput(value: string | null): string {
  return value ?? "";
}

export function GoalsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();

  const {
    goals,
    accounts,
    familyCurrencyCode,
    isLoading,
    isSavingGoal,
    isSavingEntry,
    error,
    goalForm,
    entryGoal,
    entryForm,
    selectedGoalEntries,
    setGoalForm,
    setEntryForm,
    closeEntryModal,
    load,
    createGoal,
    togglePause,
    deleteGoal,
    openEntryModal,
    createEntry,
  } = useGoalsStore();

  useEffect(() => {
    if (!familyId) {
      return;
    }

    void load(familyId, t);
  }, [familyId, load, t]);

  const goalEntryTypeLabel = (entryTypeValue: GoalEntry["entry_type"]) =>
    entryTypeValue === "contribution" ? t("finance.contribution") : t("finance.withdrawal");

  function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) {
      return;
    }

    void createGoal(familyId, t, showSnackbar);
  }

  function handleTogglePause(goalId: string) {
    if (!familyId) {
      return;
    }

    const goal = goals.find((item) => item.id === goalId);
    if (!goal) {
      return;
    }

    void togglePause(familyId, goal, t, showSnackbar);
  }

  function handleDeleteGoal(goalId: string) {
    if (!familyId) {
      return;
    }

    void deleteGoal(familyId, goalId, t, showSnackbar);
  }

  function handleOpenEntry(goalId: string) {
    if (!familyId) {
      return;
    }

    const goal = goals.find((item) => item.id === goalId);
    if (!goal) {
      return;
    }

    void openEntryModal(familyId, goal);
  }

  function handleCreateEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) {
      return;
    }

    void createEntry(familyId, t, showSnackbar);
  }

  if (!familyId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("finance.goals")} description={t("dashboard.description")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("finance.goals")} description={t("finance.goalsDescription")} />

        <FinanceNav familyId={familyId} current="goals" />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.totalGoals")}</CardDescription>
              <CardTitle>{String(goals.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.activeGoals")}</CardDescription>
              <CardTitle>{String(goals.filter((goal) => !goal.is_paused).length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("family.currency")}</CardDescription>
              <CardTitle>{familyCurrencyCode.toUpperCase()}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.createGoal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateGoal}>
              <Field label={t("family.name")} htmlFor="finance-goal-name" required>
                <input
                  id="finance-goal-name"
                  type="text"
                  value={goalForm.goalName}
                  onChange={(event) => setGoalForm({ goalName: event.target.value })}
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("finance.targetAmount")} htmlFor="finance-goal-target" required>
                  <input
                    id="finance-goal-target"
                    type="number"
                    min={1}
                    value={goalForm.goalTarget}
                    onChange={(event) => setGoalForm({ goalTarget: event.target.value })}
                    required
                  />
                </Field>
                <Field label={t("finance.currentAmount")} htmlFor="finance-goal-current" required>
                  <input
                    id="finance-goal-current"
                    type="number"
                    min={0}
                    value={goalForm.goalCurrent}
                    onChange={(event) => setGoalForm({ goalCurrent: event.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("finance.targetDate")} htmlFor="finance-goal-date">
                  <input
                    id="finance-goal-date"
                    type="date"
                    value={goalForm.goalDate}
                    onChange={(event) => setGoalForm({ goalDate: event.target.value })}
                  />
                </Field>
                <Field label={t("finance.monthlyContribution")} htmlFor="finance-goal-monthly">
                  <input
                    id="finance-goal-monthly"
                    type="number"
                    min={0}
                    value={goalForm.goalMonthlyContribution}
                    onChange={(event) => setGoalForm({ goalMonthlyContribution: event.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("finance.goalIcon")} htmlFor="finance-goal-icon">
                  <input
                    id="finance-goal-icon"
                    type="text"
                    value={goalForm.goalIcon}
                    onChange={(event) => setGoalForm({ goalIcon: event.target.value })}
                    placeholder="🏠"
                  />
                </Field>
                <Field label={t("finance.linkedAccount")} htmlFor="finance-goal-account">
                  <select
                    id="finance-goal-account"
                    value={goalForm.goalLinkedAccountId}
                    onChange={(event) => setGoalForm({ goalLinkedAccountId: event.target.value })}
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

              <Button type="submit" loading={isSavingGoal}>
                {t("finance.createGoal")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.goalList")}</CardTitle>
          </CardHeader>
          <CardContent>
            {goals.length === 0 ? (
              <EmptyState title={t("finance.noGoals")} />
            ) : (
              <ul className="space-y-3">
                {goals.map((goal) => (
                  <li key={goal.id} className="interactive-row space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{goal.icon ? `${goal.icon} ${goal.name}` : goal.name}</p>
                        <Badge variant={goal.is_paused ? "warning" : "success"}>
                          {goal.is_paused ? t("finance.paused") : t("finance.active")}
                        </Badge>
                      </div>
                      <Badge variant="info">{Math.round(goal.progress_percentage)}%</Badge>
                    </div>
                    <p className="font-mono text-sm text-foreground">
                      {formatMoney(goal.current_amount, familyCurrencyCode)} / {formatMoney(goal.target_amount, familyCurrencyCode)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("finance.remaining")}: {formatMoney(goal.remaining_amount, familyCurrencyCode)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("finance.targetDate")}: {toDateInput(goal.target_date) || "-"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => handleOpenEntry(goal.id)}>
                        {t("finance.addEntry")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleTogglePause(goal.id)}>
                        {goal.is_paused ? t("finance.resume") : t("finance.pause")}
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteGoal(goal.id)}>
                        {t("family.delete")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={Boolean(entryGoal)}
          title={entryGoal ? `${t("finance.addEntry")}: ${entryGoal.name}` : ""}
          closeLabel={t("common.close")}
          onClose={closeEntryModal}
          footer={
            <Button type="button" variant="outline" onClick={closeEntryModal}>
              {t("common.close")}
            </Button>
          }
        >
          <form className="space-y-4" onSubmit={handleCreateEntry}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("dashboard.type")} htmlFor="finance-goal-entry-type" required>
                <select
                  id="finance-goal-entry-type"
                  value={entryForm.entryType}
                  onChange={(event) =>
                    setEntryForm({ entryType: event.target.value as "contribution" | "withdrawal" })
                  }
                >
                  <option value="contribution">{t("finance.contribution")}</option>
                  <option value="withdrawal">{t("finance.withdrawal")}</option>
                </select>
              </Field>
              <Field label={t("expense.amount")} htmlFor="finance-goal-entry-amount" required>
                <input
                  id="finance-goal-entry-amount"
                  type="number"
                  min={1}
                  value={entryForm.entryAmount}
                  onChange={(event) => setEntryForm({ entryAmount: event.target.value })}
                  required
                />
              </Field>
            </div>

            <Field label={t("expense.date")} htmlFor="finance-goal-entry-date" required>
              <input
                id="finance-goal-entry-date"
                type="date"
                value={entryForm.entryDate}
                onChange={(event) => setEntryForm({ entryDate: event.target.value })}
                required
              />
            </Field>

            <Field label={t("expense.description")} htmlFor="finance-goal-entry-note">
              <input
                id="finance-goal-entry-note"
                type="text"
                value={entryForm.entryNote}
                onChange={(event) => setEntryForm({ entryNote: event.target.value })}
              />
            </Field>

            <Button type="submit" loading={isSavingEntry}>
              {t("finance.addEntry")}
            </Button>
          </form>

          <div className="space-y-2 border-t border-border/80 pt-4">
            <p className="text-sm font-medium text-foreground">{t("finance.recentEntries")}</p>
            {selectedGoalEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("finance.noEntries")}</p>
            ) : (
              <ul className="space-y-2">
                {selectedGoalEntries.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{goalEntryTypeLabel(entry.entry_type)}</span>
                      <span className="font-mono text-foreground">{formatMoney(entry.amount, familyCurrencyCode)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{entry.occurred_on}</p>
                    {entry.note ? <p className="text-xs text-foreground">{entry.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      </main>
    </PageFrame>
  );
}
