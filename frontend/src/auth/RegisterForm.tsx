import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { translateApiError } from "../api/errorI18n";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayNameId = "register-display-name";
  const emailId = "register-email";
  const passwordId = "register-password";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/");
    } catch (err) {
      setError(translateApiError(t, err, "auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enter-fade space-y-5" data-tour="auth-register-form">
      <fieldset className="space-y-4">
        <legend className="sr-only">{t("auth.register")}</legend>

        <Field label={t("auth.displayName")} htmlFor={displayNameId} required>
          <input
            id={displayNameId}
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </Field>

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
        {t("auth.registerButton")}
      </Button>

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}
