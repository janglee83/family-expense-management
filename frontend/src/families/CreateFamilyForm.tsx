import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { createFamily, type Family } from "./familyApi";

export function CreateFamilyForm({ onCreated }: { onCreated: (family: Family) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const family = await createFamily(name);
      onCreated(family);
      setName("");
    } catch {
      setError(t("family.actionFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("family.name")}
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {t("family.create")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
