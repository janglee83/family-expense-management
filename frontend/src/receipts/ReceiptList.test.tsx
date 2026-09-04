import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ReceiptList } from "./ReceiptList";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import { deleteReceipt, listReceipts } from "./receiptApi";
import { SnackbarProvider } from "../components/ui/Snackbar";

vi.mock("./receiptApi", async () => {
  const actual = await vi.importActual<typeof import("./receiptApi")>("./receiptApi");
  return { ...actual, listReceipts: vi.fn(), deleteReceipt: vi.fn() };
});
vi.mock("../families/familyApi", () => ({ getFamilyDetail: vi.fn() }));
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));

function renderAt() {
  return render(
    <SnackbarProvider>
      <MemoryRouter initialEntries={["/families/fam-1/receipts"]}>
        <Routes>
          <Route path="/families/:familyId/receipts" element={<ReceiptList />} />
        </Routes>
      </MemoryRouter>
    </SnackbarProvider>,
  );
}

describe("ReceiptList", () => {
  beforeEach(() => {
    vi.mocked(listReceipts).mockReset();
    vi.mocked(deleteReceipt).mockReset();
    vi.mocked(getFamilyDetail).mockReset();
    vi.mocked(useAuth).mockReset();
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      family_type: "shared",
      currency_code: "jpy",
      monthly_income_enabled: false,
      monthly_income: null,
      savings_goal_amount: null,
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
        { user_id: "u2", email: "b@example.com", display_name: "Bob", role: "member" },
      ],
    });
  });

  it("shows the empty state when there are no receipts", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(listReceipts).mockResolvedValue([]);

    renderAt();

    expect(await screen.findByText("まだレシートがありません")).toBeInTheDocument();
  });

  it("renders each receipt's status and hides delete for a non-uploader member", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u2", email: "b@example.com", display_name: "Bob" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(listReceipts).mockResolvedValue([
      {
        id: "rec-1",
        family_id: "fam-1",
        uploaded_by_user_id: "u1",
        content_type: "image/jpeg",
        file_size_bytes: 1024,
        status: "processing",
        error_message: null,
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
      },
    ]);

    renderAt();

    expect(await screen.findByText("処理中")).toBeInTheDocument();
    expect(screen.queryByText("削除")).not.toBeInTheDocument();
  });

  it("shows delete for the uploader", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(listReceipts).mockResolvedValue([
      {
        id: "rec-1",
        family_id: "fam-1",
        uploaded_by_user_id: "u1",
        content_type: "image/jpeg",
        file_size_bytes: 1024,
        status: "upload",
        error_message: null,
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
      },
    ]);

    renderAt();

    expect(await screen.findByText("削除")).toBeInTheDocument();
  });
});
