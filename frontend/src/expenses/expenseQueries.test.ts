import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import {
  expenseKeys,
  useCategories,
  useCreateCategory,
  useCreateExpense,
  useDeleteCategory,
  useDeleteExpense,
  useExpenses,
  useRenameCategory,
  useUpdateExpense,
} from "./expenseQueries";
import * as expenseApi from "./expenseApi";

vi.mock("./expenseApi");

const EXPENSE_INPUT = {
  payer_user_id: "u1",
  category_id: "cat-1",
  amount: 1000,
  is_shared: false,
  expense_date: "2026-09-01",
};

describe("expenseQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useCategories returns the list from listCategories", async () => {
    vi.mocked(expenseApi.listCategories).mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries", icon: "basket" },
    ]);

    const { result } = renderHook(() => useCategories("fam-1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it("useExpenses returns the list from listExpenses", async () => {
    vi.mocked(expenseApi.listExpenses).mockResolvedValue([]);

    const { result } = renderHook(() => useExpenses("fam-1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useCreateCategory invalidates expenseKeys.categories on success", async () => {
    vi.mocked(expenseApi.listCategories).mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries", icon: "basket" },
    ]);
    vi.mocked(expenseApi.createCategory).mockResolvedValue({
      id: "cat-2",
      family_id: "fam-1",
      name: "fun",
      icon: "tag",
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateCategory("fam-1"), list: useCategories("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await result.current.create.mutateAsync({ name: "fun", icon: "tag" });
    });

    expect(expenseApi.createCategory).toHaveBeenCalledWith("fam-1", "fun", "tag");
    await waitFor(() => expect(expenseApi.listCategories).toHaveBeenCalledTimes(2));
  });

  it("useRenameCategory calls renameCategory with the bound familyId", async () => {
    vi.mocked(expenseApi.renameCategory).mockResolvedValue({
      id: "cat-1",
      family_id: "fam-1",
      name: "renamed",
      icon: "tag",
    });
    const { result } = renderHook(() => useRenameCategory("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ categoryId: "cat-1", name: "renamed" });
    });

    expect(expenseApi.renameCategory).toHaveBeenCalledWith("fam-1", "cat-1", "renamed");
  });

  it("useDeleteCategory calls deleteCategory with the bound familyId", async () => {
    vi.mocked(expenseApi.deleteCategory).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteCategory("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("cat-1");
    });

    expect(expenseApi.deleteCategory).toHaveBeenCalledWith("fam-1", "cat-1");
  });

  it("useCreateExpense invalidates expenseKeys.list on success", async () => {
    vi.mocked(expenseApi.listExpenses).mockResolvedValue([]);
    vi.mocked(expenseApi.createExpense).mockResolvedValue({
      id: "exp-1",
      family_id: "fam-1",
      created_by_user_id: "u1",
      description: null,
      ...EXPENSE_INPUT,
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateExpense("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await result.current.create.mutateAsync(EXPENSE_INPUT);
    });

    await waitFor(() => expect(expenseApi.listExpenses).toHaveBeenCalledTimes(2));
  });

  it("useUpdateExpense calls updateExpense with the bound familyId and given expenseId", async () => {
    vi.mocked(expenseApi.updateExpense).mockResolvedValue({
      id: "exp-1",
      family_id: "fam-1",
      created_by_user_id: "u1",
      description: null,
      ...EXPENSE_INPUT,
    });
    const { result } = renderHook(() => useUpdateExpense("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: "exp-1", input: EXPENSE_INPUT });
    });

    expect(expenseApi.updateExpense).toHaveBeenCalledWith("fam-1", "exp-1", EXPENSE_INPUT);
  });

  it("useDeleteExpense calls deleteExpense with the bound familyId and given expenseId", async () => {
    vi.mocked(expenseApi.deleteExpense).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteExpense("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("exp-1");
    });

    expect(expenseApi.deleteExpense).toHaveBeenCalledWith("fam-1", "exp-1");
  });

  it("expenseKeys produces stable, family-scoped keys", () => {
    expect(expenseKeys.categories("fam-1")).toEqual(["families", "fam-1", "categories"]);
    expect(expenseKeys.list("fam-1")).toEqual(["families", "fam-1", "expenses"]);
  });
});
