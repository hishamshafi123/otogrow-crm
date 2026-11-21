const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';
const OUTPUT = '/Users/hishamshafi/otogrow-crm/.playwright-mcp/first-task-self-review';

async function signIn(page) {
  await page.goto(`${BASE}/delivery?view=onboarding`);
  const emailLogin = page.getByRole('button', { name: 'Continue with Email' });
  await emailLogin
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => undefined);
  if (await emailLogin.isVisible().catch(() => false)) await emailLogin.click();
  const email = page.getByPlaceholder('Email');
  await email
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => undefined);
  if (await email.isVisible().catch(() => false)) {
    assert((await email.inputValue()).length > 0, 'Use the prefilled local email.');
    await continueWizard(page);
  }
  const password = page.getByPlaceholder('Password');
  await password
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => undefined);
  if (await password.isVisible().catch(() => false)) {
    assert(
      (await password.inputValue()).length > 0,
      'Use the prefilled local password.',
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await page.waitForLoadState('networkidle');
  const chooseWorkspace = page.getByText('Choose a workspace');
  await chooseWorkspace
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => undefined);
  if (await chooseWorkspace.isVisible().catch(() => false))
    await page.getByText('Apple', { exact: true }).click();
  if (page.url().includes('verify'))
    await page.waitForFunction(() => !window.location.href.includes('verify'));
}

async function firstValue(locator) {
  const value = await locator.locator('option').evaluateAll((options) =>
    options.find((option) => option.value)?.value,
  );
  assert(value, 'A real selectable option is required.');
  return value;
}

async function continueWizard(page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 30000 });
  await button.click();
}

async function noHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert(
    dimensions.document <= dimensions.viewport + 1 &&
      dimensions.body <= dimensions.viewport + 1,
    `${label} overflows horizontally: ${JSON.stringify(dimensions)}`,
  );
}

async function main() {
  mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
  });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.goto(`${BASE}/delivery?view=onboarding`);
    const company = page.getByRole('combobox', { name: 'Client company' });
    await company.waitFor();
    await company.selectOption(await firstValue(company));
    await page.getByLabel('Project choice').waitFor();
    await page.getByLabel('Project choice').selectOption('NEW');
    await page.getByLabel('New project name').fill('Visual-only first task rule');
    const teammates = page.getByLabel('Project teammates');
    await teammates.selectOption([await firstValue(teammates)]);
    await continueWizard(page);
    await page.getByLabel('Service plan choice').selectOption('NEW');
    await page.getByLabel('Service plan name').fill('Visual-only SEO plan');
    await page.getByLabel('SEO', { exact: true }).check();
    await page.getByLabel('Billing arrangement').selectOption('RETAINER');
    await page.getByLabel('Client-visible scope').fill('Visual QA only; do not save.');
    await continueWizard(page);
    await page.getByLabel('Include the first task in this setup').check();
    await page.getByLabel('First task title').fill('Visual-only first deliverable');
    await page.getByLabel('Task service').fill('SEO');
    const assignee = page.getByLabel('First task assignee');
    const reviewer = page.getByLabel('First task reviewer');
    const selected = await firstValue(assignee);
    await assignee.selectOption(selected);
    await reviewer.selectOption(selected);
    const continueButton = page.getByRole('button', {
      name: 'Continue',
      exact: true,
    });
    assert(await continueButton.isEnabled());
    const step = page.getByRole('region', { name: 'First task' });
    assert((await step.textContent()).includes('same manager'));
    await noHorizontalOverflow(page, 'desktop');
    await continueButton.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUTPUT}/desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(page, '390px');
    await page.screenshot({ path: `${OUTPUT}/mobile-390.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 780 });
    await noHorizontalOverflow(page, '320px');
    await page.screenshot({ path: `${OUTPUT}/mobile-320.png`, fullPage: true });
    console.log(
      `Same-person first-task onboarding passed with Continue enabled at desktop/390/320px. No setup was saved. Evidence: ${OUTPUT}`,
    );
  } catch (error) {
    await page.screenshot({ path: `${OUTPUT}/failure.png`, fullPage: true });
    console.error(`Browser failure URL: ${page.url()}`);
    throw error;
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
