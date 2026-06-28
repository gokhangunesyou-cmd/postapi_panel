/**
 * PostAPI Panel — Status Code Badge Component
 * Displays numerical HTTP status codes, status categories, and description texts.
 */

import { STATUS_COLORS, STATUS_TEXT } from '../lib/constants.js';
import { getStatusCategory } from '../lib/utils.js';

class StatusBadge extends HTMLElement {
  static get observedAttributes() {
    return ['status', 'text'];
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const statusAttr = this.getAttribute('status');
    if (!statusAttr) {
      this.innerHTML = '';
      return;
    }

    const status = parseInt(statusAttr);
    const category = getStatusCategory(status);
    const color = STATUS_COLORS[category] || '#9aa0a6';

    const customText = this.getAttribute('text');
    const statusDesc = customText || STATUS_TEXT[status] || 'Unknown';

    this.className = 'badge';
    this.style.borderColor = color;
    this.style.color = color;
    this.style.backgroundColor = `${color}15`; // 8.5% opacity for solid color background effect

    this.innerHTML = `
      <span class="status-code font-bold">${status}</span>
      <span class="status-text">${statusDesc}</span>
    `;
  }
}

customElements.define('postapi-status-badge', StatusBadge);
export default StatusBadge;
