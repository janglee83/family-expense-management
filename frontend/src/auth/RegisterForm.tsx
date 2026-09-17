import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { translateApiError } from "../api/errorI18n";
import { ApiError } from "../api/errors";
import { isEmailLike } from "../utils/validators";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

const MIN_PASSWORD_LENGTH = 8;

interface RegisterFieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
}

export function RegisterForm() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayNameId = "register-display-name";
  const emailId = "register-email";
  const passwordId = "register-password";

  function validate(): RegisterFieldErrors {
    const errors: RegisterFieldErrors = {};
    if (!displayName.trim()) {
      errors.displayName = t("auth.displayNameRequired");
    }
    if (!email.trim()) {
      errors.email = t("auth.emailRequired");
    } else if (!isEmailLike(email.trim())) {
      errors.email = t("auth.emailInvalid");
    }
    if (!password) {
      errors.password = t("auth.passwordRequired");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = t("auth.passwordTooShort");
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && (err.code === "AUTH_EMAIL_ALREADY_REGISTERED" || err.code === "email_in_use")) {
        setFieldErrors((current) => ({ ...current, email: t("auth.emailInUse") }));
      } else {
        setFormError(translateApiError(t, err, "auth.genericError"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enter-fade space-y-5" data-tour="auth-register-form" noValidate>
      <fieldset className="space-y-4">
        <legend className="sr-only">{t("auth.register")}</legend>

        <Field label={t("auth.displayName")} htmlFor={displayNameId} required error={fieldErrors.displayName}>
          <input
            id={displayNameId}
            type="text"
            required
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setFieldErrors((current) => ({ ...current, displayName: undefined }));
            }}
            aria-invalid={fieldErrors.displayName ? true : undefined}
          />
        </Field>

        <Field label={t("auth.email")} htmlFor={emailId} required error={fieldErrors.email}>
          <input
            id={emailId}
            type="email"
            required
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
            required
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
        {t("auth.registerButton")}
      </Button>

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
