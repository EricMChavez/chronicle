import { test, expect } from "@playwright/test";

test.describe("Book Upload", () => {
  test.skip("upload page requires authentication", async ({ page }) => {
    // This test requires a mock auth session
    await page.goto("/books/upload");
    await expect(page).toHaveURL(/sign-in/);
  });

  test.skip("shows upload form with drag and drop zone", async ({ page }) => {
    // Requires auth setup
    await page.goto("/books/upload");
    await expect(page.getByText("Upload a Book")).toBeVisible();
    await expect(page.getByText("Choose an ePub file")).toBeVisible();
  });
});
