/**
 * PostAPI Panel — JSON Tree Viewer Component
 * Renders nested JSON structures with collapse/expand toggles, type styling,
 * value copying, and JSONPath search highlighting.
 */

class JsonTree extends HTMLElement {
  constructor() {
    super();
    this._data = null;
    this._highlightedPaths = new Set();
    this.addEventListener('click', this._handleClick.bind(this));
  }

  set data(val) {
    this._data = val;
    this.render();
  }

  get data() {
    return this._data;
  }

  /**
   * Set matching JSONPath strings to highlight in the tree.
   * @param {string[]} paths
   */
  highlightPaths(paths) {
    this._highlightedPaths = new Set(paths);
    this._applyHighlights();
  }

  render() {
    if (this._data === null || this._data === undefined) {
      this.innerHTML = '<div class="json-empty">No JSON data</div>';
      return;
    }

    this.innerHTML = `
      <div class="json-tree-container font-mono">
        ${this._renderNode(this._data, '$', true)}
      </div>
    `;
  }

  /**
   * Recursively render a JSON node
   * @param {*} value
   * @param {string} path - JSONPath representation of this node
   * @param {boolean} isLast - Whether this is the last element in parent object/array
   * @param {string} [key] - Key name if parent is object
   * @private
   */
  _renderNode(value, path, isLast, key = '') {
    const isHighlighted = this._highlightedPaths.has(path);
    const highlightClass = isHighlighted ? 'json-highlight' : '';
    const keySpan = key ? `<span class="json-key ${highlightClass}" data-path="${path}">"${key}"</span>: ` : '';
    const comma = isLast ? '' : '<span class="json-comma">,</span>';

    if (value === null) {
      return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-value json-null">null</span>${comma}</div>`;
    }

    const type = typeof value;

    if (type === 'boolean') {
      return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-value json-boolean">${value}</span>${comma}</div>`;
    }

    if (type === 'number') {
      return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-value json-number">${value}</span>${comma}</div>`;
    }

    if (type === 'string') {
      // Escape HTML and wrap in quotes
      const escaped = this._escapeHtml(value);
      return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-value json-string">"${escaped}"</span>${comma}</div>`;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-bracket">[ ]</span>${comma}</div>`;
      }

      let childHtml = '';
      for (let i = 0; i < value.length; i++) {
        childHtml += this._renderNode(value[i], `${path}[${i}]`, i === value.length - 1);
      }

      return `
        <div class="json-folder" data-path="${path}">
          <div class="json-line json-folder-header">
            <span class="json-toggle">▼</span>
            ${keySpan}<span class="json-bracket">[</span>
            <span class="json-folder-size">${value.length} items</span>
          </div>
          <div class="json-folder-children">${childHtml}</div>
          <div class="json-line json-folder-footer"><span class="json-bracket">]</span>${comma}</div>
        </div>
      `;
    }

    if (type === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-bracket">{ }</span>${comma}</div>`;
      }

      let childHtml = '';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        // Handle path indexing for special chars
        const escapedK = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? `.${k}` : `['${k.replace(/'/g, "\\'")}']`;
        childHtml += this._renderNode(value[k], `${path}${escapedK}`, i === keys.length - 1, k);
      }

      return `
        <div class="json-folder" data-path="${path}">
          <div class="json-line json-folder-header">
            <span class="json-toggle">▼</span>
            ${keySpan}<span class="json-bracket">{</span>
            <span class="json-folder-size">${keys.length} keys</span>
          </div>
          <div class="json-folder-children">${childHtml}</div>
          <div class="json-line json-folder-footer"><span class="json-bracket">}</span>${comma}</div>
        </div>
      `;
    }

    return `<div class="json-line" data-path="${path}">${keySpan}<span class="json-value">${value}</span>${comma}</div>`;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _handleClick(e) {
    const toggle = e.target.closest('.json-toggle');
    if (toggle) {
      const folder = toggle.closest('.json-folder');
      const children = folder.querySelector('.json-folder-children');
      if (children.style.display === 'none') {
        children.style.display = 'block';
        toggle.textContent = '▼';
        toggle.classList.remove('collapsed');
      } else {
        children.style.display = 'none';
        toggle.textContent = '▶';
        toggle.classList.add('collapsed');
      }
      return;
    }

    // Copy JSONPath or value on double click or right click if desired
    const key = e.target.closest('.json-key');
    if (key) {
      const path = key.getAttribute('data-path');
      navigator.clipboard.writeText(path);
      if (window.showToast) {
        window.showToast(`JSONPath copied: ${path}`, 'success');
      }
    }
  }

  _applyHighlights() {
    this.querySelectorAll('.json-highlight').forEach(el => el.classList.remove('json-highlight'));
    if (this._highlightedPaths.size === 0) return;

    this._highlightedPaths.forEach(path => {
      const line = this.querySelector(`[data-path="${path}"]`);
      if (line) {
        const keyEl = line.querySelector('.json-key');
        if (keyEl) keyEl.classList.add('json-highlight');
        
        // Auto expand parent folders to make highlight visible
        let parent = line.parentElement;
        while (parent && parent !== this) {
          if (parent.classList.contains('json-folder-children')) {
            parent.style.display = 'block';
            const header = parent.previousElementSibling;
            if (header) {
              const toggle = header.querySelector('.json-toggle');
              if (toggle) {
                toggle.textContent = '▼';
                toggle.classList.remove('collapsed');
              }
            }
          }
          parent = parent.parentElement;
        }
      }
    });
  }
}

customElements.define('postapi-json-tree', JsonTree);
export default JsonTree;
