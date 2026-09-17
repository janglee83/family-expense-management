import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { HomePage } from "./HomePage";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";
import { renderWithProviders } from "../testUtils/renderWithProviders";
import { listMyFamilies } from "../families/familyApi";
import { listCategories, listExpenses } from "../expenses/expenseApi";
import { getNetWorth } from "../finance/financeApi";

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
vi.mock("../finance/financeApi", () => ({
  getNetWorth: vi.fn(),
}));

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
    vi.mocked(getNetWorth).mockReset();
    vi.mocked(getNetWorth).mockResolvedValue({
      as_of: "2026-09-30",
      assets_total: 0,
      change_amount: 0,
      change_percentage: 0,
      current_net_worth: 0,
      liabilities_total: 0,
      period_end: "2026-09-30",
      period_start: "2026-09-01",
      previous_net_worth: 0,
    });
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
    return renderWithProviders(
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

    // Drive the same effect LanguageSwitcher's Vietnamese menu item triggers
    // (`void i18n.changeLanguage(lang)` in LanguageSwitcher.tsx) directly,
    // inside act(), rather than clicking through the real Radix dropdown.
    // What this test verifies is HomePage's reactivity to a language change,
    // not Radix's own dropdown-open/menu-item-select mechanics (which have no
    // app-specific logic — they're exercised by Radix's own test suite).
    // This CI/jsdom combination hits a Radix DismissableLayer + floating-ui
    // interaction that synchronously blocks the JS event loop for ~15s per
    // pointer interaction (profiled: near-zero calls to
    // getBoundingClientRect/requestAnimationFrame/ResizeObserver during the
    // block, so it isn't a busy reposition loop — it reproduces identically
    // in complete isolation with only <LanguageSwitcher /> rendered, so it is
    // not caused by app code). Driving the language change directly keeps
    // this test fast and deterministic while still exercising the real
    // causal relationship HomePage depends on: i18n language state → heading
    // text.
    await act(async () => {
      await i18n.changeLanguage("vi");
    });

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
