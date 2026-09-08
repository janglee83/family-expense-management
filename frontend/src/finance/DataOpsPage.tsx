import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { FinanceNav } from "./FinanceNav";
import { useDataOpsStore } from "./stores/dataOpsStore";

export function DataOpsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();

  const {
    expenses,
    familyCurrencyCode,
    previewResult,
    undoToken,
    selectedFile,
    skipDuplicates,
    isLoading,
    isPreviewing,
    isImporting,
    isRestoring,
    error,
    setSelectedFile,
    setSkipDuplicates,
    setUndoToken,
    load,
    exportJson,
    exportCsv,
    exportBackup,
    previewImport,
    commitImport,
    deleteWithUndo,
    restoreUndo,
  } = useDataOpsStore();

  useEffect(() => {
    if (!familyId) {
      return;
    }

    void load(familyId, t);
  }, [familyId, load, t]);

  function handleExportJson() {
    if (!familyId) {
      return;
    }

    void exportJson(familyId, t, showSnackbar);
  }

  function handleExportCsv() {
    if (!familyId) {
      return;
    }

    void exportCsv(familyId, t, showSnackbar);
  }

  function handleExportBackup() {
    if (!familyId) {
      return;
    }

    void exportBackup(familyId, t, showSnackbar);
  }

  function handlePreviewImport() {
    if (!familyId) {
      return;
    }

    void previewImport(familyId, t, showSnackbar);
  }

  function handleCommitImport() {
    if (!familyId) {
      return;
    }

    void commitImport(familyId, t, showSnackbar);
  }

  function handleDeleteWithUndo(expenseId: string) {
    if (!familyId) {
      return;
    }

    void deleteWithUndo(familyId, expenseId, t, showSnackbar);
  }

  function handleRestoreUndo() {
    if (!familyId) {
      return;
    }

    void restoreUndo(familyId, t, showSnackbar);
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
