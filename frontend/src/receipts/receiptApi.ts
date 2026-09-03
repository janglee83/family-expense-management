import { API_BASE_URL, apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type Receipt = components["schemas"]["ReceiptResponse"];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];

export function validateReceiptFile(file: File): "fileTooLarge" | "invalidFileType" | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "fileTooLarge";
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return "invalidFileType";
  }
  return null;
}

export async function uploadReceipt(familyId: string, file: File): Promise<Receipt> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/v1/families/${familyId}/receipts/`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    if (response.status === 422) {
      throw new Error("invalid_file");
    }
    throw new Error("upload_receipt_failed");
  }
  return (await response.json()) as Receipt;
}

export async function listReceipts(familyId: string): Promise<Receipt[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/{family_id}/receipts/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw new Error("list_receipts_failed");
  }
  return data;
}

export async function deleteReceipt(familyId: string, receiptId: string): Promise<void> {
  const { error } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/receipts/{receipt_id}",
    { params: { path: { family_id: familyId, receipt_id: receiptId } } },
  );
  if (error) {
    throw new Error("delete_receipt_failed");
  }
}

export function getReceiptImageUrl(familyId: string, receiptId: string): string {
  return `${API_BASE_URL}/api/v1/families/${familyId}/receipts/${receiptId}/image`;
}
