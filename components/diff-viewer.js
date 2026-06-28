/**
 * PostAPI Panel — Diff Viewer Component
 * Renders side-by-side diff comparing two response bodies, highlighting added and removed lines.
 */

class DiffViewer extends HTMLElement {
  constructor() {
    super();
    this._leftText = '';
    this._rightText = '';
    this._leftHeader = 'Original';
    this._rightHeader = 'Replayed';
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Set texts to compare
   * @param {string} leftText - Original response text
   * @param {string} rightText - Replayed response text
   * @param {string} [leftHeader='Original'] - Custom left pane header
   * @param {string} [rightHeader='Replayed'] - Custom right pane header
   */
  setDiff(leftText, rightText, leftHeader = 'Original', rightHeader = 'Replayed') {
    this._leftText = typeof leftText === 'string' ? leftText : JSON.stringify(leftText, null, 2);
    this._rightText = typeof rightText === 'string' ? rightText : JSON.stringify(rightText, null, 2);
    this._leftHeader = leftHeader;
    this._rightHeader = rightHeader;
    this.render();
  }

  render() {
    this.innerHTML = `
      <div class="diff-viewer flex flex-col h-full" style="background-color: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">
        <!-- Headers -->
        <div class="diff-headers flex border-b" style="background-color: var(--bg-main); border-bottom: 1px solid var(--border);">
          <div class="diff-header flex-1 p-2 font-bold text-center border-r" style="border-right: 1px solid var(--border); font-size: 12px; color: var(--text-secondary);">${this._leftHeader}</div>
          <div class="diff-header flex-1 p-2 font-bold text-center" style="font-size: 12px; color: var(--text-secondary);">${this._rightHeader}</div>
        </div>

        <!-- Scrollable split panes -->
        <div class="diff-panes flex flex-1 overflow-hidden" style="min-height: 200px;">
          <div class="diff-pane diff-left flex-1 overflow-auto border-r font-mono p-3" id="diff-pane-left" style="border-right: 1px solid var(--border); font-size: 11px; background-color: var(--bg-main);">
            <!-- Rendered Left Lines -->
          </div>
          <div class="diff-pane diff-right flex-1 overflow-auto font-mono p-3" id="diff-pane-right" style="font-size: 11px; background-color: var(--bg-main);">
            <!-- Rendered Right Lines -->
          </div>
        </div>
      </div>
    `;

    this._generateDiff();
    this._syncScroll();
  }

  _generateDiff() {
    const leftPane = this.querySelector('#diff-pane-left');
    const rightPane = this.querySelector('#diff-pane-right');
    if (!leftPane || !rightPane) return;

    const leftLines = this._leftText.split('\n');
    const rightLines = this._rightText.split('\n');

    // Simple line-by-line diff matching
    let leftHtml = '';
    let rightHtml = '';

    const maxLines = Math.max(leftLines.length, rightLines.length);

    for (let i = 0; i < maxLines; i++) {
      const leftLine = leftLines[i] !== undefined ? leftLines[i] : null;
      const rightLine = rightLines[i] !== undefined ? rightLines[i] : null;

      const lineNum = i + 1;
      const lineNumSpan = `<span class="diff-line-number text-muted" style="display: inline-block; width: 28px; border-right: 1px solid var(--border); margin-right: 8px; text-align: right; padding-right: 6px; user-select: none;">${lineNum}</span>`;

      if (leftLine === rightLine) {
        // Line is matching
        leftHtml += `<div class="diff-line font-mono" style="white-space: pre; color: var(--text-primary);">${lineNumSpan}${this._escapeHtml(leftLine)}</div>`;
        rightHtml += `<div class="diff-line font-mono" style="white-space: pre; color: var(--text-primary);">${lineNumSpan}${this._escapeHtml(rightLine)}</div>`;
      } else if (leftLine !== null && rightLine === null) {
        // Left line deleted
        leftHtml += `<div class="diff-line diff-deleted font-mono" style="white-space: pre; background-color: var(--error-light); color: var(--error);">${lineNumSpan}${this._escapeHtml(leftLine)}</div>`;
        rightHtml += `<div class="diff-line diff-empty font-mono" style="white-space: pre; background-color: var(--bg-hover);">&nbsp;</div>`;
      } else if (leftLine === null && rightLine !== null) {
        // Right line added
        leftHtml += `<div class="diff-line diff-empty font-mono" style="white-space: pre; background-color: var(--bg-hover);">&nbsp;</div>`;
        rightHtml += `<div class="diff-line diff-added font-mono" style="white-space: pre; background-color: var(--success-light); color: var(--success);">${lineNumSpan}${this._escapeHtml(rightLine)}</div>`;
      } else {
        // Both lines exist but differ
        leftHtml += `<div class="diff-line diff-deleted font-mono" style="white-space: pre; background-color: var(--error-light); color: var(--error);">${lineNumSpan}${this._escapeHtml(leftLine)}</div>`;
        rightHtml += `<div class="diff-line diff-added font-mono" style="white-space: pre; background-color: var(--success-light); color: var(--success);">${lineNumSpan}${this._escapeHtml(rightLine)}</div>`;
      }
    }

    leftPane.innerHTML = leftHtml;
    rightPane.innerHTML = rightHtml;
  }

  _syncScroll() {
    const leftPane = this.querySelector('#diff-pane-left');
    const rightPane = this.querySelector('#diff-pane-right');
    if (!leftPane || !rightPane) return;

    // Synchronize scrolling between left and right split panes
    let isLeftScrolling = false;
    let isRightScrolling = false;

    leftPane.addEventListener('scroll', () => {
      if (isRightScrolling) {
        isRightScrolling = false;
        return;
      }
      isLeftScrolling = true;
      rightPane.scrollTop = leftPane.scrollTop;
      rightPane.scrollLeft = leftPane.scrollLeft;
    });

    rightPane.addEventListener('scroll', () => {
      if (isLeftScrolling) {
        isLeftScrolling = false;
        return;
      }
      isRightScrolling = true;
      leftPane.scrollTop = rightPane.scrollTop;
      leftPane.scrollLeft = rightPane.scrollLeft;
    });
  }

  _escapeHtml(str) {
    if (str === null) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

customElements.define('postapi-diff-viewer', DiffViewer);
export default DiffViewer;
