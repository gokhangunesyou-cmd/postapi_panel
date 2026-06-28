/**
 * PostAPI Panel — Popup Controller
 * Implements tab switching, network capture display, headers copying,
 * declarativeNetRequest header manipulation, and URL query parameter editing.
 */

import i18n from '../lib/i18n.js';
import { MESSAGE_TYPES, STORAGE_KEYS } from '../lib/constants.js';
import storage from '../lib/storage.js';
import { parseUrl, buildUrl, generateId } from '../lib/utils.js';

let activeTabId = null;
let activeTabUrl = '';
let activeTabDomain = '';
let isCapturing = false;
let currentTabParams = [];
let allStorageItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Translate popup
  await i18n.init(document.body);

  // Tab switching
  const tabs = document.querySelectorAll('.popup-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetPane = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      document.getElementById(targetPane).classList.add('active');
    });
  });

  // Query active tab info
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0]) {
        const tab = tabs[0];
        activeTabId = tab.id;
        activeTabUrl = tab.url;

        const parsed = parseUrl(tab.url);
        if (parsed) {
          activeTabDomain = parsed.hostname;
          document.getElementById('active-tab-domain').textContent = activeTabDomain;
          document.getElementById('active-tab-domain').title = tab.url;
          currentTabParams = parsed.params || [];
        }

        // Fetch capture state
        chrome.runtime.sendMessage({
          type: 'GET_CAPTURE_STATE',
          tabId: activeTabId
        }, (res) => {
          if (res && res.success) {
            isCapturing = res.isCapturing;
            updateCaptureUI();
            
            // Populate captured headers if any requests exist
            if (res.requests && res.requests.length > 0) {
              renderCapturedHeaders(res.requests[0]);
            }
          }
        });

        // Load active header rules
        loadRulesData();

        // Load query parameters
        loadParamsData();

        // Load cookies & storage data
        loadStorageData();
      }
    });
  }

  // Hook capture toggle button
  const toggleBtn = document.querySelector('#btn-popup-capture-toggle');
  toggleBtn.addEventListener('click', () => {
    if (!activeTabId) return;

    const action = isCapturing ? MESSAGE_TYPES.STOP_CAPTURE : MESSAGE_TYPES.START_CAPTURE;
    
    chrome.runtime.sendMessage({
      type: action,
      tabId: activeTabId
    }, (res) => {
      if (res && res.success) {
        isCapturing = res.isCapturing;
        updateCaptureUI();
        
        // Fetch fresh state & requests
        chrome.runtime.sendMessage({
          type: 'GET_CAPTURE_STATE',
          tabId: activeTabId
        }, (freshRes) => {
          if (freshRes && freshRes.requests && freshRes.requests.length > 0) {
            renderCapturedHeaders(freshRes.requests[0]);
          }
        });
      }
    });
  });

  // Hook workspace launcher button
  const openFsBtn = document.querySelector('#btn-popup-open-fs');
  openFsBtn.addEventListener('click', async () => {
    if (activeTabId) {
      await storage.set(STORAGE_KEYS.ACTIVE_TAB, activeTabId);
    }
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_FULLSCREEN });
    window.close(); // Close popup panel
  });

  // Hook rule action select to toggle value input visibility
  const ruleActionSelect = document.getElementById('rule-action');
  ruleActionSelect.addEventListener('change', () => {
    const valRow = document.getElementById('rule-val-row');
    if (ruleActionSelect.value === 'remove') {
      valRow.style.display = 'none';
    } else {
      valRow.style.display = 'block';
    }
  });

  // Hook rule save button
  const saveRuleBtn = document.getElementById('btn-save-rule');
  saveRuleBtn.addEventListener('click', async () => {
    const action = document.getElementById('rule-action').value;
    const name = document.getElementById('rule-name').value.trim();
    const val = document.getElementById('rule-value').value.trim();

    if (!name) {
      alert('Header Name is required.');
      return;
    }

    const newRule = {
      id: generateId(),
      name: `Popup - ${name} (${action})`,
      enabled: true,
      urlPattern: `*${activeTabDomain}*`,
      isRegex: false,
      headerType: 'request',
      action,
      headerName: name,
      headerValue: action === 'remove' ? '' : val
    };

    await storage.saveHeaderRule(newRule);
    
    // Broadcast updates to apply declarativeNetRequest rules
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.UPDATE_HEADER_RULES });
    
    // Clear inputs and reload list
    document.getElementById('rule-name').value = '';
    document.getElementById('rule-value').value = '';
    loadRulesData();
  });

  // Hook add parameter row
  const addParamBtn = document.getElementById('btn-add-param-row');
  addParamBtn.addEventListener('click', () => {
    const key = document.getElementById('new-param-key').value.trim();
    const val = document.getElementById('new-param-value').value.trim();

    if (!key) {
      alert('Parameter Key is required.');
      return;
    }

    currentTabParams.push({ key, value: val, enabled: true });
    
    // Clear inputs and render
    document.getElementById('new-param-key').value = '';
    document.getElementById('new-param-value').value = '';
    renderParamsList();
  });

  // Hook reload params button
  const reloadParamsBtn = document.getElementById('btn-reload-params');
  reloadParamsBtn.addEventListener('click', () => {
    if (!activeTabId) return;

    // Gather parameter inputs
    const updatedParams = [];
    const rows = document.querySelectorAll('.param-row');
    rows.forEach(row => {
      const keyInput = row.querySelector('.param-key-input');
      const valInput = row.querySelector('.param-val-input');
      if (keyInput && valInput) {
        const key = keyInput.value.trim();
        const value = valInput.value.trim();
        if (key) {
          updatedParams.push({ key, value, enabled: true });
        }
      }
    });

    const newUrl = buildUrl(activeTabUrl.split('?')[0], updatedParams);
    chrome.tabs.update(activeTabId, { url: newUrl });
    window.close(); // Close popup after navigating
  });

  // Hook Storage & Cookies refresh button
  const refreshStorageBtn = document.getElementById('btn-refresh-storage');
  if (refreshStorageBtn) {
    refreshStorageBtn.addEventListener('click', () => loadStorageData());
  }

  // Hook Storage & Cookies search input
  const storageSearchInput = document.getElementById('storage-search');
  if (storageSearchInput) {
    storageSearchInput.addEventListener('input', () => filterStorageList());
  }
});

// ─── Capture Tab Helpers ─────────────────────────────────────────────────────

function updateCaptureUI() {
  const badge = document.querySelector('#popup-capture-badge');
  const btn = document.querySelector('#btn-popup-capture-toggle');
  
  if (isCapturing) {
    badge.textContent = 'ON';
    badge.className = 'badge badge-success font-bold';
    btn.textContent = 'Stop Capture';
    btn.className = 'btn btn-danger btn-sm';
  } else {
    badge.textContent = 'OFF';
    badge.className = 'badge font-bold';
    btn.textContent = 'Start Capture';
    btn.className = 'btn btn-primary btn-sm';
  }
}

function renderCapturedHeaders(req) {
  const container = document.getElementById('captured-headers-list');
  const methodUrlLabel = document.getElementById('last-req-method-url');

  if (!req) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span>No headers captured. Trigger network calls or reload the active tab.</span>
      </div>
    `;
    methodUrlLabel.textContent = 'No requests captured yet';
    return;
  }

  // Display method + url
  methodUrlLabel.textContent = `${req.method} ${req.url}`;
  methodUrlLabel.title = req.url;

  const headers = req.headers || req.requestHeaders || [];
  if (headers.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span>This request did not contain any headers.</span>
      </div>
    `;
    return;
  }

  let html = '';
  headers.forEach(h => {
    const key = h.key || h.name || '';
    const value = h.value || '';
    html += `
      <div class="data-row">
        <div class="data-key" title="${key}">${key}</div>
        <div class="data-val" title="${value}">${value}</div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-xs btn-copy-item" data-text="${value}" title="Copy Value" style="padding: 2px 4px; font-size: 10px;">📋</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add copy listeners
  container.querySelectorAll('.btn-copy-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text');
      navigator.clipboard.writeText(text);
      btn.textContent = '✓';
      setTimeout(() => btn.textContent = '📋', 1500);
    });
  });
}

// ─── Header Rules Tab Helpers ────────────────────────────────────────────────

async function loadRulesData() {
  const rules = await storage.getHeaderRules();
  // Filter rules matching this site domain
  const siteRules = rules.filter(r => r.urlPattern && r.urlPattern.includes(activeTabDomain));
  
  const container = document.getElementById('rules-list-container');
  if (siteRules.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span>No header modifiers active for this site.</span>
      </div>
    `;
    return;
  }

  let html = '';
  siteRules.forEach(r => {
    html += `
      <div class="data-row" style="background-color: ${r.enabled ? 'transparent' : 'rgba(255,255,255,0.02)'}; opacity: ${r.enabled ? 1 : 0.6}">
        <div class="data-key" title="${r.headerName} (${r.action})" style="flex: 0.4;">
          <span style="color: var(--text-muted); font-size: 9px; text-transform: uppercase;">[${r.action}]</span>
          ${r.headerName}
        </div>
        <div class="data-val" title="${r.headerValue || 'Removed'}" style="flex: 0.45; color: ${r.action === 'remove' ? 'var(--error)' : 'var(--text-primary)'};">
          ${r.action === 'remove' ? '<i>Removed</i>' : r.headerValue}
        </div>
        <div class="row-actions" style="flex: 0.15;">
          <button class="btn btn-ghost btn-xs btn-delete-rule" data-id="${r.id}" title="Delete Modifier" style="color: var(--error); padding: 2px 4px; font-size: 10px;">🗑️</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add delete listeners
  container.querySelectorAll('.btn-delete-rule').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await storage.deleteHeaderRule(id);
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.UPDATE_HEADER_RULES });
      loadRulesData();
    });
  });
}

// ─── Params Tab Helpers ──────────────────────────────────────────────────────

function loadParamsData() {
  renderParamsList();
}

function renderParamsList() {
  const container = document.getElementById('params-list-container');
  if (currentTabParams.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span>No query parameters in the active tab URL.</span>
      </div>
    `;
    return;
  }

  let html = '';
  currentTabParams.forEach((p, idx) => {
    html += `
      <div class="data-row param-row" data-index="${idx}">
        <input type="text" class="input font-mono param-key-input" value="${p.key}" style="flex: 0.4; height: 24px; padding: 2px 6px; font-size: 11px;">
        <input type="text" class="input font-mono param-val-input" value="${p.value || ''}" style="flex: 0.45; height: 24px; padding: 2px 6px; font-size: 11px;">
        <div class="row-actions" style="flex: 0.15;">
          <button class="btn btn-ghost btn-xs btn-delete-param" data-index="${idx}" style="color: var(--error); padding: 2px 4px; font-size: 10px;">🗑️</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add delete listeners
  container.querySelectorAll('.btn-delete-param').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      currentTabParams.splice(idx, 1);
      renderParamsList();
    });
  });
}

// ─── Storage & Cookies Tab Helpers ───────────────────────────────────────────

async function loadStorageData() {
  if (!activeTabId) return;
  allStorageItems = [];
  
  const container = document.getElementById('storage-list-container');
  if (container) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span>Loading cookies and storage...</span>
      </div>
    `;
  }

  // 1. Fetch Cookies
  try {
    const cookies = await new Promise((resolve) => {
      chrome.cookies.getAll({ url: activeTabUrl }, resolve);
    });
    if (cookies) {
      cookies.forEach(c => {
        allStorageItems.push({
          type: 'cookie',
          key: c.name,
          value: c.value,
          domain: c.domain,
          rawCookie: c
        });
      });
    }
  } catch (err) {
    console.error('Failed to get cookies:', err);
  }

  // 2. Fetch LocalStorage and SessionStorage from active page context
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: () => {
        const items = [];
        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            items.push({ type: 'local', key, value: window.localStorage.getItem(key) });
          }
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            items.push({ type: 'session', key, value: window.sessionStorage.getItem(key) });
          }
        } catch (e) {
          // Security error or access denied (e.g. protected scheme)
        }
        return items;
      }
    });
    
    if (results && results[0] && results[0].result) {
      allStorageItems.push(...results[0].result);
    }
  } catch (err) {
    console.error('Failed to get page storage:', err);
  }

  // Sort items: put keys containing 'token', 'auth', 'jwt', 'session', 'secret', 'key' at the top!
  const priorityRegex = /token|auth|jwt|session|secret|key|id/i;
  allStorageItems.sort((a, b) => {
    const aPriority = priorityRegex.test(a.key);
    const bPriority = priorityRegex.test(b.key);
    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;
    return a.key.localeCompare(b.key);
  });

  filterStorageList();
}

function filterStorageList() {
  const query = document.getElementById('storage-search')?.value.toLowerCase() || '';
  const container = document.getElementById('storage-list-container');
  if (!container) return;

  const filtered = allStorageItems.filter(item => 
    item.key.toLowerCase().includes(query) || 
    (item.value && item.value.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <span>No matching cookies or storage keys found.</span>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach((item, index) => {
    const typeLabel = item.type === 'cookie' ? '🍪 Cookie' : item.type === 'local' ? '💾 Local' : '⚡ Session';
    const badgeColor = item.type === 'cookie' ? 'var(--info)' : item.type === 'local' ? 'var(--success)' : 'var(--warning)';
    
    html += `
      <div class="data-row" style="padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border);">
        <div class="data-key" title="${item.key}" style="flex: 0.4; display: flex; flex-direction: column; gap: 1px;">
          <span style="font-size: 8px; color: ${badgeColor}; font-weight: bold; text-transform: uppercase;">${typeLabel}</span>
          <span class="font-mono text-ellipsis" style="overflow: hidden; max-width: 170px;">${item.key}</span>
        </div>
        <div class="data-val" title="${item.value || ''}" style="flex: 0.45; font-family: var(--font-mono); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: all; padding-inline-end: 4px;">
          ${item.value || '<i class="text-muted">empty</i>'}
        </div>
        <div class="row-actions" style="flex: 0.15; display: flex; gap: 2px;">
          <button class="btn btn-ghost btn-xs btn-copy-storage" data-val="${item.value || ''}" title="Copy Value" style="padding: 2px 4px; font-size: 10px;">📋</button>
          <button class="btn btn-ghost btn-xs btn-edit-storage" data-index="${index}" title="Edit Value" style="padding: 2px 4px; font-size: 10px;">✏️</button>
          <button class="btn btn-ghost btn-xs btn-delete-storage" data-index="${index}" title="Delete" style="color: var(--error); padding: 2px 4px; font-size: 10px;">🗑️</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add copy listeners
  container.querySelectorAll('.btn-copy-storage').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      navigator.clipboard.writeText(val);
      btn.textContent = '✓';
      setTimeout(() => btn.textContent = '📋', 1500);
    });
  });

  // Add edit listeners
  container.querySelectorAll('.btn-edit-storage').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      const item = allStorageItems[idx];
      if (!item) return;

      const newVal = prompt(`Edit ${item.type} value for "${item.key}":`, item.value);
      if (newVal === null) return; // cancelled
      
      let success = false;
      if (item.type === 'cookie') {
        try {
          await updateCookieHelper(activeTabUrl, item.key, newVal, item.rawCookie);
          success = true;
        } catch (err) {
          alert(`Failed to update cookie: ${err.message}`);
        }
      } else {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            args: [item.type, item.key, newVal],
            func: (storageType, k, v) => {
              try {
                if (storageType === 'local') {
                  window.localStorage.setItem(k, v);
                } else {
                  window.sessionStorage.setItem(k, v);
                }
                return true;
              } catch (e) {
                return false;
              }
            }
          });
          success = true;
        } catch (err) {
          alert(`Failed to update storage: ${err.message}`);
        }
      }
      
      if (success) {
        // Automatically reload the active tab to apply changes immediately
        chrome.tabs.reload(activeTabId);
      }
      
      // Reload storage data
      loadStorageData();
    });
  });

  // Add delete listeners
  container.querySelectorAll('.btn-delete-storage').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      const item = allStorageItems[idx];
      if (!item) return;

      if (!confirm(`Delete ${item.type} "${item.key}"?`)) return;

      let success = false;
      if (item.type === 'cookie') {
        try {
          await new Promise((resolve, reject) => {
            chrome.cookies.remove({
              url: activeTabUrl,
              name: item.key,
              storeId: item.rawCookie.storeId
            }, (res) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(res);
            });
          });
          success = true;
        } catch (err) {
          alert(`Failed to delete cookie: ${err.message}`);
        }
      } else {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            args: [item.type, item.key],
            func: (storageType, k) => {
              try {
                if (storageType === 'local') {
                  window.localStorage.removeItem(k);
                } else {
                  window.sessionStorage.removeItem(k);
                }
                return true;
              } catch (e) {
                return false;
              }
            }
          });
          success = true;
        } catch (err) {
          alert(`Failed to delete storage: ${err.message}`);
        }
      }

      if (success) {
        chrome.tabs.reload(activeTabId);
      }
      loadStorageData();
    });
  });
}

/**
 * Safely updates a cookie, keeping its original domain, path, secure, and HTTPOnly attributes.
 * Prevents Chrome from creating duplicate cookies on subdomains/root domains.
 */
async function updateCookieHelper(url, name, value, originalCookie) {
  return new Promise((resolve, reject) => {
    const details = {
      url: url,
      name: name,
      value: value,
      path: originalCookie.path || '/'
    };

    // Keep domain if not hostOnly
    if (!originalCookie.hostOnly && originalCookie.domain) {
      details.domain = originalCookie.domain;
    }

    if (originalCookie.secure !== undefined) details.secure = originalCookie.secure;
    if (originalCookie.httpOnly !== undefined) details.httpOnly = originalCookie.httpOnly;
    if (originalCookie.expirationDate !== undefined) details.expirationDate = originalCookie.expirationDate;
    if (originalCookie.storeId !== undefined) details.storeId = originalCookie.storeId;

    chrome.cookies.set(details, (c) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(c);
      }
    });
  });
}
