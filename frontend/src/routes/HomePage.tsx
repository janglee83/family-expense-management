import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listMyFamilies, type Family } from "../families/familyApi";
import {
  listCategories,
  listExpenses,
  resolveCategoryDisplayName,
  type Category,
  type Expense,
} from "../expenses/expenseApi";
import { formatMoney, formatMoneyCompact } from "../utils/currency";
import { PageFrame, PageHeader, EmptyState, LoadingState } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
import { DropdownContent, DropdownMenu, Popover, PopoverContent } from "../components/ui/primitives";
import { MonthPicker, type MonthPickerValue } from "../components/ui/MonthPicker";
import { buttonClassName } from "../components/ui/buttonClassName";
import { getCashFlowSummary, getNetWorth, type CashFlowSummary, type NetWorth } from "../finance/financeApi";

function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonth(monthValue: string, fallback: Date): { year: number; monthIndex: number } {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { year: fallback.getFullYear(), monthIndex: fallback.getMonth() };
  }

  return { year, monthIndex: month - 1 };
}

function toMonthStart(monthValue: string, fallback: Date): Date {
  const { year, monthIndex } = parseYearMonth(monthValue, fallback);
  return new Date(year, monthIndex, 1);
}

function toMonthEnd(monthValue: string, fallback: Date): Date {
  const { year, monthIndex } = parseYearMonth(monthValue, fallback);
  return new Date(year, monthIndex + 1, 0);
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDayLabel(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function buildMonthKeysInRange(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= last) {
    keys.push(toMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return keys;
}

function buildDaysInRange(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function isDateWithinRange(dateText: string, startDate: Date, endDate: Date): boolean {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date >= startDate && date <= endDate;
}

function formatRate(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "0%";
  }
  return `${Math.round(ratio * 100)}%`;
}

function toPercent(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }
  if (ratio >= 1) {
    return 100;
  }
  return Math.round(ratio * 100);
}

function shiftYearMonth(monthValue: string, delta: number): string {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return toYearMonth(new Date());
  }

  const shifted = new Date(year, month - 1 + delta, 1);
  return toYearMonth(shifted);
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "income" | "expense" | "neutral" | "savings" | "info";
}) {
  const toneClassMap = {
    income: "from-success/18 to-transparent text-success",
    expense: "from-destructive/18 to-transparent text-destructive",
    neutral: "from-muted/55 to-transparent text-foreground",
    savings: "from-primary/18 to-transparent text-primary",
    info: "from-info/18 to-transparent text-info",
  } as const;

  return (
    <Card className="enter-fade overflow-hidden">
      <CardHeader className="relative pb-4">
        <div className={`pointer-events-none absolute inset-x-0 top-0 h-12 bg-linear-to-r ${toneClassMap[tone]}`} />
        <CardDescription className="relative">{label}</CardDescription>
        <CardTitle
          className="relative max-w-full break-all font-mono text-[clamp(1.125rem,2.8vw,1.875rem)] leading-tight"
          title={value}
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="type-body-sm">{hint}</p>
      </CardContent>
    </Card>
  );
}

function DashboardHelpTooltip({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/80 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={label}
          title={label}
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,95vw)] space-y-2 p-3">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="type-body-sm text-muted-foreground">{description}</p>
        </PopoverContent>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"overview" | "analysis" | "transactions">("overview");
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [selectedRange, setSelectedRange] = useState<MonthPickerValue>(() => {
    const currentMonth = toYearMonth(new Date());
    return { startMonth: currentMonth, endMonth: currentMonth };
  });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isFamiliesLoading, setIsFamiliesLoading] = useState(true);
  const [isExpensesLoading, setIsExpensesLoading] = useState(false);
  const [netWorthSnapshot, setNetWorthSnapshot] = useState<NetWorth | null>(null);
  const [cashFlowSummary, setCashFlowSummary] = useState<CashFlowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listMyFamilies()
      .then((result) => {
        if (cancelled) return;
        setFamilies(result);
        setSelectedFamilyId((current) => current || result[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("family.actionFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsFamiliesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!selectedFamilyId) {
      setExpenses([]);
      setCategories([]);
      return;
    }

    let cancelled = false;
    setIsExpensesLoading(true);

    Promise.all([listExpenses(selectedFamilyId), listCategories(selectedFamilyId)])
      .then(([expenseResult, categoryResult]) => {
        if (cancelled) return;
        setExpenses(expenseResult);
        setCategories(categoryResult);
      })
      .catch(() => {
        if (!cancelled) {
          setExpenses([]);
          setCategories([]);
          setError(t("expense.actionFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsExpensesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFamilyId, t]);

  useEffect(() => {
    if (families.length === 0) {
      return;
    }

    if (!families.some((family) => family.id === selectedFamilyId)) {
      setSelectedFamilyId(families[0].id);
    }
  }, [families, selectedFamilyId]);

  const fallbackDate = useMemo(() => new Date(), []);
  const rangeContext = useMemo(() => {
    const rawStart = toMonthStart(selectedRange.startMonth, fallbackDate);
    const rawEnd = toMonthEnd(selectedRange.endMonth, fallbackDate);
    const startDate =
      rawStart <= rawEnd ? rawStart : toMonthStart(selectedRange.endMonth, fallbackDate);
    const endDate =
      rawStart <= rawEnd ? rawEnd : toMonthEnd(selectedRange.startMonth, fallbackDate);
    const startMonth = toYearMonth(startDate);
    const endMonth = toYearMonth(endDate);

    return {
      startDate,
      endDate,
      startMonth,
      endMonth,
      monthKeys: buildMonthKeysInRange(startDate, endDate),
    };
  }, [fallbackDate, selectedRange.endMonth, selectedRange.startMonth]);

  useEffect(() => {
    if (!selectedFamilyId) {
      setNetWorthSnapshot(null);
      setCashFlowSummary(null);
      return;
    }

    let cancelled = false;
    const startDate = toDateKey(rangeContext.startDate);
    const endDate = toDateKey(rangeContext.endDate);

    Promise.all([
      getNetWorth(selectedFamilyId, { startDate, endDate }),
      getCashFlowSummary(selectedFamilyId, { startDate, endDate }),
    ])
      .then(([netWorthResult, cashFlowResult]) => {
        if (cancelled) {
          return;
        }
        setNetWorthSnapshot(netWorthResult);
        setCashFlowSummary(cashFlowResult);
      })
      .catch(() => {
        if (!cancelled) {
          setNetWorthSnapshot(null);
          setCashFlowSummary(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rangeContext, selectedFamilyId]);

  const selectedPeriodExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => isDateWithinRange(expense.expense_date, rangeContext.startDate, rangeContext.endDate))
        .sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
    [expenses, rangeContext],
  );

  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, number>(rangeContext.monthKeys.map((monthKey) => [monthKey, 0]));

    for (const expense of selectedPeriodExpenses) {
      const expenseDate = new Date(`${expense.expense_date}T00:00:00`);
      if (Number.isNaN(expenseDate.getTime())) {
        continue;
      }
      const expenseMonthKey = toMonthKey(expenseDate);
      if (!totals.has(expenseMonthKey)) {
        continue;
      }
      totals.set(expenseMonthKey, (totals.get(expenseMonthKey) ?? 0) + expense.amount);
    }

    return rangeContext.monthKeys.map((monthKey) => ({
      key: monthKey,
      label: monthKey.slice(2).replace("-", "/"),
      total: totals.get(monthKey) ?? 0,
    }));
  }, [rangeContext, selectedPeriodExpenses]);

  const selectedPeriodTotalFromExpenses = monthlyTotals.reduce((sum, item) => sum + item.total, 0);
  const selectedPeriodTotal = cashFlowSummary?.expense_total ?? selectedPeriodTotalFromExpenses;
  const averageMonthly = Math.round(selectedPeriodTotal / Math.max(rangeContext.monthKeys.length, 1));
  const monthlyChartData = monthlyTotals.map((item) => ({ month: item.label, total: item.total }));

  const categoryLookup = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, resolveCategoryDisplayName(category, t)])),
    [categories, t],
  );

  const topCategoriesThisMonth = useMemo(() => {
    const totals = new Map<string, number>();

    for (const expense of selectedPeriodExpenses) {
      const name = categoryLookup[expense.category_id] ?? expense.category_id;
      totals.set(name, (totals.get(name) ?? 0) + expense.amount);
    }

    return Array.from(totals.entries())
      .map(([name, total]) => ({
        name,
        total,
        share: selectedPeriodTotal > 0 ? total / selectedPeriodTotal : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [categoryLookup, selectedPeriodExpenses, selectedPeriodTotal]);

  const dailyCumulativeData = useMemo(() => {
    const totalsByDate = new Map<string, number>();
    for (const expense of selectedPeriodExpenses) {
      totalsByDate.set(expense.expense_date, (totalsByDate.get(expense.expense_date) ?? 0) + expense.amount);
    }

    const points = buildDaysInRange(rangeContext.startDate, rangeContext.endDate);
    return points.reduce<Array<{ day: string; cumulative: number }>>((rows, date) => {
      const key = toDateKey(date);
      const previous = rows.length > 0 ? rows[rows.length - 1].cumulative : 0;
      const next = previous + (totalsByDate.get(key) ?? 0);
      return [
        ...rows,
        {
        day: toDayLabel(date),
          cumulative: next,
        },
      ];
    }, []);
  }, [rangeContext, selectedPeriodExpenses]);

  const recentExpenses = selectedPeriodExpenses.slice(0, 8);

  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? null;
  const selectedCurrency = selectedFamily?.currency_code ?? "jpy";

  const monthlyIncomeTarget =
    selectedFamily?.monthly_income_enabled
      ? (selectedFamily.monthly_income ?? 0) * Math.max(rangeContext.monthKeys.length, 1)
      : 0;
  const savingsGoal = (selectedFamily?.savings_goal_amount ?? 0) * Math.max(rangeContext.monthKeys.length, 1);
  const remainingBalance = monthlyIncomeTarget - selectedPeriodTotal;
  const personalTotal = selectedPeriodExpenses
    .filter((expense) => !expense.is_shared)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const sharedTotal = selectedPeriodExpenses
    .filter((expense) => expense.is_shared)
    .reduce((sum, expense) => sum + expense.amount, 0);

  const spendToIncomeRatio =
    monthlyIncomeTarget > 0 ? selectedPeriodTotal / monthlyIncomeTarget : 0;
  const savingsProgressRatio =
    savingsGoal > 0 ? Math.max(remainingBalance, 0) / savingsGoal : 0;

  const peakMonth = monthlyTotals.reduce(
    (highest, item) => (item.total > highest.total ? item : highest),
    {
      key: rangeContext.monthKeys[0] ?? rangeContext.startMonth,
      label: (rangeContext.monthKeys[0] ?? rangeContext.startMonth).slice(2).replace("-", "/"),
      total: 0,
    },
  );

  const selectedMonthLabel = rangeContext.startMonth;

  const spendMixData = [
    {
      name: t("dashboard.sharedSpend"),
      value: sharedTotal,
      color: "oklch(0.68 0.11 195)",
    },
    {
      name: t("dashboard.personalSpend"),
      value: personalTotal,
      color: "oklch(0.68 0.17 8)",
    },
  ].filter((entry) => entry.value > 0);

  const goalStatusLabel =
    monthlyIncomeTarget <= 0
      ? t("dashboard.incomeNotConfigured")
      : remainingBalance >= 0
        ? t("dashboard.onTrack")
        : t("dashboard.overBudget");

  const previousMonthKey = shiftYearMonth(rangeContext.startMonth, -1);
  const previousMonthTotal = expenses
    .filter((expense) => expense.expense_date.startsWith(`${previousMonthKey}-`))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const discretionaryLeft = monthlyIncomeTarget - savingsGoal - selectedPeriodTotal;
  const netWorthHint = netWorthSnapshot
    ? `${t("finance.netWorthChange")}: ${formatMoney(netWorthSnapshot.change_amount, selectedCurrency)}`
    : t("finance.netWorthUnavailable");
  const insightMessages: string[] = [];

  if (previousMonthTotal > 0) {
    if (selectedPeriodTotal > previousMonthTotal) {
      const increaseRatio = ((selectedPeriodTotal - previousMonthTotal) / previousMonthTotal) * 100;
      insightMessages.push(
        t("dashboard.insightHigherThanLastMonth", {
          percent: Math.round(increaseRatio),
        }),
      );
    } else {
      insightMessages.push(
        t("dashboard.insightLowerThanLastMonth", {
          amount: formatMoney(previousMonthTotal - selectedPeriodTotal, selectedCurrency),
        }),
      );
    }
  }

  if (topCategoriesThisMonth[0]) {
    insightMessages.push(
      t("dashboard.insightTopCategory", {
        category: topCategoriesThisMonth[0].name,
        amount: formatMoney(topCategoriesThisMonth[0].total, selectedCurrency),
      }),
    );
  }

  if (monthlyIncomeTarget > 0) {
    insightMessages.push(
      t("dashboard.insightDiscretionaryLeft", {
        amount: formatMoney(Math.max(discretionaryLeft, 0), selectedCurrency),
      }),
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader
          title={t("dashboard.title")}
          description={t("dashboard.description")}
          actions={
            families.length > 0 ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className={buttonClassName({
                        variant: "outline",
                        className: "h-12 w-full justify-between rounded-lg px-3 sm:min-w-56 sm:w-auto",
                      })}
                      data-tour="dashboard-family-selector"
                      aria-label={t("dashboard.family")}
                      title={t("dashboard.family")}
                    >
                      <span className="whitespace-nowrap text-muted-foreground">{t("dashboard.family")}</span>
                      <span className="max-w-32 truncate text-foreground sm:max-w-40">{selectedFamily?.name ?? ""}</span>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownContent align="end" sideOffset={8} className="min-w-56" aria-label={t("dashboard.family")}>
                      <DropdownMenu.RadioGroup value={selectedFamilyId} onValueChange={setSelectedFamilyId}>
                        {families.map((family) => (
                          <DropdownMenu.RadioItem
                            key={family.id}
                            value={family.id}
                            className="relative w-full cursor-pointer rounded-md px-3 py-2 pr-8 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus:bg-muted data-[state=checked]:bg-muted data-[state=checked]:font-medium data-[state=checked]:text-foreground"
                          >
                            {family.name}
                            <DropdownMenu.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground">
                              ✓
                            </DropdownMenu.ItemIndicator>
                          </DropdownMenu.RadioItem>
                        ))}
                      </DropdownMenu.RadioGroup>
                    </DropdownContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <MonthPicker
                  value={{
                    startMonth: rangeContext.startMonth,
                    endMonth: rangeContext.endMonth,
                  }}
                  onChange={setSelectedRange}
                  triggerTourId="dashboard-period"
                  className="w-full sm:w-auto"
                />
              </div>
            ) : undefined
          }
        />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        {isFamiliesLoading ? <LoadingState label={t("common.loading")} /> : null}

        {!isFamiliesLoading && families.length === 0 ? (
          <EmptyState
            title={t("family.noFamilies")}
            description={t("dashboard.description")}
            action={<Link to="/families/new">{t("family.create")}</Link>}
          />
        ) : null}

        {!isFamiliesLoading && families.length > 0 ? (
          <>
            {isExpensesLoading ? <LoadingState label={t("common.loading")} /> : null}
            <section className="surface-card flex flex-wrap items-center gap-2 p-2" role="tablist" aria-label={t("dashboard.viewTabs")}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "overview"}
                data-tour="dashboard-tab-overview"
                onClick={() => setActiveTab("overview")}
                className={buttonClassName({
                  variant: activeTab === "overview" ? "secondary" : "ghost",
                  size: "sm",
                })}
              >
                {t("dashboard.tabOverview")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "analysis"}
                data-tour="dashboard-tab-analysis"
                onClick={() => setActiveTab("analysis")}
                className={buttonClassName({
                  variant: activeTab === "analysis" ? "secondary" : "ghost",
                  size: "sm",
                })}
              >
                {t("dashboard.tabAnalysis")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "transactions"}
                data-tour="dashboard-tab-transactions"
                onClick={() => setActiveTab("transactions")}
                className={buttonClassName({
                  variant: activeTab === "transactions" ? "secondary" : "ghost",
                  size: "sm",
                })}
              >
                {t("dashboard.tabTransactions")}
              </button>
            </section>

            {activeTab === "overview" ? (
              <>
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" data-tour="dashboard-kpis">
                  <MetricCard
                    label={t("dashboard.incomeTarget")}
                    value={formatMoney(monthlyIncomeTarget, selectedCurrency)}
                    hint={t("dashboard.incomeTargetHint")}
                    tone="income"
                  />
                  <MetricCard
                    label={t("dashboard.selectedMonthTotal")}
                    value={formatMoney(selectedPeriodTotal, selectedCurrency)}
                    hint={`${formatRate(spendToIncomeRatio)} ${t("dashboard.spentVsIncome")}`}
                    tone="expense"
                  />
                  <MetricCard
                    label={t("dashboard.remainingBalance")}
                    value={formatMoney(remainingBalance, selectedCurrency)}
                    hint={goalStatusLabel}
                    tone="neutral"
                  />
                  <MetricCard
                    label={t("dashboard.savingsProgress")}
                    value={formatMoney(Math.max(remainingBalance, 0), selectedCurrency)}
                    hint={`${toPercent(savingsProgressRatio)}% ${t("dashboard.savingsGoalHint")}`}
                    tone="savings"
                  />
                  <MetricCard
                    label={t("finance.netWorth")}
                    value={formatMoney(netWorthSnapshot?.current_net_worth ?? 0, selectedCurrency)}
                    hint={netWorthHint}
                    tone="info"
                  />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                  <Card className="enter-fade" data-tour="dashboard-goals">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{t("dashboard.goalTracker")}</CardTitle>
                        <DashboardHelpTooltip
                          label={t("dashboard.chartHelpLabel", { chart: t("dashboard.goalTracker") })}
                          description={t("dashboard.tooltips.goalTracker")}
                        />
                      </div>
                      <CardDescription>{t("dashboard.goalTrackerDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-5">
                        <article className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <p className="font-medium text-foreground">{t("dashboard.selectedMonthTotal")}</p>
                            <p className="font-mono text-foreground">{formatMoney(selectedPeriodTotal, selectedCurrency)}</p>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-destructive/80"
                              style={{ width: `${toPercent(spendToIncomeRatio)}%` }}
                            />
                          </div>
                          <p className="type-body-sm">{formatRate(spendToIncomeRatio)} {t("dashboard.spentVsIncome")}</p>
                        </article>

                        <article className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <p className="font-medium text-foreground">{t("dashboard.savingsGoal")}</p>
                            <p className="font-mono text-foreground">{formatMoney(savingsGoal, selectedCurrency)}</p>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-success/80"
                              style={{ width: `${toPercent(savingsProgressRatio)}%` }}
                            />
                          </div>
                          <p className="type-body-sm">{toPercent(savingsProgressRatio)}% {t("dashboard.savingsGoalHint")}</p>
                        </article>

                        <article className="surface-card space-y-2 p-4">
                          <p className="text-sm font-medium text-foreground">{t("dashboard.remainingBalance")}</p>
                          <p className="font-mono text-2xl text-foreground">{formatMoney(remainingBalance, selectedCurrency)}</p>
                          <p className="type-body-sm">{goalStatusLabel}</p>
                        </article>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="enter-fade" data-tour="dashboard-daily-line">
                    <CardHeader>
                      <CardTitle>{t("dashboard.insightTitle")}</CardTitle>
                      <CardDescription>{t("dashboard.insightDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {insightMessages.length === 0 ? (
                        <p className="type-body-sm text-muted-foreground">{t("dashboard.noInsights")}</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {insightMessages.map((message) => (
                            <li key={message} className="surface-card rounded-md p-3 text-foreground">
                              {message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </section>
              </>
            ) : null}

            {activeTab === "analysis" ? (
              <>
                <section className="grid gap-4 xl:grid-cols-[1.75fr_1.25fr]">
                  <Card className="enter-fade" data-tour="dashboard-trend">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{t("dashboard.monthlyTrend")}</CardTitle>
                        <DashboardHelpTooltip
                          label={t("dashboard.chartHelpLabel", { chart: t("dashboard.monthlyTrend") })}
                          description={t("dashboard.tooltips.monthlyTrend")}
                        />
                      </div>
                      <CardDescription>
                        {selectedFamily?.name ?? t("dashboard.family")} • {selectedMonthLabel}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <Badge variant="info">
                          {t("dashboard.peakMonth", { month: peakMonth.label })}: {formatMoney(peakMonth.total, selectedCurrency)}
                        </Badge>
                        <Badge variant="neutral">
                          {t("dashboard.selectedMonthTotal")}: {formatMoney(selectedPeriodTotal, selectedCurrency)}
                        </Badge>
                        <Badge variant="neutral">
                          {t("dashboard.averageMonthly")}: {formatMoney(averageMonthly, selectedCurrency)}
                        </Badge>
                      </div>
                      <div className="h-72 w-full rounded-md border border-border/70 bg-muted/35 p-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                            <defs>
                              <linearGradient id="dashboardSpendGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="oklch(0.55 0.15 250)" stopOpacity={0.5} />
                                <stop offset="100%" stopColor="oklch(0.55 0.15 250)" stopOpacity={0.04} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" tickLine={false} axisLine={false} minTickGap={20} interval="preserveStartEnd" />
                            <YAxis
                              tickLine={false}
                              axisLine={false}
                              width={44}
                              tickFormatter={(value) =>
                                formatMoneyCompact(Number(value), selectedCurrency)
                              }
                            />
                            <Tooltip
                              formatter={(value) => formatMoney(Number(value), selectedCurrency)}
                            />
                            <Area
                              type="monotone"
                              dataKey="total"
                              stroke="oklch(0.55 0.15 250)"
                              strokeWidth={2}
                              fill="url(#dashboardSpendGradient)"
                              activeDot={{ r: 5 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="enter-fade" data-tour="dashboard-spend-mix">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{t("dashboard.spendMix")}</CardTitle>
                        <DashboardHelpTooltip
                          label={t("dashboard.chartHelpLabel", { chart: t("dashboard.spendMix") })}
                          description={t("dashboard.tooltips.spendMix")}
                        />
                      </div>
                      <CardDescription>{t("dashboard.categoryBreakdown")}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedPeriodTotal === 0 ? (
                        <EmptyState title={t("dashboard.noExpenses")} />
                      ) : (
                        <>
                          <div className="h-56 w-full rounded-md border border-border/70 bg-muted/35 p-2">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={spendMixData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={54}
                                  outerRadius={78}
                                  paddingAngle={2}
                                >
                                  {spendMixData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatMoney(Number(value), selectedCurrency)} />
                                <Legend />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>

                          <ul className="space-y-2">
                            {topCategoriesThisMonth.slice(0, 4).map((category) => (
                              <li key={category.name} className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="truncate font-medium text-foreground">{category.name}</span>
                                  <span className="font-mono text-muted-foreground">
                                    {formatMoney(category.total, selectedCurrency)}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary/75" style={{ width: `${toPercent(category.share)}%` }} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
                  <Card className="enter-fade" data-tour="dashboard-daily-line">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{t("dashboard.dailyAccumulated")}</CardTitle>
                        <DashboardHelpTooltip
                          label={t("dashboard.chartHelpLabel", { chart: t("dashboard.dailyAccumulated") })}
                          description={t("dashboard.tooltips.dailyAccumulated")}
                        />
                      </div>
                      <CardDescription>{t("dashboard.dailySpendHint")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {dailyCumulativeData.every((point) => point.cumulative === 0) ? (
                        <EmptyState title={t("dashboard.noExpenses")} />
                      ) : (
                        <div className="h-72 w-full rounded-md border border-border/70 bg-muted/35 p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyCumulativeData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="day"
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                                interval="preserveStartEnd"
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                width={44}
                                tickFormatter={(value) => formatMoneyCompact(Number(value), selectedCurrency)}
                              />
                              <Tooltip formatter={(value) => formatMoney(Number(value), selectedCurrency)} />
                              <Line
                                type="monotone"
                                dataKey="cumulative"
                                stroke="oklch(0.65 0.16 8)"
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 5 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="enter-fade" data-tour="dashboard-top-categories">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{t("dashboard.topCategories")}</CardTitle>
                        <DashboardHelpTooltip
                          label={t("dashboard.chartHelpLabel", { chart: t("dashboard.topCategories") })}
                          description={t("dashboard.tooltips.topCategories")}
                        />
                      </div>
                      <CardDescription>{t("dashboard.categoryShare")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {topCategoriesThisMonth.length === 0 ? (
                        <EmptyState title={t("dashboard.noCategoryData")} />
                      ) : (
                        <div className="h-72 w-full rounded-md border border-border/70 bg-muted/35 p-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCategoriesThisMonth.slice(0, 6)} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis
                                type="number"
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => formatMoneyCompact(Number(value), selectedCurrency)}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                width={96}
                              />
                              <Tooltip formatter={(value) => formatMoney(Number(value), selectedCurrency)} />
                              <Bar dataKey="total" fill="oklch(0.58 0.14 248)" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              </>
            ) : null}

            {activeTab === "transactions" ? (
              <section>
                <Card className="enter-fade" data-state="recent-expenses" data-tour="dashboard-ledger">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle>{t("dashboard.transactionLedger")}</CardTitle>
                      <DashboardHelpTooltip
                        label={t("dashboard.chartHelpLabel", { chart: t("dashboard.transactionLedger") })}
                        description={t("dashboard.tooltips.transactionLedger")}
                      />
                    </div>
                    <CardDescription>{t("dashboard.recentExpensesDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {recentExpenses.length === 0 ? (
                      <EmptyState title={t("dashboard.noExpenses")} />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-2 py-2">{t("expense.date")}</th>
                              <th className="px-2 py-2">{t("expense.category")}</th>
                              <th className="px-2 py-2">{t("dashboard.type")}</th>
                              <th className="px-2 py-2">{t("expense.description")}</th>
                              <th className="px-2 py-2 text-right">{t("expense.amount")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentExpenses.map((expense) => (
                              <tr key={expense.id} className="border-b border-border/50 last:border-b-0">
                                <td className="px-2 py-2 text-muted-foreground">{expense.expense_date}</td>
                                <td className="px-2 py-2 font-medium text-foreground">
                                  {categoryLookup[expense.category_id] ?? expense.category_id}
                                </td>
                                <td className="px-2 py-2">
                                  <Badge variant={expense.is_shared ? "info" : "warning"}>
                                    {expense.is_shared ? t("expense.shared") : t("expense.personal")}
                                  </Badge>
                                </td>
                                <td className="px-2 py-2 text-muted-foreground">
                                  {expense.description || t("dashboard.noDescription")}
                                </td>
                                <td className="px-2 py-2 text-right font-mono font-semibold text-foreground">
                                  {formatMoney(expense.amount, selectedCurrency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </PageFrame>
  );
}
