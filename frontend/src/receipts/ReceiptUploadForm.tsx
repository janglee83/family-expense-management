import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { uploadReceipt, validateReceiptFile, type Receipt } from "./receiptApi";
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
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileId = `receipt-file-${familyId}`;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (file) {
      const validationError = validateReceiptFile(file);
      if (validationError) {
        setError(t(`receipt.${validationError}`));
        setSelectedFile(null);
        return;
      }
    }
    setSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;

    setError(null);
    setIsUploading(true);
    try {
      const receipt = await uploadReceipt(familyId, selectedFile);
      onUploaded(receipt);
      setSelectedFile(null);
    } catch (err) {
      setError(translateApiError(t, err, "receipt.uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
        <Field label={t("receipt.upload")} htmlFor={fileId} required>
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
        loading={isUploading}
        loadingLabel={t("receipt.uploading")}
      >
        {t("receipt.upload")}
      </Button>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}
