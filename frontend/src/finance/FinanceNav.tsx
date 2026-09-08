import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { buttonClassName } from "../components/ui/buttonClassName";

type FinanceSection = "accounts" | "goals" | "subscriptions" | "splits" | "data";

const SECTION_DEFS: Array<{ key: FinanceSection; labelKey: string; to: (familyId: string) => string }> = [
  { key: "accounts", labelKey: "finance.accountsLedger", to: (familyId) => `/families/${familyId}/finance/accounts` },
  { key: "goals", labelKey: "finance.goals", to: (familyId) => `/families/${familyId}/finance/goals` },
  { key: "subscriptions", labelKey: "finance.subscriptions", to: (familyId) => `/families/${familyId}/finance/subscriptions` },
  { key: "splits", labelKey: "finance.splitExpenses", to: (familyId) => `/families/${familyId}/finance/splits` },
  { key: "data", labelKey: "finance.dataOps", to: (familyId) => `/families/${familyId}/finance/data` },
];

export function FinanceNav({ familyId, current }: { familyId: string; current: FinanceSection }) {
  const { t } = useTranslation();

  return (
    <nav className="surface-card flex flex-wrap gap-2 p-2" aria-label={t("finance.sections")}>
      {SECTION_DEFS.map((section) => (
        <Link
          key={section.key}
          to={section.to(familyId)}
          className={buttonClassName({
            variant: current === section.key ? "secondary" : "ghost",
            size: "sm",
            className: "no-underline",
          })}
          aria-current={current === section.key ? "page" : undefined}
        >
          {t(section.labelKey)}
        </Link>
      ))}

      <Link
        to={`/families/${familyId}`}
        className={buttonClassName({
          variant: "outline",
          size: "sm",
          className: "no-underline sm:ml-auto",
        })}
      >
        {t("finance.backToFamily")}
      </Link>
    </nav>
  );
}
