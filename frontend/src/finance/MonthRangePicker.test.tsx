import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthRangePicker } from "./MonthRangePicker";

describe("MonthRangePicker", () => {
  it("renders the current from/to range in the trigger label", () => {
    render(<MonthRangePicker fromMonth="2026-09" toMonth="2026-10" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /2026-09.*2026-10/ })).toBeInTheDocument();
  });

  it("opens a popover with separate from/to month pickers on click", () => {
    render(<MonthRangePicker fromMonth="2026-09" toMonth="2026-09" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09/ }));

    expect(screen.getByRole("group", { name: /from/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /to/i })).toBeInTheDocument();
  });

  it("selecting a from-month after the current to-month pushes the to-month forward", () => {
    const onChange = vi.fn();
    render(<MonthRangePicker fromMonth="2026-09" toMonth="2026-09" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09/ }));
    fireEvent.click(within(screen.getByRole("group", { name: /from/i })).getByRole("button", { name: "12" }));

    expect(onChange).toHaveBeenCalledWith({ fromMonth: "2026-12", toMonth: "2026-12" });
  });

  it("selecting a to-month before the current from-month pulls the from-month back", () => {
    const onChange = vi.fn();
    render(<MonthRangePicker fromMonth="2026-09" toMonth="2026-09" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09/ }));
    fireEvent.click(within(screen.getByRole("group", { name: /to/i })).getByRole("button", { name: "01" }));

    expect(onChange).toHaveBeenCalledWith({ fromMonth: "2026-01", toMonth: "2026-01" });
  });
});
