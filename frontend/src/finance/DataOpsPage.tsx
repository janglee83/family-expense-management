import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { useExpenses } from "../expenses/expenseQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { FinanceNav } from "./FinanceNav";
import {
  useCommitExpenseImport,
  useDeleteExpenseWithUndo,
  useExportBackup,
  useExportExpensesCsv,
  useExportExpensesJson,
  usePreviewExpenseImport,
  useRestoreUndo,
} from "./queries/dataOpsQueries";
import { useDataOpsStore } from "./stores/dataOpsStore";

function downloadContent(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function nowFileStamp(): string {
  return new Date().toISOString().replaceAll(":", "-").slice(0, 19);
}

export function DataOpsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();

  const { selectedFile, skipDuplicates, undoToken, setSelectedFile, setSkipDuplicates, setUndoToken } =
    useDataOpsStore();

  const expensesQuery = useExpenses(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const expenses = expensesQuery.data ?? [];
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading = expensesQuery.isLoading || familyDetailQuery.isLoading;
  const queryError = expensesQuery.isError || familyDetailQuery.isError ? t("expense.actionFailed") : null;
  const [formError, setFormError] = useState<string | null>(null);
  const error = queryError ?? formError;

  const exportJsonMutation = useExportExpensesJson(familyId ?? "");
  const exportCsvMutation = useExportExpensesCsv(familyId ?? "");
  const exportBackupMutation = useExportBackup(familyId ?? "");
  const previewImportMutation = usePreviewExpenseImport(familyId ?? "");
  const commitImportMutation = useCommitExpenseImport(familyId ?? "");
  const deleteWithUndoMutation = useDeleteExpenseWithUndo(familyId ?? "");
  const restoreUndoMutation = useRestoreUndo(familyId ?? "");
  const previewResult = previewImportMutation.data ?? null;
  const isPreviewing = previewImportMutation.isPending;
  const isImporting = commitImportMutation.isPending;
  const isRestoring = restoreUndoMutation.isPending;

  function handleExportJson() {
    setFormError(null);
    exportJsonMutation.mutate(undefined, {
      onSuccess: (payload) => {
        downloadContent(`expenses-${nowFileStamp()}.json`, "application/json", `${JSON.stringify(payload.items, null, 2)}\n`);
        showSnackbar({ message: t("finance.exportJsonDone"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  function handleExportCsv() {
    setFormError(null);
    exportCsvMutation.mutate(undefined, {
      onSuccess: (csvContent) => {
        downloadContent(`expenses-${nowFileStamp()}.csv`, "text/csv", csvContent);
        showSnackbar({ message: t("finance.exportCsvDone"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  function handleExportBackup() {
    setFormError(null);
    exportBackupMutation.mutate(undefined, {
      onSuccess: (payload) => {
        downloadContent(`expenses-backup-${nowFileStamp()}.json`, "application/json", `${JSON.stringify(payload, null, 2)}\n`);
        showSnackbar({ message: t("finance.exportBackupDone"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  function handlePreviewImport() {
    if (!selectedFile) return;
    setFormError(null);
    previewImportMutation.mutate(selectedFile, {
      onSuccess: () => {
        showSnackbar({ message: t("finance.previewReady"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  function handleCommitImport() {
    if (!previewResult) return;

    const rows = previewResult.rows.map((row) => ({
      payer_user_id: row.payer_user_id,
      category_id: row.category_id,
      amount: row.amount,
      is_shared: row.is_shared,
      description: row.description ?? null,
      expense_date: row.expense_date,
    }));

    setFormError(null);
    commitImportMutation.mutate(
      { rows, skip_duplicates: skipDuplicates },
      {
        onSuccess: (result) => {
          setSelectedFile(null);
          previewImportMutation.reset();
          showSnackbar({
            message: t("finance.importDone", {
              created: result.created_count,
              skipped: result.skipped_duplicate_count,
            }),
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

  function handleDeleteWithUndo(expenseId: string) {
    setFormError(null);
    deleteWithUndoMutation.mutate(expenseId, {
      onSuccess: (result) => {
        setUndoToken(result.undo_token);
        showSnackbar({ message: t("finance.deletedWithUndo"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  function handleRestoreUndo() {
    const token = undoToken.trim();
    if (!token) return;

    setFormError(null);
    restoreUndoMutation.mutate(token, {
      onSuccess: () => {
        setUndoToken("");
        showSnackbar({ message: t("finance.undoRestored"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  if (!familyId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("finance.dataOps")} description={t("finance.dataOpsDescription")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("finance.dataOps")} description={t("finance.dataOpsDescription")} />

        <FinanceNav familyId={familyId} current="data" />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>{t("expense.myExpenses")}</CardDescription>
              <CardTitle>{String(expenses.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("finance.previewRows")}</CardDescription>
              <CardTitle>{String(previewResult?.rows.length ?? 0)}</CardTitle>
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
              <CardTitle>{t("finance.exports")}</CardTitle>
              <CardDescription>{t("finance.exportsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleExportJson}>
                {t("finance.exportJson")}
              </Button>
              <Button type="button" variant="outline" onClick={handleExportCsv}>
                {t("finance.exportCsv")}
              </Button>
              <Button type="button" variant="outline" onClick={handleExportBackup}>
                {t("finance.exportBackup")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("finance.imports")}</CardTitle>
              <CardDescription>{t("finance.importsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t("finance.csvFile")} htmlFor="finance-import-file" required>
                <input
                  id="finance-import-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  required
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  loading={isPreviewing}
                  onClick={handlePreviewImport}
                  disabled={!selectedFile}
                >
                  {t("finance.previewImport")}
                </Button>
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(event) => setSkipDuplicates(event.target.checked)}
                  />
                  {t("finance.skipDuplicates")}
                </label>
                <Button type="button" loading={isImporting} onClick={handleCommitImport} disabled={!previewResult}>
                  {t("finance.commitImport")}
                </Button>
              </div>

              {previewResult ? (
                <div className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="info">
                      {t("finance.totalRows")}: {previewResult.total_rows}
                    </Badge>
                    <Badge variant="success">
                      {t("finance.validRows")}: {previewResult.valid_rows}
                    </Badge>
                    <Badge variant="warning">
                      {t("finance.invalidRows")}: {previewResult.invalid_rows}
                    </Badge>
                    <Badge variant="warning">
                      {t("finance.duplicateRows")}: {previewResult.duplicate_rows}
                    </Badge>
                  </div>

                  {previewResult.issues.length > 0 ? (
                    <ul className="space-y-2">
                      {previewResult.issues.slice(0, 8).map((issue) => (
                        <li key={`${issue.row_number}-${issue.message}`} className="text-sm text-destructive">
                          {t("finance.rowIssue", { row: issue.row_number, message: issue.message })}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("finance.noImportIssues")}</p>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.undoDelete")}</CardTitle>
            <CardDescription>{t("finance.undoDeleteDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t("finance.undoToken")} htmlFor="finance-undo-token" className="min-w-[16rem] flex-1">
                <input
                  id="finance-undo-token"
                  type="text"
                  value={undoToken}
                  onChange={(event) => setUndoToken(event.target.value)}
                />
              </Field>
              <Button type="button" variant="outline" loading={isRestoring} onClick={handleRestoreUndo}>
                {t("finance.restore")}
              </Button>
            </div>

            {expenses.length === 0 ? (
              <EmptyState title={t("expense.noExpenses")} />
            ) : (
              <ul className="space-y-3">
                {expenses.slice(0, 10).map((expense) => (
                  <li key={expense.id} className="interactive-row flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-mono text-sm text-foreground">{formatMoney(expense.amount, familyCurrencyCode)}</p>
                      <p className="text-xs text-muted-foreground">{expense.expense_date}</p>
                      {expense.description ? <p className="text-xs text-foreground">{expense.description}</p> : null}
                    </div>
                    <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteWithUndo(expense.id)}>
                      {t("finance.deleteWithUndo")}
                    </Button>
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
