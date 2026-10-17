import QRCode from 'qrcode';
import { getRobinhoodUri, ROBINHOOD_WALLET } from './metadata.js';
import { focusedElement } from './state.js';
import type { ConnectionModal } from './types.js';

type ModalOptions = Parameters<ConnectionModal['open']>[0];
type ModalState = 'loading' | 'ready' | 'error';

let activeModal: RobinhoodModal | undefined;
let nextId = 0;

/** The only light DOM node the dialog adds; it hosts an isolating shadow root. */
const HOST_TAG = 'rhw-connector';
/** Displayed QR edge in CSS pixels; the canvas backing store follows devicePixelRatio. */
const QR_SIZE = 280;

const styles = `
:host { all: initial !important; display: contents !important; }
.rhw-connector-dialog, .rhw-connector-dialog * { box-sizing: border-box; }
.rhw-connector-dialog {
  color-scheme: light; position: fixed; inset: 0; margin: auto;
  width: min(420px, calc(100vw - 32px)); max-width: 420px;
  max-height: calc(100dvh - 32px); padding: 28px; border: 1px solid #e6e8e2;
  border-radius: 28px; background: #fff; color: #181a15;
  box-shadow: 0 28px 100px #0003; overflow: auto; overscroll-behavior: contain;
  font: 400 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  letter-spacing: normal; word-spacing: normal; text-transform: none; text-indent: 0; text-shadow: none;
  text-align: left; white-space: normal; visibility: visible; cursor: auto; -webkit-font-smoothing: antialiased;
}
.rhw-connector-dialog:not([open]), .rhw-connector-dialog [hidden] { display: none !important; }
.rhw-connector-dialog::backdrop { background: #11150fc2; backdrop-filter: blur(5px); }
.rhw-connector-dialog button, .rhw-connector-dialog a { -webkit-tap-highlight-color: transparent; }
.rhw-connector-dialog button { margin: 0; font: inherit; color: inherit; cursor: pointer; }
.rhw-connector-dialog a { color: inherit; }
.rhw-connector-dialog :focus-visible { outline: 3px solid #487600; outline-offset: 4px; }
.rhw-connector-dialog .rhw-header { display: flex; align-items: center; gap: 11px; }
.rhw-connector-dialog .rhw-icon { width: 40px; height: 40px; border-radius: 12px; display: block; }
.rhw-connector-dialog .rhw-brand { flex: 1; font-size: 15px; font-weight: 650; letter-spacing: -.3px; }
.rhw-connector-dialog .rhw-close {
  display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; padding: 0;
  border: 0; border-radius: 50%; background: #f2f3ef; color: #464b40;
}
.rhw-connector-dialog .rhw-close:hover { background: #e5e8df; }
.rhw-connector-dialog svg { display: block; flex-shrink: 0; }
.rhw-connector-dialog .rhw-intro { margin-top: 28px; text-align: center; }
.rhw-connector-dialog h1 { margin: 0; font-size: 28px; line-height: 1.15; font-weight: 650; letter-spacing: -1px; }
.rhw-connector-dialog .rhw-description { margin: 12px 0 0; color: #60665a; font-size: 14px; line-height: 1.55; }
.rhw-connector-dialog .rhw-stage { margin-top: 24px; }
.rhw-connector-dialog .rhw-placeholder {
  min-height: 280px; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 18px; border-radius: 22px; background: #f5f6f2;
}
.rhw-connector-dialog .rhw-spinner {
  width: 38px; height: 38px; border: 3px solid #dfe6d3; border-top-color: #427900;
  border-radius: 50%; animation: rhw-connector-spin .8s linear infinite;
}
.rhw-connector-dialog .rhw-loading-label { margin: 0; color: #60665a; }
.rhw-connector-dialog .rhw-qr-frame {
  display: grid; place-items: center; padding: 12px;
  border: 1px solid #e8eae3; border-radius: 22px; background: #fff;
}
.rhw-connector-dialog .rhw-qr { width: 100%; }
.rhw-connector-dialog .rhw-qr canvas { display: block; width: min(100%, ${QR_SIZE}px); height: auto; aspect-ratio: 1; margin: auto; }
.rhw-connector-dialog .rhw-copy {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; margin: 12px 0 0; padding: 8px; min-height: 40px;
  border: 0; border-radius: 9px; color: #4b5143; background: transparent;
  font-size: 13px; font-weight: 550;
}
.rhw-connector-dialog .rhw-copy:hover { background: #f4f6ee; }
.rhw-connector-dialog .rhw-copy:disabled { cursor: wait; opacity: .7; }
.rhw-connector-dialog .rhw-button {
  display: flex; justify-content: center; align-items: center; gap: 9px;
  width: 100%; min-height: 50px; padding: 12px 18px; border: 1px solid transparent;
  border-radius: 999px; background: #c3f53c; color: #172106; text-decoration: none;
  font-size: 14px; line-height: 1.4; font-weight: 650;
}
.rhw-connector-dialog .rhw-button:hover { background: #b4e82f; }
.rhw-connector-dialog .rhw-app { margin-top: 16px; }
.rhw-connector-dialog .rhw-secondary { margin-top: 10px; border-color: #e1e5da; background: #fff; color: #464c3e; }
.rhw-connector-dialog .rhw-secondary:hover { background: #f3f5ed; }
.rhw-connector-dialog .rhw-error {
  padding: 30px 22px; border: 1px solid #e6e8e2; border-radius: 22px;
  background: #f8f9f5; text-align: center;
}
.rhw-connector-dialog .rhw-error-mark {
  display: grid; place-items: center; margin: 0 auto 16px; width: 44px; height: 44px;
  border: 1px solid #d9decf; border-radius: 50%; color: #5c644f; font-size: 22px;
}
.rhw-connector-dialog .rhw-error-title { margin: 0; font-size: 17px; font-weight: 650; }
.rhw-connector-dialog .rhw-error-detail { margin: 8px 0 0; color: #60665a; overflow-wrap: anywhere; }
.rhw-connector-dialog .rhw-error-hint { margin: 16px 0 0; color: #60665a; font-size: 13px; }
.rhw-connector-dialog .rhw-error-actions { margin-top: 20px; }
.rhw-connector-dialog .rhw-status { margin: 18px 0 0; color: #60665a; font-size: 12px; text-align: center; }
.rhw-connector-dialog .rhw-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 24px; padding-top: 18px; border-top: 1px solid #eceee7;
  color: #686e5f; font-size: 12px;
}
.rhw-connector-dialog .rhw-footer a { text-underline-offset: 3px; font-weight: 550; }
.rhw-connector-dialog .rhw-footer a:hover { color: #172106; }
@keyframes rhw-connector-spin { to { transform: rotate(360deg); } }
@media (max-width: 480px) {
  .rhw-connector-dialog {
    inset: auto 0 0; margin: 0; width: 100%; max-width: none; max-height: calc(100dvh - 16px);
    border-radius: 26px 26px 0 0; padding: 24px 24px max(24px, env(safe-area-inset-bottom));
  }
  .rhw-connector-dialog .rhw-intro { margin-top: 24px; }
  .rhw-connector-dialog h1 { font-size: 27px; }
  .rhw-connector-dialog .rhw-qr canvas { max-width: 240px; }
  .rhw-connector-dialog .rhw-placeholder { min-height: 240px; }
}
@media (prefers-reduced-motion: reduce) { .rhw-connector-dialog .rhw-spinner { animation: none; } }
`;

const sheets = new WeakMap<object, CSSStyleSheet>();

/** Constructed stylesheets avoid inline style elements where the browser supports them. */
function adoptStyles(root: ShadowRoot): void {
  const view = root.ownerDocument.defaultView;
  const Sheet = view?.CSSStyleSheet;
  if (view && Sheet && 'adoptedStyleSheets' in root && typeof Sheet.prototype.replaceSync === 'function') {
    try {
      let sheet = sheets.get(view);
      if (!sheet) { sheet = new Sheet(); sheet.replaceSync(styles); sheets.set(view, sheet); }
      root.adoptedStyleSheets = [sheet];
      return;
    } catch { /* Fall back to a style element below. */ }
  }
  const style = root.ownerDocument.createElement('style');
  style.textContent = styles;
  root.append(style);
}

const copyIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';

/**
 * A framework-independent dialog. Construction and imports are safe during SSR.
 * The dialog lives in a shadow root, so host page CSS cannot restyle the QR or controls.
 */
export class RobinhoodModal implements ConnectionModal {
  private host: HTMLElement | undefined;
  private root: ShadowRoot | undefined;
  private dialog: HTMLDialogElement | undefined;
  private options: ModalOptions | undefined;
  private previousFocus: HTMLElement | undefined;
  private pairingUri: string | undefined;
  private generation = 0;
  private state: ModalState = 'loading';

  open(options: ModalOptions): void {
    if (typeof document === 'undefined') throw new Error('Robinhood Wallet connection requires a browser.');
    const host = document.createElement(HOST_TAG);
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function' || typeof host.attachShadow !== 'function') {
      throw new Error('This browser does not support wallet connection dialogs. Please update your browser.');
    }
    if (this.dialog) this.cancel();
    activeModal?.cancel();
    if (activeModal) throw new Error('A newer wallet connection dialog is already open.');
    this.options = options;
    this.previousFocus = options.returnFocus ?? focusedElement(document);
    const root = host.attachShadow({ mode: 'open' });
    adoptStyles(root);
    this.host = host;
    this.root = root;
    this.dialog = dialog;
    activeModal = this;
    const id = `rhw-connector-${++nextId}`;
    dialog.className = 'rhw-connector-dialog';
    dialog.lang = 'en';
    dialog.dir = 'ltr';
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-description`);
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `<header class="rhw-header">
        <img class="rhw-icon" alt="" width="40" height="40" />
        <span class="rhw-brand">Robinhood Wallet</span>
        <button class="rhw-close" type="button" aria-label="Cancel wallet connection" autofocus>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="rhw-intro">
        <h1 id="${id}-title">Connect your wallet</h1>
        <p class="rhw-description" id="${id}-description">Scan with Robinhood Wallet, or open<br />the app on this device.</p>
      </div>
      <div class="rhw-stage" aria-busy="true">
        <div class="rhw-loading rhw-placeholder">
          <span class="rhw-spinner" aria-hidden="true"></span>
          <p class="rhw-loading-label">Preparing your connection…</p>
        </div>
        <div class="rhw-ready" hidden>
          <div class="rhw-qr-frame"><div class="rhw-qr"></div></div>
          <button class="rhw-copy" type="button">${copyIcon}<span>Copy connection link</span></button>
          <a class="rhw-button rhw-app">Open Robinhood Wallet <span aria-hidden="true">↗</span></a>
        </div>
        <div class="rhw-failed" hidden>
          <div class="rhw-error">
            <span class="rhw-error-mark" aria-hidden="true">!</span>
            <p class="rhw-error-title">Connection wasn't completed</p>
            <p class="rhw-error-detail"></p>
            <p class="rhw-error-hint"></p>
          </div>
          <div class="rhw-error-actions">
            <button class="rhw-button rhw-retry" type="button" hidden>Try again</button>
            <button class="rhw-button rhw-dismiss" type="button">Close</button>
          </div>
        </div>
      </div>
      <p class="rhw-status" role="status" aria-live="polite" aria-atomic="true">Waiting for a secure connection link.</p>
      <footer class="rhw-footer"><span>Need a wallet? <a class="rhw-install" target="_blank" rel="noopener noreferrer">Get the app ↗</a></span><a href="https://robinhood.com/us/en/support/articles/connect-to-dapps/" target="_blank" rel="noopener noreferrer">Help ↗</a></footer>`;
    root.append(dialog);
    this.find<HTMLImageElement>('.rhw-icon').src = ROBINHOOD_WALLET.iconUrl;
    this.find<HTMLAnchorElement>('.rhw-install').href = ROBINHOOD_WALLET.downloadUrl;
    this.find<HTMLButtonElement>('.rhw-close').addEventListener('click', this.cancel);
    this.find<HTMLButtonElement>('.rhw-dismiss').addEventListener('click', this.cancel);
    this.find<HTMLButtonElement>('.rhw-copy').addEventListener('click', () => { void this.copyLink(); });
    this.find<HTMLButtonElement>('.rhw-retry').addEventListener('click', () => {
      const retry = this.options?.onRetry;
      this.close();
      retry?.();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    });
    // A window capture listener consumes Escape before underlying dialog handlers.
    document.defaultView?.addEventListener('keydown', this.onKeyDown, true);
    document.body.append(host);
    this.setState('loading');
    try {
      dialog.showModal();
      this.find<HTMLButtonElement>('.rhw-close').focus({ preventScroll: true });
    } catch (error) {
      this.close();
      throw error;
    }
  }

  async ready(uri: string): Promise<void> {
    const dialog = this.dialog;
    if (!dialog) return;
    const nativeUri = getRobinhoodUri(uri);
    const generation = ++this.generation;
    this.clearPayload();
    this.setState('loading');
    this.setStatus('Preparing a fresh connection code.');
    const canvas = dialog.ownerDocument.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Scan this connection code with Robinhood Wallet.');
    const pixelRatio = Math.min(Math.max(Number(dialog.ownerDocument.defaultView?.devicePixelRatio) || 1, 1), 3);
    try {
      await QRCode.toCanvas(canvas, uri, {
        width: Math.round(QR_SIZE * pixelRatio),
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#10120b', light: '#ffffff' },
      });
    } catch {
      canvas.width = canvas.height = 0;
      if (this.dialog !== dialog || this.generation !== generation) return;
      throw new Error('The connection code could not be displayed. Please try connecting again.');
    }
    if (this.dialog !== dialog || this.generation !== generation) {
      canvas.width = canvas.height = 0;
      return;
    }
    // The QR library pins inline pixel sizes; the dialog's square, responsive CSS sizes it instead.
    canvas.style.removeProperty('width');
    canvas.style.removeProperty('height');
    this.pairingUri = uri;
    this.find('.rhw-qr').replaceChildren(canvas);
    this.find<HTMLAnchorElement>('.rhw-app').href = nativeUri;
    this.find('.rhw-copy span').textContent = 'Copy connection link';
    this.find<HTMLButtonElement>('.rhw-copy').disabled = false;
    this.setState('ready');
    this.setStatus('Approve the connection in your wallet.');
  }

  fail(message: string): void {
    if (!this.dialog) return;
    ++this.generation;
    this.clearPayload();
    this.find('.rhw-error-detail').textContent = message.replace(/wc:[^\s]+/gi, '[connection link]').slice(0, 280);
    const canRetry = Boolean(this.options?.onRetry);
    this.find<HTMLButtonElement>('.rhw-retry').hidden = !canRetry;
    this.find('.rhw-error-hint').textContent = canRetry
      ? 'Try again to create a new connection.'
      : 'Close this window and select Robinhood Wallet again to retry.';
    this.find('.rhw-dismiss').classList.toggle('rhw-secondary', canRetry);
    this.setState('error');
    this.setStatus('Connection failed. Your connection link has been cleared.');
    this.find<HTMLButtonElement>(canRetry ? '.rhw-retry' : '.rhw-dismiss').focus({ preventScroll: true });
  }

  close(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    const generation = ++this.generation;
    const lastOpenedId = nextId;
    const previousFocus = this.previousFocus;
    const host = this.host;
    this.clearPayload();
    this.dialog = undefined;
    this.host = undefined;
    this.root = undefined;
    this.options = undefined;
    this.previousFocus = undefined;
    dialog.ownerDocument.defaultView?.removeEventListener('keydown', this.onKeyDown, true);
    if (activeModal === this) activeModal = undefined;
    if (dialog.open) dialog.close();
    host?.remove();
    const document = dialog.ownerDocument;
    const restoreFocus = () => {
      if (activeModal || nextId !== lastOpenedId || this.generation !== generation || !previousFocus?.isConnected) return;
      const focus = document.activeElement;
      // Do not override a user or host that has already chosen another control.
      if (focus && focus !== document.body && focus !== document.documentElement) return;
      previousFocus.focus({ preventScroll: true });
    };
    restoreFocus();
    // Hosts commonly enable their Connect button when the rejected promise settles.
    // Retry after those microtasks, while retaining the original attempt's ownership.
    if (previousFocus?.isConnected && focusedElement(document) !== previousFocus) {
      document.defaultView?.requestAnimationFrame?.(restoreFocus);
    }
  }

  private readonly cancel = (): void => {
    const onCancel = this.options?.onCancel;
    this.close();
    onCancel?.();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (activeModal !== this || !this.dialog?.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
      .filter((element) => !element.closest('[hidden]'));
    const first = focusable[0];
    const last = focusable.at(-1);
    const focus = this.root?.activeElement ?? null;
    if (event.shiftKey && (focus === first || !this.dialog.contains(focus))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (focus === last || !this.dialog.contains(focus))) {
      event.preventDefault();
      first?.focus();
    }
  };

  private find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.dialog?.querySelector<T>(selector);
    if (!element) throw new Error('The wallet connection dialog is not open.');
    return element;
  }

  private setState(state: ModalState): void {
    this.state = state;
    this.find('.rhw-loading').hidden = state !== 'loading';
    this.find('.rhw-ready').hidden = state !== 'ready';
    this.find('.rhw-failed').hidden = state !== 'error';
    this.find('.rhw-stage').setAttribute('aria-busy', String(state === 'loading'));
  }

  private setStatus(text: string): void {
    this.find('.rhw-status').textContent = text;
  }

  private clearPayload(): void {
    this.pairingUri = undefined;
    const canvas = this.dialog?.querySelector('canvas');
    if (canvas) canvas.width = canvas.height = 0;
    this.dialog?.querySelector('.rhw-qr')?.replaceChildren();
    this.dialog?.querySelector('.rhw-app')?.removeAttribute('href');
  }

  private async copyLink(): Promise<void> {
    if (!this.dialog || !this.pairingUri || this.state !== 'ready') return;
    const generation = this.generation;
    const dialog = this.dialog;
    const button = this.find<HTMLButtonElement>('.rhw-copy');
    button.disabled = true;
    try {
      const clipboard = dialog.ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('Clipboard unavailable.');
      await clipboard.writeText(this.pairingUri);
      if (this.dialog !== dialog || this.generation !== generation) return;
      this.find('.rhw-copy span').textContent = 'Connection link copied';
      this.setStatus('Connection link copied. Only share it with your wallet.');
    } catch {
      if (this.dialog !== dialog || this.generation !== generation) return;
      this.setStatus('Could not copy the link. Scan the code or open the app to connect.');
    } finally {
      if (this.dialog === dialog && this.generation === generation) button.disabled = false;
    }
  }
}
