import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import QRCode from 'qrcode';
import { RobinhoodModal } from '../packages/core/src/modal.js';
import { getRobinhoodUri } from '../packages/core/src/metadata.js';

// Synthetic, nonfunctional pairing material. No wallet or relay is contacted.
const uri = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;
const secondUri = `wc:${'c'.repeat(64)}@2?relay-protocol=irn&symKey=${'d'.repeat(64)}`;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
let dom: JSDOM;
let modals: RobinhoodModal[];

function modal(): RobinhoodModal {
  const value = new RobinhoodModal();
  modals.push(value);
  return value;
}

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const result = dom.window.document.querySelector<T>(selector);
  assert.ok(result, `Expected element matching ${selector}.`);
  return result;
}

function stubQr(): void {
  mock.method(QRCode, 'toCanvas', async (canvas: HTMLCanvasElement) => {
    canvas.width = canvas.height = 280;
    return canvas;
  });
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><button id="host-connect">Connect wallet</button>', { url: 'https://example.test' });
  modals = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
  // JSDOM has no top layer. Real inertness is checked separately in a browser.
  Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});

afterEach(() => {
  modals.forEach((value) => value.close());
  mock.restoreAll();
  dom.window.close();
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  if (originalHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', originalHTMLElement);
  else Reflect.deleteProperty(globalThis, 'HTMLElement');
});

test('opens a named dialog, consumes Escape, cancels once, and restores host focus', () => {
  const host = element<HTMLButtonElement>('#host-connect');
  host.focus();
  let cancelled = 0;
  let underlyingEscape = 0;
  dom.window.document.addEventListener('keydown', () => { underlyingEscape++; }, true);
  const value = modal();
  value.open({ onCancel: () => { cancelled++; } });
  const dialog = element<HTMLDialogElement>('dialog');
  assert.equal(dialog.open, true);
  assert.equal(element(`#${dialog.getAttribute('aria-labelledby')}`).textContent, 'Connect your wallet');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(element('.rhw-stage').getAttribute('aria-busy'), 'true');
  assert.equal(dom.window.document.activeElement, element('.rhw-close'));
  const escape = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  element('.rhw-close').dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(underlyingEscape, 0);
  assert.equal(cancelled, 1);
  assert.equal(dom.window.document.querySelector('dialog'), null);
  assert.equal(dom.window.document.activeElement, host);
  // A detached dialog's late cancel event cannot invoke an old callback again.
  dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
  value.close();
  assert.equal(cancelled, 1);
  host.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(underlyingEscape, 1);
});

test('keyboard focus wraps across visible controls, skipping hidden ready and error actions', () => {
  modal().open({ onCancel() {} });
  const first = element('.rhw-close');
  const last = element<HTMLAnchorElement>('.rhw-footer > a');
  first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, last);
  last.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(dom.window.document.activeElement, first);
});

test('restores an explicit disabled trigger after host settlement, including an idempotent second close', async () => {
  const frames: FrameRequestCallback[] = [];
  Object.defineProperty(dom.window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => frames.push(callback),
  });
  const host = element<HTMLButtonElement>('#host-connect');
  host.focus();
  host.disabled = true;
  const value = modal();
  value.open({
    returnFocus: host,
    onCancel() {
      // The provider closes the same modal after its own cancellation cleanup.
      value.close();
      queueMicrotask(() => { host.disabled = false; });
    },
  });
  element<HTMLButtonElement>('.rhw-close').click();
  assert.equal(dom.window.document.activeElement, dom.window.document.body);
  assert.equal(frames.length, 1);
  await Promise.resolve();
  frames.shift()!(0);
  assert.equal(dom.window.document.activeElement, host);
});

test('deferred focus restoration cannot steal focus from another control or a newer dialog', () => {
  const frames: FrameRequestCallback[] = [];
  Object.defineProperty(dom.window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => frames.push(callback),
  });
  const host = element<HTMLButtonElement>('#host-connect');
  host.disabled = true;
  const other = dom.window.document.createElement('button');
  other.textContent = 'Another action';
  dom.window.document.body.append(other);
  const value = modal();
  value.open({ returnFocus: host, onCancel() {} });
  value.close();
  host.disabled = false;
  other.focus();
  frames.shift()!(0);
  assert.equal(dom.window.document.activeElement, other);

  host.disabled = true;
  value.open({ returnFocus: host, onCancel() {} });
  value.close();
  const oldFrame = frames.shift()!;
  const newer = modal();
  newer.open({ onCancel() {} });
  host.disabled = false;
  oldFrame(0);
  assert.equal(dom.window.document.activeElement, element('.rhw-close'));
});

test('opening another connection cancels the previous attempt and keeps one dialog', () => {
  let firstCancelled = 0;
  let secondCancelled = 0;
  const first = modal();
  const second = modal();
  first.open({ onCancel() { firstCancelled++; } });
  const previousDialog = element('dialog');
  second.open({ onCancel() { secondCancelled++; } });
  assert.equal(firstCancelled, 1);
  assert.equal(previousDialog.isConnected, false);
  assert.equal(dom.window.document.querySelectorAll('dialog').length, 1);
  second.open({ onCancel() {} });
  assert.equal(secondCancelled, 1);
  assert.equal(dom.window.document.querySelectorAll('dialog').length, 1);
});

test('ready exposes a locally rendered QR, native app link, and copy success; failure clears the link', async () => {
  stubQr();
  const copied: string[] = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { async writeText(text: string) { copied.push(text); } },
  });
  const value = modal();
  value.open({ onCancel() {} });
  await value.ready(uri);
  assert.equal(element('.rhw-stage').getAttribute('aria-busy'), 'false');
  assert.equal(element('.rhw-ready').hidden, false);
  assert.equal(element('canvas').getAttribute('role'), 'img');
  assert.match(element('canvas').getAttribute('aria-label') ?? '', /Scan this connection code/);
  assert.equal(element<HTMLAnchorElement>('.rhw-app').href, getRobinhoodUri(uri));
  element<HTMLButtonElement>('.rhw-copy').click();
  await settle();
  assert.deepEqual(copied, [uri]);
  assert.match(element('[role="status"]').textContent ?? '', /Connection link copied/);
  const renderedCanvas = element<HTMLCanvasElement>('canvas');
  value.fail('The connection expired.');
  assert.equal(renderedCanvas.width, 0);
  assert.equal(renderedCanvas.height, 0);
  assert.equal(dom.window.document.querySelector('canvas'), null);
  assert.equal(element('.rhw-app').hasAttribute('href'), false);
  assert.equal(element('.rhw-failed').hidden, false);
  assert.equal(element('.rhw-retry').hidden, true);
  assert.match(element('.rhw-error-hint').textContent ?? '', /select Robinhood Wallet again/);
  assert.equal(dom.window.document.activeElement, element('.rhw-dismiss'));
});

test('late QR completion cannot update a reopened dialog or retain its old canvas', async () => {
  const renders: Array<{ canvas: HTMLCanvasElement; resolve: (canvas: HTMLCanvasElement) => void }> = [];
  mock.method(QRCode, 'toCanvas', (canvas: HTMLCanvasElement) => new Promise<HTMLCanvasElement>((resolve) => {
    canvas.width = canvas.height = 280;
    renders.push({ canvas, resolve });
  }));
  const value = modal();
  value.open({ onCancel() {} });
  const stale = value.ready(uri);
  value.close();
  value.open({ onCancel() {} });
  const fresh = value.ready(secondUri);
  renders[1]!.resolve(renders[1]!.canvas);
  await fresh;
  renders[0]!.resolve(renders[0]!.canvas);
  await stale;
  assert.equal(element('canvas'), renders[1]!.canvas);
  assert.equal(element<HTMLAnchorElement>('.rhw-app').href, getRobinhoodUri(secondUri));
  assert.equal(renders[0]!.canvas.width, 0);
  assert.equal(renders[0]!.canvas.height, 0);
  value.close();
  assert.equal(renders[1]!.canvas.width, 0);
});

test('rejects invalid pairing links before QR rendering or assigning a link', async () => {
  const render = mock.method(QRCode, 'toCanvas', async () => { throw new Error('Must not render.'); });
  const value = modal();
  value.open({ onCancel() {} });
  await assert.rejects(value.ready('javascript:alert(1)'), /Invalid WalletConnect/);
  assert.equal(render.mock.callCount(), 0);
  assert.equal(element('.rhw-app').hasAttribute('href'), false);
  value.fail('<img src=x onerror=alert(1)>');
  assert.equal(element('.rhw-error-detail').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(element('.rhw-error-detail').children.length, 0);
});

test('copy failures are actionable and late clipboard completion cannot overwrite a new view', async () => {
  stubQr();
  const value = modal();
  value.open({ onCancel() {} });
  await value.ready(uri);
  element<HTMLButtonElement>('.rhw-copy').click();
  await settle();
  assert.match(element('[role="status"]').textContent ?? '', /Could not copy the link/);
  assert.equal(element<HTMLButtonElement>('.rhw-copy').disabled, false);
  let finishCopy!: () => void;
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => new Promise<void>((resolve) => { finishCopy = resolve; }) },
  });
  element<HTMLButtonElement>('.rhw-copy').click();
  value.fail('The connection expired.');
  finishCopy();
  await settle();
  assert.match(element('[role="status"]').textContent ?? '', /Connection failed/);
  assert.equal(element('.rhw-failed').hidden, false);
});

test('custom-host retry closes and clears the old view before invoking its callback', async () => {
  stubQr();
  let cancelled = 0;
  let retried = 0;
  const value = modal();
  value.open({
    onCancel() { cancelled++; },
    onRetry() {
      retried++;
      assert.equal(dom.window.document.querySelector('dialog'), null);
      value.open({ onCancel() {} });
    },
  });
  await value.ready(uri);
  value.fail('The wallet declined the connection.');
  assert.equal(element('.rhw-retry').hidden, false);
  element<HTMLButtonElement>('.rhw-retry').click();
  assert.equal(retried, 1);
  assert.equal(cancelled, 0);
  assert.equal(element('.rhw-loading').hidden, false);
  assert.equal(element('.rhw-app').hasAttribute('href'), false);
  assert.equal(dom.window.document.querySelector('canvas'), null);
});
