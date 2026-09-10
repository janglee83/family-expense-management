import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { type SplitExpense, type SplitExpenseGroup, type SplitMethod } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import { MonthRangePicker } from "./MonthRangePicker";
import { useSplitExpensesStore } from "./stores/splitExpensesStore";

const SPLIT_METHODS: SplitMethod[] = ["equal", "custom", "percentage"];

export function SplitExpensesPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { familyId } = useParams<{ familyId: string }>();
  const [pendingEditGroup, setPendingEditGroup] = useState<SplitExpenseGroup | null>(null);

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
    setGroupRange,
    setGroupForm,
    toggleGroupParticipant,
    setGroupCustomAmount,
    setGroupPercentage,
    previewGroup,
    editingGroupId,
    settlementPreview,
    isSettlementPreviewLoading,
    previewGroupSettlement,
    startEditGroup,
    cancelEditGroup,
    saveGroup,
    settleGroupSettlement,
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

  const memberName = (userId: string) => memberNameById[userId] ?? userId;

  const myRole = family?.members.find((member) => member.user_id === user?.id)?.role;

  // Mirrors the backend's `require_owner_admin_or_creator`: the group's creator, or
  // anyone with an owner/admin role, may edit the group and settle any of its edges.
  function canManageGroup(group: SplitExpenseGroup): boolean {
    return group.created_by_user_id === user?.id || myRole === "owner" || myRole === "admin";
  }

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

  function handlePreviewSettlement() {
    if (!familyId) {
      return;
    }

    void previewGroupSettlement(familyId, t);
  }

  function handleSaveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) {
      return;
    }

    void saveGroup(familyId, t, showSnackbar);
  }

  function handleEditGroupClick(group: SplitExpenseGroup) {
    if (group.settlements.some((settlement) => settlement.is_settled)) {
      setPendingEditGroup(group);
      return;
    }
    startEditGroup(group);
  }

  function handleConfirmEditGroup() {
    if (pendingEditGroup) {
      startEditGroup(pendingEditGroup);
    }
    setPendingEditGroup(null);
  }

  function handleSettleGroupSettlement(groupId: string, settlementId: string, currentState: boolean) {
    if (!familyId) {
      return;
    }

    void settleGroupSettlement(familyId, groupId, settlementId, currentState, t, showSnackbar);
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

  const payerMismatchWarning =
    groupPreview && groupPreview.expenses.length > 0 && groupForm.participantIds.length > 0
      ? groupPreview.expenses
          .map((expense) => expense.payer_user_id)
          .filter((payerId) => !groupForm.participantIds.includes(payerId))
      : [];

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
              {editingGroupId ? (
                <Alert variant="info">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{t("finance.editGroupSplit")}</span>
                    <Button type="button" variant="outline" size="sm" onClick={cancelEditGroup}>
                      {t("finance.cancelEditGroupSplit")}
                    </Button>
                  </div>
                </Alert>
              ) : null}

              <MonthRangePicker
                fromMonth={groupForm.fromMonth}
                toMonth={groupForm.toMonth}
                onChange={setGroupRange}
              />

              <Button type="button" variant="outline" loading={isPreviewLoading} onClick={handlePreviewGroup}>
                {t("finance.previewMonth")}
              </Button>

              {groupPreview ? (
                groupPreview.expenses.length === 0 ? (
                  <EmptyState title={t("finance.noEligibleExpensesForMonth")} />
                ) : (
                  <form className="space-y-4" onSubmit={handleSaveGroup}>
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
                            <span>
                              {expense.expense_date} {expense.description ? `• ${expense.description}` : ""} —{" "}
                              {t("finance.paidBy")}: {memberName(expense.payer_user_id)}
                            </span>
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

                    {payerMismatchWarning.length > 0 ? (
                      <Alert variant="error" role="alert">
                        {t("finance.splitGroupPayerNotInParticipants")}
                      </Alert>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        loading={isSettlementPreviewLoading}
                        disabled={groupForm.participantIds.length === 0}
                        onClick={handlePreviewSettlement}
                      >
                        {t("finance.previewSettlement")}
                      </Button>
                    )}

                    {settlementPreview ? (
                      <div className="surface-card space-y-2 p-3">
                        <span className="font-medium text-foreground">{t("finance.settlementPreviewTitle")}</span>
                        {settlementPreview.settlements.length === 0 ? (
                          <p className="text-sm text-muted-foreground">{t("finance.noSettlementsNeeded")}</p>
                        ) : (
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {settlementPreview.settlements.map((settlement, index) => (
                              <li key={index} className="flex items-center justify-between gap-2">
                                <span>
                                  {t("finance.settlementLine", {
                                    from: memberName(settlement.from_user_id),
                                    to: memberName(settlement.to_user_id),
                                  })}
                                </span>
                                <span className="font-mono">{formatMoney(settlement.amount, currencyCode)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}

                    <Button type="submit" loading={isGroupSaving}>
                      {t(editingGroupId ? "finance.editGroupSplit" : "finance.createGroupSplit")}
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
                        <span className="text-sm text-muted-foreground">
                          {group.period_start.slice(0, 7)} → {group.period_end.slice(0, 7)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-foreground">
                          {formatMoney(group.total_amount, currencyCode)}
                        </span>
                        {canManageGroup(group) ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => handleEditGroupClick(group)}>
                            {t("finance.editGroupSplit")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("finance.outstanding")}: {formatMoney(group.outstanding_amount, currencyCode)}
                    </p>
                    {group.participants.length > 0 ? (
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-foreground">{t("finance.fairShare")}</span>
                        <ul className="space-y-2">
                          {group.participants.map((participant) => (
                            <li
                              key={participant.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm"
                            >
                              <span className="font-medium text-foreground">
                                {memberName(participant.participant_user_id)}
                                {participant.participant_user_id === user?.id ? ` (${t("finance.you")})` : ""}
                              </span>
                              <span className="font-mono text-foreground">
                                {formatMoney(participant.amount, currencyCode)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {group.settlements.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("finance.noSettlementsNeeded")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {group.settlements.map((settlement) => (
                          <li key={settlement.id} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-foreground">
                                {t("finance.settlementLine", {
                                  from: memberName(settlement.from_user_id),
                                  to: memberName(settlement.to_user_id),
                                })}
                              </span>
                              <span className="font-mono text-foreground">
                                {formatMoney(settlement.amount, currencyCode)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <Badge variant={settlement.is_settled ? "success" : "warning"}>
                                {settlement.is_settled ? t("finance.settled") : t("finance.unsettled")}
                              </Badge>
                              {settlement.from_user_id === user?.id ||
                              settlement.to_user_id === user?.id ||
                              canManageGroup(group) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleSettleGroupSettlement(group.id, settlement.id, settlement.is_settled)
                                  }
                                >
                                  {settlement.is_settled ? t("finance.markUnsettled") : t("finance.markSettled")}
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
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

      <Modal
        isOpen={pendingEditGroup !== null}
        title={t("finance.editGroupSplitWarningTitle")}
        description={t("finance.editGroupSplitWarning")}
        onClose={() => setPendingEditGroup(null)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPendingEditGroup(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmEditGroup}>
              {t("finance.confirmEditGroupSplit")}
            </Button>
          </>
        }
      />
    </PageFrame>
  );
}
