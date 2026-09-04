import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RegisterForm } from "../auth/RegisterForm";
import { AuthFrame } from "../components/ui/Page";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function RegisterPage() {
  const { t } = useTranslation();

  return (
    <AuthFrame
      title={t("auth.register")}
      subtitle={t("app.title")}
      actions={<LanguageSwitcher />}
    >
      <RegisterForm />
      <section className="space-y-3 rounded-md border border-border/80 bg-muted/35 p-4">
        <p className="type-body-sm">{t("app.title")}</p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary no-underline transition-colors hover:text-primary/80"
        >
          {t("auth.login")}
          <span aria-hidden="true">&gt;</span>
        </Link>
      </section>
    </AuthFrame>
  );
}
