import { DropdownContent, DropdownMenu } from "./ui/primitives";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/i18n";
import { Button } from "./ui/Button";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  ja: "日本語",
  vi: "Tiếng Việt",
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const activeLanguage = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("common.language")}
          title={t("common.language")}
          className="h-10 w-10 p-0"
          data-field="language"
          data-tour="header-language"
        >
          <span aria-hidden="true" className="text-base">
            🌐
          </span>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownContent
          align="end"
          sideOffset={8}
          className="min-w-44"
          aria-label={t("common.language")}
        >
          <DropdownMenu.RadioGroup
            value={activeLanguage}
            onValueChange={(lang) => {
              void i18n.changeLanguage(lang as SupportedLanguage);
            }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <DropdownMenu.RadioItem
                key={lang}
                value={lang}
                className="relative w-full cursor-pointer rounded-md px-3 py-2 pr-8 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus:bg-muted data-[state=checked]:bg-muted data-[state=checked]:font-medium data-[state=checked]:text-foreground"
              >
                {LANGUAGE_LABELS[lang]}
                <DropdownMenu.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground">
                  ✓
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
