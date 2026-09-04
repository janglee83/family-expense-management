import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LoginForm } from "../auth/LoginForm";
import { AuthFrame } from "../components/ui/Page";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <AuthFrame title={t("auth.login")} subtitle={t("app.title")} actions={<LanguageSwitcher />}>
      <LoginForm />
      <section className="space-y-3 rounded-md border border-border/80 bg-muted/35 p-4">
        <p className="type-body-sm">{t("app.title")}</p>
        <Link
          to="/register"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary no-underline transition-colors hover:text-primary/80"
        >
          {t("auth.register")}
          <span aria-hidden="true">&gt;</span>
        </Link>
      </section>
    </AuthFrame>
  );
}
