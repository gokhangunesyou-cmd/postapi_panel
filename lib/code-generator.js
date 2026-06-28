/**
 * PostAPI Panel — Code Generator
 * 
 * Generates executable code snippets from PostAPI request configurations.
 * Supported targets: cURL, JavaScript fetch, Axios, Python requests, PHP cURL, Node.js fetch.
 * 
 * Input request format:
 * {
 *   method:   string,
 *   url:      string,
 *   headers:  Array<{key, value, enabled?}>,
 *   body:     string | object | Array | null,
 *   bodyType: 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'none',
 *   auth: {
 *     type:   'none' | 'bearer' | 'basic' | 'api-key',
 *     bearer: { token },
 *     basic:  { username, password },
 *     apiKey: { key, value, addTo }
 *   }
 * }
 * 
 * @module lib/code-generator
 */

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get enabled headers from a request, optionally with auth header injected.
 * @param {object} request
 * @returns {Array<{key:string, value:string}>}
 */
function _getEffectiveHeaders(request) {
  const headers = [];

  // User headers
  if (Array.isArray(request.headers)) {
    for (const h of request.headers) {
      if (h.enabled === false) continue;
      if (h.key) headers.push({ key: h.key, value: h.value || '' });
    }
  }

  // Auth headers
  const auth = request.auth;
  if (auth) {
    switch (auth.type) {
      case 'bearer':
        if (auth.bearer?.token) {
          headers.push({ key: 'Authorization', value: `Bearer ${auth.bearer.token}` });
        }
        break;
      case 'basic':
        if (auth.basic) {
          const encoded = btoa(`${auth.basic.username || ''}:${auth.basic.password || ''}`);
          headers.push({ key: 'Authorization', value: `Basic ${encoded}` });
        }
        break;
      case 'api-key':
        if (auth.apiKey?.addTo !== 'query' && auth.apiKey?.key) {
          headers.push({ key: auth.apiKey.key, value: auth.apiKey.value || '' });
        }
        break;
    }
  }

  // Add content-type if missing and body is JSON
  if (request.bodyType === 'json' && request.body) {
    if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
      headers.push({ key: 'Content-Type', value: 'application/json' });
    }
  }

  return headers;
}

/**
 * Get the effective URL (with API key query param if needed).
 * @param {object} request
 * @returns {string}
 */
function _getEffectiveUrl(request) {
  let url = request.url || '';
  const auth = request.auth;

  if (auth?.type === 'api-key' && auth.apiKey?.addTo === 'query' && auth.apiKey?.key) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}${encodeURIComponent(auth.apiKey.key)}=${encodeURIComponent(auth.apiKey.value || '')}`;
  }

  return url;
}

/**
 * Try to get body as a string.
 * @param {object} request
 * @returns {string|null}
 */
function _getBodyString(request) {
  if (!request.body || request.bodyType === 'none') return null;

  if (typeof request.body === 'string') return request.body;

  try {
    return JSON.stringify(request.body, null, 2);
  } catch {
    return String(request.body);
  }
}

/**
 * Escape a string for use inside single-quoted shell strings.
 * @param {string} str
 * @returns {string}
 */
function _shellEscape(str) {
  return str.replace(/'/g, "'\\''");
}

/**
 * Escape a string for use inside Python single-quoted strings.
 * @param {string} str
 * @returns {string}
 */
function _pyEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Escape a string for use inside PHP single-quoted strings.
 * @param {string} str
 * @returns {string}
 */
function _phpEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Escape a string for use inside JS template literals or double-quoted strings.
 * @param {string} str
 * @returns {string}
 */
function _jsEscape(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// ─── CodeGenerator ─────────────────────────────────────────────────────────────

class CodeGenerator {
  /**
   * Generate a cURL command.
   * @param {object} request
   * @returns {string}
   */
  static toCurl(request) {
    const method = (request.method || 'GET').toUpperCase();
    const url = _getEffectiveUrl(request);
    const headers = _getEffectiveHeaders(request);
    const body = _getBodyString(request);

    const parts = ['curl'];

    // Method (skip -X for GET since it's default)
    if (method !== 'GET') {
      parts.push(`-X ${method}`);
    }

    // URL
    parts.push(`'${_shellEscape(url)}'`);

    // Headers
    for (const h of headers) {
      parts.push(`-H '${_shellEscape(h.key)}: ${_shellEscape(h.value)}'`);
    }

    // Body
    if (body && method !== 'GET' && method !== 'HEAD') {
      if (request.bodyType === 'form-data' && Array.isArray(request.body)) {
        for (const field of request.body) {
          if (field.enabled === false) continue;
          parts.push(`-F '${_shellEscape(field.key || '')}=${_shellEscape(field.value || '')}'`);
        }
      } else if (request.bodyType === 'x-www-form-urlencoded' && Array.isArray(request.body)) {
        const encoded = request.body
          .filter((f) => f.enabled !== false)
          .map((f) => `${encodeURIComponent(f.key || '')}=${encodeURIComponent(f.value || '')}`)
          .join('&');
        parts.push(`--data '${_shellEscape(encoded)}'`);
      } else {
        parts.push(`--data '${_shellEscape(body)}'`);
      }
    }

    return parts.join(' \\\n  ');
  }

  /**
   * Generate JavaScript fetch() code.
   * @param {object} request
   * @returns {string}
   */
  static toFetch(request) {
    const method = (request.method || 'GET').toUpperCase();
    const url = _getEffectiveUrl(request);
    const headers = _getEffectiveHeaders(request);
    const body = _getBodyString(request);

    const lines = [];

    // Build options object
    const hasOptions = method !== 'GET' || headers.length > 0 || body;

    if (hasOptions) {
      lines.push(`const response = await fetch('${_jsEscape(url)}', {`);
      lines.push(`  method: '${method}',`);

      if (headers.length > 0) {
        lines.push('  headers: {');
        for (const h of headers) {
          lines.push(`    '${_jsEscape(h.key)}': '${_jsEscape(h.value)}',`);
        }
        lines.push('  },');
      }

      if (body && method !== 'GET' && method !== 'HEAD') {
        if (request.bodyType === 'json') {
          lines.push(`  body: JSON.stringify(${body}),`);
        } else if (request.bodyType === 'form-data' && Array.isArray(request.body)) {
          // FormData needs to be created separately
          lines.splice(0, lines.length); // Reset
          lines.push('const formData = new FormData();');
          for (const field of request.body) {
            if (field.enabled === false) continue;
            lines.push(`formData.append('${_jsEscape(field.key || '')}', '${_jsEscape(field.value || '')}');`);
          }
          lines.push('');
          lines.push(`const response = await fetch('${_jsEscape(url)}', {`);
          lines.push(`  method: '${method}',`);
          if (headers.length > 0) {
            lines.push('  headers: {');
            for (const h of headers) {
              if (h.key.toLowerCase() === 'content-type') continue; // FormData sets its own
              lines.push(`    '${_jsEscape(h.key)}': '${_jsEscape(h.value)}',`);
            }
            lines.push('  },');
          }
          lines.push('  body: formData,');
        } else if (request.bodyType === 'x-www-form-urlencoded' && Array.isArray(request.body)) {
          lines.splice(0, lines.length);
          lines.push('const params = new URLSearchParams();');
          for (const field of request.body) {
            if (field.enabled === false) continue;
            lines.push(`params.append('${_jsEscape(field.key || '')}', '${_jsEscape(field.value || '')}');`);
          }
          lines.push('');
          lines.push(`const response = await fetch('${_jsEscape(url)}', {`);
          lines.push(`  method: '${method}',`);
          if (headers.length > 0) {
            lines.push('  headers: {');
            for (const h of headers) {
              lines.push(`    '${_jsEscape(h.key)}': '${_jsEscape(h.value)}',`);
            }
            lines.push('  },');
          }
          lines.push('  body: params,');
        } else {
          lines.push(`  body: '${_jsEscape(body)}',`);
        }
      }

      lines.push('});');
    } else {
      lines.push(`const response = await fetch('${_jsEscape(url)}');`);
    }

    lines.push('');
    lines.push('const data = await response.json();');
    lines.push('console.log(data);');

    return lines.join('\n');
  }

  /**
   * Generate Axios code.
   * @param {object} request
   * @returns {string}
   */
  static toAxios(request) {
    const method = (request.method || 'GET').toLowerCase();
    const url = _getEffectiveUrl(request);
    const headers = _getEffectiveHeaders(request);
    const body = _getBodyString(request);

    const lines = ["const axios = require('axios');", ''];

    const config = {};
    if (headers.length > 0) {
      config.headers = {};
      for (const h of headers) {
        config.headers[h.key] = h.value;
      }
    }

    const hasBody = body && method !== 'get' && method !== 'head';

    if (Object.keys(config).length > 0 || hasBody) {
      if (hasBody) {
        lines.push(`const response = await axios.${method}('${_jsEscape(url)}', ${body}, ${JSON.stringify(config, null, 2)});`);
      } else {
        lines.push(`const response = await axios.${method}('${_jsEscape(url)}', ${JSON.stringify(config, null, 2)});`);
      }
    } else {
      lines.push(`const response = await axios.${method}('${_jsEscape(url)}');`);
    }

    lines.push('');
    lines.push('console.log(response.data);');

    return lines.join('\n');
  }

  /**
   * Generate Python requests code.
   * @param {object} request
   * @returns {string}
   */
  static toPythonRequests(request) {
    const method = (request.method || 'GET').toLowerCase();
    const url = _getEffectiveUrl(request);
    const headers = _getEffectiveHeaders(request);
    const body = _getBodyString(request);

    const lines = ['import requests', '', `url = '${_pyEscape(url)}'`];

    // Headers
    if (headers.length > 0) {
      lines.push('headers = {');
      for (const h of headers) {
        lines.push(`    '${_pyEscape(h.key)}': '${_pyEscape(h.value)}',`);
      }
      lines.push('}');
    }

    // Body
    const hasBody = body && method !== 'get' && method !== 'head';
    if (hasBody) {
      if (request.bodyType === 'json') {
        lines.push('');
        lines.push(`payload = ${body}`);
      } else if (request.bodyType === 'x-www-form-urlencoded' && Array.isArray(request.body)) {
        lines.push('');
        lines.push('data = {');
        for (const field of request.body) {
          if (field.enabled === false) continue;
          lines.push(`    '${_pyEscape(field.key || '')}': '${_pyEscape(field.value || '')}',`);
        }
        lines.push('}');
      } else if (request.bodyType === 'form-data' && Array.isArray(request.body)) {
        lines.push('');
        lines.push('files = {');
        for (const field of request.body) {
          if (field.enabled === false) continue;
          lines.push(`    '${_pyEscape(field.key || '')}': (None, '${_pyEscape(field.value || '')}'),`);
        }
        lines.push('}');
      } else {
        lines.push('');
        lines.push(`data = '${_pyEscape(body)}'`);
      }
    }

    // Build request call
    lines.push('');
    const args = [`url`];
    if (headers.length > 0) args.push('headers=headers');
    if (hasBody) {
      if (request.bodyType === 'json') {
        args.push('json=payload');
      } else if (request.bodyType === 'form-data') {
        args.push('files=files');
      } else {
        args.push('data=data');
      }
    }
    lines.push(`response = requests.${method}(${args.join(', ')})`);

    lines.push('');
    lines.push('print(response.status_code)');
    lines.push('print(response.json())');

    return lines.join('\n');
  }

  /**
   * Generate PHP cURL code.
   * @param {object} request
   * @returns {string}
   */
  static toPhpCurl(request) {
    const method = (request.method || 'GET').toUpperCase();
    const url = _getEffectiveUrl(request);
    const headers = _getEffectiveHeaders(request);
    const body = _getBodyString(request);

    const lines = [
      '<?php',
      '',
      '$ch = curl_init();',
      '',
      `curl_setopt($ch, CURLOPT_URL, '${_phpEscape(url)}');`,
      'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);',
    ];

    if (method !== 'GET') {
      lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method}');`);
    }

    // Headers
    if (headers.length > 0) {
      lines.push('');
      lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
      for (const h of headers) {
        lines.push(`    '${_phpEscape(h.key)}: ${_phpEscape(h.value)}',`);
      }
      lines.push(']);');
    }

    // Body
    if (body && method !== 'GET' && method !== 'HEAD') {
      lines.push('');
      if (request.bodyType === 'x-www-form-urlencoded' && Array.isArray(request.body)) {
        lines.push('curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([');
        for (const field of request.body) {
          if (field.enabled === false) continue;
          lines.push(`    '${_phpEscape(field.key || '')}' => '${_phpEscape(field.value || '')}',`);
        }
        lines.push(']));');
      } else if (request.bodyType === 'form-data' && Array.isArray(request.body)) {
        lines.push('curl_setopt($ch, CURLOPT_POSTFIELDS, [');
        for (const field of request.body) {
          if (field.enabled === false) continue;
          lines.push(`    '${_phpEscape(field.key || '')}' => '${_phpEscape(field.value || '')}',`);
        }
        lines.push(']);');
      } else {
        lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${_phpEscape(body)}');`);
      }
    }

    lines.push('');
    lines.push('$response = curl_exec($ch);');
    lines.push('$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);');
    lines.push('');
    lines.push('if (curl_errno($ch)) {');
    lines.push("    echo 'Error: ' . curl_error($ch);");
    lines.push('}');
    lines.push('');
    lines.push('curl_close($ch);');
    lines.push('');
    lines.push('echo $response;');

    return lines.join('\n');
  }

  /**
   * Generate Node.js fetch code (using built-in fetch or node-fetch).
   * @param {object} request
   * @returns {string}
   */
  static toNodeFetch(request) {
    const method = (request.method || 'GET').toUpperCase();
    const url = _getEffectiveUrl(request);
    const headers = _getEffectiveHeaders(request);
    const body = _getBodyString(request);

    const lines = [
      '// Node.js 18+ has built-in fetch. For older versions:',
      "// const fetch = require('node-fetch');",
      '',
    ];

    const hasBody = body && method !== 'GET' && method !== 'HEAD';

    lines.push('async function makeRequest() {');

    if (request.bodyType === 'form-data' && Array.isArray(request.body) && hasBody) {
      lines.push("  const { FormData } = require('formdata-node');");
      lines.push('  const formData = new FormData();');
      for (const field of request.body) {
        if (field.enabled === false) continue;
        lines.push(`  formData.append('${_jsEscape(field.key || '')}', '${_jsEscape(field.value || '')}');`);
      }
      lines.push('');
    }

    lines.push(`  const response = await fetch('${_jsEscape(url)}', {`);
    lines.push(`    method: '${method}',`);

    if (headers.length > 0) {
      lines.push('    headers: {');
      for (const h of headers) {
        if (request.bodyType === 'form-data' && h.key.toLowerCase() === 'content-type') continue;
        lines.push(`      '${_jsEscape(h.key)}': '${_jsEscape(h.value)}',`);
      }
      lines.push('    },');
    }

    if (hasBody) {
      if (request.bodyType === 'json') {
        lines.push(`    body: JSON.stringify(${body}),`);
      } else if (request.bodyType === 'form-data') {
        lines.push('    body: formData,');
      } else if (request.bodyType === 'x-www-form-urlencoded' && Array.isArray(request.body)) {
        const params = request.body
          .filter((f) => f.enabled !== false)
          .map((f) => `${encodeURIComponent(f.key || '')}=${encodeURIComponent(f.value || '')}`)
          .join('&');
        lines.push(`    body: '${_jsEscape(params)}',`);
      } else {
        lines.push(`    body: '${_jsEscape(body)}',`);
      }
    }

    lines.push('  });');
    lines.push('');
    lines.push('  const data = await response.json();');
    lines.push('  console.log(data);');
    lines.push('  return data;');
    lines.push('}');
    lines.push('');
    lines.push('makeRequest().catch(console.error);');

    return lines.join('\n');
  }

  /**
   * Get all available generator names.
   * @returns {Array<{id: string, name: string, language: string}>}
   */
  static getGenerators() {
    return [
      { id: 'curl', name: 'cURL', language: 'bash' },
      { id: 'fetch', name: 'JavaScript (fetch)', language: 'javascript' },
      { id: 'axios', name: 'JavaScript (Axios)', language: 'javascript' },
      { id: 'python', name: 'Python (requests)', language: 'python' },
      { id: 'php', name: 'PHP (cURL)', language: 'php' },
      { id: 'node', name: 'Node.js (fetch)', language: 'javascript' },
    ];
  }

  /**
   * Generate code for a specific generator by ID.
   * @param {string} generatorId
   * @param {object} request
   * @returns {string}
   */
  static generate(generatorId, request) {
    switch (generatorId) {
      case 'curl':
        return CodeGenerator.toCurl(request);
      case 'fetch':
        return CodeGenerator.toFetch(request);
      case 'axios':
        return CodeGenerator.toAxios(request);
      case 'python':
        return CodeGenerator.toPythonRequests(request);
      case 'php':
        return CodeGenerator.toPhpCurl(request);
      case 'node':
        return CodeGenerator.toNodeFetch(request);
      default:
        return `// Unknown generator: ${generatorId}`;
    }
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

export default CodeGenerator;
export { CodeGenerator };
