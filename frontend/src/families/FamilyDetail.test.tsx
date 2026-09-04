import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { FamilyDetail } from "./FamilyDetail";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";

const getFamilyDetailMock = vi.fn();
const removeMemberMock = vi.fn();

vi.mock("./familyApi", () => ({
  getFamilyDetail: (...args: unknown[]) => getFamilyDetailMock(...args),
  removeMember: (...args: unknown[]) => removeMemberMock(...args),
  renameFamily: vi.fn(),
  deleteFamily: vi.fn(),
  changeMemberRole: vi.fn(),
}));
vi.mock("../auth/useAuth");

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_ID = "22222222-2222-2222-2222-222222222222";
const ADMIN_ID = "44444444-4444-4444-4444-444444444444";
const OTHER_ADMIN_ID = "55555555-5555-5555-5555-555555555555";

function renderAtFamily(userId: string) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: userId, email: "user@example.com", display_name: "User" },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <SnackbarProvider>
      <MemoryRouter initialEntries={["/families/fam-1"]}>
        <Routes>
          <Route path="/families/:familyId" element={<FamilyDetail />} />
        </Routes>
      </MemoryRouter>
    </SnackbarProvider>,
  );
}

describe("FamilyDetail", () => {
  beforeEach(async () => {
    getFamilyDetailMock.mockReset();
    removeMemberMock.mockReset();
    await i18n.changeLanguage("ja");
    getFamilyDetailMock.mockResolvedValue({
      id: "fam-1",
      name: "My Family",
      family_type: "shared",
      currency_code: "jpy",
      monthly_income_enabled: false,
      monthly_income: null,
      savings_goal_amount: null,
      members: [
        {
          user_id: OWNER_ID,
          email: "owner@example.com",
          display_name: "Owner Person",
          role: "owner",
        },
        {
          user_id: MEMBER_ID,
          email: "member@example.com",
          display_name: "Member Person",
          role: "member",
        },
      ],
    });
  });

  it("shows a remove button for a member when viewed by the owner", async () => {
    renderAtFamily(OWNER_ID);

    await screen.findByText("Member Person");

    // Scope to the member's own row: the family-level delete button also
    // uses a delete-like label, so an unscoped query would pass even if the
    // per-member remove button were removed entirely.
    const memberRow = screen.getByText("Member Person").closest("li");
    expect(memberRow).not.toBeNull();
    expect(
      within(memberRow as HTMLElement).getByRole("button", { name: i18n.t("family.removeMember") }),
    ).toBeInTheDocument();
  });

  it("shows a leave button instead of remove for the current member themselves", async () => {
    renderAtFamily(MEMBER_ID);

    await screen.findByText("Member Person");

    expect(screen.getByRole("button", { name: i18n.t("family.leaveFamily") })).toBeInTheDocument();
  });

  it("does not show a remove/leave button for the owner row", async () => {
    renderAtFamily(OWNER_ID);

    await screen.findByText("Owner Person");

    expect(screen.queryByRole("button", { name: i18n.t("family.leaveFamily") })).not.toBeInTheDocument();
  });

  it("gates delete/rename/remove correctly when viewed by an admin", async () => {
    getFamilyDetailMock.mockResolvedValue({
      id: "fam-1",
      name: "My Family",
      family_type: "shared",
      currency_code: "jpy",
      monthly_income_enabled: false,
      monthly_income: null,
      savings_goal_amount: null,
      members: [
        {
          user_id: OWNER_ID,
          email: "owner@example.com",
          display_name: "Owner Person",
          role: "owner",
        },
        {
          user_id: ADMIN_ID,
          email: "admin@example.com",
          display_name: "Admin Person",
          role: "admin",
        },
        {
          user_id: MEMBER_ID,
          email: "member@example.com",
          display_name: "Member Person",
          role: "member",
        },
        {
          user_id: OTHER_ADMIN_ID,
          email: "other-admin@example.com",
          display_name: "Other Admin",
          role: "admin",
        },
      ],
    });

    const { container } = renderAtFamily(ADMIN_ID);
    await screen.findByText("Member Person");

    // 1. Delete button is OWNER-only, so an ADMIN viewer must not see it.
    // The delete button (if rendered) is a direct child of <main>, unlike the
    // per-member remove/leave buttons which live inside <li> elements — this
    // avoids ambiguity with the member-remove label.
    expect(container.querySelector("main > button")).toBeNull();

    // 2. Rename edit control (OWNER-or-ADMIN) is visible.
    expect(screen.getByRole("button", { name: i18n.t("common.edit") })).toBeInTheDocument();

    // 3. A remove button is rendered for the plain MEMBER row.
    const memberRow = screen.getByText("Member Person").closest("li");
    expect(memberRow).not.toBeNull();
    expect(
      within(memberRow as HTMLElement).getByRole("button", { name: i18n.t("family.removeMember") }),
    ).toBeInTheDocument();

    // 4. No remove button and no promote/demote <select> for a peer ADMIN's row.
    const otherAdminRow = screen.getByText("Other Admin").closest("li");
    expect(otherAdminRow).not.toBeNull();
    expect(
      within(otherAdminRow as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
    expect(
      within(otherAdminRow as HTMLElement).queryByRole("combobox"),
    ).not.toBeInTheDocument();
  });
});
