import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';
import QRCode from 'qrcode';
import { RobinhoodModal } from '../packages/core/src/modal.js';
import { getRobinhoodUri } from '../packages/core/src/metadata.js';

// Synthetic, nonfunctional pairing material. No wallet or relay is contacted.
const uri = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;
const secondUri = `wc:${'c'.repeat(64)}@2?relay-protocol=irn&symKey=${'d'.repeat(64)}`;
const HOST_TAG = 'rhw-connector';
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
let dom: JSDOM;
let modals: RobinhoodModal[];

function modal(): RobinhoodModal {
  const value = new RobinhoodModal();
  modals.push(value);
  return value;
}

/** The dialog renders inside its host's shadow root; page nodes stay in the light tree. */
function query<T extends Element = HTMLElement>(selector: string): T | null {
  return dom.window.document.querySelector(HOST_TAG)?.shadowRoot?.querySelector<T>(selector) ?? dom.window.document.querySelector<T>(selector);
}

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const result = query<T>(selector);
  assert.ok(result, `Expected element matching ${selector}.`);
  return result;
}

/** The focused element, including focus inside shadow roots. */
function focused(): Element | null {
  let active = dom.window.document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

function key(target: Element, init: KeyboardEventInit): KeyboardEvent {
  // Browser keyboard events are composed, so they cross the dialog's shadow boundary.
  const event = new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
  target.dispatchEvent(event);
  return event;
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
  assert.match(element(`#${dialog.getAttribute('aria-describedby')}`).textContent ?? '', /Scan with Robinhood Wallet/);
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.lang, 'en');
  assert.equal(element('.rhw-stage').getAttribute('aria-busy'), 'true');
  assert.equal(focused(), element('.rhw-close'));
  const escape = key(element('.rhw-close'), { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(underlyingEscape, 0);
  assert.equal(cancelled, 1);
  assert.equal(dom.window.document.querySelector(HOST_TAG), null);
  assert.equal(dom.window.document.activeElement, host);
  // A detached dialog's late cancel event cannot invoke an old callback again.
  dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
  value.close();
  assert.equal(cancelled, 1);
  key(host, { key: 'Escape' });
  assert.equal(underlyingEscape, 1);
});

test('renders inside an isolating shadow root and adds only its host to the page', () => {
  modal().open({ onCancel() {} });
  const host = dom.window.document.querySelector(HOST_TAG);
  assert.ok(host?.shadowRoot, 'Expected an open shadow root for the dialog.');
  assert.equal(host.parentElement, dom.window.document.body);
  // Host page selectors cannot reach any dialog node or style rule.
  assert.equal(dom.window.document.querySelector('dialog, button.rhw-close, canvas, style'), null);
  assert.equal(host.shadowRoot.querySelector('dialog')?.className, 'rhw-connector-dialog');
  assert.match(host.shadowRoot.querySelector('style')?.textContent ?? '', /:host \{ all: initial !important; display: contents !important; \}/);
});

test('keyboard focus wraps across visible controls, skipping hidden ready and error actions', () => {
  modal().open({ onCancel() {} });
  const first = element('.rhw-close');
  const last = element<HTMLAnchorElement>('.rhw-footer > a');
  key(first, { key: 'Tab', shiftKey: true });
  assert.equal(focused(), last);
  key(last, { key: 'Tab' });
  assert.equal(focused(), first);
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

test('restores focus to a control inside another open shadow root', () => {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const shadow = container.attachShadow({ mode: 'open' });
  const option = dom.window.document.createElement('button');
  option.textContent = 'Robinhood Wallet';
  shadow.append(option);
  option.focus();
  const value = modal();
  value.open({ onCancel() {} });
  assert.equal(focused(), element('.rhw-close'));
  value.close();
  assert.equal(focused(), option);
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
  assert.equal(focused(), element('.rhw-close'));
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
  assert.equal(dom.window.document.querySelectorAll(HOST_TAG).length, 1);
  second.open({ onCancel() {} });
  assert.equal(secondCancelled, 1);
  assert.equal(dom.window.document.querySelectorAll(HOST_TAG).length, 1);
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
  assert.equal(query('canvas'), null);
  assert.equal(element('.rhw-app').hasAttribute('href'), false);
  assert.equal(element('.rhw-failed').hidden, false);
  assert.equal(element('.rhw-retry').hidden, true);
  assert.match(element('.rhw-error-hint').textContent ?? '', /select Robinhood Wallet again/);
  assert.equal(focused(), element('.rhw-dismiss'));
});

test('QR resolution follows device pixel ratio and leaves its square display size to the dialog', async () => {
  const widths: number[] = [];
  mock.method(QRCode, 'toCanvas', async (canvas: HTMLCanvasElement, _text: string, options: { width: number }) => {
    widths.push(options.width);
    // Mirror qrcode's renderer, which pins the backing size and an inline CSS size.
    canvas.width = canvas.height = options.width;
    canvas.style.width = canvas.style.height = `${options.width}px`;
    return canvas;
  });
  Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 2 });
  const value = modal();
  value.open({ onCancel() {} });
  await value.ready(uri);
  const canvas = element<HTMLCanvasElement>('canvas');
  assert.equal(canvas.width, 560);
  assert.equal(canvas.style.width, '');
  assert.equal(canvas.style.height, '');
  Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 9 });
  await value.ready(secondUri);
  Object.defineProperty(dom.window, 'devicePixelRatio', { configurable: true, value: 0 });
  await value.ready(uri);
  assert.deepEqual(widths, [560, 840, 280]);
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
      assert.equal(dom.window.document.querySelector(HOST_TAG), null);
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
  assert.equal(query('canvas'), null);
});
