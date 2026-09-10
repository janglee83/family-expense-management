import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DropdownContent, DropdownMenu } from "./ui/primitives";
import { Button } from "./ui/Button";
import { getStoredThemePreference, setThemePreference, type ThemePreference } from "../theme";

const THEME_ICONS: Record<ThemePreference, string> = {
  light: "☀️",
  dark: "🌙",
  system: "🖥️",
};

export function ThemeToggle() {
  const { t } = useTranslation();
  const [preference, setPreference] = useState<ThemePreference>(getStoredThemePreference);

  function handleChange(value: ThemePreference) {
    setThemePreference(value);
    setPreference(value);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("common.theme")}
          title={t("common.theme")}
          className="h-10 w-10 p-0"
          data-field="theme"
          data-tour="header-theme"
        >
          <span aria-hidden="true" className="text-base">
            {THEME_ICONS[preference]}
          </span>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownContent align="end" sideOffset={8} className="min-w-44" aria-label={t("common.theme")}>
          <DropdownMenu.RadioGroup
            value={preference}
            onValueChange={(value) => handleChange(value as ThemePreference)}
          >
            {(["system", "light", "dark"] as const).map((option) => (
              <DropdownMenu.RadioItem
                key={option}
                value={option}
                className="relative w-full cursor-pointer rounded-md px-3 py-2 pr-8 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus:bg-muted data-[state=checked]:bg-muted data-[state=checked]:font-medium data-[state=checked]:text-foreground"
              >
                <span className="mr-2" aria-hidden="true">
                  {THEME_ICONS[option]}
                </span>
                {t(`common.theme${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
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
