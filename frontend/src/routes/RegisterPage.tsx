import { useTranslation } from "react-i18next";
import { RegisterForm } from "../auth/RegisterForm";

export function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.register")}</h1>
      <RegisterForm />
    </main>
  );
}
