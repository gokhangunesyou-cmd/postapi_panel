/**
 * PostAPI Panel — Main Application Controller
 * Coordinates the sidebar views, request builder, response/diff viewer,
 * dynamic environment resolving, split-pane dragging, and background message channels.
 */

import i18n from '../lib/i18n.js';
import storage from '../lib/storage.js';
import { MESSAGE_TYPES, TOAST_TYPES, STORAGE_KEYS } from '../lib/constants.js';
import { generateId, parseUrl } from '../lib/utils.js';
import { showToast } from '../components/toast.js';
import importExportManager from '../lib/import-export.js';

// Import custom elements to register them
import '../components/key-value-editor.js';
import '../components/status-badge.js';
import '../components/toast.js';
import '../components/modal.js';
import '../components/tab-bar.js';
import '../components/json-tree.js';
import '../components/request-list.js';
import '../components/request-builder.js';
import '../components/response-viewer.js';
import '../components/collection-tree.js';
import '../components/history-list.js';
import '../components/environment-selector.js';
import '../components/cookie-manager.js';
import '../components/diff-viewer.js';

let isCapturing = false;
let activeTabId = null;

// DOM Elements cache
let reqList, reqBuilder, respViewer, diffViewer, envSelector, colTree, histList, cookieMgr;

async function getActiveTabId() {
  // Check if there is a tracked active web tab in storage first
  const savedTabId = await storage.get(STORAGE_KEYS.ACTIVE_TAB);
  if (savedTabId) {
    // Verify the tab still exists
    return new Promise((resolve) => {
      chrome.tabs.get(parseInt(savedTabId), (tab) => {
        if (chrome.runtime.lastError || !tab) {
          // Fallback to query
          queryActiveTab(resolve);
        } else {
          resolve(tab.id);
        }
      });
    });
  }
  return new Promise(queryActiveTab);
}

function queryActiveTab(resolve) {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        resolve(tabs[0].id);
      } else {
        resolve(null);
      }
    });
  } else {
    resolve(null);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Theme and load i18n catalogs (without translating yet)
  const settings = await storage.getSettings();
  document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  await i18n.init(); // loads catalogs + sets language; translatePage will run on empty doc (ok)

  // 2. Render App Shell Markup
  renderAppShell();

  // 3. Translate the now-populated DOM
  i18n.translatePage(document);

  // 4. Cache Components references
  reqList    = document.querySelector('#sidebar-request-list');
  reqBuilder = document.querySelector('#main-request-builder');
  respViewer = document.querySelector('#main-response-viewer');
  diffViewer = document.querySelector('#main-diff-viewer');
  envSelector = document.querySelector('#header-environment-selector');
  colTree    = document.querySelector('#sidebar-collection-tree');
  histList   = document.querySelector('#sidebar-history-list');
  cookieMgr  = document.querySelector('#sidebar-cookie-manager');

  // 5. Setup Dragging for Split Panes
  setupSplitPaneDragging();

  // 6. Establish Background Communications
  activeTabId = typeof chrome !== 'undefined' && chrome.devtools
    ? chrome.devtools.inspectedWindow.tabId
    : await getActiveTabId();

  setupBackgroundConnection();

  // 7. Connect Components Events
  setupComponentInteractions();

  // 8. Theme / Locale Selectors sync
  setupPreferencesSync(settings);
});


function renderAppShell() {
  const app = document.querySelector('#app');
  if (!app) return;

  app.innerHTML = `
    <div class="app-layout">
      <!-- Sidebar Navigation -->
      <aside class="sidebar-layout">
        <div class="sidebar-header">
          <div class="header-brand">
            <img src="../assets/logo.png" alt="PostAPI" style="width: 18px; height: 18px;">
            <span style="font-weight: 700; color: var(--text-primary); font-size: 13px;" data-i18n="extName">PostAPI Panel</span>
          </div>
        </div>

        <!-- Sidebar Navigation Tabs -->
        <div class="flex border-b" style="border-bottom: 1px solid var(--border); background-color: var(--bg-main);">
          <button class="btn btn-ghost flex-1 py-1 px-1 text-center active sidebar-tab font-bold" data-tab="capture" data-i18n="capture" style="border-radius: 0; font-size: 10px; height: 26px; border: none; border-bottom: 2px solid var(--primary);">Capture</button>
          <button class="btn btn-ghost flex-1 py-1 px-1 text-center sidebar-tab font-bold" data-tab="collections" data-i18n="collectionsTab" style="border-radius: 0; font-size: 10px; height: 26px; border: none;">Colls</button>
          <button class="btn btn-ghost flex-1 py-1 px-1 text-center sidebar-tab font-bold" data-tab="history" data-i18n="historyTab" style="border-radius: 0; font-size: 10px; height: 26px; border: none;">History</button>
          <button class="btn btn-ghost flex-1 py-1 px-1 text-center sidebar-tab font-bold" data-tab="cookies" data-i18n="cookiesTab" style="border-radius: 0; font-size: 10px; height: 26px; border: none;">Cookies</button>
        </div>

        <!-- Sidebar content pane lists -->
        <div class="sidebar-content flex-1 flex flex-col overflow-hidden">
          <div id="side-pane-capture" class="flex-1 overflow-hidden flex flex-col">
            <postapi-request-list id="sidebar-request-list"></postapi-request-list>
          </div>
          <div id="side-pane-collections" class="flex-1 overflow-hidden flex flex-col hidden">
            <postapi-collection-tree id="sidebar-collection-tree"></postapi-collection-tree>
          </div>
          <div id="side-pane-history" class="flex-1 overflow-hidden flex flex-col hidden">
            <postapi-history-list id="sidebar-history-list"></postapi-history-list>
          </div>
          <div id="side-pane-cookies" class="flex-1 overflow-hidden flex flex-col hidden">
            <postapi-cookie-manager id="sidebar-cookie-manager"></postapi-cookie-manager>
          </div>
        </div>

        <!-- Sidebar footer preferences options -->
        <div class="sidebar-footer gap-2" style="background-color: var(--bg-main); padding: 8px 12px; justify-content: flex-end;">
          <button class="btn btn-ghost btn-sm" id="btn-theme-toggle" style="width: 24px; height: 24px; font-size: 11px; padding: 0;" title="Toggle Theme">🌙</button>
        </div>
      </aside>

      <!-- Main Header Panel toolbar -->
      <header class="header-bar">
        <div class="header-center flex items-center gap-2">
          <button class="btn btn-primary btn-sm flex items-center gap-1.5 font-bold" id="btn-capture-toggle" style="height: 28px; font-size: 11px; background-color: var(--success); border-color: var(--success);">
            <span class="capture-dot" style="width: 6px; height: 6px; background-color: #fff; border-radius: 50%; display: inline-block;"></span>
            <span id="capture-status-text">Start Capture</span>
          </button>
          <div class="divider-vertical" style="width: 1px; height: 16px; background: var(--border); margin: 0 4px;"></div>
          <postapi-environment-selector id="header-environment-selector"></postapi-environment-selector>
        </div>
        <div class="header-actions" style="display: flex; align-items: center; gap: 6px;">
          <!-- Language selector with flags -->
          <div style="position: relative; display: flex; align-items: center;">
            <span id="lang-flag" style="position: absolute; left: 7px; font-size: 14px; pointer-events: none; z-index: 1;">🇺🇸</span>
            <select id="lang-select" style="height: 28px; font-size: 11px; padding: 0 6px 0 26px; border: 1px solid var(--border); border-radius: 6px; background-color: var(--bg-panel); color: var(--text-primary); cursor: pointer; appearance: none; -webkit-appearance: none; font-weight: 600;">
              <option value="en">EN</option>
              <option value="tr">TR</option>
              <option value="ar">AR</option>
            </select>
            <span style="position: absolute; right: 6px; font-size: 9px; pointer-events: none; color: var(--text-muted);">▼</span>
          </div>
          <div style="width: 1px; height: 16px; background: var(--border);"></div>
          <button class="btn btn-ghost btn-sm font-bold" id="btn-open-fullscreen" style="height: 28px; font-size: 11px; padding: 0 10px;">
            FullScreen ↗
          </button>
        </div>
      </header>

      <!-- Main Work Area with Resizable Split Pane -->
      <main class="content-area split-horizontal">
        <div class="split-pane" id="pane-main-top" style="flex: 1 1 50%; min-height: 100px;">
          <postapi-request-builder id="main-request-builder"></postapi-request-builder>
        </div>
        <div class="split-handle" style="height: 4px; background: var(--border); cursor: row-resize; z-index: 10;"></div>
        <div class="split-pane" id="pane-main-bottom" style="flex: 1 1 50%; min-height: 100px; display: flex; flex-direction: column;">
          <postapi-response-viewer id="main-response-viewer" class="flex-1 flex flex-col"></postapi-response-viewer>
          <postapi-diff-viewer id="main-diff-viewer" class="flex-1 flex flex-col hidden"></postapi-diff-viewer>
        </div>
      </main>

      <!-- Footer status indicators -->
      <footer class="status-bar-layout">
        <div class="status-left flex items-center gap-1.5">
          <span style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--success);"></span>
          <span id="status-text">Ready</span>
        </div>
        <div class="status-right font-mono" style="font-size: 10px;">
          PostAPI Panel v1.0.0
        </div>
      </footer>

      <!-- Modals containers -->
      <postapi-modal id="modal-environments-manager" title="Manage Environments"></postapi-modal>
      <postapi-modal id="modal-save-request" title="Save Request"></postapi-modal>
    </div>
  `;
}

function setupSplitPaneDragging() {
  const handle = document.querySelector('.split-handle');
  const topPane = document.querySelector('#pane-main-top');
  const bottomPane = document.querySelector('#pane-main-bottom');
  const container = document.querySelector('.content-area');

  if (!handle || !topPane || !bottomPane) return;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('active');
    document.body.classList.add('is-dragging');

    const doDrag = (moveEvent) => {
      const containerRect = container.getBoundingClientRect();
      const relativeY = moveEvent.clientY - containerRect.top;
      
      const percentage = (relativeY / containerRect.height) * 100;
      
      // Enforce min limits
      if (percentage > 15 && percentage < 85) {
        topPane.style.flex = `1 1 ${percentage}%`;
        bottomPane.style.flex = `1 1 ${100 - percentage}%`;
      }
    };

    const stopDrag = () => {
      handle.classList.remove('active');
      document.body.classList.remove('is-dragging');
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  });
}

function setupBackgroundConnection() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  if (activeTabId) {
    const port = chrome.runtime.connect({ name: 'postapi-panel' });
    port.postMessage({ type: 'BIND_PORT', tabId: activeTabId });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'CAPTURE_STATE') {
        isCapturing = msg.isCapturing;
        updateCaptureUI();
        if (reqList) reqList.requests = msg.requests;
      } 
      
      else if (msg.type === 'REQUEST_CAPTURED') {
        if (reqList) {
          reqList.requests = [msg.request, ...reqList.requests];
        }
      } 
      
      else if (msg.type === 'REQUEST_UPDATED') {
        if (reqList) {
          const list = [...reqList.requests];
          const idx = list.findIndex(r => r.id === msg.request.id);
          if (idx !== -1) {
            list[idx] = msg.request;
            reqList.requests = list;
          }
        }
      } 
      
      else if (msg.type === 'CLEAR_CAPTURED') {
        if (reqList) reqList.requests = [];
      }
    });
  }
}

function updateCaptureUI() {
  const toggleBtn = document.querySelector('#btn-capture-toggle');
  const dot = toggleBtn?.querySelector('.capture-dot');
  const txt = toggleBtn?.querySelector('#capture-status-text');

  if (!toggleBtn || !txt) return;

  if (isCapturing) {
    toggleBtn.style.backgroundColor = 'var(--error)';
    toggleBtn.style.borderColor = 'var(--error)';
    if (dot) dot.style.backgroundColor = '#fff';
    txt.textContent = 'Stop Capture';
  } else {
    toggleBtn.style.backgroundColor = 'var(--success)';
    toggleBtn.style.borderColor = 'var(--success)';
    if (dot) dot.style.backgroundColor = '#fff';
    txt.textContent = 'Start Capture';
  }
}

function setupComponentInteractions() {
  // 1. Sidebar Tab Switching
  const tabs = document.querySelectorAll('.sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.style.borderBottom = 'none';
      });
      tab.classList.add('active');
      tab.style.borderBottom = '2px solid var(--primary)';

      const target = tab.getAttribute('data-tab');
      document.querySelector('#side-pane-capture').classList.toggle('hidden', target !== 'capture');
      document.querySelector('#side-pane-collections').classList.toggle('hidden', target !== 'collections');
      document.querySelector('#side-pane-history').classList.toggle('hidden', target !== 'history');
      document.querySelector('#side-pane-cookies').classList.toggle('hidden', target !== 'cookies');

      // Refresh cookie manager domain if switching to cookies pane
      if (target === 'cookies' && cookieMgr) {
        cookieMgr.refresh();
      }
    });
  });

  // 2. Capture toggle action
  const captureBtn = document.querySelector('#btn-capture-toggle');
  captureBtn.addEventListener('click', () => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;

    const action = isCapturing ? MESSAGE_TYPES.STOP_CAPTURE : MESSAGE_TYPES.START_CAPTURE;
    chrome.runtime.sendMessage({ type: action, tabId: activeTabId }, (res) => {
      if (chrome.runtime.lastError) {
        showToast(`Capture failed: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (res && res.success) {
        isCapturing = res.isCapturing;
        updateCaptureUI();
        showToast(isCapturing ? 'Interception debugger started' : 'Interception debugger stopped', isCapturing ? 'success' : 'info');
      }
    });
  });

  // 3. Clear captured list action
  reqList.addEventListener('request-clear-all', () => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_CAPTURED, tabId: activeTabId });
  });

  // 4. Request Selection from Captured list / History / Collections
  const loadRequestIntoBuilder = (req) => {
    // Show normal response viewer and hide diff viewer
    respViewer.classList.remove('hidden');
    diffViewer.classList.add('hidden');
    respViewer.response = null;

    // Normalise the captured request structure into a structured request for the builder
    const normalizedReq = {
      id: req.id || generateId(),
      method: req.method || 'GET',
      url: req.url || '',
      name: req.name || '',
      headers: [],
      params: [],
      body: { type: 'none', content: '', evaluate: req.body?.evaluate !== false },
      auth: { type: 'none' },
      assertions: req.assertions || []
    };

    // 1. Parse and extract query params
    const parsed = parseUrl(normalizedReq.url);
    normalizedReq.params = parsed ? parsed.params : [];

    // 2. Extract and format headers
    const rawHeaders = req.headers || req.requestHeaders || [];
    normalizedReq.headers = rawHeaders.map(h => ({
      key: h.key || h.name || '',
      value: h.value || '',
      enabled: h.enabled !== false
    }));

    // 3. Extract and parse request body content
    const rawBody = req.body?.content !== undefined ? req.body.content : (req.requestBody || '');
    const rawBodyType = req.body?.type || '';

    if (rawBodyType) {
      normalizedReq.body = {
        type: rawBodyType,
        content: rawBody
      };
    } else if (rawBody) {
      let bodyType = 'none';
      let bodyContent = rawBody;
      const contentType = normalizedReq.headers.find(h => h.key?.toLowerCase() === 'content-type')?.value || '';

      if (contentType.includes('application/json')) {
        bodyType = 'json';
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        bodyType = 'urlEncoded';
        try {
          const searchParams = new URLSearchParams(rawBody);
          const pairs = [];
          for (const [key, value] of searchParams.entries()) {
            pairs.push({ key, value, enabled: true });
          }
          bodyContent = pairs;
        } catch {
          bodyContent = [];
        }
      } else if (contentType.includes('multipart/form-data')) {
        bodyType = 'formData';
        try {
          const parsedKV = JSON.parse(rawBody);
          if (Array.isArray(parsedKV)) {
            bodyContent = parsedKV.map(p => ({ key: p.key, value: p.value, enabled: true }));
          } else {
            bodyContent = [];
          }
        } catch {
          bodyContent = [];
        }
      } else {
        const trimmed = String(rawBody).trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          bodyType = 'json';
        } else {
          bodyType = 'raw';
        }
      }

      normalizedReq.body = {
        type: bodyType,
        content: bodyContent
      };
    }

    // 4. Parse and extract auth options from headers
    if (req.auth && req.auth.type && req.auth.type !== 'none') {
      normalizedReq.auth = req.auth;
    } else {
      let auth = { type: 'none' };
      const authHeader = normalizedReq.headers.find(h => h.key?.toLowerCase() === 'authorization')?.value || '';
      if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
          auth = {
            type: 'bearer',
            bearer: { token: authHeader.substring(7).trim() }
          };
        } else if (authHeader.startsWith('Basic ')) {
          try {
            const decoded = atob(authHeader.substring(6).trim());
            const parts = decoded.split(':');
            auth = {
              type: 'basic',
              basic: {
                username: parts[0] || '',
                password: parts.slice(1).join(':') || ''
              }
            };
          } catch {
            // Keep none
          }
        }
      }
      normalizedReq.auth = auth;
    }

    reqBuilder.request = normalizedReq;
    showToast(`Loaded request: ${normalizedReq.method} ${normalizedReq.name || 'Untitled'}`, 'info');
  };

  reqList.addEventListener('request-select', (e) => {
    loadRequestIntoBuilder(e.detail.request);
    
    // Auto populate response if request was captured with response body
    if (e.detail.request.statusCode) {
      respViewer.response = e.detail.request;
    }
  });

  histList.addEventListener('history-load-trigger', (e) => {
    loadRequestIntoBuilder(e.detail.historyItem);
    if (e.detail.historyItem.response) {
      const response = e.detail.historyItem.response;
      response.request = e.detail.historyItem;
      respViewer.response = response;
    }
  });

  colTree.addEventListener('request-load-trigger', async (e) => {
    const req = await storage.getRequest(e.detail.requestId);
    if (req) {
      loadRequestIntoBuilder(req);
    }
  });

  // 5. Send/Abort triggers in request builder
  reqBuilder.addEventListener('request-send', async (e) => {
    reqBuilder.isSending = true;
    document.querySelector('#status-text').textContent = 'Sending request...';

    // Resolve variables in request using Variable Resolver logic in SW context via BG executing
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_REQUEST_BG',
          request: e.detail.request
        }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res && res.success) {
            resolve(res.response);
          } else {
            reject(new Error(res?.error || 'Unknown execution error'));
          }
        });
      });

      reqBuilder.isSending = false;
      document.querySelector('#status-text').textContent = 'Ready';
      
      // Load response
      result.request = e.detail.request;
      respViewer.response = result;

      // Add request details to history
      await storage.addToHistory({
        id: generateId(),
        method: e.detail.request.method,
        url: e.detail.request.url,
        timestamp: Date.now(),
        headers: e.detail.request.headers,
        params: e.detail.request.params,
        body: e.detail.request.body,
        auth: e.detail.request.auth,
        assertions: e.detail.request.assertions || [],
        response: result,
        statusCode: result.statusCode,
        duration: result.duration,
        size: result.size
      });
      
      histList.refresh();
      showToast('Request completed!', 'success');
    } catch (err) {
      reqBuilder.isSending = false;
      document.querySelector('#status-text').textContent = 'Ready';
      showToast(err.message, 'error');
    }
  });

  // 6. Save Request to collection trigger
  reqBuilder.addEventListener('request-save', (e) => {
    const modal = document.querySelector('#modal-save-request');
    
    storage.getCollections().then(collections => {
      modal.setBody(`
        <form id="save-request-form" class="flex flex-col gap-3" style="font-size: 12px;">
          <div class="flex flex-col gap-1">
            <label class="font-medium text-secondary">Request Name</label>
            <input type="text" class="input" id="save-req-name" value="${e.detail.request.name || 'My API Request'}" required style="height: 28px;">
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-medium text-secondary">Target Collection</label>
            <select class="select" id="save-req-col" style="height: 28px;">
              ${collections.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              <option value="__new__">+ Create New Collection...</option>
            </select>
          </div>
          <div class="flex flex-col gap-1 hidden" id="save-new-col-container">
            <label class="font-medium text-secondary">New Collection Name</label>
            <input type="text" class="input" id="save-new-col-name" placeholder="Enter collection name" style="height: 28px;">
          </div>
        </form>
      `);

      const selectCol = modal.querySelector('#save-req-col');
      const newColContainer = modal.querySelector('#save-new-col-container');
      
      selectCol.addEventListener('change', () => {
        if (selectCol.value === '__new__') {
          newColContainer.classList.remove('hidden');
        } else {
          newColContainer.classList.add('hidden');
        }
      });

      // Show/hide immediately if no collections exist
      if (collections.length === 0) {
        selectCol.value = '__new__';
        newColContainer.classList.remove('hidden');
      }

      const footer = document.createElement('div');
      footer.className = 'flex gap-2 justify-end';
      footer.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="btn-save-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btn-save-submit">Save</button>
      `;
      modal.setFooter(footer);
      modal.open();

      footer.querySelector('#btn-save-cancel').addEventListener('click', () => modal.close());
      footer.querySelector('#btn-save-submit').addEventListener('click', async () => {
        const name = document.querySelector('#save-req-name').value.trim();
        let collectionId = document.querySelector('#save-req-col').value;

        if (!name) {
          showToast('Request name is required', 'error');
          return;
        }

        if (collectionId === '__new__') {
          const newColName = document.querySelector('#save-new-col-name').value.trim();
          if (!newColName) {
            showToast('Collection name is required', 'error');
            return;
          }
          const newCol = await storage.saveCollection({ name: newColName, folders: [] });
          collectionId = newCol.id;
        }

        if (!collectionId) {
          showToast('Please select or create a collection', 'error');
          return;
        }

        const newReq = {
          ...e.detail.request,
          name,
          collectionId,
          id: e.detail.request.id || generateId()
        };

        await storage.saveRequest(newReq);
        modal.close();
        colTree.refresh();
        showToast('Request saved to collection', 'success');
      });
    });
  });

  // 7. Environment selector manage trigger
  envSelector.addEventListener('environment-manage-trigger', () => {
    const modal = document.querySelector('#modal-environments-manager');
    
    const refreshModalContent = () => {
      storage.getEnvironments().then(envs => {
        let envsListHtml = envs.map(env => `
          <div class="flex items-center justify-between p-2 border-b hover:bg-hover" style="border-bottom: 1px solid var(--border);">
            <span class="font-medium text-primary">${env.name}</span>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm btn-edit-env" data-id="${env.id}" style="height: 22px; font-size: 11px;">Edit</button>
              <button class="btn btn-ghost btn-sm btn-delete-env" data-id="${env.id}" style="height: 22px; font-size: 11px; color: var(--error);">Delete</button>
            </div>
          </div>
        `).join('');

        if (envs.length === 0) {
          envsListHtml = '<div class="text-muted text-center p-3">No environments found.</div>';
        }

        modal.setBody(`
          <div class="flex flex-col gap-3" style="font-size: 12px; min-width: 400px;">
            <div class="flex items-center justify-between">
              <span class="font-bold text-secondary">Environments</span>
              <button class="btn btn-primary btn-sm" id="btn-create-env" style="height: 24px; font-size: 11px;">+ Environment</button>
            </div>
            <div class="divider-horizontal" style="height: 1px; background: var(--border);"></div>
            <div class="envs-list-container" style="max-height: 200px; overflow-y: auto;">
              ${envsListHtml}
            </div>
          </div>
        `);

        // Hook buttons inside modal body
        modal.querySelector('#btn-create-env').addEventListener('click', async () => {
          const name = prompt('Enter environment name:');
          if (name && name.trim()) {
            await storage.saveEnvironment({ name: name.trim(), variables: [] });
            refreshModalContent();
          }
        });

        modal.querySelectorAll('.btn-edit-env').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const env = envs.find(e => e.id === id);
            if (env) showVariableEditor(env);
          });
        });

        modal.querySelectorAll('.btn-delete-env').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const env = envs.find(e => e.id === id);
            if (env && confirm(`Delete environment "${env.name}"?`)) {
              await storage.deleteEnvironment(id);
              refreshModalContent();
              envSelector.refresh();
            }
          });
        });
      });
    };

    const showVariableEditor = (env) => {
      modal.setBody(`
        <div class="flex flex-col gap-3" style="font-size: 12px; min-width: 480px;">
          <div class="flex items-center justify-between">
            <span class="font-bold text-secondary">Variables: ${env.name}</span>
            <button class="btn btn-ghost btn-sm" id="btn-back-to-envs" style="height: 24px; font-size: 11px;">← Back</button>
          </div>
          <div class="divider-horizontal" style="height: 1px; background: var(--border);"></div>
          <postapi-key-value-editor id="env-var-editor" key-placeholder="Variable Key" value-placeholder="Variable Value"></postapi-key-value-editor>
        </div>
      `);

      const editor = modal.querySelector('#env-var-editor');
      editor.value = env.variables || [];

      modal.querySelector('#btn-back-to-envs').addEventListener('click', () => {
        refreshModalContent();
      });

      // Embed save action in footer
      const footer = document.createElement('div');
      footer.className = 'flex gap-2 justify-end';
      footer.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="btn-var-cancel">Close</button>
        <button class="btn btn-primary btn-sm" id="btn-var-save">Save Variables</button>
      `;
      modal.setFooter(footer);

      footer.querySelector('#btn-var-cancel').addEventListener('click', () => modal.close());
      footer.querySelector('#btn-var-save').addEventListener('click', async () => {
        const updatedEnv = {
          ...env,
          variables: editor.value
        };
        await storage.saveEnvironment(updatedEnv);
        showToast('Environment variables saved!', 'success');
        refreshModalContent();
        envSelector.refresh();
      });
    };

    refreshModalContent();
    modal.open();
  });

  // 8. Open standalone tab action
  const fsBtn = document.querySelector('#btn-open-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_FULLSCREEN });
      }
    });
  }

  // 9. Import trigger from collection tree
  colTree.addEventListener('collection-import-trigger', () => {
    // Create an input file element dynamically to import
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const raw = event.target.result;
          const { collection, requests } = importExportManager.importFromJson(raw);

          // Save collection
          const savedCol = await storage.saveCollection(collection);
          
          // Save requests
          for (const req of requests) {
            req.collectionId = savedCol.id;
            await storage.saveRequest(req);
          }

          colTree.refresh();
          showToast(`Collection "${savedCol.name}" imported successfully!`, 'success');
        } catch (err) {
          showToast(`Import failed: ${err.message}`, 'error');
        } finally {
          document.body.removeChild(input);
        }
      };
      reader.readAsText(file);
    });

    input.click();
  });

  // 10. Export trigger from collection tree
  colTree.addEventListener('collection-export-trigger', async (e) => {
    try {
      const collectionId = e.detail.collectionId;
      const collections = await storage.getCollections();
      const col = collections.find(c => c.id === collectionId);
      if (!col) {
        showToast('Collection not found', 'error');
        return;
      }
      
      const requests = await storage.getCollectionRequests(collectionId);
      const jsonStr = importExportManager.exportCollection(col, requests, 'postapi');
      
      // Trigger download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${col.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_collection.json`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);

      showToast(`Collection "${col.name}" exported successfully!`, 'success');
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
    }
  });
}

function setupPreferencesSync(settings) {
  // Theme toggle
  const themeBtn = document.querySelector('#btn-theme-toggle');
  themeBtn.addEventListener('click', async () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    themeBtn.textContent = newTheme === 'light' ? '☀️' : '🌙';
    await storage.updateSettings({ theme: newTheme });
  });
  themeBtn.textContent = settings.theme === 'light' ? '☀️' : '🌙';

  // Language selector with flag
  const FLAGS = { en: '🇺🇸', tr: '🇹🇷', ar: '🇸🇦' };
  const langSelect = document.querySelector('#lang-select');
  const langFlag   = document.querySelector('#lang-flag');

  function updateFlag(lang) {
    if (langFlag) langFlag.textContent = FLAGS[lang] || '🌐';
  }

  /**
   * Re-render every custom web component so their internally generated HTML
   * picks up the new language from window.i18n.
   */
  function reRenderAllComponents() {
    // Components with a render() method
    [reqBuilder, respViewer, reqList, histList, colTree, cookieMgr, envSelector].forEach(c => {
      if (c && typeof c.render === 'function') {
        try { c.render(); } catch (e) { console.warn('Re-render failed for component', e); }
      }
    });

    // After re-rendering, translate everything that uses data-i18n
    i18n.translatePage(document);
  }

  if (langSelect) {
    langSelect.value = i18n.language;
    updateFlag(i18n.language);

    langSelect.addEventListener('change', async (e) => {
      const lang = e.target.value;
      await i18n.setLanguage(lang);  // persists + calls translatePage(document)
      updateFlag(lang);
      reRenderAllComponents();        // re-render components that generate own HTML
      showToast(i18n.getMessage('success'), 'success');
    });
  }
}
