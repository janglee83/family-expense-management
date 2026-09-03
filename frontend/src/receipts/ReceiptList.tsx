import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import { deleteReceipt, getReceiptImageUrl, listReceipts, type Receipt } from "./receiptApi";
import { ReceiptUploadForm } from "./ReceiptUploadForm";

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

export function ReceiptList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [myRole, setMyRole] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;

    Promise.all([listReceipts(familyId), getFamilyDetail(familyId)])
      .then(([receiptResult, familyDetail]) => {
        if (cancelled) return;
        setReceipts(receiptResult);
        setMyRole(familyDetail.members.find((member) => member.user_id === user?.id)?.role);
      })
      .catch(() => {
        if (!cancelled) {
          setReceipts([]);
          setError(t("receipt.uploadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [familyId, user?.id, t]);

  const canManage = myRole === "owner" || myRole === "admin";

  async function handleDelete(receiptId: string) {
    if (!familyId || !window.confirm(t("receipt.confirmDelete"))) return;
    setError(null);
    try {
      await deleteReceipt(familyId, receiptId);
      setReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    } catch {
      setError(t("receipt.uploadFailed"));
    }
  }

  if (isLoading || !familyId) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <main>
      <h1>{t("receipt.myReceipts")}</h1>
      <ReceiptUploadForm
        familyId={familyId}
        onUploaded={(receipt) => setReceipts((current) => [receipt, ...current])}
      />
      {receipts.length === 0 ? (
        <p>{t("receipt.noReceipts")}</p>
      ) : (
        <ul>
          {receipts.map((receipt) => {
            const canDeleteThis = canManage || receipt.uploaded_by_user_id === user?.id;
            return (
              <li key={receipt.id}>
                <a
                  href={getReceiptImageUrl(familyId, receipt.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={getReceiptImageUrl(familyId, receipt.id)} alt="" width={80} />
                </a>
                {t(statusLabelKey(receipt.status))}
                {canDeleteThis && (
                  <button onClick={() => void handleDelete(receipt.id)}>
                    {t("receipt.delete")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
