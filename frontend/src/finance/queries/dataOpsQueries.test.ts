import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import * as expenseApi from "../../expenses/expenseApi";
import { useExpenses } from "../../expenses/expenseQueries";
import {
  useCommitExpenseImport,
  useDeleteExpenseWithUndo,
  useExportBackup,
  useExportExpensesCsv,
  useExportExpensesJson,
  usePreviewExpenseImport,
  useRestoreUndo,
} from "./dataOpsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");
vi.mock("../../expenses/expenseApi");

describe("dataOpsQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useExportExpensesJson calls exportExpensesJson with the bound familyId", async () => {
    vi.mocked(financeApi.exportExpensesJson).mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useExportExpensesJson("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(financeApi.exportExpensesJson).toHaveBeenCalledWith("fam-1");
  });

  it("useExportExpensesCsv calls exportExpensesCsv with the bound familyId", async () => {
    vi.mocked(financeApi.exportExpensesCsv).mockResolvedValue("csv,data");
    const { result } = renderHook(() => useExportExpensesCsv("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(financeApi.exportExpensesCsv).toHaveBeenCalledWith("fam-1");
  });

  it("useExportBackup calls exportBackup with the bound familyId", async () => {
    vi.mocked(financeApi.exportBackup).mockResolvedValue({} as never);
    const { result } = renderHook(() => useExportBackup("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(financeApi.exportBackup).toHaveBeenCalledWith("fam-1");
  });

  it("usePreviewExpenseImport calls previewExpenseImport with the given file", async () => {
    const file = new File(["a,b"], "expenses.csv", { type: "text/csv" });
    vi.mocked(financeApi.previewExpenseImport).mockResolvedValue({
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 0,
      issues: [],
      rows: [],
    });
    const { result } = renderHook(() => usePreviewExpenseImport("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(financeApi.previewExpenseImport).toHaveBeenCalledWith("fam-1", file);
  });

  it("useCommitExpenseImport invalidates expenseKeys.list on success", async () => {
    vi.mocked(expenseApi.listExpenses).mockResolvedValue([]);
    vi.mocked(financeApi.commitExpenseImport).mockResolvedValue({ created_count: 1, skipped_duplicate_count: 0 });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ commit: useCommitExpenseImport("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.commit.mutateAsync({ rows: [], skip_duplicates: true });
    });

    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(2));
  });

  it("useDeleteExpenseWithUndo invalidates expenseKeys.list on success", async () => {
    vi.mocked(expenseApi.listExpenses).mockResolvedValue([]);
    vi.mocked(financeApi.deleteExpenseWithUndo).mockResolvedValue({
      undo_token: "tok-1",
      deleted_expense_id: "exp-1",
      expires_at: "2026-09-14T00:00:00Z",
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ del: useDeleteExpenseWithUndo("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.del.mutateAsync("exp-1");
    });

    expect(financeApi.deleteExpenseWithUndo).toHaveBeenCalledWith("fam-1", "exp-1");
    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(2));
  });

  it("useRestoreUndo invalidates expenseKeys.list on success", async () => {
    vi.mocked(expenseApi.listExpenses).mockResolvedValue([]);
    vi.mocked(financeApi.restoreUndoAction).mockResolvedValue({ restored_expense_id: "exp-1" });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ restore: useRestoreUndo("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.restore.mutateAsync("tok-1");
    });

    expect(financeApi.restoreUndoAction).toHaveBeenCalledWith("fam-1", "tok-1");
    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(2));
  });
});
