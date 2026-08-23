import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "./i18n/i18n";
import App from "./App";

const getMock = vi.fn();

vi.mock("./api/client", () => ({
  apiClient: { GET: (...args: unknown[]) => getMock(...args) },
}));

describe("App", () => {
  beforeEach(async () => {
    getMock.mockReset();
    // i18next is a global singleton; reset the language before each test so
    // the language switch in one test doesn't leak into the next.
    await i18n.changeLanguage("ja");
  });

  it("renders the title in the default (Japanese) language", async () => {
    getMock.mockResolvedValue({ data: { status: "ok", message: "pong" }, error: undefined });
    render(<App />);

    expect(screen.getByText("家計簿")).toBeInTheDocument();
    expect(await screen.findByText("サーバーに接続しました")).toBeInTheDocument();
  });

  it("switches to Vietnamese when selected", async () => {
    getMock.mockResolvedValue({ data: { status: "ok", message: "pong" }, error: undefined });
    render(<App />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox"), "vi");

    expect(await screen.findByText("Quản lý chi tiêu gia đình")).toBeInTheDocument();
  });

  it("shows a failure message when the ping call errors", async () => {
    getMock.mockResolvedValue({ data: undefined, error: { detail: "boom" } });
    render(<App />);

    expect(await screen.findByText("サーバーに接続できませんでした")).toBeInTheDocument();
  });
});
