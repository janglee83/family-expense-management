import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { FamilyList } from "./FamilyList";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";

const listMyFamiliesMock = vi.fn();

vi.mock("./familyApi", () => ({
  listMyFamilies: (...args: unknown[]) => listMyFamiliesMock(...args),
}));
vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

describe("FamilyList", () => {
  beforeEach(() => {
    listMyFamiliesMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>);
  });

  it("renders the user's families", async () => {
    listMyFamiliesMock.mockResolvedValue([
      { id: "11111111-1111-1111-1111-111111111111", name: "My Family", role: "owner" },
    ]);

    render(
      <SnackbarProvider>
        <MemoryRouter>
          <FamilyList />
        </MemoryRouter>
      </SnackbarProvider>,
    );

    expect(await screen.findByText("My Family")).toBeInTheDocument();
  });

  it("shows the empty state when there are no families", async () => {
    listMyFamiliesMock.mockResolvedValue([]);

    render(
      <SnackbarProvider>
        <MemoryRouter>
          <FamilyList />
        </MemoryRouter>
      </SnackbarProvider>,
    );

    expect(await screen.findByText("まだ家族がありません")).toBeInTheDocument();
  });
});
