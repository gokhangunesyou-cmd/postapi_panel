/**
 * PostAPI Panel — Environment Selector Component
 * Dropdown trigger that lists available environments and triggers the variables manager modal.
 */

import storage from '../lib/storage.js';

class EnvironmentSelector extends HTMLElement {
  constructor() {
    super();
    this._environments = [];
    this._activeId = null;
    this._isOpen = false;
  }

  connectedCallback() {
    this.className = 'dropdown-wrapper';
    this.render();
    this.refresh();

    this._unsubscribe = storage.onChange(() => {
      this.refresh();
    });

    document.addEventListener('click', this._handleOutsideClick.bind(this));
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    document.removeEventListener('click', this._handleOutsideClick.bind(this));
  }

  async refresh() {
    this._environments = await storage.getEnvironments();
    this._activeId = await storage.get('postapi_active_environment');
    this.render();
  }

  _handleOutsideClick(e) {
    if (!this.contains(e.target) && this._isOpen) {
      this._isOpen = false;
      this.querySelector('.dropdown').classList.remove('open');
    }
  }

  render() {
    const activeEnvName = this._activeId ? 
      (this._environments.find(e => e.id === this._activeId)?.name || 'No Environment') : 'No Environment';

    this.innerHTML = `
      <button class="btn btn-ghost btn-sm dropdown-trigger flex items-center gap-1.5 font-bold" id="env-trigger" style="height: 28px; font-size: 11px;">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--secondary);"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
        <span>${this._escapeHtml(activeEnvName)}</span>
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>

      <div class="dropdown dropdown-end" style="width: 200px;">
        <div class="dropdown-item ${!this._activeId ? 'active' : ''}" data-env-id="none">
          <span class="flex-1">No Environment</span>
        </div>
        ${this._environments.map(env => `
          <div class="dropdown-item ${env.id === this._activeId ? 'active' : ''}" data-env-id="${env.id}">
            <span class="flex-1 text-ellipsis">${this._escapeHtml(env.name)}</span>
          </div>
        `).join('')}
        <div class="context-menu-separator"></div>
        <div class="dropdown-item" id="btn-manage-envs" style="color: var(--primary); font-weight: 600;">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Manage Environments</span>
        </div>
      </div>
    `;

    this._setupUIListeners();
  }

  _setupUIListeners() {
    const trigger = this.querySelector('#env-trigger');
    const dropdown = this.querySelector('.dropdown');

    trigger.addEventListener('click', () => {
      this._isOpen = !this._isOpen;
      dropdown.classList.toggle('open', this._isOpen);
    });

    // Dropdown Items click
    this.querySelectorAll('.dropdown-item[data-env-id]').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.getAttribute('data-env-id');
        const activeId = id === 'none' ? null : id;
        await storage.setActiveEnvironment(activeId);
        this._isOpen = false;
        dropdown.classList.remove('open');
        this.refresh();

        // Broadcast active environment change
        this.dispatchEvent(new CustomEvent('environment-changed', {
          detail: { activeEnvironmentId: activeId },
          bubbles: true
        }));
      });
    });

    // Manage Environments modal trigger
    const manageBtn = this.querySelector('#btn-manage-envs');
    manageBtn.addEventListener('click', () => {
      this._isOpen = false;
      dropdown.classList.remove('open');
      
      this.dispatchEvent(new CustomEvent('environment-manage-trigger', { bubbles: true }));
    });
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

customElements.define('postapi-environment-selector', EnvironmentSelector);
export default EnvironmentSelector;
