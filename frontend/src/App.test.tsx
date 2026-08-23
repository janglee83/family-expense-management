import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import "./i18n/i18n";
import App from "./App";

describe("App", () => {
  it("renders the title in the default (Japanese) language", () => {
    render(<App />);

    expect(screen.getByText("家計簿")).toBeInTheDocument();
  });

  it("switches to Vietnamese when selected", async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox"), "vi");

    expect(
      await screen.findByText("Quản lý chi tiêu gia đình"),
    ).toBeInTheDocument();
  });
});
