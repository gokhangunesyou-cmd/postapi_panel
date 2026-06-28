/**
 * PostAPI Panel — Assertions Evaluator
 * 
 * Evaluates request validation rules against an HTTP response.
 * Supports: Status code, Headers, Response duration, Body text, and JSON Path queries.
 */

import { getValueAtPath } from './json-path.js';

/**
 * Evaluate all assertions against a response.
 * 
 * @param {Array<object>} assertions — list of assertion configurations
 * @param {object} response — the executed response object
 * @returns {Array<object>} — assertions with evaluated results: { ..., evaluated: true, passed: boolean, message: string, receivedValue: string }
 */
export function evaluateAssertions(assertions, response) {
  if (!Array.isArray(assertions) || !response) return [];

  return assertions.map(assertion => {
    if (assertion.enabled === false) {
      return {
        ...assertion,
        evaluated: true,
        passed: true,
        message: `Assertion (disabled)`,
        receivedValue: ''
      };
    }

    let passed = false;
    let receivedValue = '';
    let message = '';

    const { statusCode, headers, body, duration } = response;

    try {
      switch (assertion.type) {
        case 'status': {
          receivedValue = String(statusCode);
          const expected = assertion.value;
          if (assertion.operator === 'equals') {
            passed = receivedValue === expected;
            message = `Status code equals ${expected}`;
          } else if (assertion.operator === 'not_equals') {
            passed = receivedValue !== expected;
            message = `Status code is not ${expected}`;
          } else {
            passed = receivedValue === expected;
            message = `Status code equals ${expected}`;
          }
          break;
        }

        case 'header': {
          const headerName = (assertion.target || '').toLowerCase();
          const headerObj = (headers || []).find(h => h.key.toLowerCase() === headerName);
          receivedValue = headerObj ? headerObj.value : '';
          const expected = assertion.value;

          if (assertion.operator === 'equals') {
            passed = receivedValue === expected;
            message = `Header "${assertion.target}" equals "${expected}"`;
          } else if (assertion.operator === 'contains') {
            passed = receivedValue.includes(expected);
            message = `Header "${assertion.target}" contains "${expected}"`;
          } else if (assertion.operator === 'is_null') {
            passed = !headerObj;
            message = `Header "${assertion.target}" does not exist`;
          } else if (assertion.operator === 'is_not_null') {
            passed = !!headerObj;
            message = `Header "${assertion.target}" exists`;
          } else {
            passed = receivedValue === expected;
            message = `Header "${assertion.target}" equals "${expected}"`;
          }
          break;
        }

        case 'body_text': {
          receivedValue = typeof body === 'string' ? body : JSON.stringify(body);
          const expected = assertion.value;

          if (assertion.operator === 'contains') {
            passed = receivedValue.includes(expected);
            message = `Body text contains "${expected}"`;
          } else if (assertion.operator === 'equals') {
            passed = receivedValue === expected;
            message = `Body text equals "${expected}"`;
          } else {
            passed = receivedValue.includes(expected);
            message = `Body text contains "${expected}"`;
          }
          break;
        }

        case 'body_json': {
          const path = assertion.target || '$';
          let jsonObj = null;
          try {
            jsonObj = JSON.parse(body);
          } catch {
            // Not JSON
          }

          if (jsonObj === null) {
            passed = false;
            receivedValue = 'Response body is not valid JSON';
            message = `JSON path "${path}" query failed`;
          } else {
            const val = getValueAtPath(jsonObj, path);
            receivedValue = val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : 'undefined';
            const expected = assertion.value;

            if (assertion.operator === 'equals') {
              passed = String(val) === expected;
              message = `JSON value at "${path}" equals "${expected}"`;
            } else if (assertion.operator === 'contains') {
              passed = String(val).includes(expected);
              message = `JSON value at "${path}" contains "${expected}"`;
            } else if (assertion.operator === 'is_null') {
              passed = val === null || val === undefined;
              message = `JSON value at "${path}" is null or undefined`;
            } else if (assertion.operator === 'is_not_null') {
              passed = val !== null && val !== undefined;
              message = `JSON value at "${path}" is not null`;
            } else if (assertion.operator === 'greater_than') {
              passed = Number(val) > Number(expected);
              message = `JSON value at "${path}" > ${expected}`;
            } else if (assertion.operator === 'less_than') {
              passed = Number(val) < Number(expected);
              message = `JSON value at "${path}" < ${expected}`;
            }
          }
          break;
        }

        case 'duration': {
          receivedValue = `${duration} ms`;
          const expected = Number(assertion.value);
          if (assertion.operator === 'less_than') {
            passed = duration < expected;
            message = `Response time < ${expected} ms`;
          } else if (assertion.operator === 'greater_than') {
            passed = duration > expected;
            message = `Response time > ${expected} ms`;
          } else {
            passed = duration < expected;
            message = `Response time < ${expected} ms`;
          }
          break;
        }

        default:
          passed = true;
          message = 'Unknown assertion type';
          break;
      }
    } catch (e) {
      passed = false;
      receivedValue = `Error: ${e.message}`;
      message = `Assertion failed due to evaluation error`;
    }

    return {
      ...assertion,
      evaluated: true,
      passed,
      message,
      receivedValue
    };
  });
}
