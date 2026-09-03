import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ReceiptUploadForm } from "./ReceiptUploadForm";
import { uploadReceipt } from "./receiptApi";

vi.mock("./receiptApi", async () => {
  const actual = await vi.importActual<typeof import("./receiptApi")>("./receiptApi");
  return { ...actual, uploadReceipt: vi.fn() };
});

describe("ReceiptUploadForm", () => {
  const onUploaded = vi.fn();

  beforeEach(() => {
    onUploaded.mockReset();
    vi.mocked(uploadReceipt).mockReset();
  });

  it("rejects an oversized file client-side without calling the API", async () => {
    const user = userEvent.setup();
    render(<ReceiptUploadForm familyId="fam-1" onUploaded={onUploaded} />);
    const oversizedFile = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });

    await user.upload(screen.getByLabelText("アップロード"), oversizedFile);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ファイルサイズは10MB以下にしてください",
    );
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it("rejects a wrong-type file client-side without calling the API", async () => {
    const user = userEvent.setup();
    render(<ReceiptUploadForm familyId="fam-1" onUploaded={onUploaded} />);
    const pdfFile = new File(["not an image"], "doc.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("アップロード"), pdfFile);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JPEG、PNG、HEIC形式のみアップロードできます",
    );
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it("uploads a valid file and calls onUploaded with the result", async () => {
    vi.mocked(uploadReceipt).mockResolvedValue({
      id: "rec-1",
      family_id: "fam-1",
      uploaded_by_user_id: "u1",
      content_type: "image/jpeg",
      file_size_bytes: 1024,
      status: "upload",
      error_message: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ReceiptUploadForm familyId="fam-1" onUploaded={onUploaded} />);
    const validFile = new File(["fake jpeg content"], "receipt.jpg", { type: "image/jpeg" });

    await user.upload(screen.getByLabelText("アップロード"), validFile);
    await user.click(screen.getByRole("button", { name: "アップロード" }));

    expect(uploadReceipt).toHaveBeenCalledWith("fam-1", validFile);
    expect(onUploaded).toHaveBeenCalled();
  });
});
