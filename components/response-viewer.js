/**
 * PostAPI Panel — Response Viewer Component
 * Renders HTTP response metrics, tabbed panels for headers, cookies, timeline,
 * and formats body content (Pretty JSON tree, raw text, and HTML preview).
 */

import { formatBytes, formatDuration } from '../lib/utils.js';
import { evaluateAssertions } from '../lib/assertions-evaluator.js';

class ResponseViewer extends HTMLElement {
  constructor() {
    super();
    this._response = null;
    this._activeTab = 'body';
    this._bodyFormat = 'pretty'; // 'pretty' | 'raw' | 'preview'
  }

  connectedCallback() {
    this.render();
  }

  set response(val) {
    this._response = val;
    this.render();
  }

  get response() {
    return this._response;
  }

  render() {
    if (!this._response) {
      this.innerHTML = `
        <div class="response-viewer-empty flex-1 flex flex-col items-center justify-center p-8 text-center" style="min-height: 200px; color: var(--text-muted); background-color: var(--bg-main);">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 12px; opacity: 0.7;">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          <div class="font-medium" style="font-size: 14px;" data-i18n="response">Response</div>
          <div style="font-size: 12px; margin-top: 4px;">Send a request to see the response here</div>
        </div>
      `;
      if (window.i18n) window.i18n.translatePage(this);
      return;
    }

    const { statusCode, statusText, duration, size } = this._response;

    // Evaluate assertions if any exist in the response request or directly
    const requestAssertions = this._response.request?.assertions || this._response.assertions || [];
    const hasAssertions = requestAssertions.length > 0;
    const evalResults = hasAssertions ? evaluateAssertions(requestAssertions, this._response) : [];
    const passedCount = evalResults.filter(r => r.passed).length;
    const totalCount = evalResults.length;
    
    const assertionsTabLabel = hasAssertions ? `Assertions (${passedCount}/${totalCount})` : 'Assertions';

    this.innerHTML = `
      <div class="response-viewer-container flex flex-col h-full" style="background-color: var(--bg-panel);">
        <!-- Response Info Header (Status, Time, Size) -->
        <div class="response-header flex items-center justify-between p-3 border-b" style="border-bottom: 1px solid var(--border);">
          <div class="flex items-center gap-3">
            <span class="font-bold" style="font-size: 13px;" data-i18n="response">Response</span>
            <postapi-status-badge status="${statusCode}" text="${statusText}"></postapi-status-badge>
          </div>
          <div class="flex items-center gap-4 text-secondary" style="font-size: 12px;">
            <div class="flex items-center gap-1">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Time: <strong class="font-mono text-primary">${formatDuration(duration)}</strong></span>
            </div>
            <div class="flex items-center gap-1">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              <span>Size: <strong class="font-mono text-primary">${formatBytes(size)}</strong></span>
            </div>
          </div>
        </div>

        <!-- Response Tabs Header -->
        <div class="tab-bar border-b" style="border-bottom: 1px solid var(--border); padding-inline-start: 12px;">
          <button class="tab-item ${this._activeTab === 'body' ? 'active' : ''}" data-tab="body" data-i18n="body">Body</button>
          <button class="tab-item ${this._activeTab === 'headers' ? 'active' : ''}" data-tab="headers" data-i18n="headers">Headers</button>
          <button class="tab-item ${this._activeTab === 'cookies' ? 'active' : ''}" data-tab="cookies" data-i18n="cookies">Cookies</button>
          <button class="tab-item ${this._activeTab === 'timeline' ? 'active' : ''}" data-tab="timeline" data-i18n="timeline">Timeline</button>
          <button class="tab-item ${this._activeTab === 'assertions' ? 'active' : ''}" data-tab="assertions">${assertionsTabLabel}</button>
        </div>

        <!-- Response Panes -->
        <div class="response-panes flex-1 overflow-y-auto" style="min-height: 180px;">
          
          <!-- Body Pane -->
          <div class="tab-pane h-full flex flex-col ${this._activeTab === 'body' ? 'active' : 'hidden'}" id="resp-pane-body">
            <!-- Format selectors (Pretty, Raw, Preview) -->
            <div class="flex items-center justify-between p-2 border-b" style="border-bottom: 1px solid var(--border); background-color: var(--bg-main);">
              <div class="btn-group">
                <button class="btn btn-sm ${this._bodyFormat === 'pretty' ? 'active' : ''}" id="fmt-pretty">Pretty</button>
                <button class="btn btn-sm ${this._bodyFormat === 'raw' ? 'active' : ''}" id="fmt-raw">Raw</button>
                <button class="btn btn-sm ${this._bodyFormat === 'preview' ? 'active' : ''}" id="fmt-preview">Preview</button>
              </div>
              <button class="btn btn-ghost btn-sm" id="btn-copy-response" style="height: 22px; font-size: 11px;">Copy Body</button>
            </div>

            <!-- Body Contents -->
            <div class="response-body-wrapper flex-1 overflow-auto p-3" style="background-color: var(--bg-main);">
              <!-- Pretty JSON tree -->
              <div id="resp-format-pretty-view" class="${this._bodyFormat === 'pretty' ? 'active' : 'hidden'}">
                <postapi-json-tree id="pretty-json-viewer"></postapi-json-tree>
              </div>

              <!-- Raw Text View -->
              <div id="resp-format-raw-view" class="${this._bodyFormat === 'raw' ? 'active' : 'hidden'}">
                <pre class="font-mono" style="font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--text-primary);"><code id="raw-text-viewer"></code></pre>
              </div>

              <!-- HTML Preview iframe -->
              <div id="resp-format-preview-view" class="h-full ${this._bodyFormat === 'preview' ? 'active' : 'hidden'}" style="min-height: 150px;">
                <iframe id="preview-iframe" style="width: 100%; height: 100%; border: none; background: white;"></iframe>
              </div>
            </div>
          </div>

          <!-- Headers Pane -->
          <div class="tab-pane p-3 ${this._activeTab === 'headers' ? 'active' : 'hidden'}" id="resp-pane-headers">
            <div class="key-value-editor-container">
              <div class="key-value-header">
                <div class="kv-label" style="flex: 0.4;">Header</div>
                <div class="kv-label" style="flex: 0.6;">Value</div>
              </div>
              <div class="headers-list font-mono" style="font-size: 12px;">
                ${(this._response.headers || []).map(h => `
                  <div class="key-value-row">
                    <div style="flex: 0.4; font-weight: 600; color: var(--primary); user-select: all;">${this._escapeHtml(h.key)}</div>
                    <div style="flex: 0.6; color: var(--text-primary); user-select: all; word-break: break-all;">${this._escapeHtml(h.value)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Cookies Pane -->
          <div class="tab-pane p-3 ${this._activeTab === 'cookies' ? 'active' : 'hidden'}" id="resp-pane-cookies">
            <div class="cookies-container">
              <!-- Cookies list will be populated dynamically if present -->
              <div id="resp-cookies-list" class="font-mono" style="font-size: 12px;">
                <!-- Filled by JS -->
              </div>
            </div>
          </div>

          <!-- Timeline Pane -->
          <div class="tab-pane p-4 ${this._activeTab === 'timeline' ? 'active' : 'hidden'}" id="resp-pane-timeline">
            <div class="timeline-container flex flex-col gap-3">
              <div class="flex items-center justify-between" style="font-size: 12px;">
                <span>Total Latency:</span>
                <span class="font-bold text-primary font-mono">${formatDuration(duration)}</span>
              </div>
              <!-- Simulated timing breakdown bar -->
              <div class="timing-bar flex rounded overflow-hidden" style="height: 12px; background: var(--border);">
                <div style="width: 15%; background: var(--success); height: 100%;" title="DNS (15%)"></div>
                <div style="width: 25%; background: var(--warning); height: 100%;" title="TCP/SSL Connection (25%)"></div>
                <div style="width: 45%; background: var(--primary); height: 100%;" title="TTFB (Time to First Byte) (45%)"></div>
                <div style="width: 15%; background: var(--secondary); height: 100%;" title="Content Download (15%)"></div>
              </div>
              <div class="flex flex-col gap-1.5 mt-2" style="font-size: 11px; color: var(--text-secondary);">
                <div class="flex justify-between"><span>DNS Lookup:</span><span class="font-mono">${formatDuration(duration * 0.15)}</span></div>
                <div class="flex justify-between"><span>TCP Handshake + SSL:</span><span class="font-mono">${formatDuration(duration * 0.25)}</span></div>
                <div class="flex justify-between"><span>Waiting (TTFB):</span><span class="font-mono">${formatDuration(duration * 0.45)}</span></div>
                <div class="flex justify-between"><span>Content Download:</span><span class="font-mono">${formatDuration(duration * 0.15)}</span></div>
              </div>
            </div>
          </div>

          <!-- Assertions Pane -->
          <div class="tab-pane p-4 ${this._activeTab === 'assertions' ? 'active' : 'hidden'}" id="resp-pane-assertions">
            <div class="assertions-results-container flex flex-col gap-3">
              <div class="flex items-center justify-between" style="font-size: 12px;">
                <span class="text-secondary font-medium">Validation Results:</span>
                <span class="font-bold font-mono" style="color: ${passedCount === totalCount && totalCount > 0 ? 'var(--success)' : totalCount === 0 ? 'var(--text-muted)' : 'var(--error)'}; font-size: 13px;">
                  ${passedCount} / ${totalCount} Passed
                </span>
              </div>
              <div class="divider-horizontal" style="height: 1px; background: var(--border);"></div>
              <div class="assertions-results-list flex flex-col gap-2 font-mono" style="font-size: 11px;">
                ${evalResults.map(res => {
                  const statusColor = res.passed ? 'var(--success)' : 'var(--error)';
                  const statusIcon = res.passed ? '✓' : '✗';
                  const statusBg = res.passed ? 'rgba(0,200,83, 0.05)' : 'rgba(255,23,68, 0.05)';
                  const statusText = res.passed ? 'PASS' : 'FAIL';
                  
                  return `
                    <div class="flex flex-col p-2.5 rounded border gap-1.5" style="border-color: ${statusColor}; background-color: ${statusBg};">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="font-bold flex items-center justify-center rounded" style="color: #fff; background-color: ${statusColor}; width: 45px; height: 16px; font-size: 9px; text-align: center;">${statusText}</span>
                          <span class="font-semibold text-primary">${res.message}</span>
                        </div>
                        <span style="color: ${statusColor}; font-weight: bold; font-size: 12px;">${statusIcon}</span>
                      </div>
                      ${res.receivedValue !== undefined && res.receivedValue !== '' ? `
                        <div style="font-size: 10px; color: var(--text-secondary); margin-left: 53px;">
                          Received: <code class="p-1 rounded font-bold" style="background-color: var(--bg-main); color: var(--text-primary); border: 1px solid var(--border); word-break: break-all;">${this._escapeHtml(res.receivedValue)}</code>
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
                ${evalResults.length === 0 ? `
                  <div class="text-muted p-4 text-center" style="font-size: 12px;">
                    No validation rules were executed for this request.
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._setupTabListeners();
    this._setupFormatListeners();
    this._populateBodyData();
    this._populateCookies();

    if (window.i18n) {
      window.i18n.translatePage(this);
    }
  }

  _setupTabListeners() {
    const tabs = this.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.getAttribute('data-tab');
        this._activeTab = target;

        this.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        this.querySelector(`#resp-pane-${target}`).classList.remove('hidden');
      });
    });
  }

  _setupFormatListeners() {
    // Format switcher clicks
    const prettyBtn = this.querySelector('#fmt-pretty');
    const rawBtn = this.querySelector('#fmt-raw');
    const previewBtn = this.querySelector('#fmt-preview');

    if (!prettyBtn) return;

    const setFormat = (fmt) => {
      this._bodyFormat = fmt;
      prettyBtn.classList.toggle('active', fmt === 'pretty');
      rawBtn.classList.toggle('active', fmt === 'raw');
      previewBtn.classList.toggle('active', fmt === 'preview');

      this.querySelector('#resp-format-pretty-view').classList.toggle('hidden', fmt !== 'pretty');
      this.querySelector('#resp-format-raw-view').classList.toggle('hidden', fmt !== 'raw');
      this.querySelector('#resp-format-preview-view').classList.toggle('hidden', fmt !== 'preview');

      if (fmt === 'preview') {
        this._renderPreviewHtml();
      }
    };

    prettyBtn.addEventListener('click', () => setFormat('pretty'));
    rawBtn.addEventListener('click', () => setFormat('raw'));
    previewBtn.addEventListener('click', () => setFormat('preview'));

    // Copy response body
    const copyBtn = this.querySelector('#btn-copy-response');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this._response.body || '');
      if (window.showToast) {
        window.showToast('Response body copied to clipboard', 'success');
      }
    });
  }

  _populateBodyData() {
    const bodyStr = this._response.body || '';
    const rawViewer = this.querySelector('#raw-text-viewer');
    if (rawViewer) rawViewer.textContent = bodyStr;

    // Check if JSON and pass to pretty viewer
    const prettyViewer = this.querySelector('#pretty-json-viewer');
    if (prettyViewer) {
      try {
        const json = JSON.parse(bodyStr);
        prettyViewer.data = json;
      } catch {
        // Not valid JSON — pretty viewer shows message, fallback raw
        prettyViewer.data = null;
        this.querySelector('#fmt-pretty').disabled = true;
        this._bodyFormat = 'raw';
        this.querySelector('#fmt-raw').click();
      }
    }
  }

  _renderPreviewHtml() {
    const iframe = this.querySelector('#preview-iframe');
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(this._response.body || '');
      doc.close();
    } catch (e) {
      console.error('Failed to write HTML preview to iframe:', e);
    }
  }

  _populateCookies() {
    const container = this.querySelector('#resp-cookies-list');
    if (!container) return;

    // Parse set-cookie response headers
    const cookieHeaders = (this._response.headers || [])
      .filter(h => h.key.toLowerCase() === 'set-cookie');

    if (cookieHeaders.length === 0) {
      container.innerHTML = `
        <div class="text-muted p-4 text-center" style="font-size: 12px;">
          No cookies received in this response.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border); text-align: left;">
            <th style="padding: 6px;">Name</th>
            <th style="padding: 6px;">Value</th>
            <th style="padding: 6px;">Attributes</th>
          </tr>
        </thead>
        <tbody>
          ${cookieHeaders.map(ch => {
            const parts = ch.value.split(';');
            const [nameValue, ...attrParts] = parts;
            const eqIdx = nameValue.indexOf('=');
            const name = eqIdx !== -1 ? nameValue.substring(0, eqIdx) : nameValue;
            const value = eqIdx !== -1 ? nameValue.substring(eqIdx + 1) : '';
            const attrs = attrParts.map(ap => ap.trim()).join(', ');

            return `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 6px; font-weight: 600; color: var(--primary);">${this._escapeHtml(name)}</td>
                <td style="padding: 6px; color: var(--text-primary); word-break: break-all;">${this._escapeHtml(value)}</td>
                <td style="padding: 6px; color: var(--text-muted); font-size: 11px;">${this._escapeHtml(attrs)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
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

customElements.define('postapi-response-viewer', ResponseViewer);
export default ResponseViewer;
