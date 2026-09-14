import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useFamilyDetail } from "../families/familyQueries";
import { getReceiptImageUrl } from "./receiptApi";
import { useDeleteReceipt, useReceipts } from "./receiptQueries";
import { ReceiptUploadForm } from "./ReceiptUploadForm";
import { PageFrame, PageHeader, EmptyState, LoadingState } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";

function statusLabelKey(status: string): string {
  switch (status) {
    case "upload":
      return "receipt.statusUploaded";
    case "failed":
      return "receipt.statusFailed";
    default:
      return "receipt.statusProcessing";
  }
}

function formatReceiptDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
}

export function ReceiptList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const receiptsQuery = useReceipts(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const receipts = receiptsQuery.data ?? [];
  const myRole = familyDetailQuery.data?.members.find((member) => member.user_id === user?.id)?.role;
  const isLoading = receiptsQuery.isLoading || familyDetailQuery.isLoading;
  const error = receiptsQuery.isError || familyDetailQuery.isError ? t("receipt.uploadFailed") : null;

  const deleteReceiptMutation = useDeleteReceipt(familyId ?? "");
  const canManage = myRole === "owner" || myRole === "admin";

  function statusVariant(status: string): "neutral" | "success" | "danger" | "warning" {
    if (status === "upload") return "success";
    if (status === "failed") return "danger";
    return "warning";
  }

  function handleDelete(receiptId: string) {
    if (!familyId || !window.confirm(t("receipt.confirmDelete"))) return;
    deleteReceiptMutation.mutate(receiptId);
  }

  if (isLoading || !familyId) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("receipt.myReceipts")} description={t("family.myFamilies")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("receipt.myReceipts")} description={t("family.myFamilies")} />

        {error && (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>{t("receipt.myReceipts")}</CardDescription>
              <CardTitle>{String(receipts.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("receipt.listDescription")}</CardDescription>
              <CardTitle>{String(receipts.filter((receipt) => receipt.status === "processing").length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("role.member")}</CardDescription>
              <CardTitle>{canManage ? t("role.admin") : t("role.member")}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1.55fr]">
          <Card className="h-fit" data-tour="receipt-upload-card">
            <CardHeader>
              <CardTitle>{t("receipt.upload")}</CardTitle>
              <CardDescription>{t("receipt.uploadDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReceiptUploadForm familyId={familyId} onUploaded={() => {}} />
            </CardContent>
          </Card>

          <Card data-tour="receipt-list-card">
            <CardHeader>
              <CardTitle>{t("receipt.myReceipts")}</CardTitle>
              <CardDescription>{t("receipt.listDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {receipts.length === 0 ? (
                <EmptyState title={t("receipt.noReceipts")} />
              ) : (
                <ul className="space-y-3" data-tour="receipt-list-items">
                  {receipts.map((receipt) => {
                    const canDeleteThis = canManage || receipt.uploaded_by_user_id === user?.id;
                    return (
                      <li
                        key={receipt.id}
                        data-status={receipt.status}
                        className="interactive-row group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                          <a
                            href={getReceiptImageUrl(familyId, receipt.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                          >
                            <img
                              src={getReceiptImageUrl(familyId, receipt.id)}
                              alt={`${t("receipt.upload")} ${receipt.id}`}
                              width={80}
                              className="h-16 w-20 rounded-md border border-border bg-card object-cover"
                            />
                          </a>
                          <div className="space-y-1">
                            <Badge variant={statusVariant(receipt.status)}>
                              {t(statusLabelKey(receipt.status))}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {formatReceiptDate(receipt.created_at)}
                            </p>
                          </div>
                        </div>
                        {canDeleteThis ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(receipt.id)}
                          >
                            {t("receipt.delete")}
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </PageFrame>
  );
}
