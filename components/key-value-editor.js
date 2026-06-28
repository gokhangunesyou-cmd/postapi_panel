/**
 * PostAPI Panel — Key Value Editor Component
 * Standard interface for editing key-value list structures (Query Params, Headers, etc.)
 */

class KeyValueEditor extends HTMLElement {
  constructor() {
    super();
    this._value = [];
    this.placeholderKey = this.getAttribute('key-placeholder') || 'Key';
    this.placeholderValue = this.getAttribute('value-placeholder') || 'Value';
  }

  connectedCallback() {
    this.render();
  }

  set value(items) {
    // Filter out potential empty rows and clone items
    this._value = Array.isArray(items) ? items.map(item => ({
      key: item.key || '',
      value: item.value || '',
      enabled: item.enabled !== false,
      description: item.description || ''
    })) : [];
    
    this.render();
  }

  get value() {
    // Return all items except the last auto-generated empty row
    const items = [];
    const rows = this.querySelectorAll('.key-value-row:not(.kv-template)');
    
    rows.forEach(row => {
      const key = row.querySelector('.kv-key-input').value.trim();
      const val = row.querySelector('.kv-val-input').value.trim();
      const enabled = row.querySelector('.kv-checkbox-input').checked;
      const desc = row.querySelector('.kv-desc-input') ? row.querySelector('.kv-desc-input').value.trim() : '';

      // Skip the bottom helper row if both key and value are blank
      if (key || val) {
        items.push({ key, value: val, enabled, description: desc });
      }
    });

    return items;
  }

  render() {
    // Add header row
    this.innerHTML = `
      <div class="key-value-editor-container">
        <div class="key-value-header">
          <div class="kv-checkbox-spacer"></div>
          <div class="kv-label kv-key-label" data-i18n="key">Key</div>
          <div class="kv-label kv-value-label" data-i18n="value">Value</div>
          <div class="kv-label kv-desc-label" data-i18n="description">Description</div>
          <div class="kv-delete-spacer"></div>
        </div>
        <div class="kv-rows-list"></div>
      </div>
    `;

    const listContainer = this.querySelector('.kv-rows-list');

    // Populate existing values
    this._value.forEach(item => {
      const row = this._createRow(item);
      listContainer.appendChild(row);
    });

    // Always append one empty row at the bottom
    const emptyRow = this._createRow({ key: '', value: '', enabled: true, description: '' });
    emptyRow.classList.add('kv-template');
    listContainer.appendChild(emptyRow);

    // Dynamic localization translation helper trigger if available
    if (window.i18n) {
      window.i18n.translatePage(this);
    }
  }

  /**
   * Create HTML element for a key-value row
   * @param {object} item - { key, value, enabled, description }
   * @returns {HTMLElement}
   * @private
   */
  _createRow(item) {
    const row = document.createElement('div');
    row.className = `key-value-row ${item.enabled ? '' : 'disabled'}`;

    row.innerHTML = `
      <input type="checkbox" class="kv-checkbox-input kv-checkbox checkbox" ${item.enabled ? 'checked' : ''} aria-label="Enable Row">
      <div class="kv-key">
        <input type="text" class="input kv-key-input" placeholder="${this.placeholderKey}" value="${this._escapeQuotes(item.key)}">
      </div>
      <div class="kv-value">
        <input type="text" class="input kv-val-input" placeholder="${this.placeholderValue}" value="${this._escapeQuotes(item.value)}">
      </div>
      <div class="kv-description">
        <input type="text" class="input kv-desc-input" placeholder="Description" value="${this._escapeQuotes(item.description)}">
      </div>
      <button class="btn btn-icon btn-sm kv-delete" aria-label="Delete Row">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    // Hook events
    const checkbox = row.querySelector('.kv-checkbox-input');
    const keyInput = row.querySelector('.kv-key-input');
    const valInput = row.querySelector('.kv-val-input');
    const descInput = row.querySelector('.kv-desc-input');
    const deleteBtn = row.querySelector('.kv-delete');

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        row.classList.remove('disabled');
      } else {
        row.classList.add('disabled');
      }
      this._emitChange();
    });

    const onInputChange = () => {
      // If typing in the bottom template row, transform it to a normal row and append a new template
      if (row.classList.contains('kv-template')) {
        row.classList.remove('kv-template');
        
        // Add a new empty row at bottom
        const nextEmpty = this._createRow({ key: '', value: '', enabled: true, description: '' });
        nextEmpty.classList.add('kv-template');
        this.querySelector('.kv-rows-list').appendChild(nextEmpty);
      }
      this._emitChange();
    };

    keyInput.addEventListener('input', onInputChange);
    valInput.addEventListener('input', onInputChange);
    descInput.addEventListener('input', onInputChange);

    deleteBtn.addEventListener('click', () => {
      // Don't delete the last row template
      if (row.classList.contains('kv-template')) return;
      row.remove();
      this._emitChange();
    });

    return row;
  }

  _escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;');
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: this.value },
      bubbles: true
    }));
  }
}

customElements.define('postapi-key-value-editor', KeyValueEditor);
export default KeyValueEditor;
