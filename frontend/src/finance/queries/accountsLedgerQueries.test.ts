import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  useAccounts,
  useCreateAccount,
  useCreateLedgerTransaction,
  useLedgerTransactions,
  useToggleAccountActive,
} from "./accountsLedgerQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("accountsLedgerQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useLedgerTransactions returns the list from listLedgerTransactions", async () => {
    vi.mocked(financeApi.listLedgerTransactions).mockResolvedValue([]);
    const { result } = renderHook(() => useLedgerTransactions("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useCreateAccount invalidates financeKeys.accounts on success", async () => {
    vi.mocked(financeApi.listAccounts).mockResolvedValue([]);
    vi.mocked(financeApi.createAccount).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateAccount("fam-1"), list: useAccounts("fam-1") }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.data).toEqual([]));

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Bank", account_type: "bank" } as never);
    });

    await waitFor(() => expect(financeApi.listAccounts).toHaveBeenCalledTimes(2));
  });

  it("useToggleAccountActive calls updateAccount with is_active", async () => {
    vi.mocked(financeApi.updateAccount).mockResolvedValue({} as never);
    const { result } = renderHook(() => useToggleAccountActive("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ accountId: "acc-1", isActive: false });
    });

    expect(financeApi.updateAccount).toHaveBeenCalledWith("fam-1", "acc-1", { is_active: false });
  });

  it("useCreateLedgerTransaction invalidates both accounts and ledgerTransactions on success", async () => {
    vi.mocked(financeApi.listAccounts).mockResolvedValue([]);
    vi.mocked(financeApi.listLedgerTransactions).mockResolvedValue([]);
    vi.mocked(financeApi.createLedgerTransaction).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({
        create: useCreateLedgerTransaction("fam-1"),
        accounts: useAccounts("fam-1"),
        transactions: useLedgerTransactions("fam-1"),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.accounts.data).toEqual([]));
    await waitFor(() => expect(result.current.transactions.data).toEqual([]));

    await act(async () => {
      await result.current.create.mutateAsync({
        transaction_type: "expense",
        amount: 500,
        occurred_on: "2026-09-01",
      } as never);
    });

    await waitFor(() => expect(financeApi.listAccounts).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(financeApi.listLedgerTransactions).toHaveBeenCalledTimes(2));
  });
});
