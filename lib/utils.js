/**
 * PostAPI Panel — Utility Functions
 * Shared helper functions used across all extension components.
 */

import { STATUS_COLORS } from './constants.js';

/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID when available, falls back to manual generation.
 * @returns {string} UUID v4
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Manual fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Format byte count into human-readable string.
 * @param {number} bytes - Number of bytes
 * @param {number} [decimals=2] - Decimal places
 * @returns {string} Formatted string (e.g., "1.5 KB")
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0 || bytes == null) return '0 B';
  if (bytes < 0) return '—';

  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const index = Math.min(i, units.length - 1);

  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(decimals))} ${units[index]}`;
}

/**
 * Format duration in milliseconds to human-readable string.
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "1.23 s", "456 ms")
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get display color for an HTTP status code.
 * @param {number} status - HTTP status code
 * @returns {string} Hex color string
 */
export function getStatusColor(status) {
  const category = getStatusCategory(status);
  return STATUS_COLORS[category] || '#9aa0a6';
}

/**
 * Classify an HTTP status code into its category.
 * @param {number} status - HTTP status code
 * @returns {string} Category string ('1xx', '2xx', '3xx', '4xx', '5xx')
 */
export function getStatusCategory(status) {
  if (status >= 100 && status < 200) return '1xx';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'unknown';
}

/**
 * Create a debounced version of a function.
 * The function will only execute after the specified delay has elapsed
 * since the last invocation.
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function with .cancel() method
 */
export function debounce(fn, delay) {
  let timerId = null;

  const debounced = function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };

  debounced.cancel = () => {
    clearTimeout(timerId);
    timerId = null;
  };

  return debounced;
}

/**
 * Create a throttled version of a function.
 * The function will execute at most once per specified interval.
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Minimum interval in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, delay) {
  let lastCall = 0;
  let timerId = null;

  const throttled = function (...args) {
    const now = Date.now();
    const remaining = delay - (now - lastCall);

    if (remaining <= 0) {
      clearTimeout(timerId);
      timerId = null;
      lastCall = now;
      fn.apply(this, args);
    } else if (!timerId) {
      // Schedule trailing call
      timerId = setTimeout(() => {
        lastCall = Date.now();
        timerId = null;
        fn.apply(this, args);
      }, remaining);
    }
  };

  throttled.cancel = () => {
    clearTimeout(timerId);
    timerId = null;
  };

  return throttled;
}

/**
 * Deep clone an object using structured clone with JSON fallback.
 * @param {*} obj - Object to clone
 * @returns {*} Deep clone of the object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  try {
    // structuredClone handles Date, RegExp, Map, Set, etc.
    return structuredClone(obj);
  } catch {
    // Fallback for simple JSON-serializable objects
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return obj;
    }
  }
}

/**
 * Parse a URL string into its components.
 * @param {string} url - URL to parse
 * @returns {object|null} Parsed URL components or null if invalid
 */
export function parseUrl(url) {
  try {
    // Prepend protocol if missing so URL constructor doesn't choke
    let normalizedUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      normalizedUrl = `https://${url}`;
    }

    const parsed = new URL(normalizedUrl);
    const params = [];

    parsed.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true });
    });

    return {
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      origin: parsed.origin,
      params,
      full: parsed.href
    };
  } catch {
    return null;
  }
}

/**
 * Build a URL from a base string and query parameters.
 * @param {string} base - Base URL (may already contain query params)
 * @param {Array<{key: string, value: string, enabled?: boolean}>} params - Query parameters
 * @returns {string} Constructed URL
 */
export function buildUrl(base, params = []) {
  if (!base) return '';

  try {
    // Ensure protocol for URL constructor
    let normalizedBase = base;
    if (!/^https?:\/\//i.test(base)) {
      normalizedBase = `https://${base}`;
    }

    const url = new URL(normalizedBase);

    // Clear existing params and re-add them alongside new ones
    const existingParams = Array.from(url.searchParams.entries());
    url.search = '';

    // Add back existing params
    existingParams.forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    // Add new enabled params
    params.forEach((param) => {
      if (param.enabled !== false && param.key) {
        url.searchParams.append(param.key, param.value || '');
      }
    });

    // Return without protocol if original didn't have one
    if (!/^https?:\/\//i.test(base)) {
      return url.href.replace(/^https?:\/\//, '');
    }

    return url.href;
  } catch {
    // If URL construction fails, do simple string concatenation
    const enabledParams = params.filter((p) => p.enabled !== false && p.key);
    if (enabledParams.length === 0) return base;

    const queryString = enabledParams
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`)
      .join('&');

    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}${queryString}`;
  }
}

/**
 * Safely parse a JSON string without throwing.
 * @param {string} str - JSON string to parse
 * @param {*} [fallback=null] - Value to return on parse failure
 * @returns {*} Parsed value or fallback
 */
export function safeJsonParse(str, fallback = null) {
  if (typeof str !== 'string') return fallback;

  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Truncate a string to a maximum length with an ellipsis.
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum character length
 * @returns {string} Truncated string
 */
export function truncate(str, maxLen = 100) {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - Raw string
 * @returns {string} HTML-safe string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';

  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Format a timestamp into a locale-aware human-readable string.
 * @param {number|string|Date} ts - Timestamp (ms since epoch, ISO string, or Date)
 * @param {object} [options] - Intl.DateTimeFormat options override
 * @returns {string} Formatted date string
 */
export function formatTimestamp(ts, options = {}) {
  if (!ts) return '—';

  try {
    const date = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(date.getTime())) return '—';

    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options
    };

    return new Intl.DateTimeFormat(undefined, defaultOptions).format(date);
  } catch {
    return '—';
  }
}

/**
 * Validate whether a string is a well-formed URL.
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;

  try {
    let testUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      testUrl = `https://${url}`;
    }
    new URL(testUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a URL matches a glob or regex pattern.
 * Supports simple glob patterns: * (any chars), ? (single char)
 * Patterns starting with / are treated as regex.
 * @param {string} url - URL to test
 * @param {string} pattern - Glob or regex pattern
 * @returns {boolean} True if URL matches the pattern
 */
export function matchesPattern(url, pattern) {
  if (!url || !pattern) return false;

  try {
    // Treat patterns wrapped in / as regex
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      const lastSlash = pattern.lastIndexOf('/');
      const regexBody = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      const regex = new RegExp(regexBody, flags);
      return regex.test(url);
    }

    // Convert glob pattern to regex
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex specials (except * and ?)
      .replace(/\*/g, '.*')                   // * → any characters
      .replace(/\?/g, '.');                   // ? → single character

    return new RegExp(`^${regexStr}$`, 'i').test(url);
  } catch {
    // If pattern is invalid, fall back to simple string inclusion
    return url.includes(pattern);
  }
}

/**
 * Copy text to the clipboard.
 * Uses the Clipboard API with a textarea fallback.
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} True if copy succeeded
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback: hidden textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

/**
 * Trigger a file download in the browser.
 * @param {string} content - File content
 * @param {string} filename - Suggested file name
 * @param {string} [type='application/json'] - MIME type
 */
export function downloadFile(content, filename, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Pretty-print a JSON string with proper indentation.
 * Returns the original string if it's not valid JSON.
 * @param {string} jsonStr - JSON string
 * @param {number} [indent=2] - Indentation spaces
 * @returns {string} Formatted JSON string
 */
export function prettyPrintJson(jsonStr, indent = 2) {
  try {
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed, null, indent);
  } catch {
    return jsonStr;
  }
}

/**
 * Calculate the byte size of a string (UTF-8).
 * @param {string} str - String to measure
 * @returns {number} Byte count
 */
export function getStringByteSize(str) {
  if (typeof str !== 'string') return 0;

  try {
    return new Blob([str]).size;
  } catch {
    // Rough fallback
    return new TextEncoder().encode(str).length;
  }
}

/**
 * Create a relative time string (e.g., "5 min ago", "2 hours ago").
 * @param {number|string|Date} ts - Timestamp
 * @returns {string} Relative time string
 */
export function relativeTime(ts) {
  if (!ts) return '—';

  const date = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(date.getTime())) return '—';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return formatTimestamp(date, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Group an array of items by a classifier function.
 * @param {Array} items - Items to group
 * @param {Function} classifier - Function that returns a group key for each item
 * @returns {Object} Grouped items { [key]: [items] }
 */
export function groupBy(items, classifier) {
  return items.reduce((groups, item) => {
    const key = classifier(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Get the current timestamp in milliseconds.
 * @returns {number} Current timestamp
 */
export function now() {
  return Date.now();
}

