/**
 * PostAPI Panel — Request Builder Component
 * Main UI for creating, editing, and initiating HTTP requests.
 * Integrates key-value editors, auth panels, and query parameter syncing.
 */

import { HTTP_METHODS, BODY_TYPES, AUTH_TYPES, DEFAULT_REQUEST } from '../lib/constants.js';
import { parseUrl, buildUrl } from '../lib/utils.js';

class RequestBuilder extends HTMLElement {
  constructor() {
    super();
    this._request = JSON.parse(JSON.stringify(DEFAULT_REQUEST));
    this._activeTab = 'params';
    this._isSending = false;
  }

  connectedCallback() {
    this.render();
    this._setupSyncing();
  }

  set request(val) {
    this._request = val ? JSON.parse(JSON.stringify(val)) : JSON.parse(JSON.stringify(DEFAULT_REQUEST));
    // Ensure all sub-objects exist
    if (!this._request.headers) this._request.headers = [];
    if (!this._request.params) this._request.params = [];
    if (!this._request.body) this._request.body = { type: 'none', content: '' };
    if (!this._request.auth) this._request.auth = { type: 'none' };

    this.render();
    this._updateUIFromRequest();
  }

  get request() {
    this._updateRequestFromUI();
    return this._request;
  }

  set isSending(val) {
    this._isSending = val;
    this._updateSendButton();
  }

  get isSending() {
    return this._isSending;
  }

  _updateSendButton() {
    const sendBtn = this.querySelector('.btn-send-request');
    if (!sendBtn) return;
    
    const sendLabel = (window.i18n && window.i18n.getMessage('send')) || 'Send';
    const cancelLabel = (window.i18n && window.i18n.getMessage('cancel')) || 'Cancel';

    if (this._isSending) {
      sendBtn.textContent = cancelLabel;
      sendBtn.className = 'btn btn-danger btn-send-request';
    } else {
      sendBtn.textContent = sendLabel;
      sendBtn.className = 'btn btn-primary btn-send-request';
    }
  }

  render() {
    this.innerHTML = `
      <div class="request-builder-container flex flex-col p-3 border-b gap-3" style="background-color: var(--bg-panel); border-bottom: 1px solid var(--border);">
        <!-- Top Bar: Method + URL + Send + Save -->
        <div class="flex items-center gap-2">
          <select class="select font-mono font-bold" id="req-method" style="width: 100px; height: 32px; font-size: 12px; border-color: var(--border);">
            ${HTTP_METHODS.map(m => `<option value="${m}" ${m === this._request.method ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <input type="text" class="input flex-1 font-mono" id="req-url" placeholder="Enter request URL (e.g. api.example.com/users)" value="${this._request.url || ''}" style="height: 32px; font-size: 12px;">
          <button class="btn btn-primary btn-send-request font-bold" data-i18n="send" style="height: 32px; font-size: 12px; padding: 0 16px;">Send</button>
          <button class="btn btn-ghost btn-save-request" data-i18n="save" style="height: 32px; font-size: 12px; padding: 0 12px;">Save</button>
        </div>
 
        <!-- Request Tabs Header -->
        <div class="tab-bar border-b" style="border-bottom: 1px solid var(--border); margin-top: 4px;">
          <button class="tab-item ${this._activeTab === 'params' ? 'active' : ''}" data-tab="params" data-i18n="params">Params</button>
          <button class="tab-item ${this._activeTab === 'headers' ? 'active' : ''}" data-tab="headers" data-i18n="headers">Headers</button>
          <button class="tab-item ${this._activeTab === 'body' ? 'active' : ''}" data-tab="body" data-i18n="body">Body</button>
          <button class="tab-item ${this._activeTab === 'auth' ? 'active' : ''}" data-tab="auth" data-i18n="auth">Auth</button>
          <button class="tab-item ${this._activeTab === 'assertions' ? 'active' : ''}" data-tab="assertions" data-i18n="assertions">Assertions</button>
        </div>
 
        <!-- Tab Content Panes -->
        <div class="request-builder-panes flex-1 overflow-y-auto" style="min-height: 150px;">
          <!-- Params Pane -->
          <div class="tab-pane ${this._activeTab === 'params' ? 'active' : 'hidden'}" id="pane-params">
            <postapi-key-value-editor id="editor-params" key-placeholder="Parameter" value-placeholder="Value"></postapi-key-value-editor>
          </div>
 
          <!-- Headers Pane -->
          <div class="tab-pane ${this._activeTab === 'headers' ? 'active' : 'hidden'}" id="pane-headers">
            <postapi-key-value-editor id="editor-headers" key-placeholder="Header" value-placeholder="Value"></postapi-key-value-editor>
          </div>
 
          <!-- Body Pane -->
          <div class="tab-pane ${this._activeTab === 'body' ? 'active' : 'hidden'} flex flex-col gap-2" id="pane-body">
            <div class="flex items-center justify-between mb-2" style="font-size: 12px;">
              <div class="flex items-center gap-4">
                ${BODY_TYPES.map(type => `
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="body-type" value="${type}" ${type === this._request.body.type ? 'checked' : ''}>
                    <span>${type}</span>
                  </label>
                `).join('')}
              </div>
              <div class="flex items-center gap-3">
                <button class="btn btn-ghost btn-sm hidden" id="btn-beautify-json" style="height: 24px; font-size: 11px; padding: 0 8px; border: 1px solid var(--border);" data-i18n="formatJson">Format JSON</button>
                <label class="flex items-center gap-1.5 cursor-pointer text-secondary" id="body-evaluate-container">
                  <input type="checkbox" id="body-evaluate" ${this._request.body.evaluate !== false ? 'checked' : ''}>
                  <span>Enable Evaluation</span>
                </label>
              </div>
            </div>
 
            <!-- Body Contents -->
            <div id="body-content-editor" class="flex-1">
              <!-- Text Area for raw JSON -->
              <div id="body-text-container" class="hidden">
                <textarea class="textarea font-mono" id="body-raw-text" placeholder='{"key": "value"}' style="width: 100%; min-height: 120px; font-size: 12px; background-color: var(--bg-input); border-color: var(--border); color: var(--text-primary); padding: 8px;"></textarea>
              </div>
              <!-- Key Value Editor for Form Data / urlencoded -->
              <div id="body-kv-container" class="hidden">
                <postapi-key-value-editor id="editor-body-kv" key-placeholder="Field key" value-placeholder="Field value"></postapi-key-value-editor>
              </div>
              <!-- Placeholder for none/binary -->
              <div id="body-none-container" class="text-muted p-4 text-center" style="font-size: 12px;">
                This request does not have a body.
              </div>
            </div>
          </div>
 
          <!-- Auth Pane -->
          <div class="tab-pane ${this._activeTab === 'auth' ? 'active' : 'hidden'} flex flex-col gap-3 p-1" id="pane-auth">
            <div class="flex items-center gap-2" style="font-size: 12px;">
              <span class="text-secondary">Type:</span>
              <select class="select" id="auth-type" style="width: 160px; height: 28px; font-size: 12px;">
                ${AUTH_TYPES.map(t => `<option value="${t}" ${t === this._request.auth.type ? 'selected' : ''}>${t === 'none' ? 'No Auth' : t === 'bearer' ? 'Bearer Token' : t === 'basic' ? 'Basic Auth' : 'API Key'}</option>`).join('')}
              </select>
            </div>
 
            <div class="divider-horizontal my-1" style="height: 1px; background-color: var(--border);"></div>
 
            <!-- Auth Options -->
            <div id="auth-fields">
              <div id="auth-none" class="text-muted text-center p-3" style="font-size: 12px;">
                No authentication required.
              </div>
 
              <!-- Bearer Token -->
              <div id="auth-bearer" class="hidden flex flex-col gap-1.5">
                <span class="font-medium text-secondary" style="font-size: 12px;">Token</span>
                <input type="text" class="input font-mono" id="auth-bearer-token" placeholder="Bearer Token" style="height: 28px; font-size: 12px;">
              </div>
 
              <!-- Basic Auth -->
              <div id="auth-basic" class="hidden flex gap-2">
                <div class="flex flex-col gap-1.5 flex-1">
                  <span class="font-medium text-secondary" style="font-size: 12px;">Username</span>
                  <input type="text" class="input font-mono" id="auth-basic-username" placeholder="Username" style="height: 28px; font-size: 12px;">
                </div>
                <div class="flex flex-col gap-1.5 flex-1">
                  <span class="font-medium text-secondary" style="font-size: 12px;">Password</span>
                  <input type="password" class="input font-mono" id="auth-basic-password" placeholder="Password" style="height: 28px; font-size: 12px;">
                </div>
              </div>
 
              <!-- API Key -->
              <div id="auth-api-key" class="hidden flex flex-col gap-2">
                <div class="flex gap-2">
                  <div class="flex flex-col gap-1.5 flex-1">
                    <span class="font-medium text-secondary" style="font-size: 12px;">Key</span>
                    <input type="text" class="input font-mono" id="auth-api-key-name" placeholder="X-API-Key" style="height: 28px; font-size: 12px;">
                  </div>
                  <div class="flex flex-col gap-1.5 flex-1">
                    <span class="font-medium text-secondary" style="font-size: 12px;">Value</span>
                    <input type="text" class="input font-mono" id="auth-api-key-value" placeholder="Value" style="height: 28px; font-size: 12px;">
                  </div>
                </div>
                <div class="flex items-center gap-2 mt-1" style="font-size: 12px;">
                  <span class="text-secondary">Add to:</span>
                  <label class="flex items-center gap-1"><input type="radio" name="auth-key-add" value="header" checked> Header</label>
                  <label class="flex items-center gap-1"><input type="radio" name="auth-key-add" value="query"> Query Params</label>
                </div>
              </div>
            </div>
          </div>
 
          <!-- Assertions Pane -->
          <div class="tab-pane ${this._activeTab === 'assertions' ? 'active' : 'hidden'} flex flex-col gap-2" id="pane-assertions">
            <div class="flex items-center justify-between mb-2">
              <span class="text-secondary" style="font-size: 12px;">Define response validation rules:</span>
              <button class="btn btn-ghost btn-sm" id="btn-add-assertion" style="height: 24px; font-size: 11px;">+ Assertion</button>
            </div>
            <div class="divider-horizontal" style="height: 1px; background-color: var(--border); margin-bottom: 4px;"></div>
            <div class="assertions-editor-container overflow-y-auto" style="max-height: 250px;">
              <table class="table" style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border); text-align: left; color: var(--text-muted);">
                    <th style="padding: 4px; width: 30px;">Active</th>
                    <th style="padding: 4px; width: 120px;">Type</th>
                    <th style="padding: 4px; width: 150px;">Target</th>
                    <th style="padding: 4px; width: 100px;">Operator</th>
                    <th style="padding: 4px;">Expected Value</th>
                    <th style="padding: 4px; width: 40px; text-align: center;"></th>
                  </tr>
                </thead>
                <tbody id="assertions-list-body">
                  <!-- Dynamically populated rows -->
                </tbody>
              </table>
              <div id="assertions-empty-msg" class="text-muted text-center p-4 hidden">
                No assertions defined for this request.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._setupUIListeners();
    this._updateUIFromRequest();
    this._updateSendButton();

    if (window.i18n) {
      window.i18n.translatePage(this);
    }
  }

  _setupUIListeners() {
    // Tabs clicking
    const tabs = this.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const target = tab.getAttribute('data-tab');
        this._activeTab = target;

        this.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        this.querySelector(`#pane-${target}`).classList.remove('hidden');
      });
    });

    // Send click
    const sendBtn = this.querySelector('.btn-send-request');
    sendBtn.addEventListener('click', () => {
      this._updateRequestFromUI();
      if (this._isSending) {
        this.dispatchEvent(new CustomEvent('request-abort', { bubbles: true }));
      } else {
        this.dispatchEvent(new CustomEvent('request-send', {
          detail: { request: this._request },
          bubbles: true
        }));
      }
    });

    // Save click
    const saveBtn = this.querySelector('.btn-save-request');
    saveBtn.addEventListener('click', () => {
      this._updateRequestFromUI();
      this.dispatchEvent(new CustomEvent('request-save', {
        detail: { request: this._request },
        bubbles: true
      }));
    });

    // Body type change
    const bodyRadios = this.querySelectorAll('input[name="body-type"]');
    bodyRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this._toggleBodyTypeUI(e.target.value);
      });
    });

    // Auth type change
    const authTypeSelect = this.querySelector('#auth-type');
    authTypeSelect.addEventListener('change', (e) => {
      this._toggleAuthTypeUI(e.target.value);
    });

    // Add assertion click
    const addAssertionBtn = this.querySelector('#btn-add-assertion');
    if (addAssertionBtn) {
      addAssertionBtn.addEventListener('click', () => {
        if (!this._request.assertions) this._request.assertions = [];
        this._request.assertions.push({
          id: 'assert_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          type: 'status',
          target: '',
          operator: 'equals',
          value: '200',
          enabled: true
        });
        this._renderAssertionRows();
      });
    }

    // Format JSON click
    const beautifyBtn = this.querySelector('#btn-beautify-json');
    if (beautifyBtn) {
      beautifyBtn.addEventListener('click', () => {
        const textarea = this.querySelector('#body-raw-text');
        if (!textarea) return;
        const val = textarea.value.trim();
        if (!val) return;
        try {
          textarea.value = JSON.stringify(JSON.parse(val), null, 2);
          this._updateRequestFromUI();
        } catch (err) {
          const msg = window.i18n && typeof window.i18n.getMessage === 'function' 
            ? window.i18n.getMessage('invalidJson') 
            : 'Invalid JSON: Cannot parse request body';
          if (window.showToast) {
            window.showToast(msg, 'error');
          } else {
            alert(msg);
          }
        }
      });
    }
  }

  _setupSyncing() {
    const urlInput = this.querySelector('#req-url');
    const paramsEditor = this.querySelector('#editor-params');

    // Sync URL -> Params editor
    urlInput.addEventListener('input', () => {
      const url = urlInput.value.trim();
      const parsed = parseUrl(url);
      if (parsed && parsed.params.length > 0) {
        // Only update editor if params differ to prevent cursor jumping
        const currentEditorVal = paramsEditor.value;
        const keysMatch = currentEditorVal.length === parsed.params.length &&
                           currentEditorVal.every((p, idx) => p.key === parsed.params[idx].key && p.value === parsed.params[idx].value);
        if (!keysMatch) {
          paramsEditor.value = parsed.params;
        }
      } else if (!url.includes('?')) {
        // Clear parameters if URL has no search query
        if (paramsEditor.value.length > 0) {
          paramsEditor.value = [];
        }
      }
    });

    // Sync Params editor -> URL
    paramsEditor.addEventListener('change', (e) => {
      const url = urlInput.value.trim();
      const newUrl = buildUrl(url, e.detail.value);
      urlInput.value = newUrl;
    });
  }

  _toggleBodyTypeUI(type) {
    const textContainer = this.querySelector('#body-text-container');
    const kvContainer = this.querySelector('#body-kv-container');
    const noneContainer = this.querySelector('#body-none-container');
    const beautifyBtn = this.querySelector('#btn-beautify-json');

    textContainer.classList.add('hidden');
    kvContainer.classList.add('hidden');
    noneContainer.classList.add('hidden');
    if (beautifyBtn) beautifyBtn.classList.add('hidden');

    if (type === 'json' || type === 'raw') {
      textContainer.classList.remove('hidden');
      if (type === 'json' && beautifyBtn) {
        beautifyBtn.classList.remove('hidden');
      }
    } else if (type === 'formData' || type === 'urlEncoded') {
      kvContainer.classList.remove('hidden');
    } else {
      noneContainer.classList.remove('hidden');
    }
  }

  _toggleAuthTypeUI(type) {
    this.querySelector('#auth-none').classList.add('hidden');
    this.querySelector('#auth-bearer').classList.add('hidden');
    this.querySelector('#auth-basic').classList.add('hidden');
    this.querySelector('#auth-api-key').classList.add('hidden');

    if (type === 'bearer') {
      this.querySelector('#auth-bearer').classList.remove('hidden');
    } else if (type === 'basic') {
      this.querySelector('#auth-basic').classList.remove('hidden');
    } else if (type === 'apiKey') {
      this.querySelector('#auth-api-key').classList.remove('hidden');
    } else {
      this.querySelector('#auth-none').classList.remove('hidden');
    }
  }

  _renderAssertionRows() {
    const tbody = this.querySelector('#assertions-list-body');
    const emptyMsg = this.querySelector('#assertions-empty-msg');
    if (!tbody) return;

    tbody.innerHTML = '';
    const assertions = this._request.assertions || [];

    if (assertions.length === 0) {
      emptyMsg.classList.remove('hidden');
      return;
    }
    emptyMsg.classList.add('hidden');

    assertions.forEach((assertion, idx) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border)';
      tr.setAttribute('data-index', idx);

      const showTarget = assertion.type === 'header' || assertion.type === 'body_json';
      const targetPlaceholder = assertion.type === 'header' ? 'e.g. Content-Type' : 'e.g. $.data.id';

      // Options for Operator select depending on assertion type
      let operatorOptions = '';
      if (assertion.type === 'status') {
        operatorOptions = `
          <option value="equals" ${assertion.operator === 'equals' ? 'selected' : ''}>Equals</option>
          <option value="not_equals" ${assertion.operator === 'not_equals' ? 'selected' : ''}>Not Equals</option>
        `;
      } else if (assertion.type === 'header') {
        operatorOptions = `
          <option value="equals" ${assertion.operator === 'equals' ? 'selected' : ''}>Equals</option>
          <option value="contains" ${assertion.operator === 'contains' ? 'selected' : ''}>Contains</option>
          <option value="is_null" ${assertion.operator === 'is_null' ? 'selected' : ''}>Not Exists</option>
          <option value="is_not_null" ${assertion.operator === 'is_not_null' ? 'selected' : ''}>Exists</option>
        `;
      } else if (assertion.type === 'body_text') {
        operatorOptions = `
          <option value="contains" ${assertion.operator === 'contains' ? 'selected' : ''}>Contains</option>
          <option value="equals" ${assertion.operator === 'equals' ? 'selected' : ''}>Equals</option>
        `;
      } else if (assertion.type === 'body_json') {
        operatorOptions = `
          <option value="equals" ${assertion.operator === 'equals' ? 'selected' : ''}>Equals</option>
          <option value="contains" ${assertion.operator === 'contains' ? 'selected' : ''}>Contains</option>
          <option value="is_null" ${assertion.operator === 'is_null' ? 'selected' : ''}>Is Null</option>
          <option value="is_not_null" ${assertion.operator === 'is_not_null' ? 'selected' : ''}>Is Not Null</option>
          <option value="greater_than" ${assertion.operator === 'greater_than' ? 'selected' : ''}>&gt;</option>
          <option value="less_than" ${assertion.operator === 'less_than' ? 'selected' : ''}>&lt;</option>
        `;
      } else if (assertion.type === 'duration') {
        operatorOptions = `
          <option value="less_than" ${assertion.operator === 'less_than' ? 'selected' : ''}>Less Than</option>
          <option value="greater_than" ${assertion.operator === 'greater_than' ? 'selected' : ''}>Greater Than</option>
        `;
      }

      const showValue = assertion.operator !== 'is_null' && assertion.operator !== 'is_not_null';

      tr.innerHTML = `
        <td style="padding: 4px; text-align: center; vertical-align: middle;">
          <input type="checkbox" class="assert-enabled" ${assertion.enabled !== false ? 'checked' : ''}>
        </td>
        <td style="padding: 4px;">
          <select class="select assert-type" style="width: 100%; height: 24px; padding: 2px 4px; font-size: 11px;">
            <option value="status" ${assertion.type === 'status' ? 'selected' : ''}>Status Code</option>
            <option value="header" ${assertion.type === 'header' ? 'selected' : ''}>Header</option>
            <option value="body_text" ${assertion.type === 'body_text' ? 'selected' : ''}>Body Text</option>
            <option value="body_json" ${assertion.type === 'body_json' ? 'selected' : ''}>JSON Path</option>
            <option value="duration" ${assertion.type === 'duration' ? 'selected' : ''}>Duration (ms)</option>
          </select>
        </td>
        <td style="padding: 4px;">
          <input type="text" class="input assert-target font-mono" style="width: 100%; height: 24px; padding: 2px 6px; font-size: 11px; ${showTarget ? '' : 'visibility: hidden;'}" placeholder="${targetPlaceholder}" value="${assertion.target || ''}">
        </td>
        <td style="padding: 4px;">
          <select class="select assert-operator" style="width: 100%; height: 24px; padding: 2px 4px; font-size: 11px;">
            ${operatorOptions}
          </select>
        </td>
        <td style="padding: 4px;">
          <input type="text" class="input assert-value font-mono" style="width: 100%; height: 24px; padding: 2px 6px; font-size: 11px; ${showValue ? '' : 'visibility: hidden;'}" placeholder="e.g. 200" value="${assertion.value || ''}">
        </td>
        <td style="padding: 4px; text-align: center; vertical-align: middle;">
          <button class="btn btn-ghost btn-icon btn-delete-assertion" style="width: 20px; height: 20px; color: var(--error); padding: 0;" title="Delete assertion">×</button>
        </td>
      `;

      // Attach row event listeners for changes
      const updateRowValues = () => {
        assertion.enabled = tr.querySelector('.assert-enabled').checked;
        assertion.type = tr.querySelector('.assert-type').value;
        assertion.target = tr.querySelector('.assert-target').value.trim();
        assertion.operator = tr.querySelector('.assert-operator').value;
        assertion.value = tr.querySelector('.assert-value').value.trim();
      };

      tr.querySelector('.assert-enabled').addEventListener('change', updateRowValues);
      tr.querySelector('.assert-target').addEventListener('input', updateRowValues);
      tr.querySelector('.assert-value').addEventListener('input', updateRowValues);

      tr.querySelector('.assert-type').addEventListener('change', (e) => {
        updateRowValues();
        assertion.target = '';
        if (e.target.value === 'status') assertion.operator = 'equals';
        else if (e.target.value === 'header') assertion.operator = 'equals';
        else if (e.target.value === 'body_text') assertion.operator = 'contains';
        else if (e.target.value === 'body_json') assertion.operator = 'equals';
        else if (e.target.value === 'duration') assertion.operator = 'less_than';
        assertion.value = '';
        this._renderAssertionRows();
      });

      tr.querySelector('.assert-operator').addEventListener('change', () => {
        updateRowValues();
        this._renderAssertionRows();
      });

      tr.querySelector('.btn-delete-assertion').addEventListener('click', () => {
        this._request.assertions.splice(idx, 1);
        this._renderAssertionRows();
      });

      tbody.appendChild(tr);
    });
  }

  _updateUIFromRequest() {
    if (!this.querySelector('#req-method')) return;

    this.querySelector('#req-method').value = this._request.method || 'GET';
    this.querySelector('#req-url').value = this._request.url || '';

    // Editors
    this.querySelector('#editor-params').value = this._request.params || [];
    this.querySelector('#editor-headers').value = this._request.headers || [];

    // Body
    const body = this._request.body || { type: 'none', content: '', evaluate: true };
    const bodyRadio = this.querySelector(`input[name="body-type"][value="${body.type}"]`);
    if (bodyRadio) bodyRadio.checked = true;
    this._toggleBodyTypeUI(body.type);

    const bodyEvaluateCheckbox = this.querySelector('#body-evaluate');
    if (bodyEvaluateCheckbox) {
      bodyEvaluateCheckbox.checked = body.evaluate !== false;
    }

    if (body.type === 'json') {
      let displayContent = '';
      if (typeof body.content === 'string') {
        try {
          displayContent = JSON.stringify(JSON.parse(body.content), null, 2);
        } catch (e) {
          displayContent = body.content;
        }
      } else {
        displayContent = JSON.stringify(body.content, null, 2);
      }
      this.querySelector('#body-raw-text').value = displayContent;
    } else if (body.type === 'raw') {
      this.querySelector('#body-raw-text').value = typeof body.content === 'string' ? body.content : JSON.stringify(body.content, null, 2);
    } else if (body.type === 'formData' || body.type === 'urlEncoded') {
      this.querySelector('#editor-body-kv').value = Array.isArray(body.content) ? body.content : [];
    }

    // Auth
    const auth = this._request.auth || { type: 'none' };
    this.querySelector('#auth-type').value = auth.type;
    this._toggleAuthTypeUI(auth.type);

    if (auth.type === 'bearer') {
      this.querySelector('#auth-bearer-token').value = auth.bearer?.token || '';
    } else if (auth.type === 'basic') {
      this.querySelector('#auth-basic-username').value = auth.basic?.username || '';
      this.querySelector('#auth-basic-password').value = auth.basic?.password || '';
    } else if (auth.type === 'apiKey') {
      this.querySelector('#auth-api-key-name').value = auth.apiKey?.key || '';
      this.querySelector('#auth-api-key-value').value = auth.apiKey?.value || '';
      const radio = this.querySelector(`input[name="auth-key-add"][value="${auth.apiKey?.addTo || 'header'}"]`);
      if (radio) radio.checked = true;
    }

    // Assertions
    this._renderAssertionRows();
  }

  _updateRequestFromUI() {
    if (!this.querySelector('#req-method')) return;

    this._request.method = this.querySelector('#req-method').value;
    this._request.url = this.querySelector('#req-url').value.trim();

    // Sync editors to value
    this._request.params = this.querySelector('#editor-params').value;
    this._request.headers = this.querySelector('#editor-headers').value;

    // Body
    const bodyType = this.querySelector('input[name="body-type"]:checked').value;
    this._request.body.type = bodyType;

    const bodyEvaluateCheckbox = this.querySelector('#body-evaluate');
    if (bodyEvaluateCheckbox) {
      this._request.body.evaluate = bodyEvaluateCheckbox.checked;
    }

    if (bodyType === 'json' || bodyType === 'raw') {
      this._request.body.content = this.querySelector('#body-raw-text').value;
    } else if (bodyType === 'formData' || bodyType === 'urlEncoded') {
      this._request.body.content = this.querySelector('#editor-body-kv').value;
    } else {
      this._request.body.content = '';
    }

    // Auth
    const authType = this.querySelector('#auth-type').value;
    this._request.auth.type = authType;

    if (authType === 'bearer') {
      this._request.auth.bearer = {
        token: this.querySelector('#auth-bearer-token').value.trim()
      };
    } else if (authType === 'basic') {
      this._request.auth.basic = {
        username: this.querySelector('#auth-basic-username').value.trim(),
        password: this.querySelector('#auth-basic-password').value.trim()
      };
    } else if (authType === 'apiKey') {
      const addToRadio = this.querySelector('input[name="auth-key-add"]:checked');
      this._request.auth.apiKey = {
        key: this.querySelector('#auth-api-key-name').value.trim(),
        value: this.querySelector('#auth-api-key-value').value.trim(),
        addTo: addToRadio ? addToRadio.value : 'header'
      };
    }
  }
}

customElements.define('postapi-request-builder', RequestBuilder);
export default RequestBuilder;
