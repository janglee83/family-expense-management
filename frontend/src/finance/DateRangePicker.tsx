import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent } from "../components/ui/primitives";
import { Button } from "../components/ui/Button";

export interface DateRange {
  fromDate: string;
  toDate: string;
}

interface DateRangePickerProps {
  fromDate: string;
  toDate: string;
  onChange: (range: DateRange) => void;
}

interface MonthView {
  year: number;
  month: number;
}

function parseIsoDate(value: string): MonthView & { day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function shiftMonth(view: MonthView, delta: number): MonthView {
  const zeroBased = view.month - 1 + delta;
  const year = view.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  return { year, month: month + 1 };
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function CalendarGrid({
  view,
  selectedDate,
  weekdayLabels,
  onSelectDay,
}: {
  view: MonthView;
  selectedDate: string;
  weekdayLabels: string[];
  onSelectDay: (day: number) => void;
}) {
  const totalDays = daysInMonth(view.year, view.month);
  const leadingBlanks = firstWeekdayOfMonth(view.year, view.month);
  const cells: Array<number | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1">
        {weekdayLabels.map((label, index) => (
          <span key={index} className="text-center text-xs font-medium text-muted-foreground">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) =>
          day === null ? (
            <span key={`blank-${index}`} />
          ) : (
            <Button
              key={day}
              type="button"
              variant={toIsoDate(view.year, view.month, day) === selectedDate ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onSelectDay(day)}
            >
              {day}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

export function DateRangePicker({ fromDate, toDate, onChange }: DateRangePickerProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [fromView, setFromView] = useState<MonthView>(() => parseIsoDate(fromDate));
  const [toView, setToView] = useState<MonthView>(() => parseIsoDate(toDate));

  // The browsed month is local state so the user can navigate months without changing
  // the selection, but it must follow the props when the parent replaces the range
  // outright (e.g. starting an edit on a group with a different period).
  useEffect(() => {
    setFromView(parseIsoDate(fromDate));
  }, [fromDate]);

  useEffect(() => {
    setToView(parseIsoDate(toDate));
  }, [toDate]);

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" });
    // 2023-01-01 is a Sunday; walking 7 days from there covers every weekday once.
    return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2023, 0, 1 + index)));
  }, [i18n.language]);

  const monthLabelFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }),
    [i18n.language],
  );

  const displayFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language), [i18n.language]);

  function formatDisplay(isoDate: string): string {
    const { year, month, day } = parseIsoDate(isoDate);
    return displayFormatter.format(new Date(year, month - 1, day));
  }

  function selectFrom(day: number) {
    const nextFrom = toIsoDate(fromView.year, fromView.month, day);
    const nextTo = compareIsoDate(nextFrom, toDate) > 0 ? nextFrom : toDate;
    onChange({ fromDate: nextFrom, toDate: nextTo });
  }

  function selectTo(day: number) {
    const nextTo = toIsoDate(toView.year, toView.month, day);
    const nextFrom = compareIsoDate(nextTo, fromDate) < 0 ? nextTo : fromDate;
    onChange({ fromDate: nextFrom, toDate: nextTo });
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button type="button" variant="outline" aria-label={`${fromDate} - ${toDate}`}>
          {formatDisplay(fromDate)} → {formatDisplay(toDate)}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        {/* Inline z-index (not a Tailwind class, since cn() here does not dedupe
            conflicting utility classes and class-vs-class precedence would depend on
            Tailwind's generated stylesheet order) so this popover reliably sits above
            the Modal overlay/content (z-80) when opened from inside a Modal (e.g. the
            trip edit dialog), while staying below the toast viewport (z-90). */}
        <PopoverContent align="start" sideOffset={8} style={{ zIndex: 85 }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div role="group" aria-label={t("finance.fromDate")} className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.previousMonth")}
                  onClick={() => setFromView((view) => shiftMonth(view, -1))}
                >
                  ‹
                </Button>
                <span className="text-sm font-medium text-foreground">
                  {monthLabelFormatter.format(new Date(fromView.year, fromView.month - 1, 1))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.nextMonth")}
                  onClick={() => setFromView((view) => shiftMonth(view, 1))}
                >
                  ›
                </Button>
              </div>
              <CalendarGrid view={fromView} selectedDate={fromDate} weekdayLabels={weekdayLabels} onSelectDay={selectFrom} />
            </div>

            <div role="group" aria-label={t("finance.toDate")} className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.previousMonth")}
                  onClick={() => setToView((view) => shiftMonth(view, -1))}
                >
                  ‹
                </Button>
                <span className="text-sm font-medium text-foreground">
                  {monthLabelFormatter.format(new Date(toView.year, toView.month - 1, 1))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.nextMonth")}
                  onClick={() => setToView((view) => shiftMonth(view, 1))}
                >
                  ›
                </Button>
              </div>
              <CalendarGrid view={toView} selectedDate={toDate} weekdayLabels={weekdayLabels} onSelectDay={selectTo} />
            </div>
          </div>
        </PopoverContent>
      </Popover.Portal>
    </Popover.Root>
  );
}
