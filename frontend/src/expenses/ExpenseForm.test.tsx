import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ExpenseForm } from "./ExpenseForm";
import { getFamilyDetail } from "../families/familyApi";
import { createCategory, createExpense, listCategories, updateExpense } from "./expenseApi";
import type { Expense } from "./expenseApi";

vi.mock("./expenseApi", async () => {
  const actual = await vi.importActual<typeof import("./expenseApi")>("./expenseApi");
  return {
    ...actual,
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
  };
});
vi.mock("../families/familyApi", () => ({
  getFamilyDetail: vi.fn(),
}));

describe("ExpenseForm", () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    onSaved.mockReset();
    vi.mocked(listCategories).mockReset();
    vi.mocked(createCategory).mockReset();
    vi.mocked(createExpense).mockReset();
    vi.mocked(updateExpense).mockReset();
    vi.mocked(getFamilyDetail).mockReset();

    vi.mocked(listCategories).mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries" },
    ]);
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
      ],
    });
  });

  it("shows a validation error for a non-positive amount without calling the API", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm familyId="fam-1" onSaved={onSaved} />, { wrapper: MemoryRouter });
    await screen.findByText("食料品");

    await user.clear(screen.getByLabelText("金額"));
    await user.type(screen.getByLabelText("金額"), "0");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "金額は1円以上で入力してください",
    );
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("submits the selected payer, category, and amount", async () => {
    vi.mocked(createExpense).mockResolvedValue({
      id: "exp-1",
      family_id: "fam-1",
      payer_user_id: "u1",
      created_by_user_id: "u1",
      category_id: "cat-1",
      amount: 1200,
      is_shared: false,
      description: null,
      expense_date: "2026-08-25",
    });
    const user = userEvent.setup();
    render(<ExpenseForm familyId="fam-1" onSaved={onSaved} />, { wrapper: MemoryRouter });
    await screen.findByText("食料品");

    await user.clear(screen.getByLabelText("金額"));
    await user.type(screen.getByLabelText("金額"), "1200");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(createExpense).toHaveBeenCalledWith(
      "fam-1",
      expect.objectContaining({ payer_user_id: "u1", category_id: "cat-1", amount: 1200 }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("creates a new category and selects it", async () => {
    vi.mocked(createCategory).mockResolvedValue({
      id: "cat-2",
      family_id: "fam-1",
      name: "Custom Thing",
    });
    const user = userEvent.setup();
    render(<ExpenseForm familyId="fam-1" onSaved={onSaved} />, { wrapper: MemoryRouter });
    await screen.findByText("食料品");

    await user.type(screen.getByLabelText("新しいカテゴリー名"), "Custom Thing");
    await user.click(screen.getByRole("button", { name: "カテゴリーを追加" }));

    expect(createCategory).toHaveBeenCalledWith("fam-1", "Custom Thing");
    expect(await screen.findByText("Custom Thing")).toBeInTheDocument();
  });

  it("submits an update for an existing expense instead of creating a new one", async () => {
    const existingExpense: Expense = {
      id: "exp-1",
      family_id: "fam-1",
      payer_user_id: "u1",
      created_by_user_id: "u1",
      category_id: "cat-1",
      amount: 1500,
      is_shared: true,
      description: "Weekly groceries",
      expense_date: "2026-08-20",
    };
    vi.mocked(updateExpense).mockResolvedValue({ ...existingExpense, amount: 1800 });
    const user = userEvent.setup();
    render(
      <ExpenseForm familyId="fam-1" expense={existingExpense} onSaved={onSaved} />,
      { wrapper: MemoryRouter },
    );
    await screen.findByText("食料品");

    expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("金額"));
    await user.type(screen.getByLabelText("金額"), "1800");
    await user.click(screen.getByRole("button", { name: "編集" }));

    expect(updateExpense).toHaveBeenCalledWith(
      "fam-1",
      "exp-1",
      expect.objectContaining({ payer_user_id: "u1", category_id: "cat-1", amount: 1800 }),
    );
    expect(createExpense).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });
});
