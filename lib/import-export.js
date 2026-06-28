/**
 * PostAPI Panel — Import / Export Manager
 * 
 * Supports:
 *   - PostAPI native JSON format (export & import)
 *   - Postman Collection v2.1 (export & import)
 *   - cURL command parsing (import only)
 * 
 * @module lib/import-export
 */

import { generateId, now } from './utils.js';

// ─── Format Detection ──────────────────────────────────────────────────────────

/**
 * Detect the format of a JSON string.
 * @param {string} jsonString
 * @returns {'postapi' | 'postman' | 'unknown'}
 */
function detectFormat(jsonString) {
  try {
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

    // Postman v2.1
    if (data.info && data.info.schema && data.info.schema.includes('schema.getpostman.com')) {
      return 'postman';
    }

    // PostAPI native format
    if (data._postapi || data.format === 'postapi') {
      return 'postapi';
    }

    // Try to detect Postman by structure
    if (data.info && data.item && Array.isArray(data.item)) {
      return 'postman';
    }

    // Try to detect PostAPI by structure
    if (data.collection && data.requests) {
      return 'postapi';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─── ImportExportManager ───────────────────────────────────────────────────────

class ImportExportManager {
  // ── Export ──────────────────────────────────────────────────────────────

  /**
   * Export a collection with its requests in PostAPI native format.
   * @param {object} collection — collection metadata
   * @param {Array<object>} requests — request objects belonging to this collection
   * @param {string} [format='postapi'] — export format
   * @returns {string} — JSON string
   */
  exportCollection(collection, requests, format = 'postapi') {
    if (format === 'postman') {
      return this.exportAsPostman(collection, requests);
    }

    const data = {
      _postapi: true,
      format: 'postapi',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      collection: {
        id: collection.id,
        name: collection.name || 'Unnamed Collection',
        description: collection.description || '',
        variables: collection.variables || [],
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      },
      requests: (requests || []).map((req) => ({
        id: req.id,
        name: req.name || '',
        method: req.method || 'GET',
        url: req.url || '',
        headers: req.headers || [],
        body: req.body || null,
        bodyType: req.bodyType || 'none',
        auth: req.auth || { type: 'none' },
        folderId: req.folderId || null,
        sortOrder: req.sortOrder || 0,
      })),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Export in Postman Collection v2.1 format.
   * @param {object} collection
   * @param {Array<object>} requests
   * @returns {string} — JSON string
   */
  exportAsPostman(collection, requests) {
    const postmanCollection = {
      info: {
        _postman_id: collection.id || generateId(),
        name: collection.name || 'Unnamed Collection',
        description: collection.description || '',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: (requests || []).map((req) => this._requestToPostmanItem(req)),
      variable: (collection.variables || []).map((v) => ({
        key: v.key,
        value: v.value || '',
        type: 'string',
      })),
    };

    return JSON.stringify(postmanCollection, null, 2);
  }

  // ── Import ─────────────────────────────────────────────────────────────

  /**
   * Auto-detect format and import from a JSON string.
   * @param {string} jsonString
   * @returns {{ collection: object, requests: Array<object> }}
   * @throws {Error} if format is unknown or parsing fails
   */
  importFromJson(jsonString) {
    const format = detectFormat(jsonString);

    switch (format) {
      case 'postapi':
        return this._importPostApi(jsonString);
      case 'postman':
        return this.importFromPostman(jsonString);
      default:
        throw new Error('Unknown collection format. Supported formats: PostAPI, Postman Collection v2.1');
    }
  }

  /**
   * Import from Postman Collection v2.1 JSON.
   * @param {string|object} postmanJson — JSON string or parsed object
   * @returns {{ collection: object, requests: Array<object> }}
   */
  importFromPostman(postmanJson) {
    const data = typeof postmanJson === 'string' ? JSON.parse(postmanJson) : postmanJson;

    if (!data.info || !data.item) {
      throw new Error('Invalid Postman collection: missing "info" or "item"');
    }

    const collectionId = generateId();
    const timestamp = now();
    const folders = [];

    const collection = {
      id: collectionId,
      name: data.info.name || 'Imported Collection',
      description: data.info.description || '',
      variables: (data.variable || []).map((v) => ({
        key: v.key,
        value: v.value || '',
        enabled: !v.disabled,
      })),
      folders,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Recursively flatten items (handles nested folders)
    const requests = [];
    this._flattenPostmanItems(data.item, requests, collectionId, null, folders);

    return { collection, requests };
  }

  /**
   * Parse a cURL command into a PostAPI request object.
   * @param {string} curlCommand
   * @returns {object} — request config
   */
  importFromCurl(curlCommand) {
    if (!curlCommand || typeof curlCommand !== 'string') {
      throw new Error('Invalid cURL command');
    }

    // Normalise multiline commands (backslash continuations)
    let cmd = curlCommand.replace(/\\\s*\n/g, ' ').trim();

    // Remove leading "curl" keyword
    if (cmd.toLowerCase().startsWith('curl')) {
      cmd = cmd.slice(4).trim();
    }

    const request = {
      id: generateId(),
      name: '',
      method: 'GET',
      url: '',
      headers: [],
      body: null,
      bodyType: 'none',
      auth: { type: 'none' },
    };

    // Tokenize respecting quotes
    const tokens = this._tokenizeCurl(cmd);
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      switch (token) {
        case '-X':
        case '--request':
          i++;
          if (i < tokens.length) {
            request.method = tokens[i].toUpperCase();
          }
          break;

        case '-H':
        case '--header':
          i++;
          if (i < tokens.length) {
            const headerStr = tokens[i];
            const colonIdx = headerStr.indexOf(':');
            if (colonIdx > 0) {
              const key = headerStr.slice(0, colonIdx).trim();
              const value = headerStr.slice(colonIdx + 1).trim();
              request.headers.push({ key, value, enabled: true });
            }
          }
          break;

        case '-d':
        case '--data':
        case '--data-raw':
        case '--data-binary':
          i++;
          if (i < tokens.length) {
            request.body = tokens[i];
            // Auto-detect JSON body
            const trimmed = tokens[i].trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              request.bodyType = 'json';
              if (!request.headers.some((h) => h.key.toLowerCase() === 'content-type')) {
                request.headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
              }
            } else {
              request.bodyType = 'raw';
            }
            // Infer method if still GET
            if (request.method === 'GET') {
              request.method = 'POST';
            }
          }
          break;

        case '--data-urlencode':
          i++;
          if (i < tokens.length) {
            if (!Array.isArray(request.body)) {
              request.body = [];
              request.bodyType = 'x-www-form-urlencoded';
            }
            const eqIdx = tokens[i].indexOf('=');
            if (eqIdx > 0) {
              request.body.push({
                key: tokens[i].slice(0, eqIdx),
                value: tokens[i].slice(eqIdx + 1),
                enabled: true,
              });
            }
            if (request.method === 'GET') request.method = 'POST';
          }
          break;

        case '-F':
        case '--form':
          i++;
          if (i < tokens.length) {
            if (!Array.isArray(request.body)) {
              request.body = [];
              request.bodyType = 'form-data';
            }
            const eqIdx = tokens[i].indexOf('=');
            if (eqIdx > 0) {
              request.body.push({
                key: tokens[i].slice(0, eqIdx),
                value: tokens[i].slice(eqIdx + 1),
                enabled: true,
              });
            }
            if (request.method === 'GET') request.method = 'POST';
          }
          break;

        case '-u':
        case '--user':
          i++;
          if (i < tokens.length) {
            const [username, ...passwordParts] = tokens[i].split(':');
            request.auth = {
              type: 'basic',
              basic: {
                username: username || '',
                password: passwordParts.join(':') || '',
              },
            };
          }
          break;

        case '-L':
        case '--location':
          // Follow redirects — default behaviour, just skip
          break;

        case '-k':
        case '--insecure':
          // Skip SSL verification — not directly applicable to fetch
          break;

        case '-v':
        case '--verbose':
        case '-s':
        case '--silent':
        case '-S':
        case '--show-error':
        case '--compressed':
          // Informational flags — skip
          break;

        default:
          // If it looks like a URL (no leading dash)
          if (!token.startsWith('-') && !request.url) {
            request.url = token;
            request.name = this._extractNameFromUrl(token);
          }
          break;
      }

      i++;
    }

    // Check for auth header and convert to auth object
    const authHeaderIdx = request.headers.findIndex(
      (h) => h.key.toLowerCase() === 'authorization'
    );
    if (authHeaderIdx !== -1 && request.auth.type === 'none') {
      const authValue = request.headers[authHeaderIdx].value;
      if (authValue.startsWith('Bearer ')) {
        request.auth = {
          type: 'bearer',
          bearer: { token: authValue.slice(7) },
        };
        request.headers.splice(authHeaderIdx, 1);
      } else if (authValue.startsWith('Basic ')) {
        try {
          const decoded = atob(authValue.slice(6));
          const [username, ...passwordParts] = decoded.split(':');
          request.auth = {
            type: 'basic',
            basic: { username, password: passwordParts.join(':') },
          };
          request.headers.splice(authHeaderIdx, 1);
        } catch {
          // Leave as header if decoding fails
        }
      }
    }

    return request;
  }

  // ── Internal — PostAPI Import ──────────────────────────────────────────

  /**
   * Import from PostAPI native format.
   * @param {string|object} json
   * @returns {{ collection: object, requests: Array<object> }}
   * @private
   */
  _importPostApi(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    if (!data.collection) {
      throw new Error('Invalid PostAPI format: missing "collection"');
    }

    const collectionId = generateId();
    const timestamp = now();

    const collection = {
      id: collectionId,
      name: data.collection.name || 'Imported Collection',
      description: data.collection.description || '',
      variables: data.collection.variables || [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const requests = (data.requests || []).map((req) => ({
      ...req,
      id: generateId(),
      collectionId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    return { collection, requests };
  }

  // ── Internal — Postman Conversion ──────────────────────────────────────

  /**
   * Recursively flatten Postman items (handles nested folders).
   * @param {Array} items — Postman item array
   * @param {Array} out — output request array
   * @param {string} collectionId
   * @param {string|null} folderId — parent folder ID
   * @private
   */
  _flattenPostmanItems(items, out, collectionId, folderId, foldersList) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (item.item && Array.isArray(item.item)) {
        // This is a folder
        const folderItemId = generateId();
        foldersList.push({
          id: folderItemId,
          name: item.name || 'Folder',
          requests: []
        });
        // Recurse into folder
        this._flattenPostmanItems(item.item, out, collectionId, folderItemId, foldersList);
      } else if (item.request) {
        // This is a request
        const req = this._postmanItemToRequest(item, collectionId, folderId);
        out.push(req);
      }
    }
  }

  /**
   * Convert a single Postman item to a PostAPI request.
   * @param {object} item — Postman item
   * @param {string} collectionId
   * @param {string|null} folderId
   * @returns {object}
   * @private
   */
  _postmanItemToRequest(item, collectionId, folderId) {
    const pmReq = item.request;
    const timestamp = now();

    // URL
    let url = '';
    if (typeof pmReq.url === 'string') {
      url = pmReq.url;
    } else if (pmReq.url?.raw) {
      url = pmReq.url.raw;
    }

    // Headers
    const headers = (pmReq.header || []).map((h) => ({
      key: h.key || '',
      value: h.value || '',
      enabled: !h.disabled,
    }));

    // Body
    const { body, bodyType } = this._parsePostmanBody(pmReq.body);

    // Auth
    const auth = this._parsePostmanAuth(pmReq.auth || item.auth);

    return {
      id: generateId(),
      collectionId,
      folderId,
      name: item.name || '',
      method: (pmReq.method || 'GET').toUpperCase(),
      url,
      headers,
      body,
      bodyType,
      auth,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Parse Postman body format.
   * @param {object} pmBody
   * @returns {{ body: *, bodyType: string }}
   * @private
   */
  _parsePostmanBody(pmBody) {
    if (!pmBody) return { body: null, bodyType: 'none' };

    switch (pmBody.mode) {
      case 'raw':
        // Check if it's JSON via options
        if (pmBody.options?.raw?.language === 'json') {
          return { body: pmBody.raw || '', bodyType: 'json' };
        }
        // Try to auto-detect JSON
        if (pmBody.raw) {
          const trimmed = pmBody.raw.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return { body: pmBody.raw, bodyType: 'json' };
          }
        }
        return { body: pmBody.raw || '', bodyType: 'raw' };

      case 'formdata':
        return {
          body: (pmBody.formdata || []).map((f) => ({
            key: f.key || '',
            value: f.value || '',
            type: f.type || 'text',
            enabled: !f.disabled,
          })),
          bodyType: 'form-data',
        };

      case 'urlencoded':
        return {
          body: (pmBody.urlencoded || []).map((f) => ({
            key: f.key || '',
            value: f.value || '',
            enabled: !f.disabled,
          })),
          bodyType: 'x-www-form-urlencoded',
        };

      case 'file':
        return { body: null, bodyType: 'none' };

      default:
        return { body: null, bodyType: 'none' };
    }
  }

  /**
   * Parse Postman auth into PostAPI auth format.
   * @param {object} pmAuth
   * @returns {object}
   * @private
   */
  _parsePostmanAuth(pmAuth) {
    if (!pmAuth || pmAuth.type === 'noauth') {
      return { type: 'none' };
    }

    switch (pmAuth.type) {
      case 'bearer': {
        const tokenEntry = (pmAuth.bearer || []).find((e) => e.key === 'token');
        return {
          type: 'bearer',
          bearer: { token: tokenEntry?.value || '' },
        };
      }

      case 'basic': {
        const userEntry = (pmAuth.basic || []).find((e) => e.key === 'username');
        const passEntry = (pmAuth.basic || []).find((e) => e.key === 'password');
        return {
          type: 'basic',
          basic: {
            username: userEntry?.value || '',
            password: passEntry?.value || '',
          },
        };
      }

      case 'apikey': {
        const keyEntry = (pmAuth.apikey || []).find((e) => e.key === 'key');
        const valEntry = (pmAuth.apikey || []).find((e) => e.key === 'value');
        const inEntry = (pmAuth.apikey || []).find((e) => e.key === 'in');
        return {
          type: 'api-key',
          apiKey: {
            key: keyEntry?.value || '',
            value: valEntry?.value || '',
            addTo: inEntry?.value === 'query' ? 'query' : 'header',
          },
        };
      }

      default:
        return { type: 'none' };
    }
  }

  /**
   * Convert a PostAPI request to a Postman item object.
   * @param {object} req
   * @returns {object}
   * @private
   */
  _requestToPostmanItem(req) {
    const item = {
      name: req.name || req.url || '',
      request: {
        method: (req.method || 'GET').toUpperCase(),
        header: (req.headers || []).map((h) => ({
          key: h.key || '',
          value: h.value || '',
          disabled: h.enabled === false,
        })),
        url: {
          raw: req.url || '',
          protocol: '',
          host: [],
          path: [],
        },
      },
      response: [],
    };

    // Parse URL into Postman structure
    try {
      const parsed = new URL(req.url);
      item.request.url.protocol = parsed.protocol.replace(':', '');
      item.request.url.host = parsed.hostname.split('.');
      item.request.url.path = parsed.pathname.split('/').filter(Boolean);
      if (parsed.search) {
        item.request.url.query = Array.from(parsed.searchParams.entries()).map(([key, value]) => ({
          key,
          value,
        }));
      }
    } catch {
      // If URL parsing fails, keep raw only
    }

    // Body
    if (req.body && req.bodyType !== 'none') {
      item.request.body = this._requestToPostmanBody(req.body, req.bodyType);
    }

    // Auth
    if (req.auth && req.auth.type !== 'none') {
      item.request.auth = this._requestToPostmanAuth(req.auth);
    }

    return item;
  }

  /**
   * Convert PostAPI body to Postman body format.
   * @private
   */
  _requestToPostmanBody(body, bodyType) {
    switch (bodyType) {
      case 'json':
        return {
          mode: 'raw',
          raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
          options: { raw: { language: 'json' } },
        };

      case 'form-data':
        return {
          mode: 'formdata',
          formdata: (Array.isArray(body) ? body : []).map((f) => ({
            key: f.key || '',
            value: f.value || '',
            type: f.type || 'text',
            disabled: f.enabled === false,
          })),
        };

      case 'x-www-form-urlencoded':
        return {
          mode: 'urlencoded',
          urlencoded: (Array.isArray(body) ? body : []).map((f) => ({
            key: f.key || '',
            value: f.value || '',
            disabled: f.enabled === false,
          })),
        };

      case 'raw':
      default:
        return {
          mode: 'raw',
          raw: typeof body === 'string' ? body : String(body),
        };
    }
  }

  /**
   * Convert PostAPI auth to Postman auth format.
   * @private
   */
  _requestToPostmanAuth(auth) {
    switch (auth.type) {
      case 'bearer':
        return {
          type: 'bearer',
          bearer: [{ key: 'token', value: auth.bearer?.token || '', type: 'string' }],
        };

      case 'basic':
        return {
          type: 'basic',
          basic: [
            { key: 'username', value: auth.basic?.username || '', type: 'string' },
            { key: 'password', value: auth.basic?.password || '', type: 'string' },
          ],
        };

      case 'api-key':
        return {
          type: 'apikey',
          apikey: [
            { key: 'key', value: auth.apiKey?.key || '', type: 'string' },
            { key: 'value', value: auth.apiKey?.value || '', type: 'string' },
            { key: 'in', value: auth.apiKey?.addTo || 'header', type: 'string' },
          ],
        };

      default:
        return { type: 'noauth' };
    }
  }

  // ── Internal — cURL Tokenizer ──────────────────────────────────────────

  /**
   * Tokenize a cURL command string, respecting quoted arguments.
   * @param {string} cmd
   * @returns {string[]}
   * @private
   */
  _tokenizeCurl(cmd) {
    const tokens = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (let i = 0; i < cmd.length; i++) {
      const ch = cmd[i];

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }

      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }

      if (ch === ' ' && !inSingle && !inDouble) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += ch;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Extract a readable name from a URL.
   * @param {string} url
   * @returns {string}
   * @private
   */
  _extractNameFromUrl(url) {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1];
      }
      return parsed.hostname;
    } catch {
      return url.slice(0, 50);
    }
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

const importExportManager = new ImportExportManager();

export default importExportManager;
export { ImportExportManager, detectFormat };
