import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { isEmailLike } from "../utils/validators";
import { type FamilyMemberInfo } from "./familyApi";
import { useAddMember } from "./familyQueries";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

export function AddMemberForm({
  familyId,
  onAdded,
}: {
  familyId: string;
  onAdded: (member: FamilyMemberInfo) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const addMemberMutation = useAddMember(familyId);
  const emailId = `member-email-${familyId}`;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(t("family.memberEmailRequired"));
      setFormError(null);
      return;
    }
    if (!isEmailLike(trimmed)) {
      setEmailError(t("family.invalidMemberEmail"));
      setFormError(null);
      return;
    }

    setEmailError(null);
    setFormError(null);
    addMemberMutation.mutate(trimmed, {
      onSuccess: (member) => {
        onAdded(member);
        setEmail("");
      },
      onError: (err) => {
        setFormError(translateApiError(t, err, "family.actionFailed"));
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4"
      noValidate
    >
      <Field label={t("family.memberEmail")} htmlFor={emailId} required error={emailError}>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(null);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={addMemberMutation.isPending} loadingLabel={t("common.loading")}>
          {t("family.addMember")}
        </Button>
      </div>
      {formError && (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      )}
    </form>
  );
}
