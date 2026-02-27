import { test, expect } from "@playwright/test";

test.describe("Codex Browsing", () => {
  test.skip("shows entries filtered by reading progress", async ({ page }) => {
    // Requires auth + seeded book with entries
    await page.goto("/books/sample-book-001/entries");
    await expect(page.getByText("Jay Gatsby")).toBeVisible();
    await expect(page.getByText("Nick Carraway")).toBeVisible();
  });

  test.skip("filters entries by type", async ({ page }) => {
    await page.goto("/books/sample-book-001/entries");
    await page.getByText("Locations").click();
    await expect(page.getByText("West Egg")).toBeVisible();
  });

  test.skip("shows entry detail with filtered content", async ({ page }) => {
    await page.goto("/books/sample-book-001/entries/entry-gatsby-001");
    await expect(page.getByText("Jay Gatsby")).toBeVisible();
    await expect(page.getByText("At a Glance")).toBeVisible();
  });

  test.skip("chapter selector updates entry visibility", async ({ page }) => {
    await page.goto("/books/sample-book-001/entries");
    // Change chapter to 1
    await page.selectOption("#chapter-select", "1");
    // Should still see entries that first appear in chapter 1
    await expect(page.getByText("Jay Gatsby")).toBeVisible();
  });
});
