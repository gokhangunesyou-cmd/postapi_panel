(function() {
  if (window.__POSTAPI_INTERCEPTED__) return;
  window.__POSTAPI_INTERCEPTED__ = true;

  const PAGE_SOURCE = '__POSTAPI_PAGE__';

  // Helper to send logs to Content Script
  function sendCapturedRequest(data) {
    window.postMessage({
      source: PAGE_SOURCE,
      payload: data
    }, '*');
  }

  // ─── XMLHTTPREQUEST MONKEYPATCH ───────────────────────────────────────
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (!this._headers) this._headers = [];
    this._headers.push({ key: header, value: value });
    return originalXHRSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = url;
    this._headers = [];
    this._startTime = performance.now();
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener('load', function() {
      captureXHR(this, body);
    });
    this.addEventListener('error', function() {
      captureXHR(this, body, 'Network Error');
    });
    this.addEventListener('abort', function() {
      captureXHR(this, body, 'Aborted');
    });
    return originalXHRSend.apply(this, arguments);
  };

  function captureXHR(xhr, reqBody, errorText = '') {
    try {
      // Read response content safely
      let respBody = '';
      if (xhr.responseType === '' || xhr.responseType === 'text') {
        respBody = xhr.responseText;
      } else if (xhr.responseType === 'json') {
        respBody = JSON.stringify(xhr.response);
      } else {
        respBody = '[Binary Content / Non-text type]';
      }

      // Truncate response body if too large (> 3MB) to prevent messaging choke
      if (respBody && respBody.length > 3000000) {
        respBody = respBody.substring(0, 3000000) + '\n\n...[Response truncated by PostAPI Panel for size]';
      }

      let parsedReqBody = '';
      if (reqBody) {
        if (typeof reqBody === 'string') {
          parsedReqBody = reqBody;
        } else if (reqBody instanceof FormData) {
          const params = [];
          for (const [key, value] of reqBody.entries()) {
            params.push({ key, value: typeof value === 'string' ? value : '[File Object]' });
          }
          parsedReqBody = JSON.stringify(params);
        } else if (reqBody instanceof URLSearchParams) {
          parsedReqBody = reqBody.toString();
        } else {
          try {
            parsedReqBody = JSON.stringify(reqBody);
          } catch {
            parsedReqBody = String(reqBody);
          }
        }
      }

      // Parse response headers
      const rawHeaders = xhr.getAllResponseHeaders();
      const responseHeaders = rawHeaders.trim().split(/[\r\n]+/).map(line => {
        const parts = line.split(': ');
        return { key: parts[0], value: parts.slice(1).join(': ') };
      }).filter(h => h.key);

      sendCapturedRequest({
        method: xhr._method || 'GET',
        url: buildAbsoluteUrl(xhr._url),
        requestHeaders: xhr._headers || [],
        requestBody: parsedReqBody,
        statusCode: xhr.status || (errorText ? 0 : 200),
        statusText: errorText || xhr.statusText || 'OK',
        responseHeaders,
        responseBody: respBody,
        duration: Math.round(performance.now() - xhr._startTime),
        size: respBody.length,
        type: 'xhr',
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('[PostAPI Page] Error capturing XHR:', e);
    }
  }

  // ─── FETCH MONKEYPATCH ────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    const startTime = performance.now();
    let url = '';
    let method = 'GET';
    let reqHeaders = [];
    let reqBody = '';

    // Resolve URL and Method
    if (typeof resource === 'string') {
      url = resource;
    } else if (resource instanceof Request) {
      url = resource.url;
      method = resource.method;
      reqHeaders = Array.from(resource.headers.entries()).map(([key, value]) => ({ key, value }));
    }

    if (init) {
      if (init.method) method = init.method;
      
      // Resolve Headers
      if (init.headers) {
        if (init.headers instanceof Headers) {
          reqHeaders = Array.from(init.headers.entries()).map(([key, value]) => ({ key, value }));
        } else if (Array.isArray(init.headers)) {
          reqHeaders = init.headers.map(([key, value]) => ({ key, value }));
        } else {
          reqHeaders = Object.entries(init.headers).map(([key, value]) => ({ key, value }));
        }
      }

      // Resolve Body
      if (init.body) {
        if (typeof init.body === 'string') {
          reqBody = init.body;
        } else if (init.body instanceof FormData) {
          const params = [];
          for (const [key, value] of init.body.entries()) {
            params.push({ key, value: typeof value === 'string' ? value : '[File Object]' });
          }
          reqBody = JSON.stringify(params);
        } else if (init.body instanceof URLSearchParams) {
          reqBody = init.body.toString();
        } else {
          try {
            reqBody = JSON.stringify(init.body);
          } catch {
            reqBody = String(init.body);
          }
        }
      }
    }

    try {
      const response = await originalFetch.apply(this, arguments);
      const duration = Math.round(performance.now() - startTime);

      // Clone response so we can read body without consuming it
      const clonedResponse = response.clone();
      
      setTimeout(async () => {
        try {
          let respBody = '';
          try {
            respBody = await clonedResponse.text();
          } catch {
            respBody = '[Binary Content / Non-text type]';
          }

          // Truncate if too large
          if (respBody && respBody.length > 3000000) {
            respBody = respBody.substring(0, 3000000) + '\n\n...[Response truncated by PostAPI Panel for size]';
          }

          const responseHeaders = Array.from(response.headers.entries()).map(([key, value]) => ({ key, value }));

          sendCapturedRequest({
            method: method.toUpperCase(),
            url: buildAbsoluteUrl(url),
            requestHeaders: reqHeaders,
            requestBody: reqBody,
            statusCode: response.status,
            statusText: response.statusText || 'OK',
            responseHeaders,
            responseBody: respBody,
            duration,
            size: respBody.length,
            type: 'fetch',
            timestamp: Date.now()
          });
        } catch (err) {
          console.error('[PostAPI Page] Error in fetch logging async block:', err);
        }
      }, 50);

      return response;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      sendCapturedRequest({
        method: method.toUpperCase(),
        url: buildAbsoluteUrl(url),
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        statusCode: 0,
        statusText: 'Network Error',
        responseHeaders: [],
        responseBody: error.message,
        duration,
        size: 0,
        type: 'fetch',
        timestamp: Date.now()
      });
      throw error;
    }
  };

  function buildAbsoluteUrl(url) {
    try {
      const a = document.createElement('a');
      a.href = url;
      return a.href;
    } catch {
      return url;
    }
  }
})();
