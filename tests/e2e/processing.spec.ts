import { test, expect } from "@playwright/test";

test.describe("Book Processing", () => {
  test.skip("shows processing status for a book", async ({ page }) => {
    // Requires auth + seeded book
    await page.goto("/books/sample-book-001");
    await expect(page.getByText("Processing complete")).toBeVisible();
  });

  test.skip("shows process button for unprocessed books", async ({ page }) => {
    // Requires auth + unprocessed book
    await page.goto("/books/unprocessed-book");
    await expect(page.getByText("Start Processing")).toBeVisible();
  });
});
