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
    "Bloodrager bloodlines",
    "Sorcerer bloodlines",
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

test("Cure Light Wounds uses same-tab navigation to the matching rule heading", async ({ page }) => {
  await page.goto("/spells/spell.cure-light-wounds");

  await page.locator('dl a[href="/rules/actions#standard-action"]').click();
  await expect(page).toHaveURL(/\/rules\/actions#standard-action$/);
  await expect(page.locator("#standard-action")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("rich spell descriptions link inline and expand functions-like content once", async ({ page }) => {
  await page.goto("/spells/spell.restoration");

  const description = page.locator(".rich-description").first();
  await expect(description.getByRole("link", { name: "lesser restoration" })).toHaveAttribute(
    "href",
    "/spells/spell.restoration-lesser",
  );
  await expect(page.locator('[data-embedded-spell="spell.restoration-lesser"]')).toHaveCount(1);
  await expect(page.locator("[data-embedded-spell] [data-embedded-spell]")).toHaveCount(0);
  await expectNoPageOverflow(page);
  let results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await description.getByRole("link", { name: "lesser restoration" }).click();
  await expect(page).toHaveURL(/\/spells\/spell\.restoration-lesser$/);
});

test("Batch 18 links and expands Crime Wave without recursive or new-tab navigation", async ({ page }) => {
  await page.goto("/spells/spell.crime-of-opportunity");

  const description = page.locator(".rich-description").first();
  const crimeWaveLink = description.getByRole("link", { name: "crime wave" });
  await expect(crimeWaveLink).toHaveAttribute("href", "/spells/spell.crime-wave");
  await expect(crimeWaveLink).not.toHaveAttribute("target", "_blank");
  await expect(page.locator('[data-embedded-spell="spell.crime-wave"]')).toHaveCount(1);
  await expect(page.locator("[data-embedded-spell] [data-embedded-spell]")).toHaveCount(0);
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await crimeWaveLink.click();
  await expect(page).toHaveURL(/\/spells\/spell\.crime-wave$/);
});

test("Batch 19 separates Curse Water's alignment and creature-type links", async ({ page }) => {
  await page.goto("/spells/spell.curse-water");

  const description = page.locator(".rich-description").first();
  await expect(description.locator('a[href="/entities/rule.good"]')).toHaveText("good");
  await expect(description.locator('a[href="/entities/rule.evil"]')).toHaveText("evil");
  await expect(description.locator('a[href="/entities/rule.outsider"]')).toHaveCount(2);
  const unholyWater = description.locator('a[href="/entities/item.unholy-water"]').first();
  await expect(unholyWater).not.toHaveAttribute("target", "_blank");
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await unholyWater.click();
  await expect(page).toHaveURL(/\/entities\/item\.unholy-water$/);
});

test("Batch 20 separates Greater Darkvision's parent spell from its granted sense", async ({ page }) => {
  await page.goto("/spells/spell.darkvision-greater");

  const description = page.locator(".rich-description").first();
  const parent = description.locator('a[href="/spells/spell.darkvision"]');
  const sense = description.locator('a[href="/entities/rule.darkvision"]');
  await expect(parent).toHaveCount(1);
  await expect(sense).toHaveCount(1);
  await expect(parent).not.toHaveAttribute("target", "_blank");
  await expect(page.locator('[data-embedded-spell="spell.darkvision"]')).toHaveCount(0);
  await expect(page.locator("aside.notice")).toContainText(
    "that parent is not fully resolved in the local rules data",
  );
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await sense.click();
  await expect(page).toHaveURL(/\/entities\/rule\.darkvision$/);
});

test("Batch 21 separates Deeper Darkness's spell, descriptor, and illumination links", async ({ page }) => {
  await page.goto("/spells/spell.deeper-darkness");

  const description = page.locator(".rich-description").first();
  const parent = description.locator('a[href="/spells/spell.darkness"]');
  await expect(parent).toHaveCount(2);
  await expect(description.locator('a[href="/rules/descriptors#darkness"]')).toHaveCount(1);
  await expect(description.locator('a[href="/rules/illumination#darkness"]')).toHaveCount(2);
  await expect(description.locator('a[href="/spells/spell.darkness"]', {
    hasText: "Deeper darkness",
  })).toHaveCount(0);
  await expect(parent.first()).not.toHaveAttribute("target", "_blank");
  await expect(page.locator('[data-embedded-spell="spell.darkness"]')).toHaveCount(1);
  await expect(page.locator("[data-embedded-spell] [data-embedded-spell]")).toHaveCount(0);
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await description.locator('a[href="/rules/descriptors#darkness"]').click();
  await expect(page).toHaveURL(/\/rules\/descriptors#darkness$/);
});

test("Batch 22 links only the explicit Snare spell reference", async ({ page }) => {
  await page.goto("/spells/spell.detect-snares-and-pits");

  const description = page.locator(".rich-description").first();
  const snare = description.locator('a[href="/spells/spell.snare"]');
  await expect(snare).toHaveCount(1);
  await expect(description.locator('a[href="/spells/spell.detect-magic"]')).toHaveCount(0);
  await expect(snare).not.toHaveAttribute("target", "_blank");
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await snare.click();
  await expect(page).toHaveURL(/\/spells\/spell\.snare$/);
});

test("Batch 23 links only Greater Discharge's three parent references", async ({ page }) => {
  await page.goto("/spells/spell.discharge-greater");

  const description = page.locator(".rich-description").first();
  const parentLinks = description.locator('a[href="/spells/spell.discharge"]');
  await expect(parentLinks).toHaveCount(3);
  await expect(parentLinks.first()).not.toHaveAttribute("target", "_blank");
  await expect(page.locator('[data-embedded-spell="spell.discharge"]')).toHaveCount(1);
  await expect(page.locator("[data-embedded-spell] [data-embedded-spell]")).toHaveCount(0);
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await parentLinks.first().click();
  await expect(page).toHaveURL(/\/spells\/spell\.discharge$/);
});

test("Batch 24 folds Dispel variants and links only the explicit Silence spell", async ({ page }) => {
  await page.goto("/spells/spell.dispel-good");

  const variantDescription = page.locator(".rich-description").first();
  const parent = variantDescription.locator('a[href="/spells/spell.dispel-evil"]');
  await expect(parent).toHaveCount(1);
  await expect(parent).not.toHaveAttribute("target", "_blank");
  await expect(page.locator('[data-embedded-spell="spell.dispel-evil"]')).toHaveCount(1);
  await expect(page.locator("[data-embedded-spell] [data-embedded-spell]")).toHaveCount(0);
  await expectNoPageOverflow(page);

  await parent.click();
  await expect(page).toHaveURL(/\/spells\/spell\.dispel-evil$/);

  await page.goto("/spells/spell.disrupt-silence");
  const silence = page.locator(".rich-description").first()
    .locator('a[href="/spells/spell.silence"]');
  await expect(silence).toHaveCount(1);
  await expect(silence).not.toHaveAttribute("target", "_blank");
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await silence.click();
  await expect(page).toHaveURL(/\/spells\/spell\.silence$/);
});

test("Batch 25 preserves Detect Undead's table and contextual Dream link", async ({ page }) => {
  await page.goto("/spells/spell.detect-undead");

  const undeadDescription = page.locator(".rich-description").first();
  await expect(undeadDescription.locator("table")).toHaveCount(1);
  await expect(undeadDescription.locator("tbody tr")).toHaveCount(4);
  await expect(undeadDescription.locator('a[href="/entities/rule.undead"]')).toHaveCount(9);
  await expectNoPageOverflow(page);

  await page.goto("/spells/spell.dream-travel");
  const dream = page.locator(".rich-description").first()
    .locator('a[href="/spells/spell.dream"]');
  await expect(dream).toHaveCount(1);
  await expect(dream).not.toHaveAttribute("target", "_blank");
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await dream.click();
  await expect(page).toHaveURL(/\/spells\/spell\.dream$/);
});

test("Batch 26 preserves Elemental Mastery's table and contextual spell links", async ({ page }) => {
  await page.goto("/spells/spell.elemental-mastery");

  const mastery = page.locator(".rich-description").first();
  await expect(mastery.locator("table")).toHaveCount(1);
  await expect(mastery.locator("tbody tr")).toHaveCount(4);
  await expect(mastery.locator('a[href="/entities/rule.ifrit"]')).toHaveCount(2);
  await expectNoPageOverflow(page);

  await page.goto("/spells/spell.echeans-excellent-enclosure");
  const antimagic = page.locator(".rich-description").first()
    .locator('a[href="/spells/spell.antimagic-field"]');
  await expect(antimagic).toHaveCount(3);
  await expect(antimagic.first()).not.toHaveAttribute("target", "_blank");
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await antimagic.first().click();
  await expect(page).toHaveURL(/\/spells\/spell\.antimagic-field$/);
});

test("pilot lists remain semantic and accessible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/spells/spell.bestow-curse-greater");

  const description = page.locator(".rich-description").first();
  await expect(description.locator("ul")).toHaveCount(1);
  await expect(description.locator("ul > li")).toHaveCount(5);
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("spell families render once without implying recursive inheritance", async ({ page }) => {
  await page.goto("/spells/spell.bestow-curse-greater");

  await expect(page.getByRole("heading", { level: 2, name: "Spell family" })).toBeVisible();
  await expect(page.getByText("does not by itself assert rules inheritance")).toBeVisible();
  await expect(page.locator('[data-embedded-spell="spell.bestow-curse"]')).toHaveCount(1);
  await expect(page.locator("[data-embedded-spell] [data-embedded-spell]")).toHaveCount(0);
  await expectNoPageOverflow(page);
});

test("Darkness separates mythic rules and links contextual definitions", async ({ page }) => {
  await page.goto("/spells/spell.darkness");

  const description = page.locator(".rich-description").first();
  await expect(description).not.toContainText("Mythic Darkness");
  await expect(description.locator('a[href="/spells/spell.darkness"]')).toHaveCount(0);
  await expect(description.locator('a[href="/rules/descriptors#darkness"]')).toHaveCount(1);
  await expect(description.locator('a[href^="/rules/illumination#"]')).toHaveCount(6);
  await expect(description.locator('a[href="/entities/item.torch"]')).toHaveCount(1);
  await expect(description.locator('a[href="/entities/item.lantern"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: "Mythic Darkness" })).toBeVisible();
  await expect(page.locator('[data-embedded-spell="spell.deeper-darkness"]')).toHaveCount(1);
  await expectNoPageOverflow(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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
