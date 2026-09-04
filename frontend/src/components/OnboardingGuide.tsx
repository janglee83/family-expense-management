import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Joyride, STATUS, type EventData, type Step } from "react-joyride";
import { useLocation } from "react-router-dom";
import { Button } from "./ui/Button";
import { hasSeenOnboarding, markOnboardingSeen } from "../onboarding/state";

export function OnboardingGuide({ forcePrompt = false }: { forcePrompt?: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [isRunning, setIsRunning] = useState(false);
  const [tourNonce, setTourNonce] = useState(0);

  const appWideSteps = useMemo<Step[]>(
    () => [
      {
        target: '[data-tour="nav-home"]',
        title: t("onboarding.title"),
        content: t("onboarding.stepNavHome"),
        placement: "right",
        disableBeacon: true,
      },
      {
        target: '[data-tour="nav-families"]',
        content: t("onboarding.stepNavFamilies"),
        placement: "right",
      },
      {
        target: '[data-tour="nav-create-family"]',
        content: t("onboarding.stepNavCreateFamily"),
        placement: "right",
      },
      {
        target: '[data-tour="header-language"]',
        content: t("onboarding.stepHeaderLanguage"),
        placement: "bottom",
      },
      {
        target: '[data-tour="header-notifications"]',
        content: t("onboarding.stepHeaderNotifications"),
        placement: "bottom",
      },
      {
        target: '[data-tour="header-onboarding"]',
        content: t("onboarding.stepHeaderGuide"),
        placement: "bottom",
      },
    ],
    [t],
  );

  const routeSteps = useMemo<Step[]>(() => {
    if (location.pathname === "/") {
      return [
        {
          target: '[data-tour="dashboard-family-selector"]',
          content: t("onboarding.stepDashboardFamilySelector"),
          placement: "bottom",
        },
        {
          target: '[data-tour="dashboard-period"]',
          content: t("onboarding.stepDashboardMonthPicker"),
          placement: "bottom",
        },
        {
          target: '[data-tour="dashboard-tab-overview"]',
          content: t("onboarding.stepDashboardTabOverview"),
          placement: "bottom",
        },
        {
          target: '[data-tour="dashboard-kpis"]',
          content: t("onboarding.stepDashboardKpis"),
          placement: "top",
        },
        {
          target: '[data-tour="dashboard-tab-analysis"]',
          content: t("onboarding.stepDashboardTabAnalysis"),
          placement: "bottom",
        },
        {
          target: '[data-tour="dashboard-tab-transactions"]',
          content: t("onboarding.stepDashboardTabTransactions"),
          placement: "bottom",
        },
      ];
    }

    if (location.pathname === "/families") {
      return [
        {
          target: '[data-tour="family-create-action"]',
          content: t("onboarding.stepFamilyListCreate"),
          placement: "bottom",
        },
        {
          target: '[data-tour="family-list-panel"]',
          content: t("onboarding.stepFamilyListPanel"),
          placement: "top",
        },
      ];
    }

    if (location.pathname === "/families/new") {
      return [
        {
          target: '[data-tour="family-create-page"]',
          content: t("onboarding.stepFamilyCreatePage"),
          placement: "top",
        },
        {
          target: '[data-tour="family-create-form-card"]',
          content: t("onboarding.stepFamilyCreateForm"),
          placement: "top",
        },
      ];
    }

    if (/^\/families\/[^/]+$/.test(location.pathname)) {
      return [
        {
          target: '[data-tour="family-detail-actions"]',
          content: t("onboarding.stepFamilyDetailActions"),
          placement: "bottom",
        },
        {
          target: '[data-tour="family-members-card"]',
          content: t("onboarding.stepFamilyMembers"),
          placement: "top",
        },
        {
          target: '[data-tour="family-rename-card"]',
          content: t("onboarding.stepFamilySettings"),
          placement: "top",
        },
      ];
    }

    if (/^\/families\/[^/]+\/expenses$/.test(location.pathname)) {
      return [
        {
          target: '[data-tour="expense-create-action"]',
          content: t("onboarding.stepExpenseCreateAction"),
          placement: "bottom",
        },
        {
          target: '[data-tour="expense-list-card"]',
          content: t("onboarding.stepExpenseList"),
          placement: "top",
        },
        {
          target: '[data-tour="expense-categories-card"]',
          content: t("onboarding.stepExpenseCategories"),
          placement: "top",
        },
      ];
    }

    if (/^\/families\/[^/]+\/receipts$/.test(location.pathname)) {
      return [
        {
          target: '[data-tour="receipt-upload-card"]',
          content: t("onboarding.stepReceiptUpload"),
          placement: "top",
        },
        {
          target: '[data-tour="receipt-list-card"]',
          content: t("onboarding.stepReceiptList"),
          placement: "top",
        },
      ];
    }

    return [];
  }, [location.pathname, t]);

  const steps = useMemo<Step[]>(
    () => [...appWideSteps, ...routeSteps],
    [appWideSteps, routeSteps],
  );

  function startGuide() {
    if (steps.length === 0) {
      return;
    }
    setTourNonce((value) => value + 1);
    setIsRunning(true);
  }

  useEffect(() => {
    if (forcePrompt) {
      return;
    }
    if (hasSeenOnboarding()) {
      return;
    }
    if (steps.length === 0) {
      return;
    }
    setTourNonce((value) => value + 1);
    setIsRunning(true);
    markOnboardingSeen();
  }, [forcePrompt, steps.length]);

  function handleTourEvent(data: EventData) {
    const status = data.status;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setIsRunning(false);
      markOnboardingSeen();
    }
  }

  return (
    <>
      <Joyride
        key={tourNonce}
        run={isRunning}
        continuous
        onEvent={handleTourEvent}
        steps={steps}
        options={{
          buttons: ["back", "skip", "primary"],
          showProgress: true,
          skipScroll: true,
          spotlightPadding: 10,
          zIndex: 90,
          overlayColor: "rgba(15, 23, 42, 0.45)",
          primaryColor: "#3b82f6",
          textColor: "#102a43",
          backgroundColor: "#ffffff",
        }}
        locale={{
          back: t("onboarding.back"),
          close: t("common.close"),
          last: t("onboarding.finish"),
          next: t("onboarding.next"),
          skip: t("onboarding.skip"),
        }}
      />

      {forcePrompt ? (
        <div className="surface-card space-y-1 border border-info/35 bg-info/10 p-3" role="status">
          <p className="text-sm font-medium text-foreground">{t("onboarding.title")}</p>
          <p className="text-xs text-muted-foreground">{t("onboarding.description")}</p>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={startGuide}
        className="h-10 w-10 p-0"
        data-tour="header-onboarding"
        aria-label={t("onboarding.openGuide")}
        title={t("onboarding.openGuide")}
      >
        <span aria-hidden="true" className="text-base">
          📘
        </span>
      </Button>
    </>
  );
}
