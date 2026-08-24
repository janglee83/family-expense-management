import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { FamilyList } from "./FamilyList";

const listMyFamiliesMock = vi.fn();
const createFamilyMock = vi.fn();

vi.mock("./familyApi", () => ({
  listMyFamilies: (...args: unknown[]) => listMyFamiliesMock(...args),
  createFamily: (...args: unknown[]) => createFamilyMock(...args),
}));

describe("FamilyList", () => {
  beforeEach(() => {
    listMyFamiliesMock.mockReset();
    createFamilyMock.mockReset();
  });

  it("renders the user's families", async () => {
    listMyFamiliesMock.mockResolvedValue([
      { id: "11111111-1111-1111-1111-111111111111", name: "My Family", role: "owner" },
    ]);

    render(<FamilyList />, { wrapper: MemoryRouter });

    expect(await screen.findByText("My Family")).toBeInTheDocument();
  });

  it("shows the empty state when there are no families", async () => {
    listMyFamiliesMock.mockResolvedValue([]);

    render(<FamilyList />, { wrapper: MemoryRouter });

    expect(await screen.findByText("まだ家族がありません")).toBeInTheDocument();
  });

  it("adds the newly created family to the list on submit", async () => {
    listMyFamiliesMock.mockResolvedValue([]);
    createFamilyMock.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "New Family",
      role: "owner",
    });
    const user = userEvent.setup();

    render(<FamilyList />, { wrapper: MemoryRouter });
    await screen.findByText("まだ家族がありません");

    await user.type(screen.getByLabelText("家族名"), "New Family");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("New Family")).toBeInTheDocument();
  });
});
