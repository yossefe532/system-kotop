import { test, expect } from '@playwright/test'

test('renders application shell', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Vite|POS|Educon/i)
})
