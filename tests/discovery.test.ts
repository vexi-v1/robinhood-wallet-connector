import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {discoverRobinhood} from '../packages/core/src/discovery.js';
import {getRobinhoodUri} from '../packages/core/src/metadata.js';

function provider(flag = false) {return {isRobinhoodMobileWallet: flag, request: async () => {throw new Error('Discovery must never request accounts');}, on() {}, removeListener() {}};}
async function browser(run: (dom: JSDOM) => Promise<void>) {
  const dom = new JSDOM('', {url: 'https://example.test'});
  const previous = {window: globalThis.window, Event: globalThis.Event};
  Object.assign(globalThis, {window: dom.window, Event: dom.window.Event});
  try {await run(dom);} finally {Object.assign(globalThis, previous); dom.window.close();}
}

test('EIP-6963 exact rdns announcement wins over unrelated injected providers without requesting accounts', async () => browser(async (dom) => {
  const robinhood = provider();
  (dom.window as unknown as {ethereum: unknown}).ethereum = provider();
  const announce = () => {
    dom.window.dispatchEvent(new dom.window.CustomEvent('eip6963:announceProvider', {detail: {info: {rdns: 'com.other.wallet'}, provider: provider()}}));
    dom.window.dispatchEvent(new dom.window.CustomEvent('eip6963:announceProvider', {detail: {info: {rdns: 'com.robinhood.wallet'}, provider: robinhood}}));
  };
  dom.window.addEventListener('eip6963:requestProvider', announce);
  assert.equal(await discoverRobinhood(new AbortController().signal, 20), robinhood);
}));

test('late discovery inside the bounded discovery window is selected', async () => browser(async (dom) => {
  const robinhood = provider();
  const pending = discoverRobinhood(new AbortController().signal, 40);
  setTimeout(() => dom.window.dispatchEvent(new dom.window.CustomEvent('eip6963:announceProvider', {detail: {info: {rdns: 'com.robinhood.wallet'}, provider: robinhood}})), 5);
  assert.equal(await pending, robinhood);
}));

test('legacy fallback requires exact published flag and a valid request/event interface', async () => browser(async (dom) => {
  const robinhood = provider(true); const fake = {isRobinhoodMobileWallet: true};
  (dom.window as unknown as {ethereum: unknown}).ethereum = {providers: [provider(), fake, robinhood]};
  assert.equal(await discoverRobinhood(new AbortController().signal, 1), robinhood);
  (dom.window as unknown as {ethereum: unknown}).ethereum = {...provider(), isRobinhood: true};
  assert.equal(await discoverRobinhood(new AbortController().signal, 1), undefined);
}));

test('aborted discovery settles promptly and ignores later matching announcements', async () => browser(async (dom) => {
  const controller = new AbortController(); const pending = discoverRobinhood(controller.signal, 500);
  controller.abort(); assert.equal(await pending, undefined);
  dom.window.dispatchEvent(new dom.window.CustomEvent('eip6963:announceProvider', {detail: {info: {rdns: 'com.robinhood.wallet'}, provider: provider()}}));
}));

test('native app links encode a valid WCv2 URI and reject arbitrary schemes or malformed secrets', () => {
  const uri = `wc:${'0'.repeat(64)}@2?relay-protocol=irn&symKey=${'1'.repeat(64)}`;
  assert.equal(getRobinhoodUri(uri), `robinhood-wallet://wc?uri=${encodeURIComponent(uri)}`);
  for (const invalid of ['javascript:alert(1)', 'https://example.test', 'wc:foo@2?relay-protocol=irn', uri.replace('irn', 'unknown')]) assert.throws(() => getRobinhoodUri(invalid), {code: -32602});
});
