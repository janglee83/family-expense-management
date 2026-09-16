import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { translateApiError } from "../api/errorI18n";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = "login-email";
  const passwordId = "login-password";

  function validate(): LoginFieldErrors {
    const errors: LoginFieldErrors = {};
    if (!email.trim()) {
      errors.email = t("auth.emailRequired");
    }
    if (!password) {
      errors.password = t("auth.passwordRequired");
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setFormError(translateApiError(t, err, "auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enter-fade space-y-5" data-tour="auth-login-form" noValidate>
      <fieldset className="space-y-4">
        <legend className="sr-only">{t("auth.login")}</legend>

        <Field label={t("auth.email")} htmlFor={emailId} required error={fieldErrors.email}>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            aria-invalid={fieldErrors.email ? true : undefined}
          />
        </Field>

        <Field label={t("auth.password")} htmlFor={passwordId} required error={fieldErrors.password}>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            aria-invalid={fieldErrors.password ? true : undefined}
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

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
