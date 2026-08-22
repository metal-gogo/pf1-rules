import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoPageOverflow(page: Page): Promise<void> {
  const dimensions = await page.locator("html").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
}

test("alphabetical catalog contains overflow and bounds its result set", async ({ page }) => {
  await page.goto("/spells/alphabetical");

  await expect(page.getByRole("heading", { level: 1, name: "Alphabetical spells" })).toBeVisible();
  await expect(page.locator(".alphabetical-table tbody tr")).toHaveCount(50);
  await expectNoPageOverflow(page);

  const region = page.getByRole("region", { name: "Results" });
  await expect(region).toHaveCSS("overflow-x", "auto");
  await expect(page.locator(".alphabetical-table thead th").first()).toHaveCSS("position", "sticky");
  await expect(page.locator(".alphabetical-table tbody .key-column").first()).toHaveCSS("position", "sticky");

  await page.getByRole("link", { name: "L", exact: true }).click();
  await expect(page).toHaveURL(/letter=L/);
  await expect(page.getByRole("link", { name: "L", exact: true })).toHaveAttribute("aria-current", "true");
});

test("spell-list directory exposes every source kind without page overflow", async ({ page }) => {
  await page.goto("/spells");

  await expect(page.getByRole("heading", { level: 1, name: "Spell lists by source" })).toBeVisible();
  const kinds = page.getByRole("navigation", { name: "Spell list kinds" });
  for (const name of [
    "Classes",
    "Domains",
    "Subdomains",
    "Bloodlines",
    "Mysteries",
    "Patrons",
    "Spirits",
    "Elemental schools",
    "Feats",
    "Formulae",
  ]) {
    await expect(kinds.getByRole("link", { name: new RegExp(`^${name} \\(`) })).toBeVisible();
  }
  await expectNoPageOverflow(page);
});

test("class tables retain context and use four focused columns", async ({ page }) => {
  await page.goto("/classes/cleric");

  await expectNoPageOverflow(page);
  const firstTable = page.locator(".spell-table").first();
  await expect(firstTable.locator("thead th")).toHaveCount(4);
  await expect(firstTable.locator(".row-number")).toHaveCount(0);
  await expect(firstTable.locator("thead th").first()).toHaveCSS("position", "sticky");
  await expect(firstTable.locator("tbody .key-column").first()).toHaveCSS("position", "sticky");
  await expect(firstTable.locator(".components-column a")).toHaveCount(1);
  expect(await firstTable.locator(".components-column abbr").count()).toBeGreaterThan(0);

  const region = page.locator(".spell-table-region").first();
  const overflow = await region.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
});

test("spell filters support keyboard focus, summaries, and reset", async ({ page }) => {
  await page.goto("/classes/cleric");

  const search = page.getByRole("searchbox", { name: "Search spells" });
  const moreFilters = page.getByRole("button", { name: "More filters" });
  await expect(search).toBeVisible();

  await moreFilters.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Filter spells" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close filters" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(moreFilters).toBeFocused();

  await search.fill("light");
  await expect(page.locator("#spell-filter-status")).toContainText("Active filters: Search “light”");
  const clear = page.getByRole("button", { name: "Clear all", exact: true });
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(page.locator("#spell-filter-status")).toContainText("No filters active");
});

test("table pages have no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/spells/alphabetical");
  let results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.goto("/classes/cleric");
  await page.getByRole("button", { name: "More filters" }).click();
  results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("alphabetical catalog reflows at a 200 percent equivalent viewport", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/spells/alphabetical");
  await expectNoPageOverflow(page);
  await expect(page.getByRole("region", { name: "Results" })).toBeVisible();
});
