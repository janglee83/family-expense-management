import { useTranslation } from "react-i18next";
import { LoginForm } from "../auth/LoginForm";

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.login")}</h1>
      <LoginForm />
    </main>
  );
}
