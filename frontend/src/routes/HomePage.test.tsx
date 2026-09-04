import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { HomePage } from "./HomePage";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";
import { listMyFamilies } from "../families/familyApi";
import { listCategories, listExpenses } from "../expenses/expenseApi";

vi.mock("../families/familyApi", () => ({
  listMyFamilies: vi.fn(),
}));
vi.mock("../expenses/expenseApi", async () => {
  const actual = await vi.importActual<typeof import("../expenses/expenseApi")>("../expenses/expenseApi");
  return {
    ...actual,
    listExpenses: vi.fn(),
    listCategories: vi.fn(),
  };
});

vi.mock("../auth/useAuth");

describe("HomePage", () => {
  const logoutMock = vi.fn();

  beforeEach(async () => {
    logoutMock.mockReset();
    vi.mocked(listMyFamilies).mockReset();
    vi.mocked(listExpenses).mockReset();
    vi.mocked(listCategories).mockReset();
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listCategories).mockResolvedValue([]);
    // i18next is a global singleton; reset the language before each test so
    // the language switch in one test doesn't leak into the next.
    await i18n.changeLanguage("ja");
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        display_name: "Alice",
      },
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: logoutMock,
    });
  });

  function renderPage() {
    return render(
      <SnackbarProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </SnackbarProvider>,
    );
  }

  it("renders dashboard heading and empty-family state in Japanese by default", async () => {
    vi.mocked(listMyFamilies).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole("heading", { name: i18n.t("dashboard.title") })).toBeInTheDocument();
    expect(await screen.findByText(i18n.t("family.noFamilies"))).toBeInTheDocument();
  });

  it("switches to Vietnamese when selected", async () => {
    vi.mocked(listMyFamilies).mockResolvedValue([
      {
        id: "fam-1",
        name: "My Family",
        role: "owner",
        family_type: "shared",
        currency_code: "jpy",
        monthly_income_enabled: false,
        monthly_income: null,
        savings_goal_amount: null,
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "言語" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Tiếng Việt" }));

    expect(await screen.findByRole("heading", { name: i18n.t("dashboard.title") })).toBeInTheDocument();
  });

  it("shows a failure message when loading families fails", async () => {
    vi.mocked(listMyFamilies).mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("family.actionFailed"));
  });

  it("calls logout when the logout button is clicked", async () => {
    vi.mocked(listMyFamilies).mockResolvedValue([]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: i18n.t("auth.logout") }));

    expect(logoutMock).toHaveBeenCalled();
  });
});
