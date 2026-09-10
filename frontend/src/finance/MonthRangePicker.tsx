import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent } from "../components/ui/primitives";
import { Button } from "../components/ui/Button";

export interface MonthRange {
  fromMonth: string;
  toMonth: string;
}

interface MonthRangePickerProps {
  fromMonth: string;
  toMonth: string;
  onChange: (range: MonthRange) => void;
}

const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

function parseYearMonth(value: string): { year: number; month: string } {
  const [year, month] = value.split("-");
  return { year: Number(year), month };
}

function compareYearMonth(a: string, b: string): number {
  return a.localeCompare(b);
}

export function MonthRangePicker({ fromMonth, toMonth, onChange }: MonthRangePickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [fromYear, setFromYear] = useState(() => parseYearMonth(fromMonth).year);
  const [toYear, setToYear] = useState(() => parseYearMonth(toMonth).year);

  // The year grids are local state so the user can browse years without changing the
  // selection, but they must follow the props when the parent replaces the range
  // outright (e.g. starting an edit on a group from a different year).
  useEffect(() => {
    setFromYear(parseYearMonth(fromMonth).year);
  }, [fromMonth]);

  useEffect(() => {
    setToYear(parseYearMonth(toMonth).year);
  }, [toMonth]);

  function selectFrom(month: string) {
    const nextFrom = `${fromYear}-${month}`;
    const nextTo = compareYearMonth(nextFrom, toMonth) > 0 ? nextFrom : toMonth;
    onChange({ fromMonth: nextFrom, toMonth: nextTo });
  }

  function selectTo(month: string) {
    const nextTo = `${toYear}-${month}`;
    const nextFrom = compareYearMonth(nextTo, fromMonth) < 0 ? nextTo : fromMonth;
    onChange({ fromMonth: nextFrom, toMonth: nextTo });
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button type="button" variant="outline" aria-label={`${fromMonth} - ${toMonth}`}>
          {fromMonth} → {toMonth}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <PopoverContent align="start" sideOffset={8}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div role="group" aria-label={t("finance.fromMonth")} className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.previousYear")}
                  onClick={() => setFromYear((year) => year - 1)}
                >
                  ‹
                </Button>
                <span className="text-sm font-medium text-foreground">{fromYear}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.nextYear")}
                  onClick={() => setFromYear((year) => year + 1)}
                >
                  ›
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTH_NUMBERS.map((month) => (
                  <Button
                    key={month}
                    type="button"
                    variant={`${fromYear}-${month}` === fromMonth ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => selectFrom(month)}
                  >
                    {month}
                  </Button>
                ))}
              </div>
            </div>

            <div role="group" aria-label={t("finance.toMonth")} className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.previousYear")}
                  onClick={() => setToYear((year) => year - 1)}
                >
                  ‹
                </Button>
                <span className="text-sm font-medium text-foreground">{toYear}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("finance.nextYear")}
                  onClick={() => setToYear((year) => year + 1)}
                >
                  ›
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MONTH_NUMBERS.map((month) => (
                  <Button
                    key={month}
                    type="button"
                    variant={`${toYear}-${month}` === toMonth ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => selectTo(month)}
                  >
                    {month}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover.Portal>
    </Popover.Root>
  );
}
