const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:3001';
const MONTH = '2098-12';
const OUTPUT =
  '/Users/hishamshafi/otogrow-crm/.playwright-mcp/founder-performance';
const fixture = require('/tmp/otogrow-founder-ui-fixture.json');

const text = async (locator) => (await locator.textContent()) ?? '';
const assertText = async (locator, expected) =>
  assert(
    (await text(locator)).includes(expected),
    `Missing visible text: ${expected}`,
  );

async function signIn(page) {
  await page.goto(`${BASE}/delivery?view=health`);
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
    assert(
      (await email.inputValue()).length > 0,
      'Use the prefilled local email.',
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
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
  if (await chooseWorkspace.isVisible().catch(() => false)) {
    await page.getByText('Apple', { exact: true }).click();
  }
  if (page.url().includes('verify')) {
    await page.waitForFunction(() => !window.location.href.includes('verify'));
  }
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
    const destination = `${BASE}/delivery?view=health&founderPanel=performance&founderMonth=${MONTH}&founderTimezone=UTC&founderCurrency=USD`;
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/metadata') &&
        response.request().method() === 'POST' &&
        response.request().postData()?.includes('DeliveryFounderPerformance'),
    );
    await page.goto(destination);
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    const performance = payload.data?.deliveryFounderPerformance;
    assert(performance, JSON.stringify(payload.errors ?? payload));
    assert.equal(performance.month, MONTH);
    assert.equal(performance.currencies[0].revenueMicros, '50000000');
    assert.equal(performance.currencies[0].costMicros, '100000000');
    assert.equal(performance.currencies[0].resultMicros, '-50000000');
    assert.equal(performance.operations.openTaskCount, 1);
    assert.equal(performance.operations.overdueTaskCount, 1);
    const client = performance.clients.find(
      (row) => row.projectId === fixture.projectId,
    );
    assert(client);
    assert.equal(client.finance[0].resultMicros, '-50000000');
    assert(!JSON.stringify(payload).includes('PRIVATE_'));

    const company = page.getByRole('region', {
      name: 'USD financial performance',
    });
    await company.waitFor();
    await assertText(company, '$50.00');
    await assertText(company, '-$50.00');
    await assertText(company, '-100.00%');
    const clientRow = page.getByRole('article', { name: fixture.sentinel });
    await assertText(clientRow, '1 open');
    await assertText(clientRow, '1 overdue');
    await assertText(clientRow, '-100.00%');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const element of document.querySelectorAll('*')) {
        if (element.scrollHeight > element.clientHeight) element.scrollTop = 0;
      }
    });
    await page.screenshot({
      path: `${OUTPUT}/desktop-top-light.png`,
      fullPage: true,
    });
    await page.getByText('Cost breakdown and company allocations').click();
    await page.getByText('Delivery quality and revision evidence').click();
    await noHorizontalOverflow(page, 'desktop light');
    await page.screenshot({
      path: `${OUTPUT}/desktop-light.png`,
      fullPage: true,
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({
      path: `${OUTPUT}/desktop-dark.png`,
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: 'light' });

    await clientRow.getByRole('link', { name: 'Financial sources' }).click();
    await page.getByRole('heading', { name: 'Monthly results' }).waitFor();
    await assertText(page.locator('body'), fixture.sentinel);
    await assertText(page.locator('body'), '-$50.00');
    await page.goBack();
    await company.waitFor();

    await page
      .getByRole('article', { name: 'Tim Apple' })
      .getByRole('link', { name: 'Open assigned work' })
      .click();
    await page.getByText(`${fixture.sentinel} blocked video`).waitFor();
    await page.goBack();
    await company.waitFor();

    await page
      .getByRole('link', { name: 'Needs attention', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Needs attention' }).waitFor();
    await page
      .getByRole('article')
      .filter({ hasText: fixture.sentinel })
      .first()
      .waitFor();
    await assertText(page.locator('body'), fixture.sentinel);
    await page.goBack();
    await company.waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(page, '390px light');
    await page.screenshot({
      path: `${OUTPUT}/mobile-390-light.png`,
      fullPage: true,
    });
    await clientRow.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${OUTPUT}/mobile-client-390-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const element of document.querySelectorAll('*')) {
        if (element.scrollHeight > element.clientHeight) element.scrollTop = 0;
      }
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await noHorizontalOverflow(page, '390px dark');
    await page.screenshot({
      path: `${OUTPUT}/mobile-390-dark.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 780 });
    await noHorizontalOverflow(page, '320px dark');
    await page.screenshot({
      path: `${OUTPUT}/mobile-320-dark.png`,
      fullPage: true,
    });

    await page
      .locator('summary')
      .filter({ hasText: 'Reporting filters' })
      .click();
    await page.getByLabel('Service month').fill('2098-11');
    await page.getByRole('button', { name: 'Apply reporting period' }).click();
    await page
      .getByText(/No posted monthly finance or cash records are available/)
      .waitFor();
    await assertText(page.locator('body'), 'November 2098');
    assert(!page.url().includes('founderClientsAfter'));
    await page.goBack();
    await company.waitFor();
    console.log(
      `Founder performance browser acceptance passed: real GraphQL, exact values, finance/employee/attention source journeys, desktop/mobile light/dark, empty month and overflow checks. Evidence: ${OUTPUT}`,
    );
  } catch (error) {
    await page.screenshot({
      path: `${OUTPUT}/failure.png`,
      fullPage: true,
    });
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
