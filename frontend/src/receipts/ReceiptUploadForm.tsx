import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { validateReceiptFile, type Receipt } from "./receiptApi";
import { useUploadReceipt } from "./receiptQueries";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

interface ReceiptUploadFormProps {
  familyId: string;
  onUploaded: (receipt: Receipt) => void;
}

export function ReceiptUploadForm({ familyId, onUploaded }: ReceiptUploadFormProps) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const uploadReceiptMutation = useUploadReceipt(familyId);
  const fileId = `receipt-file-${familyId}`;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileError(null);
    setFormError(null);
    if (file) {
      const validationError = validateReceiptFile(file);
      if (validationError) {
        setFileError(t(`receipt.${validationError}`));
        setSelectedFile(null);
        return;
      }
    }
    setSelectedFile(file);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;

    setFormError(null);
    uploadReceiptMutation.mutate(selectedFile, {
      onSuccess: (receipt) => {
        onUploaded(receipt);
        setSelectedFile(null);
      },
      onError: (err) => {
        setFormError(translateApiError(t, err, "receipt.uploadFailed"));
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
        <Field label={t("receipt.upload")} htmlFor={fileId} required error={fileError}>
          <input id={fileId} type="file" onChange={handleFileChange} />
        </Field>

        {selectedFile ? (
          <p className="type-body-sm break-all">
            {selectedFile.name}
          </p>
        ) : null}
      </section>

      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={!selectedFile}
        loading={uploadReceiptMutation.isPending}
        loadingLabel={t("receipt.uploading")}
      >
        {t("receipt.upload")}
      </Button>

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
