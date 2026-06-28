/**
 * PostAPI Panel — History List Component
 * Displays past sent requests grouped by relative time periods (Today, Yesterday, Older).
 */

import storage from '../lib/storage.js';
import { formatTimestamp, relativeTime, getStatusColor } from '../lib/utils.js';

class HistoryList extends HTMLElement {
  constructor() {
    super();
    this._history = [];
    this._searchQuery = '';
  }

  connectedCallback() {
    this.render();
    this.refresh();

    // Subscribe to storage changes
    this._unsubscribe = storage.onChange(() => {
      this.refresh();
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
  }

  async refresh() {
    this._history = await storage.getHistory();
    this._renderHistoryItems();
  }

  render() {
    this.innerHTML = `
      <div class="history-list flex flex-col h-full">
        <!-- History Header Actions -->
        <div class="flex items-center justify-between p-2 border-b" style="border-bottom: 1px solid var(--border);">
          <span class="font-bold text-secondary" style="font-size: 12px;" data-i18n="history">History</span>
          <button class="btn btn-ghost btn-sm" id="btn-clear-history" data-i18n="clearAll" style="height: 24px; padding: 0 6px; font-size: 11px;">
            Clear All
          </button>
        </div>

        <!-- Filter Search Box -->
        <div class="p-2 border-b" style="border-bottom: 1px solid var(--border);">
          <input type="text" class="input search-box font-mono" id="history-search" placeholder="Search history..." style="height: 26px; font-size: 11px; width: 100%;">
        </div>

        <!-- History list items -->
        <div class="history-items-scroll flex-1 overflow-y-auto" style="background-color: var(--bg-panel);">
          <div id="history-root"></div>
        </div>
      </div>
    `;

    this._setupUIListeners();
  }

  _setupUIListeners() {
    // Search filter
    const searchInput = this.querySelector('#history-search');
    searchInput.addEventListener('input', (e) => {
      this._searchQuery = e.target.value;
      this._renderHistoryItems();
    });

    // Clear history
    const clearBtn = this.querySelector('#btn-clear-history');
    clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all request history?')) {
        await storage.clearHistory();
        this.refresh();
      }
    });
  }

  _renderHistoryItems() {
    const rootEl = this.querySelector('#history-root');
    if (!rootEl) return;

    // Apply search filter
    const filtered = this._history.filter(item => {
      if (!this._searchQuery) return true;
      const q = this._searchQuery.toLowerCase();
      return (item.url || '').toLowerCase().includes(q) || (item.method || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      rootEl.innerHTML = `
        <div class="text-muted p-4 text-center" style="font-size: 12px; margin-top: 20px;">
          No history records found.
        </div>
      `;
      return;
    }

    // Group by day categories: Today, Yesterday, Older
    const today = [];
    const yesterday = [];
    const older = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;

    filtered.forEach(item => {
      const ts = item.timestamp;
      if (ts >= startOfToday) {
        today.push(item);
      } else if (ts >= startOfYesterday) {
        yesterday.push(item);
      } else {
        older.push(item);
      }
    });

    rootEl.innerHTML = '';

    if (today.length > 0) this._renderGroup('Today', today, rootEl);
    if (yesterday.length > 0) this._renderGroup('Yesterday', yesterday, rootEl);
    if (older.length > 0) this._renderGroup('Older', older, rootEl);

    if (window.i18n) window.i18n.translatePage(rootEl);
  }

  _renderGroup(title, items, container) {
    const groupEl = document.createElement('div');
    groupEl.className = 'history-group mb-3';

    groupEl.innerHTML = `
      <div class="history-group-title text-muted px-2 py-1" style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: var(--tracking-wider); background-color: var(--bg-main);">${title}</div>
      <div class="history-group-list"></div>
    `;

    const listEl = groupEl.querySelector('.history-group-list');
    items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item flex items-center justify-between p-2 border-b cursor-pointer hover:bg-hover';
      itemEl.style.borderBottom = '1px solid var(--border)';
      itemEl.style.height = '34px';

      const statusColor = getStatusColor(item.statusCode) || 'var(--text-muted)';
      const path = this._getPathOnly(item.url);

      itemEl.innerHTML = `
        <div class="flex items-center gap-2 flex-1 min-width-0">
          <span class="method-badge method-${item.method.toLowerCase()} font-mono font-bold" style="font-size: 8px; min-width: 32px; padding: 1px 3px; line-height: 1; text-align: center;">
            ${item.method}
          </span>
          <span class="history-path font-mono text-ellipsis flex-1" style="font-size: 11px; color: var(--text-primary);" title="${item.url}">${path}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="status-code font-bold font-mono" style="font-size: 10px; color: ${statusColor};">${item.statusCode || 'ERR'}</span>
          <span class="history-time font-mono text-muted" style="font-size: 10px;" title="${formatTimestamp(item.timestamp)}">${this._getRelativeTimeText(item.timestamp)}</span>
        </div>
      `;

      itemEl.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('history-load-trigger', {
          detail: { historyItem: item },
          bubbles: true
        }));
      });

      listEl.appendChild(itemEl);
    });

    container.appendChild(groupEl);
  }

  _getPathOnly(urlString) {
    try {
      const url = new URL(urlString);
      return url.pathname + url.search;
    } catch {
      return urlString;
    }
  }

  _getRelativeTimeText(ts) {
    const now = Date.now();
    const diffMin = Math.floor((now - ts) / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    return relativeTime(ts);
  }
}

customElements.define('postapi-history-list', HistoryList);
export default HistoryList;
