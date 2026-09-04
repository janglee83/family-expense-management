import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

export async function expectVisibleFocusStyle(locator: Locator): Promise<void> {
  const hasVisibleFocus = await locator.evaluate((node) => {
    const styles = window.getComputedStyle(node as HTMLElement);
    const hasOutline = styles.outlineStyle !== "none" && styles.outlineWidth !== "0px";
    const hasBoxShadow = styles.boxShadow !== "none";
    return hasOutline || hasBoxShadow;
  });

  expect(hasVisibleFocus).toBe(true);
}
