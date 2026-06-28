/**
 * PostAPI Panel — Toast Component
 * Renders toast notifications in the application using global CSS classes.
 */

import { TOAST_TYPES, TOAST_DURATION } from '../lib/constants.js';

class ToastItem extends HTMLElement {
  connectedCallback() {
    this.type = this.getAttribute('type') || TOAST_TYPES.INFO;
    this.titleText = this.getAttribute('title') || '';
    this.message = this.getAttribute('message') || '';
    this.duration = parseInt(this.getAttribute('duration')) || TOAST_DURATION;

    this.className = `toast toast-${this.type}`;
    this.style.setProperty('--toast-duration', `${this.duration}ms`);

    this.render();

    // Setup auto-close timer
    this.timer = setTimeout(() => this.close(), this.duration);

    // Setup close button event
    const closeBtn = this.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        clearTimeout(this.timer);
        this.close();
      });
    }
  }

  render() {
    // Determine icon based on toast type
    let iconSvg = '';
    switch (this.type) {
      case TOAST_TYPES.SUCCESS:
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        break;
      case TOAST_TYPES.ERROR:
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        break;
      case TOAST_TYPES.WARNING:
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        break;
      case TOAST_TYPES.INFO:
      default:
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        break;
    }

    this.innerHTML = `
      ${iconSvg}
      <div class="toast-content">
        ${this.titleText ? `<div class="toast-title">${this.titleText}</div>` : ''}
        <div class="toast-message">${this.message}</div>
      </div>
      <button class="toast-close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div class="toast-progress"></div>
    `;
  }

  close() {
    this.classList.add('toast-exit');
    this.addEventListener('animationend', (e) => {
      if (e.animationName === 'toast-slide-out') {
        this.remove();
      }
    });
  }
}

customElements.define('postapi-toast-item', ToastItem);

/**
 * Global helper to show a toast message.
 * Creates container if not already in document.
 * 
 * @param {string} message 
 * @param {'success'|'error'|'warning'|'info'} type 
 * @param {string} [title] 
 * @param {number} [duration] 
 */
export function showToast(message, type = TOAST_TYPES.INFO, title = '', duration = TOAST_DURATION) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('postapi-toast-item');
  toast.setAttribute('type', type);
  toast.setAttribute('message', message);
  if (title) toast.setAttribute('title', title);
  toast.setAttribute('duration', duration.toString());

  container.appendChild(toast);
}

// Attach helper to global window for accessibility
if (typeof window !== 'undefined') {
  window.showToast = showToast;
}
