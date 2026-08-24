import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { addMember, type FamilyMemberInfo } from "./familyApi";

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const member = await addMember(familyId, email);
      onAdded(member);
      setEmail("");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "member_not_found"
          ? t("family.memberNotFound")
          : err instanceof Error && err.message === "member_already_exists"
            ? t("family.memberAlreadyExists")
            : t("family.actionFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("family.memberEmail")}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {t("family.addMember")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
