#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { platformFixture } from './browser-platform-fixtures.mjs';

// Run against built, packed consumers. Block external traffic and use only synthetic approvals.
const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node scripts/browser-integrations.mjs /path/to/matrix/report.json');
const matrix = JSON.parse(await readFile(reportPath, 'utf8'));
const selected = process.argv.slice(3);
const available = ['vanilla', 'wagmi-v2', 'wagmi-v3', 'rainbowkit', 'onboard', 'appkit', 'connectkit', 'ethers', 'viem', 'thirdweb', 'dynamic', 'privy'];
const cases = selected.length ? selected : matrix.results.map(({ name }) => name);
assert.ok(cases.length, 'The browser matrix must contain at least one example');
for (const name of cases) {
  assert.ok(available.includes(name), `Unknown browser case: ${name}`);
  assert.equal(matrix.results.find((entry) => entry.name === name)?.status, 'passed', `${name} must pass the packed matrix before browser checks`);
}
const output = join(matrix.directory, 'browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const results = [];

async function serve(directory) {
  const root = resolve(directory, 'dist');
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(`${root}${sep}`)) throw new Error('Invalid path');
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function contextFor(origin, viewport, injected, platform) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    if (!await platformFixture(route, platform)) return route.abort();
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  if (injected) await context.addInitScript(() => {
    const events = new Map();
    const syntheticAccount = '0x0000000000000000000000000000000000000001';
    const wallet = {
      isRobinhoodMobileWallet: true,
      prompts: Number(localStorage.getItem('synthetic-prompts') ?? 0),
      sensitiveRequests: Number(localStorage.getItem('synthetic-sensitive-requests') ?? 0),
      async request({ method }) {
        if (/^(personal_sign|eth_sign|eth_sendTransaction|eth_sendRawTransaction|wallet_sendCalls)/.test(method)) {
          localStorage.setItem('synthetic-sensitive-requests', String(++wallet.sensitiveRequests));
          throw new Error('Signing and transactions are forbidden in automated browser checks');
        }
        if (method === 'eth_chainId') return '0x1';
        if (method === 'eth_accounts') return localStorage.getItem('synthetic-approved') ? [syntheticAccount] : [];
        if (method === 'eth_requestAccounts') {
          localStorage.setItem('synthetic-prompts', String(++wallet.prompts));
          localStorage.setItem('synthetic-approved', 'true');
          return [syntheticAccount];
        }
        throw Object.assign(new Error('Unsupported synthetic method'), { code: 4200 });
      },
      on(name, listener) {
        if (!events.has(name)) events.set(name, new Set());
        events.get(name).add(listener);
      },
      removeListener(name, listener) { events.get(name)?.delete(listener); },
      listenerCount() { return [...events.values()].reduce((count, listeners) => count + listeners.size, 0); },
    };
    window.ethereum = wallet;
    window.__syntheticWallet = wallet;
  });
  return context;
}

async function choose(page, name, beforeSelect) {
  if (name === 'appkit') await page.getByRole('button', { name: 'Open wallet chooser', exact: true }).click();
  if (name === 'connectkit' || name === 'rainbowkit') await page.getByRole('button', { name: 'Connect Wallet', exact: true }).click();
  if (name === 'onboard') await page.getByRole('button', { name: 'Connect Robinhood Wallet', exact: true }).click();
  if (name === 'dynamic') await page.getByRole('button', { name: /connect (your )?wallet|log in or sign up/i }).first().click();
  if (['appkit', 'connectkit', 'dynamic', 'rainbowkit', 'onboard'].includes(name)) {
    const entry = page.getByText('Robinhood Wallet', { exact: true }).first();
    await entry.waitFor();
    await entry.click({ trial: true });
    if (beforeSelect) {
      // Host choosers can start fading in after their entries become actionable.
      await page.waitForTimeout(500);
      await beforeSelect();
    }
    await entry.click();
  }
  else await page.getByRole('button', { name: 'Connect Robinhood Wallet', exact: true }).click();
}
async function status(page, connected, name) {
  await page.waitForFunction((expected) => {
    const value = document.querySelector('.status, #status')?.textContent?.toLowerCase() ?? '';
    return expected ? /\bconnected\b/.test(value) : /\bdisconnected\b|connection cancelled|ready to connect/.test(value);
  }, connected).catch(async () => {
    const prompts = await page.evaluate(() => window.__syntheticWallet?.prompts);
    throw new Error(`Expected ${name} to be ${connected ? 'connected' : 'disconnected'}; synthetic permission requests: ${prompts}`);
  });
}

try {
  for (const entry of matrix.results.filter(({ name }) => cases.includes(name))) {
    assert.equal(entry.status, 'passed', `${entry.name} must pass the packed matrix before browser checks`);
    const { server, origin } = await serve(entry.directory);
    try {
      for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
        const context = await contextFor(origin, viewport, true, entry.name);
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message === 'Failed to fetch' ? 'Failed to fetch' : error.name));
          await page.goto(origin);
          await status(page, false, entry.name);
          assert.equal(await page.evaluate(() => window.__syntheticWallet.prompts), 0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          // Capture only disconnected pages, before any account or pairing material exists.
          await page.screenshot({ path: join(output, `${entry.name}-${viewport.width}.png`) });
          await choose(page, entry.name, () => page.screenshot({ path: join(output, `${entry.name}-chooser-${viewport.width}.png`) }));
          await status(page, true, entry.name);
          assert.equal(await page.evaluate(() => window.__syntheticWallet.prompts), 1);
          await page.reload();
          // These minimal examples deliberately require another explicit connection after reload.
          const restores = !['vanilla', 'onboard'].includes(entry.name);
          await status(page, restores, entry.name);
          assert.equal(await page.evaluate(() => window.__syntheticWallet.prompts), 1);
          if (!restores) {
            await choose(page, entry.name);
            await status(page, true, entry.name);
          }
          // Explicit reconnect also recovers the persisted approval without a new prompt.
          const expectedPrompts = 1;
          assert.equal(await page.evaluate(() => window.__syntheticWallet.prompts), expectedPrompts);
          // A hydrated framework can show its account button before provider restoration finishes.
          await page.waitForFunction(() => window.__syntheticWallet.listenerCount() > 0);
          if (entry.name === 'rainbowkit') {
            await page.getByTestId('rk-account-button').click();
            await page.getByTestId('rk-disconnect-button').click();
          } else await page.getByRole('button', { name: 'Disconnect', exact: true }).first().click();
          await status(page, false, entry.name);
          assert.equal(await page.evaluate(() => window.__syntheticWallet.listenerCount()), 0);
          await page.reload();
          await status(page, false, entry.name);
          assert.equal(await page.evaluate(() => window.__syntheticWallet.prompts), expectedPrompts);
          assert.equal(await page.evaluate(() => window.__syntheticWallet.sensitiveRequests), 0);
          assert.equal(errors.length, 0, `${entry.name} raised an uncaught browser error: ${errors.join(', ')}`);
          results.push({ name: entry.name, viewport, scenario: 'synthetic connection, reload, disconnect and listener cleanup', reload: restores ? 'approved state restored without a permission request' : 'explicit reconnection restores approval without another permission request', permissionRequests: expectedPrompts, sensitiveRequests: 0, status: 'passed' });
        } finally { await context.close(); }

        const remoteContext = await contextFor(origin, viewport, false, entry.name);
        try {
          const page = await remoteContext.newPage();
          await page.goto(origin);
          await choose(page, entry.name);
          const dialog = page.locator('rhw-connector dialog[open]');
          await dialog.waitFor();
          assert.equal(await dialog.count(), 1);
          assert.ok(await dialog.evaluate((element) => element.getBoundingClientRect().width <= innerWidth));
          await page.keyboard.press('Tab');
          assert.ok(await dialog.evaluate((element) => element.contains(element.getRootNode().activeElement)));
          await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden' });
          if (entry.name !== 'onboard') await status(page, false, entry.name);
          if (entry.name === 'onboard') {
            await page.getByText('Click here to try again', { exact: true }).click();
          } else if (['connectkit', 'rainbowkit'].includes(entry.name)) {
            await page.getByRole('button', { name: /^(retry|try again)$/i }).click();
          } else {
            // AppKit keeps its chooser open after SDK cancellation.
            if (entry.name === 'appkit') await page.keyboard.press('Escape');
            if (entry.name === 'dynamic') await page.keyboard.press('Escape');
            await choose(page, entry.name);
          }
          await dialog.waitFor();
          assert.equal(await dialog.count(), 1);
          await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden' });
          results.push({ name: entry.name, viewport, scenario: 'blocked remote transport, one SDK dialog, keyboard focus, cancellation and retry', status: 'passed' });
        } finally { await remoteContext.close(); }
        console.log(`${entry.name} ${viewport.width}: synthetic lifecycle and keyboard cancellation passed`);
      }
    } finally { await new Promise((done) => server.close(done)); }
  }
  assert.equal(results.length, cases.length * 4, 'Every selected example must complete both scenarios at both viewports');
} finally {
  await browser.close();
  await writeFile(join(output, 'report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), browser: browser.version(), channel: process.env.BROWSER_CHANNEL ?? 'playwright-chromium',
    scriptSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    platformFixturesSha256: createHash('sha256').update(await readFile(new URL('./browser-platform-fixtures.mjs', import.meta.url))).digest('hex'),
    matrixReportSha256: createHash('sha256').update(await readFile(reportPath)).digest('hex'),
    externalTraffic: 'blocked; Dynamic public configuration is fulfilled with local synthetic responses', physicalWallets: 'not tested', results,
  }, null, 2) + '\n');
}
console.log(`Browser report: ${join(output, 'report.json')}`);
