import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("shows sign-in page with GitHub button", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Chronicle")).toBeVisible();
    await expect(page.getByText("Sign in with GitHub")).toBeVisible();
  });

  test("landing page is accessible without auth", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Chronicle")).toBeVisible();
    await expect(page.getByText("Get Started")).toBeVisible();
  });
});
