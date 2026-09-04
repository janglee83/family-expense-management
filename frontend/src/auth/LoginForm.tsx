import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { translateApiError } from "../api/errorI18n";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

export function LoginForm() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = "login-email";
  const passwordId = "login-password";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(translateApiError(t, err, "auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enter-fade space-y-5" data-tour="auth-login-form">
      <fieldset className="space-y-4">
        <legend className="sr-only">{t("auth.login")}</legend>

        <Field label={t("auth.email")} htmlFor={emailId} required>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>

        <Field label={t("auth.password")} htmlFor={passwordId} required>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
      </fieldset>

      <Button
        type="submit"
        className="w-full"
        loading={isSubmitting}
        loadingLabel={t("common.loading")}
      >
        {t("auth.loginButton")}
      </Button>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}
