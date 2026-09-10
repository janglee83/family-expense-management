import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangePicker } from "./DateRangePicker";

describe("DateRangePicker", () => {
  it("renders the current from/to range in the trigger label", () => {
    render(<DateRangePicker fromDate="2026-09-01" toDate="2026-09-10" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /2026-09-01.*2026-09-10/ })).toBeInTheDocument();
  });

  it("opens a popover with separate from/to day calendars on click", () => {
    render(<DateRangePicker fromDate="2026-09-01" toDate="2026-09-01" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09-01/ }));

    expect(screen.getByRole("group", { name: /from/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /to/i })).toBeInTheDocument();
  });

  it("selecting a from-day after the current to-day pushes the to-day forward", () => {
    const onChange = vi.fn();
    render(<DateRangePicker fromDate="2026-09-01" toDate="2026-09-01" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09-01/ }));
    fireEvent.click(within(screen.getByRole("group", { name: /from/i })).getByRole("button", { name: "15" }));

    expect(onChange).toHaveBeenCalledWith({ fromDate: "2026-09-15", toDate: "2026-09-15" });
  });

  it("resyncs both browsed months when the from/to date props change after mount", () => {
    const { rerender } = render(<DateRangePicker fromDate="2026-09-01" toDate="2026-09-01" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09-01/ }));
    expect(within(screen.getByRole("group", { name: /from/i })).getByText(/2026/)).toBeInTheDocument();

    // e.g. starting an edit on a group whose period is in different months.
    rerender(<DateRangePicker fromDate="2024-03-05" toDate="2025-11-20" onChange={vi.fn()} />);

    expect(within(screen.getByRole("group", { name: /from/i })).getByText(/2024/)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: /to/i })).getByText(/2025/)).toBeInTheDocument();
  });

  it("selecting a to-day before the current from-day pulls the from-day back", () => {
    const onChange = vi.fn();
    render(<DateRangePicker fromDate="2026-09-20" toDate="2026-09-20" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /2026-09-20/ }));
    fireEvent.click(within(screen.getByRole("group", { name: /to/i })).getByRole("button", { name: "1" }));

    expect(onChange).toHaveBeenCalledWith({ fromDate: "2026-09-01", toDate: "2026-09-01" });
  });
});
