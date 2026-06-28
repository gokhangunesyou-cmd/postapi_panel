/**
 * PostAPI Panel — Cookie Manager Component
 * Inspects, adds, edits, and deletes cookies for domains/current tab using chrome.cookies API.
 */

import { showToast } from './toast.js';

class CookieManager extends HTMLElement {
  constructor() {
    super();
    this._cookies = [];
    this._domain = '';
  }

  connectedCallback() {
    this.render();
    this._getCurrentTabDomain().then(domain => {
      if (domain) {
        this._domain = domain;
        const input = this.querySelector('#cookie-domain-input');
        if (input) input.value = domain;
        this.refresh();
      }
    });
  }

  async _getCurrentTabDomain() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].url) {
            try {
              const url = new URL(tabs[0].url);
              resolve(url.hostname);
            } catch {
              resolve('');
            }
          } else {
            resolve('');
          }
        });
      } else {
        resolve('');
      }
    });
  }

  async refresh() {
    if (!this._domain) return;
    
    this._cookies = [];
    this._renderListOnly();

    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.getAll({ domain: this._domain }, (cookies) => {
        this._cookies = cookies || [];
        this._renderListOnly();
      });
    } else {
      console.warn('chrome.cookies API not available in this context');
    }
  }

  render() {
    this.innerHTML = `
      <div class="cookie-manager-container flex flex-col h-full p-3 gap-3" style="background-color: var(--bg-panel);">
        <!-- Domain filter input -->
        <div class="flex items-center gap-2">
          <span class="font-medium text-secondary" style="font-size: 12px;">Domain:</span>
          <input type="text" class="input font-mono flex-1" id="cookie-domain-input" placeholder="e.g. example.com" value="${this._domain}" style="height: 28px; font-size: 11px;">
          <button class="btn btn-ghost btn-sm" id="btn-refresh-cookies" style="height: 28px; font-size: 11px;">Refresh</button>
          <button class="btn btn-primary btn-sm" id="btn-add-cookie-modal" style="height: 28px; font-size: 11px;">+ Cookie</button>
        </div>

        <div class="divider-horizontal" style="height: 1px; background-color: var(--border);"></div>

        <!-- Cookies Table List -->
        <div class="flex-1 overflow-y-auto" style="background-color: var(--bg-main); border: 1px solid var(--border); border-radius: var(--radius-md);">
          <div id="cookies-table-container"></div>
        </div>

        <!-- Add/Edit Modal (Embedded in HTML hidden) -->
        <postapi-modal id="modal-cookie-editor" title="Add Cookie"></postapi-modal>
      </div>
    `;

    this._setupUIListeners();
  }

  _setupUIListeners() {
    // Refresh click
    const refreshBtn = this.querySelector('#btn-refresh-cookies');
    refreshBtn.addEventListener('click', () => {
      const input = this.querySelector('#cookie-domain-input');
      this._domain = input.value.trim();
      this.refresh();
    });

    // Domain change keypress Enter
    const input = this.querySelector('#cookie-domain-input');
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this._domain = input.value.trim();
        this.refresh();
      }
    });

    // Add Cookie modal trigger
    const addBtn = this.querySelector('#btn-add-cookie-modal');
    addBtn.addEventListener('click', () => {
      this._showCookieEditorModal();
    });
  }

  _renderListOnly() {
    const container = this.querySelector('#cookies-table-container');
    if (!container) return;

    if (!this._domain) {
      container.innerHTML = `
        <div class="text-muted p-4 text-center" style="font-size: 12px; margin-top: 20px;">
          Enter a domain name to list cookies.
        </div>
      `;
      return;
    }

    if (this._cookies.length === 0) {
      container.innerHTML = `
        <div class="text-muted p-4 text-center" style="font-size: 12px; margin-top: 20px;">
          No cookies found for domain "${this._domain}".
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="table" style="width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 11px;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border); text-align: left; background-color: var(--bg-panel); color: var(--text-secondary);">
            <th style="padding: 8px;">Name</th>
            <th style="padding: 8px;">Value</th>
            <th style="padding: 8px;">Path</th>
            <th style="padding: 8px; text-align: center;">Secure</th>
            <th style="padding: 8px; text-align: center;">HttpOnly</th>
            <th style="padding: 8px; text-align: center;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${this._cookies.map(cookie => `
            <tr style="border-bottom: 1px solid var(--border);" class="hover:bg-hover">
              <td style="padding: 8px; font-weight: 600; color: var(--primary); user-select: all;">${this._escapeHtml(cookie.name)}</td>
              <td style="padding: 8px; color: var(--text-primary); user-select: all; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this._escapeHtml(cookie.value)}">${this._escapeHtml(cookie.value)}</td>
              <td style="padding: 8px; color: var(--text-muted);">${this._escapeHtml(cookie.path)}</td>
              <td style="padding: 8px; text-align: center;">${cookie.secure ? '✅' : '❌'}</td>
              <td style="padding: 8px; text-align: center;">${cookie.httpOnly ? '✅' : '❌'}</td>
              <td style="padding: 8px; text-align: center;">
                <div class="flex items-center justify-center gap-1">
                  <button class="btn btn-ghost btn-icon btn-sm btn-edit-cookie" data-name="${this._escapeHtml(cookie.name)}" style="width: 18px; height: 18px; font-size: 10px;">✏️</button>
                  <button class="btn btn-ghost btn-icon btn-sm btn-delete-cookie" data-name="${this._escapeHtml(cookie.name)}" style="width: 18px; height: 18px; font-size: 10px; color: var(--error);">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Hook list buttons
    container.querySelectorAll('.btn-delete-cookie').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        this._deleteCookie(name);
      });
    });

    container.querySelectorAll('.btn-edit-cookie').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        const cookie = this._cookies.find(c => c.name === name);
        this._showCookieEditorModal(cookie);
      });
    });

    if (window.i18n) window.i18n.translatePage(container);
  }

  _showCookieEditorModal(cookie = null) {
    const modal = this.querySelector('#modal-cookie-editor');
    modal.title = cookie ? 'Edit Cookie' : 'Add Cookie';

    const isSecureChecked = cookie ? cookie.secure : true;
    const isHttpOnlyChecked = cookie ? cookie.httpOnly : false;

    modal.setBody(`
      <form id="cookie-editor-form" class="flex flex-col gap-3" style="font-size: 12px;">
        <div class="flex flex-col gap-1">
          <label class="font-medium text-secondary">Cookie Name</label>
          <input type="text" class="input font-mono" id="form-cookie-name" value="${cookie ? this._escapeHtml(cookie.name) : ''}" required ${cookie ? 'readonly' : ''} style="height: 28px;">
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-medium text-secondary">Cookie Value</label>
          <textarea class="textarea font-mono" id="form-cookie-value" style="height: 60px; padding: 6px;">${cookie ? this._escapeHtml(cookie.value) : ''}</textarea>
        </div>
        <div class="flex gap-2">
          <div class="flex flex-col gap-1 flex-1">
            <label class="font-medium text-secondary">Domain</label>
            <input type="text" class="input font-mono" id="form-cookie-domain" value="${cookie ? cookie.domain : this._domain}" required style="height: 28px;">
          </div>
          <div class="flex flex-col gap-1 flex-1">
            <label class="font-medium text-secondary">Path</label>
            <input type="text" class="input font-mono" id="form-cookie-path" value="${cookie ? cookie.path : '/'}" required style="height: 28px;">
          </div>
        </div>
        <div class="flex gap-4 my-1">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" id="form-cookie-secure" ${isSecureChecked ? 'checked' : ''}>
            <span>Secure</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" id="form-cookie-httponly" ${isHttpOnlyChecked ? 'checked' : ''}>
            <span>HttpOnly</span>
          </label>
        </div>
      </form>
    `);

    const footer = document.createElement('div');
    footer.className = 'flex gap-2 justify-end';
    footer.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-form-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="btn-form-submit">Save</button>
    `;

    modal.setFooter(footer);
    modal.open();

    // Hook modal events
    footer.querySelector('#btn-form-cancel').addEventListener('click', () => modal.close());
    footer.querySelector('#btn-form-submit').addEventListener('click', () => {
      const name = this.querySelector('#form-cookie-name').value.trim();
      const value = this.querySelector('#form-cookie-value').value.trim();
      const domain = this.querySelector('#form-cookie-domain').value.trim();
      const path = this.querySelector('#form-cookie-path').value.trim();
      const secure = this.querySelector('#form-cookie-secure').checked;
      const httpOnly = this.querySelector('#form-cookie-httponly').checked;

      if (!name || !domain) {
        showToast('Name and Domain are required fields', 'error');
        return;
      }

      this._saveCookie({ name, value, domain, path, secure, httpOnly });
      modal.close();
    });
  }

  _saveCookie(cookieDetails) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    // Build URL from domain for chrome.cookies.set
    const protocol = cookieDetails.secure ? 'https://' : 'http://';
    // Remove leading dot for URL construction if any
    const domainClean = cookieDetails.domain.startsWith('.') ? cookieDetails.domain.substring(1) : cookieDetails.domain;
    const url = `${protocol}${domainClean}${cookieDetails.path}`;

    const setDetails = {
      url,
      name: cookieDetails.name,
      value: cookieDetails.value,
      domain: cookieDetails.domain,
      path: cookieDetails.path,
      secure: cookieDetails.secure,
      httpOnly: cookieDetails.httpOnly
    };

    chrome.cookies.set(setDetails, (cookie) => {
      if (chrome.runtime.lastError) {
        showToast(`Failed to set cookie: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        showToast(`Cookie "${cookie.name}" saved!`, 'success');
        this.refresh();
      }
    });
  }

  _deleteCookie(name) {
    if (typeof chrome === 'undefined' || !chrome.cookies) return;

    if (confirm(`Delete cookie "${name}"?`)) {
      // Find cookie details to build exact URL
      const cookie = this._cookies.find(c => c.name === name);
      if (!cookie) return;

      const protocol = cookie.secure ? 'https://' : 'http://';
      const domainClean = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      const url = `${protocol}${domainClean}${cookie.path}`;

      chrome.cookies.remove({ url, name }, (details) => {
        if (chrome.runtime.lastError) {
          showToast(`Failed to delete cookie: ${chrome.runtime.lastError.message}`, 'error');
        } else {
          showToast(`Cookie "${name}" deleted!`, 'success');
          this.refresh();
        }
      });
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

customElements.define('postapi-cookie-manager', CookieManager);
export default CookieManager;
