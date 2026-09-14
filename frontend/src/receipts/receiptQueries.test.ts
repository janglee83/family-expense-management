import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import { receiptKeys, useDeleteReceipt, useReceipts, useUploadReceipt } from "./receiptQueries";
import * as receiptApi from "./receiptApi";

vi.mock("./receiptApi");

describe("receiptQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useReceipts returns the list from listReceipts", async () => {
    vi.mocked(receiptApi.listReceipts).mockResolvedValue([]);
    const { result } = renderHook(() => useReceipts("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useUploadReceipt invalidates receiptKeys.list on success", async () => {
    vi.mocked(receiptApi.listReceipts).mockResolvedValue([]);
    vi.mocked(receiptApi.uploadReceipt).mockResolvedValue({
      id: "rec-1",
      family_id: "fam-1",
      uploaded_by_user_id: "u1",
      status: "processing",
      created_at: "2026-09-01T00:00:00Z",
    } as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ upload: useUploadReceipt("fam-1"), list: useReceipts("fam-1") }),
      { wrapper },
    );
    await waitFor(() => expect(receiptApi.listReceipts).toHaveBeenCalledTimes(1));
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.upload.mutateAsync(file);
    });

    expect(receiptApi.uploadReceipt).toHaveBeenCalledWith("fam-1", file);
    await waitFor(() => expect(receiptApi.listReceipts).toHaveBeenCalledTimes(2));
  });

  it("useDeleteReceipt invalidates receiptKeys.list on success", async () => {
    vi.mocked(receiptApi.listReceipts).mockResolvedValue([]);
    vi.mocked(receiptApi.deleteReceipt).mockResolvedValue(undefined);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ del: useDeleteReceipt("fam-1"), list: useReceipts("fam-1") }),
      { wrapper },
    );
    await waitFor(() => expect(receiptApi.listReceipts).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.del.mutateAsync("rec-1");
    });

    expect(receiptApi.deleteReceipt).toHaveBeenCalledWith("fam-1", "rec-1");
    await waitFor(() => expect(receiptApi.listReceipts).toHaveBeenCalledTimes(2));
  });

  it("receiptKeys produces a stable, family-scoped key", () => {
    expect(receiptKeys.list("fam-1")).toEqual(["families", "fam-1", "receipts"]);
  });
});
