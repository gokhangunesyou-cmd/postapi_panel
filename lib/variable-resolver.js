/**
 * PostAPI Panel — Variable Resolver
 * 
 * Resolves {{variable}} placeholders in strings, objects, headers, and URLs.
 * Lookup order: active environment → global variables → built-in dynamic vars.
 * 
 * @module lib/variable-resolver
 */

// ─── Built-in Dynamic Variables ────────────────────────────────────────────────

/**
 * Map of built-in dynamic variable names to their generator functions.
 * These are evaluated fresh on every resolution.
 */
const BUILTIN_VARS = {
  /**
   * Current Unix timestamp (seconds since epoch).
   */
  $timestamp: () => String(Math.floor(Date.now() / 1000)),

  /**
   * Current time as an ISO 8601 string.
   */
  $isoTimestamp: () => new Date().toISOString(),

  /**
   * Random integer between 0 and 2^31 - 1.
   */
  $randomInt: () => String(Math.floor(Math.random() * 2147483647)),

  /**
   * RFC 4122 version-4 UUID.
   */
  $randomUUID: () => {
    // Use crypto.randomUUID if available, otherwise fall back to manual
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Manual v4 UUID generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Random email address.
   */
  $randomEmail: () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];
    let user = '';
    const len = 8 + Math.floor(Math.random() * 8);
    for (let i = 0; i < len; i++) {
      user += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${user}@${domain}`;
  },
};

/** Regex for matching {{variableName}} patterns */
const VAR_PATTERN = /\{\{([^{}]+)\}\}/g;

// ─── VariableResolver ──────────────────────────────────────────────────────────

class VariableResolver {
  /**
   * Resolve all {{variable}} occurrences in a string.
   * 
   * @param {string} template — string potentially containing {{var}} placeholders
   * @param {object} [environment] — { variables: [{key, value, enabled}] }
   * @param {object} [globals] — { variables: [{key, value, enabled}] } (global env)
   * @returns {string} — template with all resolvable variables replaced
   */
  resolve(template, environment, globals) {
    if (typeof template !== 'string') return template;
    if (!this.hasVariables(template)) return template;

    // Build lookup maps (environment overrides globals)
    const envMap = this._buildVarMap(environment);
    const globalMap = this._buildVarMap(globals);

    return template.replace(VAR_PATTERN, (match, varName) => {
      const trimmed = varName.trim();

      // 1. Active environment
      if (envMap.has(trimmed)) {
        return envMap.get(trimmed);
      }

      // 2. Global variables
      if (globalMap.has(trimmed)) {
        return globalMap.get(trimmed);
      }

      // 3. Built-in dynamic variables
      if (BUILTIN_VARS[trimmed]) {
        try {
          return BUILTIN_VARS[trimmed]();
        } catch (err) {
          console.error(`[VariableResolver] Built-in "${trimmed}" failed:`, err);
          return match; // Leave unresolved
        }
      }

      // 4. Not found — leave as-is
      return match;
    });
  }

  /**
   * Deep-resolve all string values in an object (or array).
   * Non-string values are left untouched.
   * 
   * @param {*} obj — value to deep-resolve
   * @param {object} [environment]
   * @param {object} [globals]
   * @returns {*} — deep-resolved copy
   */
  resolveObject(obj, environment, globals) {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.resolve(obj, environment, globals);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObject(item, environment, globals));
    }

    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveObject(value, environment, globals);
      }
      return result;
    }

    // number, boolean, etc. — return as-is
    return obj;
  }

  /**
   * Resolve variables in an array of header objects [{key, value, enabled?}].
   * Only enabled headers are resolved (disabled ones are left untouched).
   * 
   * @param {Array<{key:string, value:string, enabled?:boolean}>} headers
   * @param {object} [environment]
   * @param {object} [globals]
   * @returns {Array<{key:string, value:string, enabled?:boolean}>}
   */
  resolveHeaders(headers, environment, globals) {
    if (!Array.isArray(headers)) return [];

    return headers.map((header) => {
      // Skip disabled headers
      if (header.enabled === false) return { ...header };

      return {
        ...header,
        key: this.resolve(header.key, environment, globals),
        value: this.resolve(header.value, environment, globals),
      };
    });
  }

  /**
   * Resolve a URL template.
   * @param {string} url
   * @param {object} [environment]
   * @param {object} [globals]
   * @returns {string}
   */
  resolveUrl(url, environment, globals) {
    return this.resolve(url, environment, globals);
  }

  /**
   * Extract all variable names found in a template string.
   * @param {string} template
   * @returns {string[]} — array of unique variable names
   */
  extractVariables(template) {
    if (typeof template !== 'string') return [];

    const vars = new Set();
    let match;
    const re = new RegExp(VAR_PATTERN.source, 'g');

    while ((match = re.exec(template)) !== null) {
      vars.add(match[1].trim());
    }

    return [...vars];
  }

  /**
   * Check whether a string contains any {{...}} patterns.
   * @param {string} str
   * @returns {boolean}
   */
  hasVariables(str) {
    if (typeof str !== 'string') return false;
    return str.includes('{{') && str.includes('}}');
  }

  /**
   * Get available built-in variable names.
   * @returns {string[]}
   */
  getBuiltinVariables() {
    return Object.keys(BUILTIN_VARS);
  }

  // ── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Build a Map<variableName, value> from an environment object.
   * Only enabled variables are included.
   * @param {object} [env] — { variables: [{key, value, enabled}] }
   * @returns {Map<string, string>}
   * @private
   */
  _buildVarMap(env) {
    const map = new Map();
    if (!env?.variables || !Array.isArray(env.variables)) return map;

    for (const v of env.variables) {
      // Default to enabled if not explicitly set
      if (v.enabled !== false && v.key) {
        map.set(v.key, v.value ?? '');
      }
    }

    return map;
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

const variableResolver = new VariableResolver();

export default variableResolver;
export { VariableResolver, BUILTIN_VARS };
