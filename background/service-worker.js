/**
 * PostAPI Panel — Background Service Worker (ES Module)
 * Manages extension lifecycle, message routing, header rule injection (declarativeNetRequest),
 * tab-specific network debugging (CDP), and CORS-free request execution.
 */

import { STORAGE_KEYS, MESSAGE_TYPES, DEFAULT_SETTINGS } from '../lib/constants.js';
import storage from '../lib/storage.js';
import { generateId } from '../lib/utils.js';
import variableResolver from '../lib/variable-resolver.js';

// Track active debugging sessions (tabId -> boolean)
const activeDebugTabs = new Map();

// Track captured requests (tabId -> array of requests)
const capturedRequests = new Map();

// Port connections (tabId -> Array of connected ports: devtools, sidebar, app)
const tabPorts = new Map();

// ─── Service Worker Initialization ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[PostAPI SW] Extension installed:', details.reason);
  
  // Set default settings if not already present
  const settings = await storage.getSettings();
  if (Object.keys(settings).length === 0) {
    await storage.updateSettings(DEFAULT_SETTINGS);
  }
  
  // Set up storage defaults
  await storage.migrate();

  // Welcome page
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html') });
  }
});

// Clean up debugging session when tabs are closed
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (activeDebugTabs.has(tabId)) {
      stopCDPInterception(tabId);
    }
    capturedRequests.delete(tabId);
    tabPorts.delete(tabId);
  });
}

// Track the most recently active non-extension tab in storage
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab && tab.url && !tab.url.startsWith('chrome-extension://')) {
        await storage.set(STORAGE_KEYS.ACTIVE_TAB, activeInfo.tabId);
      }
    } catch (err) {
      // Ignore
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    try {
      if (tab && tab.active && tab.url && !tab.url.startsWith('chrome-extension://')) {
        await storage.set(STORAGE_KEYS.ACTIVE_TAB, tabId);
      }
    } catch (err) {
      // Ignore
    }
  });
}


// ─── Port Connection Routing ────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  console.log(`[PostAPI SW] Port connected: ${port.name}`);
  
  port.onMessage.addListener(async (msg, senderPort) => {
    // Expected message from DevTools or other panel to bind to tabId
    if (msg.type === 'BIND_PORT' && msg.tabId) {
      const tabId = parseInt(msg.tabId);
      port.tabId = tabId;
      
      let ports = tabPorts.get(tabId) || [];
      ports.push(port);
      tabPorts.set(tabId, ports);

      console.log(`[PostAPI SW] Port ${port.name} bound to tab ${tabId}`);

      // Send initial capture state and request buffer
      port.postMessage({
        type: 'CAPTURE_STATE',
        isCapturing: activeDebugTabs.has(tabId),
        requests: capturedRequests.get(tabId) || []
      });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log(`[PostAPI SW] Port disconnected: ${port.name}`);
    if (port.tabId) {
      let ports = tabPorts.get(port.tabId) || [];
      ports = ports.filter(p => p !== port);
      if (ports.length === 0) {
        tabPorts.delete(port.tabId);
      } else {
        tabPorts.set(port.tabId, ports);
      }
    }
  });
});

// ─── Message Router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Handle async response
  const handleAsyncMessage = async () => {
    switch (msg.type) {
      case 'GET_CAPTURE_STATE': {
        const tabId = msg.tabId;
        return { 
          success: true, 
          isCapturing: activeDebugTabs.has(tabId),
          requests: capturedRequests.get(tabId) || []
        };
      }

      case MESSAGE_TYPES.START_CAPTURE: {
        const tabId = msg.tabId || sender.tab?.id;
        if (!tabId) throw new Error('No target tab ID provided for capture');
        await startCDPInterception(tabId);
        return { success: true, isCapturing: true };
      }

      case MESSAGE_TYPES.STOP_CAPTURE: {
        const tabId = msg.tabId || sender.tab?.id;
        if (!tabId) throw new Error('No target tab ID provided for capture');
        await stopCDPInterception(tabId);
        return { success: true, isCapturing: false };
      }

      case MESSAGE_TYPES.CLEAR_CAPTURED: {
        const tabId = msg.tabId;
        if (tabId) {
          capturedRequests.set(tabId, []);
          broadcastToTab(tabId, { type: 'CLEAR_CAPTURED' });
        }
        return { success: true };
      }

      case 'REQUEST_CAPTURED_CS': {
        const tabId = sender.tab?.id;
        if (!tabId) return { success: false };

        if (!capturedRequests.has(tabId)) {
          capturedRequests.set(tabId, []);
        }
        const tabBuffer = capturedRequests.get(tabId);
        
        const request = msg.data;
        request.id = request.id || generateId();

        tabBuffer.unshift(request);
        if (tabBuffer.length > 500) tabBuffer.pop();

        broadcastToTab(tabId, { type: 'REQUEST_CAPTURED', request });
        return { success: true };
      }

      case 'EXECUTE_REQUEST_BG': {
        // Execute request from Background context to bypass CORS
        try {
          const response = await executeRequestBackground(msg.request);
          return { success: true, response };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }

      case MESSAGE_TYPES.UPDATE_HEADER_RULES: {
        // Refresh DNR rules
        await updateDNRRules();
        return { success: true };
      }

      case MESSAGE_TYPES.OPEN_FULLSCREEN: {
        chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html') });
        return { success: true };
      }

      default:
        // Let it fall through
        return null;
    }
  };

  handleAsyncMessage()
    .then(res => {
      if (res !== null) sendResponse(res);
    })
    .catch(err => {
      sendResponse({ success: false, error: err.message });
    });

  return true; // Keep message channel open for async response
});

// ─── Broadcast Utility ──────────────────────────────────────────────────────
function broadcastToTab(tabId, message) {
  const ports = tabPorts.get(tabId);
  if (ports && ports.length > 0) {
    ports.forEach(port => {
      try {
        port.postMessage(message);
      } catch (err) {
        console.error('[PostAPI SW] Failed to post to port:', err);
      }
    });
  }
}

// ─── CDP Debugger Interception ──────────────────────────────────────────────
async function startCDPInterception(tabId) {
  if (activeDebugTabs.has(tabId)) return;

  return new Promise((resolve, reject) => {
    const target = { tabId };
    chrome.debugger.attach(target, '1.3', () => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }

      activeDebugTabs.set(tabId, true);
      chrome.debugger.sendCommand(target, 'Network.enable', {}, () => {
        if (chrome.runtime.lastError) {
          chrome.debugger.detach(target);
          activeDebugTabs.delete(tabId);
          return reject(new Error(chrome.runtime.lastError.message));
        }

        console.log(`[PostAPI SW] Attached debugger to tab ${tabId}`);
        // Clear previous buffer
        if (!capturedRequests.has(tabId)) {
          capturedRequests.set(tabId, []);
        }

        // Notify panels
        broadcastToTab(tabId, { type: 'CAPTURE_STATE', isCapturing: true, requests: capturedRequests.get(tabId) || [] });
        resolve();
      });
    });
  });
}

async function stopCDPInterception(tabId) {
  if (!activeDebugTabs.has(tabId)) return;

  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      activeDebugTabs.delete(tabId);
      console.log(`[PostAPI SW] Detached debugger from tab ${tabId}`);
      
      // Notify panels
      broadcastToTab(tabId, { type: 'CAPTURE_STATE', isCapturing: false, requests: capturedRequests.get(tabId) || [] });
      resolve();
    });
  });
}

// Listen to Debugger Network Domain CDP events
if (typeof chrome !== 'undefined' && chrome.debugger && chrome.debugger.onEvent) {
  chrome.debugger.onEvent.addListener(async (source, method, params) => {
    const tabId = source.tabId;
    if (!activeDebugTabs.has(tabId)) return;

    // Initialize request buffer for tab if not present
    if (!capturedRequests.has(tabId)) {
      capturedRequests.set(tabId, []);
    }

    const tabBuffer = capturedRequests.get(tabId);

    if (method === 'Network.requestWillBeSent') {
      // Only capture XHR/Fetch requests
      const type = params.type;
      if (type !== 'XHR' && type !== 'Fetch') return;

      const request = {
        id: params.requestId,
        method: params.request.method,
        url: params.request.url,
        requestHeaders: Object.entries(params.request.headers).map(([key, value]) => ({ key, value, enabled: true })),
        requestBody: params.request.postData || '',
        type: type.toLowerCase(),
        initiator: params.initiator?.stack?.callFrames?.[0]?.url || 'unknown',
        timestamp: Math.round(params.wallTime * 1000),
        duration: 0,
        size: 0,
        statusCode: 0,
        statusText: 'Pending...',
        responseHeaders: [],
        responseBody: ''
      };

      tabBuffer.unshift(request);
      // Keep max 500 captured requests
      if (tabBuffer.length > 500) tabBuffer.pop();

      broadcastToTab(tabId, { type: 'REQUEST_CAPTURED', request });
    }

    else if (method === 'Network.responseReceived') {
      const request = tabBuffer.find(r => r.id === params.requestId);
      if (!request) return;

      request.statusCode = params.response.status;
      request.statusText = params.response.statusText || 'OK';
      request.responseHeaders = Object.entries(params.response.headers).map(([key, value]) => ({ key, value }));
      request.size = params.response.encodedDataLength || 0;

      // Fetch response body asynchronously
      setTimeout(() => {
        chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody', { requestId: params.requestId }, (responseBodyResult) => {
          if (!chrome.runtime.lastError && responseBodyResult) {
            request.responseBody = responseBodyResult.body;
          }
          
          // Notify panels of completed response details
          broadcastToTab(tabId, { type: 'REQUEST_UPDATED', request });
        });
      }, 100);
    }

    else if (method === 'Network.loadingFinished') {
      const request = tabBuffer.find(r => r.id === params.requestId);
      if (!request) return;

      const duration = params.timestamp - (request.timestamp / 1000);
      request.duration = Math.max(1, Math.round(duration * 1000));
      request.size = params.encodedDataLength || request.size;

      broadcastToTab(tabId, { type: 'REQUEST_UPDATED', request });
    }
  });
}

// Detach handler for browser UI interactions
if (typeof chrome !== 'undefined' && chrome.debugger && chrome.debugger.onDetached) {
  chrome.debugger.onDetached.addListener((source, reason) => {
    const tabId = source.tabId;
    activeDebugTabs.delete(tabId);
    console.log(`[PostAPI SW] Debugger detached automatically from tab ${tabId}:`, reason);
    broadcastToTab(tabId, { type: 'CAPTURE_STATE', isCapturing: false, requests: capturedRequests.get(tabId) || [] });
  });
}

// ─── Declarative Net Request (Header Rules) ─────────────────────────────────
async function updateDNRRules() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) return;

  const rules = await storage.getHeaderRules();
  const activeEnvId = await storage.get(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
  const environments = await storage.getEnvironments();
  const activeEnv = environments.find(e => e.id === activeEnvId) || null;

  const dnrRules = [];
  let ruleIdCounter = 1;

  rules.forEach(rule => {
    if (!rule.enabled) return;

    // Resolve variables in values if active environment exists
    let headerValue = rule.headerValue;
    if (activeEnv && activeEnv.variables) {
      activeEnv.variables.forEach(v => {
        if (v.enabled) {
          const placeholder = `{{${v.key}}}`;
          headerValue = headerValue.replaceAll(placeholder, v.value);
        }
      });
    }

    const dnrRule = {
      id: ruleIdCounter++,
      priority: rule.priority || 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: []
      },
      condition: {
        urlFilter: rule.urlPattern || '*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'main_frame']
      }
    };

    if (rule.action === 'set') {
      dnrRule.action.requestHeaders.push({
        header: rule.headerName,
        operation: 'set',
        value: headerValue
      });
    } else if (rule.action === 'remove') {
      dnrRule.action.requestHeaders.push({
        header: rule.headerName,
        operation: 'remove'
      });
    } else if (rule.action === 'append') {
      dnrRule.action.requestHeaders.push({
        header: rule.headerName,
        operation: 'append',
        value: headerValue
      });
    }

    dnrRules.push(dnrRule);
  });

  // Fetch currently active dynamic rules to remove them
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const currentRuleIds = currentRules.map(r => r.id);

  // Update dynamic rules list
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: currentRuleIds,
    addRules: dnrRules
  });

  console.log(`[PostAPI SW] Applied ${dnrRules.length} dynamic header rules successfully.`);
}

// ─── CORS Bypass Request Executor ──────────────────────────────────────────
async function executeRequestBackground(requestConfig) {
  const activeEnvId = await storage.get(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
  const environments = await storage.getEnvironments();
  const activeEnv = environments.find(e => e.id === activeEnvId) || null;

  // Deep clone to avoid mutating original state
  const cfg = JSON.parse(JSON.stringify(requestConfig));

  // Resolve placeholders in url, headers, auth and body
  cfg.url = variableResolver.resolveUrl(cfg.url || '', activeEnv);
  cfg.headers = variableResolver.resolveHeaders(cfg.headers || [], activeEnv);
  if (cfg.auth) {
    cfg.auth = variableResolver.resolveObject(cfg.auth, activeEnv);
  }

  // Handle nested body object or direct bodyType/bodyContent properties
  const bodyType = cfg.body?.type || cfg.bodyType || 'none';
  let bodyContent = cfg.body?.content !== undefined ? cfg.body.content : cfg.bodyContent;
  const evaluateBody = cfg.body?.evaluate !== false;

  if (bodyContent && evaluateBody) {
    if (typeof bodyContent === 'string') {
      bodyContent = variableResolver.resolve(bodyContent, activeEnv);
    } else {
      bodyContent = variableResolver.resolveObject(bodyContent, activeEnv);
    }
  }

  let url = cfg.url || '';
  const method = (cfg.method || 'GET').toUpperCase();

  const headers = {};
  if (Array.isArray(cfg.headers)) {
    cfg.headers.forEach(h => {
      if (h.enabled !== false && h.key) {
        headers[h.key] = h.value;
      }
    });
  }

  // Handle Authentication
  if (cfg.auth && cfg.auth.type !== 'none') {
    const auth = cfg.auth;
    if (auth.type === 'bearer' && auth.bearer?.token) {
      headers['Authorization'] = `Bearer ${auth.bearer.token}`;
    } else if (auth.type === 'basic' && auth.basic) {
      const basic = auth.basic;
      headers['Authorization'] = `Basic ${btoa(`${basic.username}:${basic.password}`)}`;
    } else if (auth.type === 'apiKey' && auth.apiKey?.key) {
      const key = auth.apiKey.key;
      const value = auth.apiKey.value || '';
      if (auth.apiKey.addTo === 'query') {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      } else {
        headers[key] = value;
      }
    }
  }

  // Build fetch body
  let body = null;
  if (method !== 'GET' && method !== 'HEAD') {
    if (bodyType === 'json') {
      headers['Content-Type'] = 'application/json';
      body = typeof bodyContent === 'string' ? 
        bodyContent : JSON.stringify(bodyContent);
    } else if (bodyType === 'urlEncoded') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const params = new URLSearchParams();
      if (Array.isArray(bodyContent)) {
        bodyContent.forEach(item => {
          if (item.enabled !== false && item.key) params.append(item.key, item.value || '');
        });
      }
      body = params.toString();
    } else if (bodyType === 'raw') {
      if (!headers['Content-Type']) headers['Content-Type'] = 'text/plain';
      body = bodyContent || '';
    } else if (bodyType === 'formData') {
      // Background SW cannot serialize FormData with file streams easily, 
      // but standard text fields work. We send it as urlencoded or JSON fallback if simple.
      // For extensions, standard key-value text form data can be built using URLSearchParams:
      const params = new URLSearchParams();
      if (Array.isArray(bodyContent)) {
        bodyContent.forEach(item => {
          if (item.enabled !== false && item.key) params.append(item.key, item.value || '');
        });
      }
      body = params.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded'; // Fallback mapping
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s default timeout
  const startTime = performance.now();

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit'
    });

    const endTime = performance.now();
    clearTimeout(timeoutId);

    const resHeaders = [];
    res.headers.forEach((value, key) => resHeaders.push({ key, value }));

    const resBody = await res.text();

    return {
      statusCode: res.status,
      statusText: res.statusText || 'OK',
      headers: resHeaders,
      body: resBody,
      duration: Math.round(endTime - startTime),
      size: new Blob([resBody]).size
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      statusCode: 0,
      statusText: 'Network Error / CORS Blocked',
      headers: [],
      body: `Background fetch failed: ${err.message}`,
      duration: Math.round(performance.now() - startTime),
      size: 0
    };
  }
}
