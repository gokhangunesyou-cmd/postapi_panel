/**
 * PostAPI Panel — Header Rule Manager
 * 
 * Translates PostAPI's internal header rule format into
 * chrome.declarativeNetRequest dynamic rules.
 * 
 * PostAPI rule format:
 * {
 *   id:          string   (PostAPI UUID)
 *   name:        string
 *   enabled:     boolean
 *   profile:     string   (profile name)
 *   urlPattern:  string   (glob / regex)
 *   isRegex:     boolean  (if true, use regexFilter instead of urlFilter)
 *   headerType:  'request' | 'response'
 *   action:      'set' | 'remove' | 'append'
 *   headerName:  string
 *   headerValue: string   (may contain {{variables}})
 * }
 * 
 * @module lib/header-rules
 */

import variableResolver from './variable-resolver.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Chrome requires unique integer IDs for declarativeNetRequest rules.
 * We reserve a numeric range starting from this offset so we don't
 * collide with other extensions or static rule sets.
 */
const RULE_ID_OFFSET = 100_000;

/**
 * Maximum number of dynamic rules Chrome allows.
 * (As of Manifest V3, the limit is 5000 for dynamic + session rules combined.)
 */
const MAX_DYNAMIC_RULES = 5000;

// ─── HeaderRuleManager ─────────────────────────────────────────────────────────

class HeaderRuleManager {
  constructor() {
    /**
     * Maps PostAPI string IDs → Chrome integer rule IDs.
     * @type {Map<string, number>}
     */
    this._idMap = new Map();

    /** Auto-incrementing counter for Chrome rule IDs */
    this._nextId = RULE_ID_OFFSET;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Apply a full set of PostAPI rules, replacing all existing dynamic rules.
   * Only enabled rules are pushed to Chrome.
   * 
   * @param {Array<object>} rules — PostAPI rule objects
   * @param {object} [environment] — active environment for variable resolution
   * @param {object} [globals] — global environment for variable resolution
   */
  async applyRules(rules, environment, globals) {
    // Remove all existing dynamic rules first
    await this.clearRules();

    const enabledRules = (rules || []).filter((r) => r.enabled !== false);
    if (enabledRules.length === 0) return;

    const addRules = enabledRules
      .map((r) => this._toDeclarativeRule(r, environment, globals))
      .filter(Boolean);

    if (addRules.length === 0) return;

    try {
      await this._updateDynamicRules({ addRules });
    } catch (err) {
      console.error('[HeaderRuleManager] applyRules failed:', err);
      throw err;
    }
  }

  /**
   * Add a single PostAPI rule.
   * @param {object} rule
   * @param {object} [environment]
   * @param {object} [globals]
   */
  async addRule(rule, environment, globals) {
    if (!rule || rule.enabled === false) return;

    const chromeRule = this._toDeclarativeRule(rule, environment, globals);
    if (!chromeRule) return;

    try {
      await this._updateDynamicRules({ addRules: [chromeRule] });
    } catch (err) {
      console.error('[HeaderRuleManager] addRule failed:', err);
      throw err;
    }
  }

  /**
   * Remove a rule by its PostAPI string ID.
   * @param {string} ruleId — PostAPI rule ID
   */
  async removeRule(ruleId) {
    const chromeId = this._idMap.get(ruleId);
    if (chromeId === undefined) return;

    try {
      await this._updateDynamicRules({ removeRuleIds: [chromeId] });
      this._idMap.delete(ruleId);
    } catch (err) {
      console.error('[HeaderRuleManager] removeRule failed:', err);
      throw err;
    }
  }

  /**
   * Remove all dynamic rules managed by this extension.
   */
  async clearRules() {
    try {
      const existingRules = await this._getDynamicRules();
      const removeIds = existingRules.map((r) => r.id);

      if (removeIds.length > 0) {
        await this._updateDynamicRules({ removeRuleIds: removeIds });
      }

      this._idMap.clear();
    } catch (err) {
      console.error('[HeaderRuleManager] clearRules failed:', err);
      throw err;
    }
  }

  /**
   * Enable all rules belonging to a named profile.
   * @param {string} profileName
   * @param {Array<object>} allRules — full list of PostAPI rules
   * @param {object} [environment]
   * @param {object} [globals]
   */
  async enableProfile(profileName, allRules, environment, globals) {
    const profileRules = (allRules || []).filter(
      (r) => r.profile === profileName && r.enabled !== false
    );

    const addRules = profileRules
      .map((r) => this._toDeclarativeRule(r, environment, globals))
      .filter(Boolean);

    if (addRules.length > 0) {
      try {
        await this._updateDynamicRules({ addRules });
      } catch (err) {
        console.error('[HeaderRuleManager] enableProfile failed:', err);
        throw err;
      }
    }
  }

  /**
   * Disable (remove) all rules belonging to a named profile.
   * @param {string} profileName
   * @param {Array<object>} allRules — full list of PostAPI rules
   */
  async disableProfile(profileName, allRules) {
    const profileRuleIds = (allRules || [])
      .filter((r) => r.profile === profileName)
      .map((r) => r.id);

    const removeIds = profileRuleIds
      .map((id) => this._idMap.get(id))
      .filter((id) => id !== undefined);

    if (removeIds.length > 0) {
      try {
        await this._updateDynamicRules({ removeRuleIds: removeIds });
        profileRuleIds.forEach((id) => this._idMap.delete(id));
      } catch (err) {
        console.error('[HeaderRuleManager] disableProfile failed:', err);
        throw err;
      }
    }
  }

  /**
   * Get the number of currently active dynamic rules.
   * @returns {Promise<number>}
   */
  async getRuleCount() {
    try {
      const rules = await this._getDynamicRules();
      return rules.length;
    } catch {
      return 0;
    }
  }

  // ── Rule Conversion ─────────────────────────────────────────────────────

  /**
   * Convert a PostAPI rule to a chrome.declarativeNetRequest rule object.
   * 
   * @param {object} rule — PostAPI header rule
   * @param {object} [environment]
   * @param {object} [globals]
   * @returns {object|null} — Chrome rule, or null if invalid
   * @private
   */
  _toDeclarativeRule(rule, environment, globals) {
    if (!rule || !rule.headerName) return null;

    // Allocate a unique integer ID for Chrome
    const chromeId = this._allocateId(rule.id);

    // Resolve variables in header value
    let headerValue = rule.headerValue || '';
    if (variableResolver.hasVariables(headerValue)) {
      headerValue = variableResolver.resolve(headerValue, environment, globals);
    }

    // Build the header operation
    const operation = this._mapAction(rule.action);
    const headerOp = {
      header: rule.headerName,
      operation,
    };

    // 'remove' operations must NOT have a value
    if (operation !== 'remove') {
      headerOp.value = headerValue;
    }

    // Determine which header list to modify
    const isRequestHeader = rule.headerType !== 'response';

    // Build action
    const action = {
      type: 'modifyHeaders',
    };

    if (isRequestHeader) {
      action.requestHeaders = [headerOp];
    } else {
      action.responseHeaders = [headerOp];
    }

    // Build condition
    const condition = {};

    if (rule.urlPattern) {
      if (rule.isRegex) {
        condition.regexFilter = rule.urlPattern;
      } else {
        condition.urlFilter = rule.urlPattern;
      }
    } else {
      // Match all URLs if no pattern specified
      condition.urlFilter = '*';
    }

    // Apply to all resource types
    condition.resourceTypes = [
      'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
      'font', 'object', 'xmlhttprequest', 'ping', 'csp_report',
      'media', 'websocket', 'webtransport', 'webbundle', 'other',
    ];

    return {
      id: chromeId,
      priority: 1,
      action,
      condition,
    };
  }

  /**
   * Map PostAPI action names to chrome.declarativeNetRequest operations.
   * @param {string} action — 'set' | 'remove' | 'append'
   * @returns {string} — 'set' | 'remove' | 'append'
   * @private
   */
  _mapAction(action) {
    switch (action) {
      case 'remove':
        return 'remove';
      case 'append':
        return 'append';
      case 'set':
      default:
        return 'set';
    }
  }

  /**
   * Allocate (or retrieve) a Chrome integer ID for a PostAPI string ID.
   * @param {string} postApiId
   * @returns {number}
   * @private
   */
  _allocateId(postApiId) {
    if (this._idMap.has(postApiId)) {
      return this._idMap.get(postApiId);
    }

    const chromeId = this._nextId++;
    this._idMap.set(postApiId, chromeId);
    return chromeId;
  }

  // ── Chrome API Wrappers ─────────────────────────────────────────────────

  /**
   * Get all current dynamic rules.
   * @returns {Promise<Array>}
   * @private
   */
  _getDynamicRules() {
    return new Promise((resolve, reject) => {
      try {
        chrome.declarativeNetRequest.getDynamicRules((rules) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(rules || []);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Update dynamic rules (add / remove).
   * @param {object} options — { addRules?, removeRuleIds? }
   * @returns {Promise<void>}
   * @private
   */
  _updateDynamicRules(options) {
    return new Promise((resolve, reject) => {
      try {
        chrome.declarativeNetRequest.updateDynamicRules(options, () => {
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
}

// ─── Export ────────────────────────────────────────────────────────────────────

const headerRuleManager = new HeaderRuleManager();

export default headerRuleManager;
export { HeaderRuleManager };
