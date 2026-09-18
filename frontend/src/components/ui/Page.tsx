import { Dialog, DialogContent, DialogOverlay } from "./primitives";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { NotificationCenter } from "../NotificationCenter";
import { OnboardingGuide } from "../OnboardingGuide";
import { ThemeToggle } from "../ThemeToggle";
import { buttonClassName } from "./buttonClassName";

function SidebarLink({
  to,
  label,
  isActive,
  tourId,
  onClick,
}: {
  to: string;
  label: string;
  isActive: boolean;
  tourId?: string;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      data-tour={tourId}
      onClick={onClick}
      className={buttonClassName({
        variant: isActive ? "secondary" : "ghost",
        className: "w-full justify-start no-underline",
      })}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </NavLink>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const pathname = location.pathname;
  const isHomeRoute = pathname === "/";
  const isCreateFamilyRoute = pathname === "/families/new";
  const isTripDetailRoute = pathname.startsWith("/families/") && pathname.includes("/trips/");
  const isTripsRoute = pathname === "/trips" || isTripDetailRoute;
  const isFamiliesRoute =
    pathname === "/families" ||
    (pathname.startsWith("/families/") && !isCreateFamilyRoute && !isTripDetailRoute);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setIsMobileNavOpen(false);
    await logout();
  }

  return (
    <div className="isolate min-h-screen bg-background text-foreground">
      <Dialog.Root open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <Dialog.Portal>
            <DialogOverlay className="z-70 lg:hidden" />
            <DialogContent
            id="mobile-navigation-panel"
            aria-label={t("nav.sidebarLabel")}
              className="inset-y-0 left-0 z-70 h-full w-[min(18rem,86vw)] translate-x-0 translate-y-0 space-y-4 p-4 lg:hidden"
          >
            <Dialog.Title className="sr-only">{t("nav.sidebarLabel")}</Dialog.Title>

            <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-4">
              <Link
                to="/"
                className="type-h3 block no-underline text-foreground hover:text-primary"
                onClick={() => setIsMobileNavOpen(false)}
              >
                {t("app.title")}
              </Link>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={buttonClassName({ variant: "outline", size: "sm", className: "h-8 px-2" })}
                >
                  {t("common.close")}
                </button>
              </Dialog.Close>
            </div>

            {user ? <p className="type-body-sm truncate">{user.display_name}</p> : null}

            <nav className="space-y-2" aria-label={t("nav.sidebarLabel")}>
              <SidebarLink
                to="/"
                label={t("nav.home")}
                isActive={isHomeRoute}
                tourId="nav-home"
                onClick={() => setIsMobileNavOpen(false)}
              />
              <SidebarLink
                to="/families"
                label={t("nav.families")}
                isActive={isFamiliesRoute}
                tourId="nav-families"
                onClick={() => setIsMobileNavOpen(false)}
              />
              <SidebarLink
                to="/trips"
                label={t("nav.trips")}
                isActive={isTripsRoute}
                tourId="nav-trips"
                onClick={() => setIsMobileNavOpen(false)}
              />
              <SidebarLink
                to="/families/new"
                label={t("nav.createFamily")}
                isActive={isCreateFamilyRoute}
                tourId="nav-create-family"
                onClick={() => setIsMobileNavOpen(false)}
              />
            </nav>

            {user ? (
              <div className="border-t border-border/80 pt-2">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className={buttonClassName({ variant: "outline", className: "w-full justify-start" })}
                >
                  {t("auth.logout")}
                </button>
              </div>
            ) : null}
            </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
        <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-8">
          <aside className="surface-card hidden h-fit space-y-4 p-4 lg:sticky lg:top-8 lg:block" aria-label={t("nav.sidebarLabel")}>
            <div className="space-y-1 border-b border-border/80 pb-4">
              <Link to="/" className="type-h3 block no-underline text-foreground hover:text-primary">
                {t("app.title")}
              </Link>
              {user ? <p className="type-body-sm truncate">{user.display_name}</p> : null}
            </div>

            <nav className="space-y-2" aria-label={t("nav.sidebarLabel")}>
              <SidebarLink to="/" label={t("nav.home")} isActive={isHomeRoute} tourId="nav-home" />
              <SidebarLink
                to="/families"
                label={t("nav.families")}
                isActive={isFamiliesRoute}
                tourId="nav-families"
              />
              <SidebarLink to="/trips" label={t("nav.trips")} isActive={isTripsRoute} tourId="nav-trips" />
              <SidebarLink
                to="/families/new"
                label={t("nav.createFamily")}
                isActive={isCreateFamilyRoute}
                tourId="nav-create-family"
              />
            </nav>

            {user ? (
              <div className="border-t border-border/80 pt-2">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className={buttonClassName({ variant: "outline", className: "w-full justify-start" })}
                >
                  {t("auth.logout")}
                </button>
              </div>
            ) : null}
          </aside>

          <div className="min-w-0 space-y-4">
            <header className="surface-card flex items-center justify-end gap-2 p-2">
              <button
                type="button"
                className={buttonClassName({ variant: "outline", size: "sm", className: "h-10 px-3 lg:hidden" })}
                onClick={() => setIsMobileNavOpen(true)}
                aria-label={t("nav.sidebarLabel")}
                title={t("nav.sidebarLabel")}
                aria-expanded={isMobileNavOpen}
                aria-controls="mobile-navigation-panel"
              >
                <span className="sr-only">{t("nav.sidebarLabel")}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <LanguageSwitcher />
              <ThemeToggle />
              <NotificationCenter />
              <OnboardingGuide />
            </header>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-border/90 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="type-h1 wrap-break-word">{title}</h1>
        {description ? <p className="type-body-sm max-w-2xl">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function AuthFrame({
  title,
  subtitle,
  actions,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-10">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-start pt-12 sm:pt-16 md:items-center md:pt-0">
        <section className="surface-elevated enter-rise relative w-full overflow-hidden" data-surface="auth">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-linear-to-r from-primary/18 via-info/12 to-success/16" />
          <div className="relative space-y-3 border-b border-border/90 p-6 pt-7">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h1 className="type-display wrap-break-word">{title}</h1>
              {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
            </div>
            {subtitle ? <p className="type-body-sm">{subtitle}</p> : null}
          </div>
          <div className="relative space-y-5 p-6">{children}</div>
          {footer ? <footer className="border-t border-border p-6 pt-4">{footer}</footer> : null}
        </section>
      </main>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card enter-fade flex flex-col items-start gap-3 p-6" data-state="empty">
      <h2 className="type-h3">{title}</h2>
      {description ? <p className="type-body-sm">{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div
      className="surface-card enter-fade flex min-h-28 items-center justify-center p-6"
      role="status"
      aria-live="polite"
    >
      <p className="type-body-sm">{label}</p>
    </div>
  );
}
