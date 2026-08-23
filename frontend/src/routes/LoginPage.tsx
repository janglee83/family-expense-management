import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LoginForm } from "../auth/LoginForm";

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.login")}</h1>
      <LoginForm />
      <p>
        <Link to="/register">{t("auth.register")}</Link>
      </p>
    </main>
  );
}
