import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { FamilyDetail } from "./FamilyDetail";
import { useAuth } from "../auth/useAuth";

const getFamilyDetailMock = vi.fn();
const removeMemberMock = vi.fn();
const addMemberMock = vi.fn();

vi.mock("./familyApi", () => ({
  getFamilyDetail: (...args: unknown[]) => getFamilyDetailMock(...args),
  removeMember: (...args: unknown[]) => removeMemberMock(...args),
  addMember: (...args: unknown[]) => addMemberMock(...args),
  renameFamily: vi.fn(),
  deleteFamily: vi.fn(),
  changeMemberRole: vi.fn(),
}));
vi.mock("../auth/useAuth");

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_ID = "22222222-2222-2222-2222-222222222222";

function renderAtFamily(userId: string) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: userId, email: "user@example.com", display_name: "User" },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/families/fam-1"]}>
      <Routes>
        <Route path="/families/:familyId" element={<FamilyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FamilyDetail", () => {
  beforeEach(() => {
    getFamilyDetailMock.mockReset();
    removeMemberMock.mockReset();
    addMemberMock.mockReset();
    getFamilyDetailMock.mockResolvedValue({
      id: "fam-1",
      name: "My Family",
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

    expect(
      screen.getAllByRole("button", { name: "削除" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows a leave button instead of remove for the current member themselves", async () => {
    renderAtFamily(MEMBER_ID);

    await screen.findByText("Member Person");

    expect(screen.getByRole("button", { name: "退出する" })).toBeInTheDocument();
  });

  it("does not show a remove/leave button for the owner row", async () => {
    renderAtFamily(OWNER_ID);

    await screen.findByText("Owner Person");

    expect(screen.queryByRole("button", { name: "退出する" })).not.toBeInTheDocument();
  });

  it("calls addMember when the owner submits the add-member form", async () => {
    addMemberMock.mockResolvedValue({
      user_id: "33333333-3333-3333-3333-333333333333",
      email: "new@example.com",
      display_name: "New Person",
      role: "member",
    });
    const user = userEvent.setup();
    renderAtFamily(OWNER_ID);
    await screen.findByText("Member Person");

    await user.type(screen.getByLabelText("メールアドレス"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "メンバーを追加" }));

    expect(addMemberMock).toHaveBeenCalledWith("fam-1", "new@example.com");
  });
});
