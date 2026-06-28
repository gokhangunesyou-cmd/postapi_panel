/**
 * PostAPI Panel — Internationalization Helper
 *
 * Manages language detection, string translation, RTL support,
 * and locale-aware formatting for en / tr / ar.
 *
 * KEY DESIGN: We load _locales/<lang>/messages.json at runtime via fetch so
 * that the user-selected language is always respected. We do NOT rely on
 * chrome.i18n.getMessage() which is permanently bound to the browser's UI
 * language and cannot be changed at runtime.
 *
 * @module lib/i18n
 */

import { STORAGE_KEYS } from './constants.js';

// ─── Supported Languages ──────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', name: 'English',  nativeName: 'English',    dir: 'ltr' },
  { code: 'tr', name: 'Turkish',  nativeName: 'Türkçe',     dir: 'ltr' },
  { code: 'ar', name: 'Arabic',   nativeName: 'العربية',    dir: 'rtl' },
]);

/** Quick lookup map */
const LANG_MAP = Object.freeze(
  SUPPORTED_LANGUAGES.reduce((acc, l) => {
    acc[l.code] = l;
    return acc;
  }, {})
);

// ─── Inline Fallback Strings (English) ────────────────────────────────────────
// Used only if the locale JSON cannot be fetched (e.g. offline / missing key).

const FALLBACK_EN = {
  app_name:       'PostAPI Panel',
  extName:        'PostAPI Panel',
  send:           'Send',
  save:           'Save',
  cancel:         'Cancel',
  delete:         'Delete',
  edit:           'Edit',
  close:          'Close',
  loading:        'Loading…',
  error:          'Error',
  success:        'Settings saved',
  settings:       'Settings',
  collections:    'Collections',
  history:        'History',
  environments:   'Environments',
  headers:        'Headers',
  cookies:        'Cookies',
  body:           'Body',
  params:         'Params',
  auth:           'Auth',
  assertions:     'Assertions',
  response:       'Response',
  timeline:       'Timeline',
  no_results:     'No results found',
  confirm_delete: 'Are you sure you want to delete this?',
  formatJson:     'Format JSON',
  invalidJson:    'Invalid JSON: Cannot parse request body',
};

// ─── I18nManager ───────────────────────────────────────────────────────────────

class I18nManager {
  constructor() {
    /** @type {string} current language code */
    this._language = 'en';
    /** @type {boolean} whether init() has been called */
    this._initialised = false;
    /**
     * Runtime-loaded locale message maps.
     * Structure: { en: { key: { message: '...' } }, tr: { ... }, ar: { ... } }
     * @type {Object.<string, Object.<string, {message: string}>>}
     */
    this._catalog = {};
  }

  // ── Initialization ──────────────────────────────────────────────────────

  /**
   * Initialise the i18n system.
   * Loads all locale files, applies direction, and translates the page.
   * @param {HTMLElement} [root=document.documentElement]
   */
  async init(root) {
    this._language = await this._getSavedLanguage();

    // Pre-load all locale catalogs in parallel so switching is instant
    await Promise.all(
      SUPPORTED_LANGUAGES.map(l => this._loadCatalog(l.code))
    );

    this.applyDirection(this._language);
    this.translatePage(root);
    this._initialised = true;
  }

  // ── Catalog Loading ─────────────────────────────────────────────────────

  /**
   * Fetch and cache the messages.json for the given language.
   * @param {string} lang
   */
  async _loadCatalog(lang) {
    if (this._catalog[lang]) return; // already loaded

    try {
      let url;
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
      } else {
        // Dev / non-extension context
        url = `../_locales/${lang}/messages.json`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._catalog[lang] = await res.json();
    } catch (err) {
      console.warn(`[I18nManager] Could not load locale for "${lang}":`, err);
      this._catalog[lang] = {}; // empty so we won't retry endlessly
    }
  }

  // ── Message Retrieval ───────────────────────────────────────────────────

  /**
   * Get a translated message by key for the **currently selected language**.
   * Priority: runtime catalog → English catalog → inline fallback → key itself.
   * @param {string} key
   * @param {string|string[]} [substitutions]
   * @returns {string}
   */
  getMessage(key, substitutions) {
    if (!key) return '';

    // 1. Runtime catalog for the selected language
    const entry = this._catalog[this._language]?.[key];
    if (entry?.message) {
      return this._substitute(entry.message, substitutions);
    }

    // 2. English catalog fallback
    const enEntry = this._catalog['en']?.[key];
    if (enEntry?.message) {
      return this._substitute(enEntry.message, substitutions);
    }

    // 3. Inline English strings (always available, no network needed)
    if (FALLBACK_EN[key]) {
      return this._substitute(FALLBACK_EN[key], substitutions);
    }

    // 4. Return the key itself so at least something is visible
    return key;
  }

  /**
   * Replace $1, $2, … placeholders in a string.
   * @param {string} str
   * @param {string|string[]|undefined} substitutions
   * @returns {string}
   */
  _substitute(str, substitutions) {
    if (!substitutions) return str;
    const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
    return subs.reduce(
      (s, val, i) => s.replace(new RegExp(`\\$${i + 1}`, 'g'), val),
      str
    );
  }

  // ── Language Management ─────────────────────────────────────────────────

  /**
   * Read the user's saved language preference from chrome.storage.
   * Falls back to 'en' if nothing is stored.
   * @returns {Promise<string>}
   */
  async _getSavedLanguage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await new Promise(resolve =>
          chrome.storage.sync.get([STORAGE_KEYS.SETTINGS], resolve)
        );
        const saved = result[STORAGE_KEYS.SETTINGS]?.language;
        if (saved && LANG_MAP[saved]) return saved;
      }
    } catch (err) {
      console.warn('[I18nManager] Could not read language from storage:', err);
    }
    return 'en';
  }

  /**
   * Change the active language.
   * Persists to sync storage, updates direction, and re-translates the page.
   * @param {string} lang — language code (en|tr|ar)
   */
  async setLanguage(lang) {
    if (!LANG_MAP[lang]) {
      console.warn(`[I18nManager] Unsupported language: "${lang}"`);
      return;
    }

    this._language = lang;

    // Ensure catalog is loaded (should already be from init)
    await this._loadCatalog(lang);

    // Persist preference
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await new Promise(resolve =>
          chrome.storage.sync.get([STORAGE_KEYS.SETTINGS], resolve)
        );
        const settings = result[STORAGE_KEYS.SETTINGS] || {};
        settings.language = lang;
        await new Promise(resolve =>
          chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve)
        );
      }
    } catch (err) {
      console.error('[I18nManager] Failed to save language preference:', err);
    }

    this.applyDirection(lang);
    this.translatePage(document);
  }

  /**
   * Get list of supported languages with metadata.
   * @returns {Array<{code:string, name:string, nativeName:string, dir:string}>}
   */
  getSupportedLanguages() {
    return [...SUPPORTED_LANGUAGES];
  }

  // ── Page Translation ────────────────────────────────────────────────────

  /**
   * Translate all elements with a `data-i18n` attribute inside `root`.
   * @param {Document|HTMLElement} [root=document]
   */
  translatePage(root) {
    const container = root || (typeof document !== 'undefined' ? document : null);
    if (!container) return;

    const qs = (sel) =>
      container.querySelectorAll ? container.querySelectorAll(sel) : [];

    // Text content
    qs('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = this.getMessage(key);
    });

    // Placeholder
    qs('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = this.getMessage(key);
    });

    // Title / tooltip
    qs('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = this.getMessage(key);
    });

    // Aria-label
    qs('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', this.getMessage(key));
    });
  }

  // ── Direction ───────────────────────────────────────────────────────────

  /**
   * Apply text direction (ltr/rtl) to the document based on language.
   * @param {string} lang
   */
  applyDirection(lang) {
    const langMeta = LANG_MAP[lang];
    const dir = langMeta?.dir || 'ltr';

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', lang);
    }
  }

  // ── Locale-Aware Formatting ─────────────────────────────────────────────

  /**
   * Format a Date object according to the current language locale.
   * @param {Date|number|string} date
   * @param {string} [lang]
   * @param {Intl.DateTimeFormatOptions} [options]
   * @returns {string}
   */
  formatDate(date, lang, options) {
    const locale = lang || this._language;
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return String(date);

    const defaults = {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    };

    try {
      return new Intl.DateTimeFormat(locale, options || defaults).format(d);
    } catch {
      return d.toLocaleString();
    }
  }

  /**
   * Format a number according to the current language locale.
   * @param {number} num
   * @param {string} [lang]
   * @param {Intl.NumberFormatOptions} [options]
   * @returns {string}
   */
  formatNumber(num, lang, options) {
    const locale = lang || this._language;
    try {
      return new Intl.NumberFormat(locale, options).format(num);
    } catch {
      return String(num);
    }
  }

  // ── Convenience Getters ─────────────────────────────────────────────────

  /** Current language code */
  get language() { return this._language; }

  /** Current direction */
  get direction() { return LANG_MAP[this._language]?.dir || 'ltr'; }

  /** Whether current language is RTL */
  get isRTL() { return this.direction === 'rtl'; }
}

// ─── Singleton Export ──────────────────────────────────────────────────────────

/** @type {I18nManager} */
const i18n = new I18nManager();

if (typeof window !== 'undefined') {
  window.i18n = i18n;
}

export default i18n;
export { I18nManager, SUPPORTED_LANGUAGES };
