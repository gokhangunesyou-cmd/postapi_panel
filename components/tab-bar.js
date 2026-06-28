/**
 * PostAPI Panel — Tab Bar Component
 * Manages active states and event triggers for a horizontal tab bar UI.
 */

class TabBar extends HTMLElement {
  constructor() {
    super();
    this._tabs = [];
    this._activeTabId = null;
  }

  connectedCallback() {
    this.className = 'tab-bar';
    this.render();
  }

  set tabs(tabsList) {
    this._tabs = Array.isArray(tabsList) ? tabsList : [];
    this.render();
  }

  get tabs() {
    return this._tabs;
  }

  set activeTabId(id) {
    this._activeTabId = id;
    this._updateActiveState();
  }

  get activeTabId() {
    return this._activeTabId;
  }

  render() {
    if (this._tabs.length === 0) {
      this.innerHTML = '<div class="tab-bar-empty">No active tabs</div>';
      return;
    }

    this.innerHTML = '';
    this._tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item ${tab.id === this._activeTabId ? 'active' : ''}`;
      tabEl.setAttribute('data-tab-id', tab.id);

      // Method badge if present (for requests tabs)
      const methodBadge = tab.method ? 
        `<span class="method-badge method-${tab.method.toLowerCase()} font-mono font-bold" style="font-size: 10px; min-width: 32px; padding: 1px 4px; margin-inline-end: 6px;">${tab.method}</span>` : '';

      tabEl.innerHTML = `
        ${methodBadge}
        <span class="tab-title text-ellipsis" title="${tab.title}">${tab.title}</span>
        ${tab.closable !== false ? `
          <button class="tab-close-btn btn btn-icon btn-sm" aria-label="Close Tab" style="width: 16px; height: 16px; margin-inline-start: var(--space-1-5);">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        ` : ''}
      `;

      // Event listener for tab selection
      tabEl.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close-btn')) {
          e.stopPropagation();
          this._closeTab(tab.id);
        } else {
          this._selectTab(tab.id);
        }
      });

      this.appendChild(tabEl);
    });

    // Option to render an "Add Tab" button if enabled
    if (this.hasAttribute('addable')) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-icon btn-sm tab-add-btn';
      addBtn.setAttribute('aria-label', 'Add Tab');
      addBtn.style.margin = '4px 8px';
      addBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      `;
      addBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('tab-add', { bubbles: true }));
      });
      this.appendChild(addBtn);
    }
  }

  _selectTab(id) {
    if (this._activeTabId === id) return;
    this._activeTabId = id;
    this._updateActiveState();

    this.dispatchEvent(new CustomEvent('tab-select', {
      detail: { tabId: id },
      bubbles: true
    }));
  }

  _closeTab(id) {
    this.dispatchEvent(new CustomEvent('tab-close', {
      detail: { tabId: id },
      bubbles: true
    }));
  }

  _updateActiveState() {
    this.querySelectorAll('.tab-item').forEach(el => {
      if (el.getAttribute('data-tab-id') === this._activeTabId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }
}

customElements.define('postapi-tab-bar', TabBar);
export default TabBar;
