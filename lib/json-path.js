/**
 * PostAPI Panel — JSONPath Query Engine
 * 
 * A lightweight, zero-dependency JSONPath implementation supporting:
 *   $.store.book[0].title       — dot notation
 *   $.store.book[*].title       — wildcard
 *   $..title                    — recursive descent
 *   $.store.book[?(@.price<10)] — filter expressions
 *   $.store.book[0:2]           — array slicing
 * 
 * Every query returns an array of { path: string, value: any }.
 * 
 * @module lib/json-path
 */

// ─── Tokeniser ─────────────────────────────────────────────────────────────────

/**
 * Parse a JSONPath expression into an array of segment tokens.
 * Each token is an object: { type, value }
 * Types: 'root', 'child', 'recursive', 'wildcard', 'index', 'slice', 'filter'
 * 
 * @param {string} expr
 * @returns {Array<object>}
 */
function tokenize(expr) {
  const tokens = [];
  if (!expr || typeof expr !== 'string') return tokens;

  let path = expr.trim();

  // Must start with $
  if (!path.startsWith('$')) {
    path = '$.' + path;
  }

  tokens.push({ type: 'root', value: '$' });
  path = path.slice(1); // remove leading $

  let i = 0;
  while (i < path.length) {
    const ch = path[i];

    if (ch === '.') {
      if (path[i + 1] === '.') {
        // Recursive descent
        tokens.push({ type: 'recursive', value: '..' });
        i += 2;
      } else {
        i += 1;
      }

      // Read identifier after dot
      if (i < path.length && path[i] !== '[' && path[i] !== '.') {
        let name = '';
        while (i < path.length && path[i] !== '.' && path[i] !== '[') {
          name += path[i];
          i++;
        }

        if (name === '*') {
          tokens.push({ type: 'wildcard', value: '*' });
        } else if (name) {
          tokens.push({ type: 'child', value: name });
        }
      }
    } else if (ch === '[') {
      // Find matching ]
      let depth = 1;
      let j = i + 1;
      while (j < path.length && depth > 0) {
        if (path[j] === '[') depth++;
        if (path[j] === ']') depth--;
        j++;
      }

      const inner = path.slice(i + 1, j - 1).trim();
      i = j;

      if (inner === '*') {
        tokens.push({ type: 'wildcard', value: '*' });
      } else if (inner.startsWith('?')) {
        tokens.push({ type: 'filter', value: inner.slice(1).trim() });
      } else if (inner.includes(':')) {
        tokens.push({ type: 'slice', value: inner });
      } else if (inner.startsWith("'") || inner.startsWith('"')) {
        // Quoted property name
        const propName = inner.slice(1, -1);
        tokens.push({ type: 'child', value: propName });
      } else {
        // Numeric index
        const idx = parseInt(inner, 10);
        if (!isNaN(idx)) {
          tokens.push({ type: 'index', value: idx });
        } else {
          tokens.push({ type: 'child', value: inner });
        }
      }
    } else {
      // Skip unexpected characters
      i++;
    }
  }

  return tokens;
}

// ─── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a JSONPath expression against a JavaScript object.
 * 
 * @param {*} root — the data object
 * @param {Array<object>} tokens — parsed tokens
 * @returns {Array<{path: string, value: *}>}
 */
function evaluate(root, tokens) {
  if (!tokens.length) return [];

  // Start with root
  let results = [{ path: '$', value: root }];

  for (let t = 1; t < tokens.length; t++) {
    const token = tokens[t];
    let nextResults = [];

    for (const { path, value } of results) {
      switch (token.type) {
        case 'child':
          if (value !== null && typeof value === 'object') {
            const child = value[token.value];
            if (child !== undefined) {
              nextResults.push({
                path: `${path}.${token.value}`,
                value: child,
              });
            }
          }
          break;

        case 'index':
          if (Array.isArray(value)) {
            const idx = token.value < 0 ? value.length + token.value : token.value;
            if (idx >= 0 && idx < value.length) {
              nextResults.push({
                path: `${path}[${token.value}]`,
                value: value[idx],
              });
            }
          }
          break;

        case 'wildcard':
          if (Array.isArray(value)) {
            value.forEach((item, idx) => {
              nextResults.push({
                path: `${path}[${idx}]`,
                value: item,
              });
            });
          } else if (value !== null && typeof value === 'object') {
            for (const [key, val] of Object.entries(value)) {
              nextResults.push({
                path: `${path}.${key}`,
                value: val,
              });
            }
          }
          break;

        case 'recursive':
          // Collect all descendants, then apply the NEXT token to each
          {
            const descendants = _collectDescendants(value, path);

            // If there's a next token, apply it
            if (t + 1 < tokens.length) {
              const nextToken = tokens[t + 1];
              t++; // consume next token here

              for (const desc of descendants) {
                const matched = _applyToken(desc.value, desc.path, nextToken);
                nextResults.push(...matched);
              }
            } else {
              nextResults.push(...descendants);
            }
          }
          break;

        case 'slice':
          if (Array.isArray(value)) {
            const parts = token.value.split(':').map((s) => s.trim());
            const len = value.length;
            let start = parts[0] !== '' ? parseInt(parts[0], 10) : 0;
            let end = parts[1] !== '' ? parseInt(parts[1], 10) : len;
            const step = parts[2] !== undefined && parts[2] !== '' ? parseInt(parts[2], 10) : 1;

            if (start < 0) start = Math.max(0, len + start);
            if (end < 0) end = Math.max(0, len + end);
            start = Math.min(start, len);
            end = Math.min(end, len);

            for (let idx = start; step > 0 ? idx < end : idx > end; idx += step) {
              nextResults.push({
                path: `${path}[${idx}]`,
                value: value[idx],
              });
            }
          }
          break;

        case 'filter':
          if (Array.isArray(value)) {
            value.forEach((item, idx) => {
              if (_evaluateFilter(item, token.value)) {
                nextResults.push({
                  path: `${path}[${idx}]`,
                  value: item,
                });
              }
            });
          }
          break;

        default:
          break;
      }
    }

    results = nextResults;
  }

  return results;
}

/**
 * Apply a single token to a value and return matches.
 * @private
 */
function _applyToken(value, path, token) {
  const results = [];

  if (value === null || value === undefined) return results;

  switch (token.type) {
    case 'child':
      if (typeof value === 'object') {
        const child = value[token.value];
        if (child !== undefined) {
          results.push({ path: `${path}.${token.value}`, value: child });
        }
      }
      break;

    case 'wildcard':
      if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          results.push({ path: `${path}[${idx}]`, value: item });
        });
      } else if (typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
          results.push({ path: `${path}.${key}`, value: val });
        }
      }
      break;

    case 'index':
      if (Array.isArray(value)) {
        const idx = token.value < 0 ? value.length + token.value : token.value;
        if (idx >= 0 && idx < value.length) {
          results.push({ path: `${path}[${token.value}]`, value: value[idx] });
        }
      }
      break;

    case 'filter':
      if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          if (_evaluateFilter(item, token.value)) {
            results.push({ path: `${path}[${idx}]`, value: item });
          }
        });
      }
      break;

    default:
      break;
  }

  return results;
}

/**
 * Recursively collect all descendant values.
 * @param {*} value
 * @param {string} path
 * @returns {Array<{path, value}>}
 * @private
 */
function _collectDescendants(value, path) {
  const results = [{ path, value }];

  if (value === null || typeof value !== 'object') return results;

  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      results.push(..._collectDescendants(item, `${path}[${idx}]`));
    });
  } else {
    for (const [key, val] of Object.entries(value)) {
      results.push(..._collectDescendants(val, `${path}.${key}`));
    }
  }

  return results;
}

// ─── Filter Expression Evaluator ───────────────────────────────────────────────

/**
 * Evaluate a filter expression like (@.price < 10) against an item.
 * Supports: ==, !=, <, >, <=, >=, && , ||
 * @param {*} item
 * @param {string} expr — e.g. "(@.price < 10)"
 * @returns {boolean}
 * @private
 */
function _evaluateFilter(item, expr) {
  if (!expr || typeof expr !== 'string') return false;

  // Remove surrounding parentheses
  let e = expr.trim();
  if (e.startsWith('(') && e.endsWith(')')) {
    e = e.slice(1, -1).trim();
  }

  // Handle logical operators (simple left-to-right, no precedence)
  if (e.includes('&&')) {
    return e.split('&&').every((part) => _evaluateFilter(item, part.trim()));
  }
  if (e.includes('||')) {
    return e.split('||').some((part) => _evaluateFilter(item, part.trim()));
  }

  // Match comparison: @.field op value
  const compMatch = e.match(
    /^@\.([a-zA-Z_$][\w.$]*)\s*(==|!=|<=|>=|<|>)\s*(.+)$/
  );
  if (compMatch) {
    const [, fieldPath, operator, rawRight] = compMatch;
    const leftVal = _resolveFieldPath(item, fieldPath);
    const rightVal = _parseFilterValue(rawRight.trim());

    return _compare(leftVal, operator, rightVal);
  }

  // Existence check: @.field
  const existMatch = e.match(/^@\.([a-zA-Z_$][\w.$]*)$/);
  if (existMatch) {
    const val = _resolveFieldPath(item, existMatch[1]);
    return val !== undefined && val !== null;
  }

  return false;
}

/**
 * Resolve a dotted field path on an object (e.g. "author.name").
 * @private
 */
function _resolveFieldPath(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Parse a filter value literal.
 * @private
 */
function _parseFilterValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;

  // Quoted string
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }

  // Number
  const num = Number(raw);
  if (!isNaN(num)) return num;

  return raw;
}

/**
 * Compare two values with the given operator.
 * @private
 */
function _compare(left, op, right) {
  switch (op) {
    case '==':
      return left == right; // eslint-disable-line eqeqeq
    case '!=':
      return left != right; // eslint-disable-line eqeqeq
    case '<':
      return left < right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '>=':
      return left >= right;
    default:
      return false;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a JSONPath expression and return all matching results.
 * @param {*} obj — the data to query
 * @param {string} path — JSONPath expression (e.g. "$.store.book[*].title")
 * @returns {Array<{path: string, value: *}>}
 */
export function jsonPathQuery(obj, path) {
  try {
    const tokens = tokenize(path);
    return evaluate(obj, tokens);
  } catch (err) {
    console.error('[jsonPath] Query error:', err);
    return [];
  }
}

/**
 * Search for all paths whose value contains the search term.
 * Works on string values (case-insensitive partial match) and exact matches
 * for numbers/booleans.
 * 
 * @param {*} obj — the data to search
 * @param {string|number|boolean} searchTerm
 * @returns {Array<{path: string, value: *}>}
 */
export function jsonPathSearch(obj, searchTerm) {
  const results = [];
  if (obj === null || obj === undefined) return results;

  const termStr = String(searchTerm).toLowerCase();

  function walk(current, path) {
    if (current === null || current === undefined) return;

    if (typeof current === 'string') {
      if (current.toLowerCase().includes(termStr)) {
        results.push({ path, value: current });
      }
    } else if (typeof current === 'number' || typeof current === 'boolean') {
      if (String(current).toLowerCase() === termStr) {
        results.push({ path, value: current });
      }
    } else if (Array.isArray(current)) {
      current.forEach((item, idx) => {
        walk(item, `${path}[${idx}]`);
      });
    } else if (typeof current === 'object') {
      for (const [key, val] of Object.entries(current)) {
        // Also check if the key matches
        if (key.toLowerCase().includes(termStr)) {
          results.push({ path: `${path}.${key}`, value: val });
        }
        walk(val, `${path}.${key}`);
      }
    }
  }

  walk(obj, '$');
  return results;
}

/**
 * Get a single value at a JSONPath. Returns the first match's value,
 * or undefined if no match.
 * @param {*} obj
 * @param {string} path
 * @returns {*}
 */
export function getValueAtPath(obj, path) {
  const results = jsonPathQuery(obj, path);
  return results.length > 0 ? results[0].value : undefined;
}

export default { jsonPathQuery, jsonPathSearch, getValueAtPath };
