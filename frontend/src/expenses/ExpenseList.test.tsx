import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ExpenseList } from "./ExpenseList";
import { getFamilyDetail } from "../families/familyApi";
import { useAuth } from "../auth/useAuth";

const listExpensesMock = vi.fn();
const listCategoriesMock = vi.fn();

vi.mock("./expenseApi", async () => {
  const actual = await vi.importActual<typeof import("./expenseApi")>("./expenseApi");
  return {
    ...actual,
    listExpenses: (...args: unknown[]) => listExpensesMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  };
});
vi.mock("../families/familyApi", () => ({
  getFamilyDetail: vi.fn(),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/families/fam-1/expenses"]}>
      <Routes>
        <Route path="/families/:familyId/expenses" element={<ExpenseList />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExpenseList", () => {
  beforeEach(() => {
    listExpensesMock.mockReset();
    listCategoriesMock.mockReset();
    vi.mocked(getFamilyDetail).mockReset();
    vi.mocked(useAuth).mockReset();
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
      ],
    });
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
  });

  it("shows the empty state when there are no expenses", async () => {
    listExpensesMock.mockResolvedValue([]);
    listCategoriesMock.mockResolvedValue([]);

    renderAt();

    expect(await screen.findByText("まだ支出がありません")).toBeInTheDocument();
  });

  it("renders an expense with its resolved category and payer names", async () => {
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u1",
        created_by_user_id: "u1",
        category_id: "cat-1",
        amount: 1500,
        is_shared: false,
        description: "Weekly groceries",
        expense_date: "2026-08-25",
      },
    ]);
    listCategoriesMock.mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries" },
    ]);

    renderAt();

    expect(await screen.findByText(/1500/)).toBeInTheDocument();
    expect(await screen.findByText(/食料品/)).toBeInTheDocument();
    expect(await screen.findByText(/Alice/)).toBeInTheDocument();
  });
});

describe("ExpenseList permission gating", () => {
  beforeEach(() => {
    listExpensesMock.mockReset();
    listCategoriesMock.mockReset();
    vi.mocked(getFamilyDetail).mockReset();
    vi.mocked(useAuth).mockReset();
    listCategoriesMock.mockResolvedValue([{ id: "cat-1", family_id: null, name: "groceries" }]);
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
        { user_id: "u2", email: "b@example.com", display_name: "Bob", role: "member" },
      ],
    });
  });

  it("hides edit/delete for a plain member viewing someone else's expense", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u2", email: "b@example.com", display_name: "Bob" },
    } as ReturnType<typeof useAuth>);
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u1",
        created_by_user_id: "u1",
        category_id: "cat-1",
        amount: 1000,
        is_shared: false,
        description: null,
        expense_date: "2026-08-25",
      },
    ]);

    renderAt();

    await screen.findByText(/1000/);
    expect(screen.queryByText("編集")).not.toBeInTheDocument();
    expect(screen.queryByText("削除")).not.toBeInTheDocument();
  });

  it("shows edit/delete for the expense's own creator", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u2", email: "b@example.com", display_name: "Bob" },
    } as ReturnType<typeof useAuth>);
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u2",
        created_by_user_id: "u2",
        category_id: "cat-1",
        amount: 1000,
        is_shared: false,
        description: null,
        expense_date: "2026-08-25",
      },
    ]);

    renderAt();

    await screen.findByText(/1000/);
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("shows edit/delete for an OWNER viewing someone else's expense", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u2",
        created_by_user_id: "u2",
        category_id: "cat-1",
        amount: 1000,
        is_shared: false,
        description: null,
        expense_date: "2026-08-25",
      },
    ]);

    renderAt();

    await screen.findByText(/1000/);
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });
});
