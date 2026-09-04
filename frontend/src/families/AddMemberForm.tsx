import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { addMember, type FamilyMemberInfo } from "./familyApi";
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = `member-email-${familyId}`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const member = await addMember(familyId, email);
      onAdded(member);
      setEmail("");
    } catch (err) {
      setError(translateApiError(t, err, "family.actionFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
      <Field label={t("family.memberEmail")} htmlFor={emailId} required>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={isSubmitting} loadingLabel={t("common.loading")}>
          {t("family.addMember")}
        </Button>
      </div>
      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}
    </form>
  );
}
