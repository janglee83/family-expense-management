import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { uploadReceipt, validateReceiptFile, type Receipt } from "./receiptApi";

interface ReceiptUploadFormProps {
  familyId: string;
  onUploaded: (receipt: Receipt) => void;
}

export function ReceiptUploadForm({ familyId, onUploaded }: ReceiptUploadFormProps) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
      setError(
        err instanceof Error && err.message === "invalid_file"
          ? t("receipt.invalidFileType")
          : t("receipt.uploadFailed"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("receipt.upload")}
        <input type="file" onChange={handleFileChange} />
      </label>
      <button type="submit" disabled={!selectedFile || isUploading}>
        {isUploading ? t("receipt.uploading") : t("receipt.upload")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
