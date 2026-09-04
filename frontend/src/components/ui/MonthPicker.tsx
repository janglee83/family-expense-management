import { Popover, PopoverContent } from "./primitives";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { cn } from "./cn";

export interface MonthPickerValue {
  startMonth: string;
  endMonth: string;
}

function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonth(monthValue: string): string {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return toYearMonth(new Date());
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(monthValue: string, delta: number): string {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return toYearMonth(new Date());
  }

  const date = new Date(year, month - 1 + delta, 1);
  return toYearMonth(date);
}

function parseYearMonth(monthValue: string): { year: number; monthIndex: number } {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const today = new Date();
    return { year: today.getFullYear(), monthIndex: today.getMonth() };
  }

  return { year, monthIndex: month - 1 };
}

export function MonthPicker({
  value,
  onChange,
  className,
  triggerTourId,
}: {
  value: MonthPickerValue;
  onChange: (next: MonthPickerValue) => void;
  className?: string;
  triggerTourId?: string;
}) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(() => parseYearMonth(value.startMonth).year);
  const [draftMonthIndex, setDraftMonthIndex] = useState(
    () => parseYearMonth(value.startMonth).monthIndex,
  );

  useEffect(() => {
    if (isOpen) {
      const parsed = parseYearMonth(value.startMonth);
      setDraftYear(parsed.year);
      setDraftMonthIndex(parsed.monthIndex);
    }
  }, [isOpen, value.startMonth]);

  const triggerText = useMemo(() => {
    const parsed = parseYearMonth(value.startMonth);
    return `${String(parsed.monthIndex + 1).padStart(2, "0")}/${parsed.year}`;
  }, [value.startMonth]);

  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        new Intl.DateTimeFormat(i18n.language, { month: "short" }).format(new Date(2026, index, 1)),
      ),
    [i18n.language],
  );

  const currentMonth = toYearMonth(new Date());

  function applyMonth(nextMonth: string) {
    const normalized = normalizeMonth(nextMonth);
    onChange({ startMonth: normalized, endMonth: normalized });
    setIsOpen(false);
  }

  function applyDraftMonth() {
    applyMonth(`${draftYear}-${String(draftMonthIndex + 1).padStart(2, "0")}`);
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-12 min-w-44 justify-between gap-2 rounded-lg px-3", className)}
          data-tour={triggerTourId}
          aria-label={t("dashboard.month")}
        >
          <span className="whitespace-nowrap text-muted-foreground">{t("dashboard.month")}</span>
          <span className="whitespace-nowrap font-mono text-sm text-foreground">{triggerText}</span>
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <PopoverContent
          align="end"
          sideOffset={8}
        >
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraftYear((year) => year - 1)}
              aria-label={`${t("dashboard.month")} - ${draftYear - 1}`}
            >
              -
            </Button>
            <p className="text-base font-semibold text-foreground">{draftYear}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraftYear((year) => year + 1)}
              aria-label={`${t("dashboard.month")} - ${draftYear + 1}`}
            >
              +
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {monthLabels.map((monthLabel, monthIndex) => {
              const isSelected = draftMonthIndex === monthIndex;
              return (
                <Button
                  key={monthLabel}
                  type="button"
                  size="sm"
                  variant={isSelected ? "primary" : "ghost"}
                  onClick={() => setDraftMonthIndex(monthIndex)}
                  className="justify-center"
                >
                  {monthLabel}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const parsed = parseYearMonth(currentMonth);
                setDraftYear(parsed.year);
                setDraftMonthIndex(parsed.monthIndex);
              }}
            >
              {t("dashboard.currentMonth")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const parsed = parseYearMonth(shiftMonth(currentMonth, -1));
                setDraftYear(parsed.year);
                setDraftMonthIndex(parsed.monthIndex);
              }}
            >
              {t("dashboard.previousMonth")}
            </Button>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/80 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const parsed = parseYearMonth(value.startMonth);
                setDraftYear(parsed.year);
                setDraftMonthIndex(parsed.monthIndex);
                setIsOpen(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" onClick={applyDraftMonth}>
              {t("common.confirm")}
            </Button>
          </div>
        </PopoverContent>
      </Popover.Portal>
    </Popover.Root>
  );
}
