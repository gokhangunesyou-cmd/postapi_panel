/**
 * PostAPI Panel — Reusable Modal Dialog Component
 * Provides clean overlay layout, header titles, close hooks, and animation.
 */

class Modal extends HTMLElement {
  constructor() {
    super();
    this._isOpen = false;
  }

  connectedCallback() {
    this.render();
    this._setupListeners();
  }

  set title(val) {
    this.setAttribute('title', val);
    const titleEl = this.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = val;
  }

  get title() {
    return this.getAttribute('title') || '';
  }

  open() {
    this._isOpen = true;
    const overlay = this.querySelector('.modal-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      setTimeout(() => overlay.classList.add('open'), 10);
    }
    document.body.style.overflow = 'hidden';
    this.dispatchEvent(new CustomEvent('modal-open', { bubbles: true }));
  }

  close() {
    this._isOpen = false;
    const overlay = this.querySelector('.modal-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => {
        if (!this._isOpen) overlay.classList.add('hidden');
      }, 250);
    }
    document.body.style.overflow = '';
    this.dispatchEvent(new CustomEvent('modal-close', { bubbles: true }));
  }

  render() {
    this.innerHTML = `
      <div class="modal-overlay hidden" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.5); z-index: var(--z-modal); display: flex; align-items: center; justify-content: center;">
        <div class="modal-container card" style="min-width: 480px; max-width: 90%; max-height: 85%; display: flex; flex-direction: column; background-color: var(--bg-panel); border: 1px solid var(--border); box-shadow: var(--shadow-elevation-3);">
          <div class="modal-header card-header" style="padding: 12px 16px; border-bottom: 1px solid var(--border);">
            <div class="modal-title font-bold" style="font-size: 14px;">${this.title}</div>
            <button class="btn btn-icon btn-sm modal-close-btn" aria-label="Close Modal" style="font-size: 16px;">×</button>
          </div>
          <div class="modal-body card-body overflow-y-auto" style="flex: 1; padding: 16px; min-height: 100px;">
            <!-- Content will be enjected here -->
          </div>
          <div class="modal-footer card-footer hidden" style="padding: 12px 16px; border-top: 1px solid var(--border); justify-content: flex-end; gap: 8px;">
            <!-- Buttons if any -->
          </div>
        </div>
      </div>
    `;
  }

  _setupListeners() {
    const overlay = this.querySelector('.modal-overlay');
    const closeBtn = this.querySelector('.modal-close-btn');

    closeBtn.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      // Close only if clicking directly on overlay backdrop
      if (e.target === overlay) {
        this.close();
      }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        this.close();
      }
    });
  }

  // Helper to set content
  setBody(elementOrHtml) {
    const bodyContainer = this.querySelector('.modal-body');
    if (!bodyContainer) return;
    
    bodyContainer.innerHTML = '';
    if (typeof elementOrHtml === 'string') {
      bodyContainer.innerHTML = elementOrHtml;
    } else if (elementOrHtml instanceof HTMLElement) {
      bodyContainer.appendChild(elementOrHtml);
    }
  }

  setFooter(elementOrHtml) {
    const footerContainer = this.querySelector('.modal-footer');
    if (!footerContainer) return;

    footerContainer.innerHTML = '';
    footerContainer.classList.remove('hidden');

    if (typeof elementOrHtml === 'string') {
      footerContainer.innerHTML = elementOrHtml;
    } else if (elementOrHtml instanceof HTMLElement) {
      footerContainer.appendChild(elementOrHtml);
    }
  }
}

customElements.define('postapi-modal', Modal);
export default Modal;
