/**
 * PostAPI Panel — Request List Component
 * Lists captured network requests with method badges, paths, status codes, and timing.
 */

import { HTTP_METHODS } from '../lib/constants.js';
import { formatBytes, formatDuration, getStatusColor } from '../lib/utils.js';

class RequestList extends HTMLElement {
  constructor() {
    super();
    this._requests = [];
    this._filteredRequests = [];
    this._selectedId = null;
    this._filters = {
      search: '',
      methods: new Set(HTTP_METHODS)
    };
  }

  connectedCallback() {
    this.render();
    this._setupEvents();
  }

  set requests(list) {
    this._requests = Array.isArray(list) ? list : [];
    this._applyFilters();
  }

  get requests() {
    return this._requests;
  }

  set selectedId(id) {
    this._selectedId = id;
    this._updateSelectedClass();
  }

  get selectedId() {
    return this._selectedId;
  }

  _setupEvents() {
    this.addEventListener('click', (e) => {
      const item = e.target.closest('.request-list-item');
      if (item) {
        const id = item.getAttribute('data-id');
        this._selectRequest(id);
      }
    });
  }

  _applyFilters() {
    const searchVal = this._filters.search.toLowerCase();
    this._filteredRequests = this._requests.filter(req => {
      // Method filter
      if (!this._filters.methods.has(req.method)) return false;

      // Search filter (URL)
      if (searchVal && !req.url.toLowerCase().includes(searchVal)) return false;

      return true;
    });

    this._renderListOnly();
  }

  render() {
    this.innerHTML = `
      <div class="request-list-container flex flex-col h-full">
        <!-- Filter Toolbar -->
        <div class="request-list-toolbar toolbar gap-2 flex items-center p-2 border-b">
          <input type="text" class="input search-box flex-1" id="list-search" placeholder="Filter requests..." style="height: 28px; font-size: 12px;">
          <button class="btn btn-ghost btn-sm" id="btn-clear-captured" data-i18n="clearAll" style="height: 28px; font-size: 12px; padding: 0 8px;">Clear</button>
        </div>

        <!-- Method Toggles -->
        <div class="method-toggles-bar flex items-center gap-1 p-2 border-b overflow-x-auto" style="min-height: 36px; scrollbar-width: none;">
          ${HTTP_METHODS.map(m => `
            <button class="btn btn-ghost btn-sm method-filter-btn active" data-method="${m}" style="height: 22px; font-size: 10px; padding: 0 6px;">
              ${m}
            </button>
          `).join('')}
        </div>

        <!-- Scrollable list of requests -->
        <div class="request-items-scroll flex-1 overflow-y-auto" style="background-color: var(--bg-main);">
          <div class="request-items-list"></div>
        </div>
      </div>
    `;

    // Hook filter inputs
    const searchInput = this.querySelector('#list-search');
    searchInput.addEventListener('input', (e) => {
      this._filters.search = e.target.value;
      this._applyFilters();
    });

    const clearBtn = this.querySelector('#btn-clear-captured');
    clearBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('request-clear-all', { bubbles: true }));
    });

    const filterBtns = this.querySelectorAll('.method-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const method = btn.getAttribute('data-method');
        if (this._filters.methods.has(method)) {
          this._filters.methods.delete(method);
          btn.classList.remove('active');
        } else {
          this._filters.methods.add(method);
          btn.classList.add('active');
        }
        this._applyFilters();
      });
    });

    this._renderListOnly();
  }

  _renderListOnly() {
    const listEl = this.querySelector('.request-items-list');
    if (!listEl) return;

    if (this._filteredRequests.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state p-8 text-center" style="margin-top: 40px;">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin: 0 auto 12px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <div class="text-secondary font-medium" data-i18n="noRequests">No requests captured</div>
          <div class="text-muted" style="font-size: 12px; margin-top: 4px;">Trigger network calls in the tab</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this._filteredRequests.map(req => {
      const urlObj = this._safeParseUrl(req.url);
      const host = urlObj.host;
      const path = urlObj.path + urlObj.search;
      const statusColor = getStatusColor(req.statusCode) || 'var(--text-muted)';
      const isSelected = req.id === this._selectedId;

      return `
        <div class="request-list-item flex flex-col p-2 border-b cursor-pointer transition-colors ${isSelected ? 'active' : ''}" 
             data-id="${req.id}" 
             style="border-bottom: 1px solid var(--border); ${isSelected ? 'background-color: var(--bg-hover); border-inline-start: 3px solid var(--primary);' : ''}">
          <div class="flex items-center justify-between gap-2">
            <span class="method-badge method-${req.method.toLowerCase()} font-mono font-bold" style="font-size: 10px; min-width: 44px; text-align: center;">
              ${req.method}
            </span>
            <span class="request-url-path font-mono text-ellipsis flex-1" style="font-size: 12px; color: var(--text-primary);" title="${req.url}">
              ${path}
            </span>
            <span class="status-code font-bold font-mono" style="font-size: 11px; color: ${statusColor};">
              ${req.statusCode || 'ERR'}
            </span>
          </div>
          <div class="flex items-center justify-between mt-1 text-muted" style="font-size: 11px;">
            <span class="request-host" title="${req.url}">${host}</span>
            <div class="flex items-center gap-2">
              <span class="request-duration">${formatDuration(req.duration)}</span>
              <span class="request-size">${formatBytes(req.size)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Dynamic localization translation helper trigger if available
    if (window.i18n) {
      window.i18n.translatePage(listEl);
    }
  }

  _selectRequest(id) {
    if (this._selectedId === id) return;
    this._selectedId = id;
    this._updateSelectedClass();

    const req = this._requests.find(r => r.id === id);
    this.dispatchEvent(new CustomEvent('request-select', {
      detail: { request: req },
      bubbles: true
    }));
  }

  _updateSelectedClass() {
    this.querySelectorAll('.request-list-item').forEach(el => {
      const id = el.getAttribute('data-id');
      if (id === this._selectedId) {
        el.classList.add('active');
        el.style.backgroundColor = 'var(--bg-hover)';
        el.style.borderInlineStart = '3px solid var(--primary)';
      } else {
        el.classList.remove('active');
        el.style.backgroundColor = '';
        el.style.borderInlineStart = '';
      }
    });
  }

  _safeParseUrl(urlString) {
    try {
      const url = new URL(urlString);
      return {
        host: url.hostname,
        path: url.pathname,
        search: url.search
      };
    } catch (e) {
      return {
        host: urlString.substring(0, 30),
        path: urlString,
        search: ''
      };
    }
  }
}

customElements.define('postapi-request-list', RequestList);
export default RequestList;
