import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../api/client";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useAuth } from "../auth/useAuth";

type PingStatus = "loading" | "success" | "failure";

export function HomePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<PingStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    apiClient
      .GET("/api/v1/ping")
      .then(({ data, error }) => {
        if (cancelled) return;
        setStatus(data && !error ? "success" : "failure");
      })
      .catch(() => {
        if (!cancelled) setStatus("failure");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <LanguageSwitcher />
      <p>
        {status === "loading" && t("common.loading")}
        {status === "success" && t("ping.success")}
        {status === "failure" && t("ping.failure")}
      </p>
      {user && (
        <p>
          {user.display_name} ·{" "}
          <button onClick={() => void logout()}>{t("auth.logout")}</button>
        </p>
      )}
    </main>
  );
}
