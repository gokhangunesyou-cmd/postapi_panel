/**
 * PostAPI Panel — Chrome Storage Wrapper
 * 
 * Provides a clean API over chrome.storage.local (data) and chrome.storage.sync (settings).
 * Implements typed accessors for every data model in the application.
 * 
 * @module lib/storage
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, DATA_VERSION } from './constants.js';
import { generateId, now } from './utils.js';

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Thin promise wrapper for chrome.storage area getters.
 * @param {'local'|'sync'} area
 * @param {string|string[]|null} keys
 * @returns {Promise<object>}
 */
function _get(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Thin promise wrapper for chrome.storage area setters.
 * @param {'local'|'sync'} area
 * @param {object} items
 * @returns {Promise<void>}
 */
function _set(area, items) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].set(items, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Thin promise wrapper for chrome.storage area remove.
 * @param {'local'|'sync'} area
 * @param {string|string[]} keys
 * @returns {Promise<void>}
 */
function _remove(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ─── StorageManager ────────────────────────────────────────────────────────────

class StorageManager {
  constructor() {
    /** @type {Set<Function>} listeners for storage change events */
    this._listeners = new Set();

    // Wire up Chrome's onChanged event once
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        this._listeners.forEach((cb) => {
          try {
            cb(changes, areaName);
          } catch (e) {
            console.error('[StorageManager] Listener error:', e);
          }
        });
      });
    }
  }

  // ── Generic CRUD ───────────────────────────────────────────────────────────

  /**
   * Get a value from local storage.
   * @param {string} key
   * @returns {Promise<*>}
   */
  async get(key) {
    try {
      const result = await _get('local', [key]);
      return result[key] ?? null;
    } catch (err) {
      console.error(`[StorageManager] get("${key}") failed:`, err);
      return null;
    }
  }

  /**
   * Set a value in local storage.
   * @param {string} key
   * @param {*} value
   */
  async set(key, value) {
    try {
      await _set('local', { [key]: value });
    } catch (err) {
      console.error(`[StorageManager] set("${key}") failed:`, err);
      throw err;
    }
  }

  /**
   * Remove a key from local storage.
   * @param {string} key
   */
  async remove(key) {
    try {
      await _remove('local', [key]);
    } catch (err) {
      console.error(`[StorageManager] remove("${key}") failed:`, err);
      throw err;
    }
  }

  /**
   * Clear all local storage data.
   */
  async clear() {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Change Listeners ───────────────────────────────────────────────────────

  /**
   * Register a callback for storage changes.
   * @param {Function} callback — receives (changes, areaName)
   * @returns {Function} unsubscribe function
   */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ── Collections ────────────────────────────────────────────────────────────

  /**
   * Retrieve all collections.
   * @returns {Promise<Array>}
   */
  async getCollections() {
    return (await this.get(STORAGE_KEYS.COLLECTIONS)) || [];
  }

  /**
   * Save (create or update) a collection.
   * @param {object} collection — must include at least { name }
   * @returns {Promise<object>} the saved collection with id and timestamps
   */
  async saveCollection(collection) {
    const collections = await this.getCollections();
    const timestamp = now();

    if (collection.id) {
      // Update existing
      const idx = collections.findIndex((c) => c.id === collection.id);
      if (idx !== -1) {
        collections[idx] = { ...collections[idx], ...collection, updatedAt: timestamp };
      } else {
        // ID provided but not found — insert as new
        collection.updatedAt = timestamp;
        collections.push(collection);
      }
    } else {
      // Create new
      collection.id = generateId();
      collection.createdAt = timestamp;
      collection.updatedAt = timestamp;
      collections.push(collection);
    }

    await this.set(STORAGE_KEYS.COLLECTIONS, collections);
    return collection;
  }

  /**
   * Delete a collection by ID.
   * @param {string} id
   */
  async deleteCollection(id) {
    const collections = await this.getCollections();
    const filtered = collections.filter((c) => c.id !== id);
    await this.set(STORAGE_KEYS.COLLECTIONS, filtered);

    // Also remove associated requests
    const requests = await this.getCollectionRequests(id);
    if (requests.length) {
      const allRequests = await this._getAllRequests();
      const remaining = allRequests.filter((r) => r.collectionId !== id);
      await this.set(STORAGE_KEYS.REQUESTS, remaining);
    }
  }

  /**
   * Get all requests belonging to a collection.
   * @param {string} collectionId
   * @returns {Promise<Array>}
   */
  async getCollectionRequests(collectionId) {
    const all = await this._getAllRequests();
    return all.filter((r) => r.collectionId === collectionId);
  }

  // ── Requests ───────────────────────────────────────────────────────────────

  /**
   * Get all requests from storage.
   * @returns {Promise<Array>}
   * @private
   */
  async _getAllRequests() {
    return (await this.get(STORAGE_KEYS.REQUESTS)) || [];
  }

  /**
   * Save (create or update) a request.
   * @param {object} request
   * @returns {Promise<object>}
   */
  async saveRequest(request) {
    const requests = await this._getAllRequests();
    const timestamp = now();

    if (request.id) {
      const idx = requests.findIndex((r) => r.id === request.id);
      if (idx !== -1) {
        requests[idx] = { ...requests[idx], ...request, updatedAt: timestamp };
      } else {
        request.updatedAt = timestamp;
        requests.push(request);
      }
    } else {
      request.id = generateId();
      request.createdAt = timestamp;
      request.updatedAt = timestamp;
      requests.push(request);
    }

    await this.set(STORAGE_KEYS.REQUESTS, requests);
    return request;
  }

  /**
   * Delete a request by ID.
   * @param {string} id
   */
  async deleteRequest(id) {
    const requests = await this._getAllRequests();
    await this.set(
      STORAGE_KEYS.REQUESTS,
      requests.filter((r) => r.id !== id)
    );
  }

  /**
   * Get a single request by ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getRequest(id) {
    const requests = await this._getAllRequests();
    return requests.find((r) => r.id === id) || null;
  }

  // ── History ────────────────────────────────────────────────────────────────

  /**
   * Get history entries, optionally filtered.
   * @param {object} [filters] — { method, search, startDate, endDate, limit }
   * @returns {Promise<Array>}
   */
  async getHistory(filters = {}) {
    let history = (await this.get(STORAGE_KEYS.HISTORY)) || [];

    // Apply filters
    if (filters.method) {
      history = history.filter((h) => h.method === filters.method);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      history = history.filter((h) => h.url?.toLowerCase().includes(term));
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      history = history.filter((h) => h.timestamp >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      history = history.filter((h) => h.timestamp <= end);
    }

    // Sort newest first
    history.sort((a, b) => b.timestamp - a.timestamp);

    if (filters.limit && filters.limit > 0) {
      history = history.slice(0, filters.limit);
    }

    return history;
  }

  /**
   * Add a new entry to history.
   * @param {object} entry — { method, url, statusCode, duration, ... }
   * @returns {Promise<object>}
   */
  async addToHistory(entry) {
    const history = (await this.get(STORAGE_KEYS.HISTORY)) || [];
    entry.id = entry.id || generateId();
    entry.timestamp = entry.timestamp || now();
    history.unshift(entry);

    // Auto-prune to prevent storage overflow (keep max 500 entries by default)
    const maxItems = 500;
    if (history.length > maxItems) {
      history.length = maxItems;
    }

    await this.set(STORAGE_KEYS.HISTORY, history);
    return entry;
  }

  /**
   * Clear all history.
   */
  async clearHistory() {
    await this.set(STORAGE_KEYS.HISTORY, []);
  }

  /**
   * Prune history entries older than maxAge (ms) or exceeding maxItems count.
   * @param {number} maxAge — maximum age in milliseconds
   * @param {number} maxItems — maximum number of items to keep
   */
  async pruneHistory(maxAge, maxItems) {
    let history = (await this.get(STORAGE_KEYS.HISTORY)) || [];
    const cutoff = now() - maxAge;

    history = history.filter((h) => h.timestamp >= cutoff);
    history.sort((a, b) => b.timestamp - a.timestamp);

    if (maxItems > 0 && history.length > maxItems) {
      history.length = maxItems;
    }

    await this.set(STORAGE_KEYS.HISTORY, history);
  }

  // ── Environments ───────────────────────────────────────────────────────────

  /**
   * Get all environments.
   * @returns {Promise<Array>}
   */
  async getEnvironments() {
    return (await this.get(STORAGE_KEYS.ENVIRONMENTS)) || [];
  }

  /**
   * Save (create or update) an environment.
   * @param {object} env — { name, variables: [{key, value, enabled}] }
   * @returns {Promise<object>}
   */
  async saveEnvironment(env) {
    const envs = await this.getEnvironments();
    const timestamp = now();

    if (env.id) {
      const idx = envs.findIndex((e) => e.id === env.id);
      if (idx !== -1) {
        envs[idx] = { ...envs[idx], ...env, updatedAt: timestamp };
      } else {
        env.updatedAt = timestamp;
        envs.push(env);
      }
    } else {
      env.id = generateId();
      env.createdAt = timestamp;
      env.updatedAt = timestamp;
      envs.push(env);
    }

    await this.set(STORAGE_KEYS.ENVIRONMENTS, envs);
    return env;
  }

  /**
   * Delete an environment by ID. If it was active, clears active environment.
   * @param {string} id
   */
  async deleteEnvironment(id) {
    const envs = await this.getEnvironments();
    await this.set(
      STORAGE_KEYS.ENVIRONMENTS,
      envs.filter((e) => e.id !== id)
    );

    // Clear active if deleted
    const activeId = await this.get(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
    if (activeId === id) {
      await this.remove(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
    }
  }

  /**
   * Set the active environment by ID.
   * @param {string|null} id — null to deactivate
   */
  async setActiveEnvironment(id) {
    if (id === null) {
      await this.remove(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
    } else {
      await this.set(STORAGE_KEYS.ACTIVE_ENVIRONMENT, id);
    }
  }

  /**
   * Get the currently active environment object (or null).
   * @returns {Promise<object|null>}
   */
  async getActiveEnvironment() {
    const id = await this.get(STORAGE_KEYS.ACTIVE_ENVIRONMENT);
    if (!id) return null;

    const envs = await this.getEnvironments();
    return envs.find((e) => e.id === id) || null;
  }

  // ── Header Rules ───────────────────────────────────────────────────────────

  /**
   * Get all header rules.
   * @returns {Promise<Array>}
   */
  async getHeaderRules() {
    return (await this.get(STORAGE_KEYS.HEADER_RULES)) || [];
  }

  /**
   * Save (create or update) a header rule.
   * @param {object} rule
   * @returns {Promise<object>}
   */
  async saveHeaderRule(rule) {
    const rules = await this.getHeaderRules();
    const timestamp = now();

    if (rule.id) {
      const idx = rules.findIndex((r) => r.id === rule.id);
      if (idx !== -1) {
        rules[idx] = { ...rules[idx], ...rule, updatedAt: timestamp };
      } else {
        rule.updatedAt = timestamp;
        rules.push(rule);
      }
    } else {
      rule.id = generateId();
      rule.createdAt = timestamp;
      rule.updatedAt = timestamp;
      rules.push(rule);
    }

    await this.set(STORAGE_KEYS.HEADER_RULES, rules);
    return rule;
  }

  /**
   * Delete a header rule by ID.
   * @param {string} id
   */
  async deleteHeaderRule(id) {
    const rules = await this.getHeaderRules();
    await this.set(
      STORAGE_KEYS.HEADER_RULES,
      rules.filter((r) => r.id !== id)
    );
  }

  /**
   * Get all header profiles.
   * @returns {Promise<Array>}
   */
  async getHeaderProfiles() {
    return (await this.get(STORAGE_KEYS.HEADER_PROFILES)) || [];
  }

  /**
   * Save (create or update) a header profile.
   * @param {object} profile — { name, rules: [...ruleIds], enabled }
   * @returns {Promise<object>}
   */
  async saveHeaderProfile(profile) {
    const profiles = await this.getHeaderProfiles();
    const timestamp = now();

    if (profile.id) {
      const idx = profiles.findIndex((p) => p.id === profile.id);
      if (idx !== -1) {
        profiles[idx] = { ...profiles[idx], ...profile, updatedAt: timestamp };
      } else {
        profile.updatedAt = timestamp;
        profiles.push(profile);
      }
    } else {
      profile.id = generateId();
      profile.createdAt = timestamp;
      profile.updatedAt = timestamp;
      profiles.push(profile);
    }

    await this.set(STORAGE_KEYS.HEADER_PROFILES, profiles);
    return profile;
  }

  // ── Cookie Jars ────────────────────────────────────────────────────────────

  /**
   * Get all cookie jars.
   * @returns {Promise<Array>}
   */
  async getCookieJars() {
    return (await this.get(STORAGE_KEYS.COOKIE_JARS)) || [];
  }

  /**
   * Save (create or update) a cookie jar.
   * @param {object} jar — { name, cookies: [...] }
   * @returns {Promise<object>}
   */
  async saveCookieJar(jar) {
    const jars = await this.getCookieJars();
    const timestamp = now();

    if (jar.id) {
      const idx = jars.findIndex((j) => j.id === jar.id);
      if (idx !== -1) {
        jars[idx] = { ...jars[idx], ...jar, updatedAt: timestamp };
      } else {
        jar.updatedAt = timestamp;
        jars.push(jar);
      }
    } else {
      jar.id = generateId();
      jar.createdAt = timestamp;
      jar.updatedAt = timestamp;
      jars.push(jar);
    }

    await this.set(STORAGE_KEYS.COOKIE_JARS, jars);
    return jar;
  }

  /**
   * Delete a cookie jar by ID.
   * @param {string} id
   */
  async deleteCookieJar(id) {
    const jars = await this.getCookieJars();
    await this.set(
      STORAGE_KEYS.COOKIE_JARS,
      jars.filter((j) => j.id !== id)
    );
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  /**
   * Get application settings from sync storage.
   * Falls back to defaults for any missing keys.
   * @returns {Promise<object>}
   */
  async getSettings() {
    try {
      const result = await _get('sync', [STORAGE_KEYS.SETTINGS]);
      return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
    } catch (err) {
      console.error('[StorageManager] getSettings failed:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Merge partial updates into settings (sync storage).
   * @param {object} partial — key/value pairs to merge
   * @returns {Promise<object>} the full updated settings
   */
  async updateSettings(partial) {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };

    try {
      await _set('sync', { [STORAGE_KEYS.SETTINGS]: updated });
    } catch (err) {
      console.error('[StorageManager] updateSettings failed:', err);
      throw err;
    }

    return updated;
  }

  // ── Data Migration ─────────────────────────────────────────────────────────

  /**
   * Check and perform data migrations if needed.
   * Call once on extension startup.
   */
  async migrate() {
    const currentVersion = (await this.get(STORAGE_KEYS.DATA_VERSION)) || 0;

    if (currentVersion >= DATA_VERSION) {
      return; // Already up to date
    }

    console.log(`[StorageManager] Migrating data from v${currentVersion} to v${DATA_VERSION}`);

    // Run migrations sequentially
    for (let v = currentVersion + 1; v <= DATA_VERSION; v++) {
      try {
        await this._runMigration(v);
        await this.set(STORAGE_KEYS.DATA_VERSION, v);
        console.log(`[StorageManager] Migration to v${v} complete`);
      } catch (err) {
        console.error(`[StorageManager] Migration to v${v} failed:`, err);
        break;
      }
    }
  }

  /**
   * Run a specific migration version.
   * Add migration logic for each version bump here.
   * @param {number} version
   * @private
   */
  async _runMigration(version) {
    switch (version) {
      case 1:
        // v1: Initial schema — ensure all arrays exist
        const keys = [
          STORAGE_KEYS.COLLECTIONS,
          STORAGE_KEYS.REQUESTS,
          STORAGE_KEYS.HISTORY,
          STORAGE_KEYS.ENVIRONMENTS,
          STORAGE_KEYS.HEADER_RULES,
          STORAGE_KEYS.HEADER_PROFILES,
          STORAGE_KEYS.COOKIE_JARS,
        ];
        for (const key of keys) {
          const val = await this.get(key);
          if (!Array.isArray(val)) {
            await this.set(key, []);
          }
        }
        break;

      // Future migrations go here:
      // case 2: ...

      default:
        console.warn(`[StorageManager] No migration handler for v${version}`);
    }
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────────

/** @type {StorageManager} */
const storage = new StorageManager();

export default storage;
export { StorageManager };
