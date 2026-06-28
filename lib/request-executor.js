/**
 * PostAPI Panel — HTTP Request Executor
 * 
 * Executes HTTP requests using the Fetch API.
 * Handles authentication, body serialization, timing, and CORS errors.
 * 
 * Request config:
 * {
 *   method:   string  ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'),
 *   url:      string,
 *   headers:  Array<{key, value, enabled?}>,
 *   body:     string | object | null,
 *   bodyType: 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'none',
 *   auth: {
 *     type:   'none' | 'bearer' | 'basic' | 'api-key',
 *     bearer: { token },
 *     basic:  { username, password },
 *     apiKey: { key, value, addTo: 'header' | 'query' }
 *   },
 *   timeout:         number (ms, 0 = no timeout),
 *   followRedirects: boolean (default true)
 * }
 * 
 * Response:
 * {
 *   statusCode:  number,
 *   statusText:  string,
 *   headers:     Array<{key, value}>,
 *   body:        string,
 *   duration:    number (ms),
 *   size:        number (bytes)
 * }
 * 
 * @module lib/request-executor
 */

// ─── RequestExecutor ───────────────────────────────────────────────────────────

class RequestExecutor {
  constructor() {
    /** @type {AbortController|null} currently active abort controller */
    this._controller = null;

    /** @type {boolean} */
    this._isExecuting = false;
  }

  /**
   * Execute an HTTP request.
   * @param {object} requestConfig
   * @returns {Promise<object>} response object
   */
  async execute(requestConfig) {
    if (this._isExecuting) {
      this.abort();
    }

    this._controller = new AbortController();
    this._isExecuting = true;

    // Set up timeout
    let timeoutId = null;
    const timeout = requestConfig.timeout || 0;
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        this._controller?.abort();
      }, timeout);
    }

    const startTime = performance.now();

    try {
      // Build fetch options
      const { url, fetchOptions } = this._buildFetchOptions(requestConfig);

      // Send request
      const response = await fetch(url, fetchOptions);
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      // Parse response
      const result = await this._parseResponse(response, duration);

      return result;
    } catch (err) {
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      return this._handleError(err, duration);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this._isExecuting = false;
      this._controller = null;
    }
  }

  /**
   * Abort the currently executing request.
   */
  abort() {
    if (this._controller) {
      this._controller.abort();
      this._controller = null;
      this._isExecuting = false;
    }
  }

  /**
   * Whether a request is currently in flight.
   * @returns {boolean}
   */
  get isExecuting() {
    return this._isExecuting;
  }

  // ── Build Fetch Options ─────────────────────────────────────────────────

  /**
   * Transform a PostAPI request config into a fetch() URL + init object.
   * @param {object} config
   * @returns {{ url: string, fetchOptions: RequestInit }}
   * @private
   */
  _buildFetchOptions(config) {
    let url = config.url || '';
    const method = (config.method || 'GET').toUpperCase();

    // Headers — start with user-provided enabled headers
    const headers = new Headers();
    if (Array.isArray(config.headers)) {
      for (const h of config.headers) {
        if (h.enabled === false) continue;
        if (h.key && h.value !== undefined) {
          headers.set(h.key, h.value);
        }
      }
    }

    // Auth — inject auth headers or query parameters
    url = this._applyAuth(config.auth, headers, url);

    // Body
    let body = null;
    if (method !== 'GET' && method !== 'HEAD') {
      body = this._serializeBody(config.body, config.bodyType, headers);
    }

    const fetchOptions = {
      method,
      headers,
      body,
      signal: this._controller.signal,
      redirect: config.followRedirects === false ? 'manual' : 'follow',
      // Attempt to bypass CORS in some environments
      mode: 'cors',
      credentials: 'omit',
    };

    return { url, fetchOptions };
  }

  /**
   * Apply authentication to headers or URL.
   * @param {object} auth
   * @param {Headers} headers
   * @param {string} url
   * @returns {string} possibly modified URL
   * @private
   */
  _applyAuth(auth, headers, url) {
    if (!auth || auth.type === 'none') return url;

    switch (auth.type) {
      case 'bearer': {
        const token = auth.bearer?.token || '';
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        break;
      }

      case 'basic': {
        const username = auth.basic?.username || '';
        const password = auth.basic?.password || '';
        const encoded = btoa(`${username}:${password}`);
        headers.set('Authorization', `Basic ${encoded}`);
        break;
      }

      case 'api-key': {
        const key = auth.apiKey?.key || '';
        const value = auth.apiKey?.value || '';
        if (key) {
          if (auth.apiKey?.addTo === 'query') {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
          } else {
            headers.set(key, value);
          }
        }
        break;
      }

      default:
        break;
    }

    return url;
  }

  /**
   * Serialize request body based on the specified body type.
   * @param {*} body
   * @param {string} bodyType
   * @param {Headers} headers — may be mutated to set Content-Type
   * @returns {string|FormData|URLSearchParams|null}
   * @private
   */
  _serializeBody(body, bodyType, headers) {
    if (!body && bodyType !== 'form-data') return null;

    switch (bodyType) {
      case 'json': {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        if (typeof body === 'string') return body;
        try {
          return JSON.stringify(body);
        } catch {
          return String(body);
        }
      }

      case 'form-data': {
        // body should be an array of {key, value, type?, file?} or a FormData
        if (body instanceof FormData) return body;

        const formData = new FormData();
        if (Array.isArray(body)) {
          for (const field of body) {
            if (field.enabled === false) continue;
            if (field.type === 'file' && field.file) {
              formData.append(field.key, field.file, field.file.name);
            } else {
              formData.append(field.key || '', field.value || '');
            }
          }
        }
        // Do NOT set Content-Type — browser will set it with boundary
        headers.delete('Content-Type');
        return formData;
      }

      case 'x-www-form-urlencoded': {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/x-www-form-urlencoded');
        }
        if (body instanceof URLSearchParams) return body;
        if (typeof body === 'string') return body;

        // body should be array of {key, value}
        const params = new URLSearchParams();
        if (Array.isArray(body)) {
          for (const field of body) {
            if (field.enabled === false) continue;
            params.append(field.key || '', field.value || '');
          }
        }
        return params;
      }

      case 'raw':
      default: {
        // Raw text/string — leave Content-Type to user or default to text/plain
        if (!headers.has('Content-Type') && bodyType === 'raw') {
          headers.set('Content-Type', 'text/plain');
        }
        return typeof body === 'string' ? body : String(body ?? '');
      }

      case 'none':
        return null;
    }
  }

  // ── Response Parsing ────────────────────────────────────────────────────

  /**
   * Parse a Fetch Response into our unified format.
   * @param {Response} response
   * @param {number} duration — elapsed ms
   * @returns {Promise<object>}
   * @private
   */
  async _parseResponse(response, duration) {
    // Extract headers
    const headers = [];
    response.headers.forEach((value, key) => {
      headers.push({ key, value });
    });

    // Read body text
    let body = '';
    let size = 0;
    try {
      const buffer = await response.arrayBuffer();
      size = buffer.byteLength;
      body = new TextDecoder().decode(buffer);
    } catch (err) {
      body = `[Error reading response body: ${err.message}]`;
    }

    // Auto-detect JSON and pretty-print
    let parsedBody = body;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json') || this._looksLikeJson(body)) {
      try {
        const parsed = JSON.parse(body);
        parsedBody = JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON — keep raw
        parsedBody = body;
      }
    }

    return {
      statusCode: response.status,
      statusText: response.statusText,
      headers,
      body: parsedBody,
      duration,
      size,
    };
  }

  /**
   * Heuristic check for JSON-like strings.
   * @param {string} str
   * @returns {boolean}
   * @private
   */
  _looksLikeJson(str) {
    if (!str) return false;
    const trimmed = str.trimStart();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  // ── Error Handling ──────────────────────────────────────────────────────

  /**
   * Convert a fetch error into a response-like object.
   * @param {Error} err
   * @param {number} duration
   * @returns {object}
   * @private
   */
  _handleError(err, duration) {
    let statusCode = 0;
    let statusText = 'Error';
    let body = '';

    if (err.name === 'AbortError') {
      statusText = 'Request Aborted';
      body = 'The request was aborted (timeout or manual cancellation).';
    } else if (err.name === 'TypeError' && err.message?.includes('Failed to fetch')) {
      // Typical CORS or network error
      statusText = 'Network Error';
      body = [
        'Failed to fetch. Possible causes:',
        '',
        '1. CORS: The server does not allow requests from this origin.',
        '   → Try sending the request from the background service worker.',
        '2. Network: The server is unreachable or the URL is invalid.',
        '3. Mixed Content: HTTPS page trying to load HTTP resource.',
        '4. DNS: The domain could not be resolved.',
        '',
        `Original error: ${err.message}`,
      ].join('\n');
    } else {
      statusText = err.name || 'Error';
      body = err.message || 'An unknown error occurred.';
    }

    return {
      statusCode,
      statusText,
      headers: [],
      body,
      duration,
      size: 0,
    };
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

export default RequestExecutor;
export { RequestExecutor };
