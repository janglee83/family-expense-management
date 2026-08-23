import { useTranslation } from "react-i18next";

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.login")}</h1>
    </main>
  );
}
