export const ONBOARDING_SEEN_KEY = "family_expense_onboarding_seen";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
}
