/**
 * PostAPI Panel — Network Interception Engine
 * 
 * Two capture modes:
 *   1. DevTools — chrome.devtools.network.onRequestFinished (HAR entries)
 *   2. Debugger — chrome.debugger attached to a tab, listening to Network domain
 * 
 * All captured data is normalised into a unified request format.
 * 
 * @module lib/network-interceptor
 */

import { generateId } from './utils.js';

// ─── Unified Request Schema ───────────────────────────────────────────────────
// {
//   id:              string,
//   method:          string,
//   url:             string,
//   requestHeaders:  Array<{name, value}>,
//   requestBody:     string | null,
//   responseHeaders: Array<{name, value}>,
//   responseBody:    string | null,
//   statusCode:      number,
//   statusText:      string,
//   duration:        number (ms),
//   size:            number (bytes, response body),
//   type:            string (xhr, fetch, document, script, …),
//   initiator:       string | object | null,
//   timestamp:       number (epoch ms)
// }

/**
 * Create a blank request entry with defaults.
 * @returns {object}
 */
function _blankEntry() {
  return {
    id: generateId(),
    method: 'GET',
    url: '',
    requestHeaders: [],
    requestBody: null,
    responseHeaders: [],
    responseBody: null,
    statusCode: 0,
    statusText: '',
    duration: 0,
    size: 0,
    type: 'other',
    initiator: null,
    timestamp: Date.now(),
  };
}

// ─── NetworkInterceptor ────────────────────────────────────────────────────────

class NetworkInterceptor {
  constructor() {
    /** @type {'idle'|'devtools'|'debugger'} */
    this._mode = 'idle';

    /** @type {number|null} tab ID for debugger mode */
    this._tabId = null;

    /** @type {Array<object>} captured requests */
    this._requests = [];

    /** @type {Set<Function>} listeners for new request events */
    this._listeners = new Set();

    // Bound handlers (so we can remove them later)
    this._onHarEntry = this._handleHarEntry.bind(this);
    this._onDebuggerEvent = this._handleDebuggerEvent.bind(this);
    this._onDebuggerDetach = this._handleDebuggerDetach.bind(this);

    /**
     * In debugger mode, in-flight requests are tracked here keyed by
     * Chrome's Network requestId until the response is complete.
     * @type {Map<string, object>}
     */
    this._pending = new Map();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start capturing network traffic.
   * @param {number} tabId — target tab (only used in debugger mode)
   * @param {'devtools'|'debugger'} mode
   */
  async startCapture(tabId, mode = 'devtools') {
    if (this._mode !== 'idle') {
      await this.stopCapture();
    }

    this._tabId = tabId;
    this._mode = mode;
    this._requests = [];
    this._pending.clear();

    if (mode === 'devtools') {
      this._startDevToolsCapture();
    } else if (mode === 'debugger') {
      await this._startDebuggerCapture(tabId);
    } else {
      throw new Error(`[NetworkInterceptor] Unknown mode: "${mode}"`);
    }
  }

  /**
   * Stop all capturing and clean up listeners / debugger attachment.
   */
  async stopCapture() {
    if (this._mode === 'devtools') {
      this._stopDevToolsCapture();
    } else if (this._mode === 'debugger') {
      await this._stopDebuggerCapture();
    }

    this._mode = 'idle';
    this._tabId = null;
    this._pending.clear();
  }

  /**
   * Whether we're currently capturing.
   * @returns {boolean}
   */
  isCapturing() {
    return this._mode !== 'idle';
  }

  /**
   * Return all captured requests.
   * @returns {Array<object>}
   */
  getRequests() {
    return [...this._requests];
  }

  /**
   * Clear captured requests buffer.
   */
  clearRequests() {
    this._requests = [];
  }

  /**
   * Register a listener that fires on every new captured request.
   * @param {Function} callback — receives the normalised request object
   */
  onRequest(callback) {
    this._listeners.add(callback);
  }

  /**
   * Unregister a previously registered listener.
   * @param {Function} callback
   */
  removeListener(callback) {
    this._listeners.delete(callback);
  }

  // ── DevTools Mode ───────────────────────────────────────────────────────

  /** @private */
  _startDevToolsCapture() {
    if (typeof chrome === 'undefined' || !chrome.devtools?.network) {
      console.error('[NetworkInterceptor] chrome.devtools.network API not available');
      this._mode = 'idle';
      return;
    }

    chrome.devtools.network.onRequestFinished.addListener(this._onHarEntry);
  }

  /** @private */
  _stopDevToolsCapture() {
    if (typeof chrome !== 'undefined' && chrome.devtools?.network) {
      chrome.devtools.network.onRequestFinished.removeListener(this._onHarEntry);
    }
  }

  /**
   * Handle a HAR entry coming from DevTools network panel.
   * @param {object} harEntry — HAR 1.2 entry object
   * @private
   */
  _handleHarEntry(harEntry) {
    const req = _blankEntry();

    try {
      const { request, response, time, startedDateTime } = harEntry;

      req.method = request.method || 'GET';
      req.url = request.url || '';
      req.requestHeaders = (request.headers || []).map((h) => ({
        name: h.name,
        value: h.value,
      }));
      req.requestBody = request.postData?.text || null;

      req.statusCode = response.status || 0;
      req.statusText = response.statusText || '';
      req.responseHeaders = (response.headers || []).map((h) => ({
        name: h.name,
        value: h.value,
      }));
      req.size = response.bodySize > 0 ? response.bodySize : (response.content?.size || 0);
      req.duration = typeof time === 'number' ? time : 0;
      req.type = harEntry._resourceType || response.content?.mimeType || 'other';
      req.timestamp = startedDateTime ? new Date(startedDateTime).getTime() : Date.now();
      req.initiator = harEntry._initiator || null;

      // Attempt to retrieve response body asynchronously
      this._fetchHarResponseBody(harEntry, req);
    } catch (err) {
      console.error('[NetworkInterceptor] Error parsing HAR entry:', err);
    }

    this._addRequest(req);
  }

  /**
   * Retrieve response body from a HAR entry (async).
   * Updates the request in-place once available.
   * @private
   */
  _fetchHarResponseBody(harEntry, reqObj) {
    if (typeof harEntry.getContent !== 'function') return;

    harEntry.getContent((body, encoding) => {
      try {
        reqObj.responseBody = body || null;
        if (body && !reqObj.size) {
          reqObj.size = new Blob([body]).size;
        }
      } catch {
        // Silently ignore body retrieval failure
      }
    });
  }

  // ── Debugger Mode ───────────────────────────────────────────────────────

  /**
   * Attach the debugger and enable the Network domain.
   * @param {number} tabId
   * @private
   */
  async _startDebuggerCapture(tabId) {
    if (typeof chrome === 'undefined' || !chrome.debugger) {
      console.error('[NetworkInterceptor] chrome.debugger API not available');
      this._mode = 'idle';
      return;
    }

    try {
      await this._debuggerAttach(tabId);
      await this._debuggerCommand(tabId, 'Network.enable', {});
      chrome.debugger.onEvent.addListener(this._onDebuggerEvent);
      chrome.debugger.onDetached.addListener(this._onDebuggerDetach);
    } catch (err) {
      console.error('[NetworkInterceptor] Failed to start debugger capture:', err);
      this._mode = 'idle';
      throw err;
    }
  }

  /**
   * Detach the debugger and clean up listeners.
   * @private
   */
  async _stopDebuggerCapture() {
    if (typeof chrome === 'undefined' || !chrome.debugger) return;

    chrome.debugger.onEvent.removeListener(this._onDebuggerEvent);
    chrome.debugger.onDetached.removeListener(this._onDebuggerDetach);

    if (this._tabId !== null) {
      try {
        await this._debuggerDetach(this._tabId);
      } catch {
        // Tab may have been closed — ignore
      }
    }
  }

  /**
   * Handle debugger protocol events.
   * @param {object} source — { tabId }
   * @param {string} method — e.g. 'Network.requestWillBeSent'
   * @param {object} params
   * @private
   */
  _handleDebuggerEvent(source, method, params) {
    if (source.tabId !== this._tabId) return;

    switch (method) {
      case 'Network.requestWillBeSent':
        this._onRequestWillBeSent(params);
        break;
      case 'Network.responseReceived':
        this._onResponseReceived(params);
        break;
      case 'Network.loadingFinished':
        this._onLoadingFinished(params);
        break;
      case 'Network.loadingFailed':
        this._onLoadingFailed(params);
        break;
      default:
        break;
    }
  }

  /** @private */
  _onRequestWillBeSent(params) {
    const { requestId, request, timestamp, initiator, type } = params;

    const entry = _blankEntry();
    entry._debuggerRequestId = requestId;
    entry.method = request.method || 'GET';
    entry.url = request.url || '';
    entry.requestHeaders = this._headersObjectToArray(request.headers);
    entry.requestBody = request.postData || null;
    entry.type = type || 'other';
    entry.initiator = initiator || null;
    entry.timestamp = timestamp ? timestamp * 1000 : Date.now(); // CDP timestamps are in seconds
    entry._startTime = timestamp || (Date.now() / 1000);

    this._pending.set(requestId, entry);
  }

  /** @private */
  _onResponseReceived(params) {
    const { requestId, response } = params;
    const entry = this._pending.get(requestId);
    if (!entry) return;

    entry.statusCode = response.status || 0;
    entry.statusText = response.statusText || '';
    entry.responseHeaders = this._headersObjectToArray(response.headers);

    // Estimate size from headers
    const cl = response.headers?.['content-length'] || response.headers?.['Content-Length'];
    if (cl) entry.size = parseInt(cl, 10) || 0;
  }

  /** @private */
  async _onLoadingFinished(params) {
    const { requestId, timestamp, encodedDataLength } = params;
    const entry = this._pending.get(requestId);
    if (!entry) return;

    this._pending.delete(requestId);

    // Calculate duration
    if (entry._startTime && timestamp) {
      entry.duration = Math.round((timestamp - entry._startTime) * 1000);
    }
    if (encodedDataLength) {
      entry.size = encodedDataLength;
    }

    // Try to get response body
    try {
      const result = await this._debuggerCommand(this._tabId, 'Network.getResponseBody', { requestId });
      if (result) {
        entry.responseBody = result.base64Encoded
          ? atob(result.body)
          : result.body;
        if (!entry.size && entry.responseBody) {
          entry.size = new Blob([entry.responseBody]).size;
        }
      }
    } catch {
      // Body may not be available (e.g. streaming, WebSocket)
    }

    // Clean up internal fields
    delete entry._debuggerRequestId;
    delete entry._startTime;

    this._addRequest(entry);
  }

  /** @private */
  _onLoadingFailed(params) {
    const { requestId, errorText, timestamp } = params;
    const entry = this._pending.get(requestId);
    if (!entry) return;

    this._pending.delete(requestId);

    entry.statusText = errorText || 'Failed';
    if (entry._startTime && timestamp) {
      entry.duration = Math.round((timestamp - entry._startTime) * 1000);
    }

    delete entry._debuggerRequestId;
    delete entry._startTime;

    this._addRequest(entry);
  }

  /**
   * Handle unexpected debugger detachment.
   * @private
   */
  _handleDebuggerDetach(source, reason) {
    if (source.tabId === this._tabId) {
      console.warn(`[NetworkInterceptor] Debugger detached: ${reason}`);
      this._mode = 'idle';
      this._tabId = null;
      this._pending.clear();
    }
  }

  // ── Debugger Helpers ────────────────────────────────────────────────────

  /** @private */
  _debuggerAttach(tabId) {
    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /** @private */
  _debuggerDetach(tabId) {
    return new Promise((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /** @private */
  _debuggerCommand(tabId, method, params = {}) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Convert a plain { "Header-Name": "value" } object to [{name, value}].
   * @param {object} headersObj
   * @returns {Array<{name:string, value:string}>}
   * @private
   */
  _headersObjectToArray(headersObj) {
    if (!headersObj || typeof headersObj !== 'object') return [];

    return Object.entries(headersObj).map(([name, value]) => ({
      name,
      value: String(value),
    }));
  }

  /**
   * Store a completed request and notify listeners.
   * @param {object} req — normalised request
   * @private
   */
  _addRequest(req) {
    this._requests.push(req);

    this._listeners.forEach((cb) => {
      try {
        cb(req);
      } catch (err) {
        console.error('[NetworkInterceptor] Listener error:', err);
      }
    });
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

export default NetworkInterceptor;
export { NetworkInterceptor };
