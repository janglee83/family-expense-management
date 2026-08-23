import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RegisterForm } from "../auth/RegisterForm";

export function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.register")}</h1>
      <RegisterForm />
      <p>
        <Link to="/login">{t("auth.login")}</Link>
      </p>
    </main>
  );
}
