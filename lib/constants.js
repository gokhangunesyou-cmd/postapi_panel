/**
 * PostAPI Panel — Application Constants
 * Central configuration for all constant values used across the extension.
 */

// Supported HTTP methods
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

// Method badge colors for visual distinction
export const METHOD_COLORS = {
  GET: '#00c853',
  POST: '#ff6b35',
  PUT: '#ffd600',
  DELETE: '#ff1744',
  PATCH: '#7c5cff',
  OPTIONS: '#9aa0a6',
  HEAD: '#9aa0a6'
};

// Supported request body types
export const BODY_TYPES = ['none', 'json', 'formData', 'urlEncoded', 'raw', 'binary'];

// Content-Type headers for each body type
export const BODY_CONTENT_TYPES = {
  json: 'application/json',
  formData: 'multipart/form-data',
  urlEncoded: 'application/x-www-form-urlencoded',
  raw: 'text/plain',
  binary: 'application/octet-stream'
};

// Supported authentication types
export const AUTH_TYPES = ['none', 'bearer', 'basic', 'apiKey'];

// API key placement options
export const API_KEY_LOCATIONS = ['header', 'queryParam'];

// Status code color mapping by category
export const STATUS_COLORS = {
  '1xx': '#9aa0a6',
  '2xx': '#00c853',
  '3xx': '#ffd600',
  '4xx': '#ff1744',
  '5xx': '#ff1744'
};

// Common status text descriptions
export const STATUS_TEXT = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

export const DATA_VERSION = 1;

// Chrome storage keys — single source of truth for all persisted data
export const STORAGE_KEYS = {
  COLLECTIONS: 'postapi_collections',
  REQUESTS: 'postapi_requests',
  HISTORY: 'postapi_history',
  ENVIRONMENTS: 'postapi_environments',
  HEADER_RULES: 'postapi_header_rules',
  HEADER_PROFILES: 'postapi_header_profiles',
  COOKIE_JARS: 'postapi_cookie_jars',
  SETTINGS: 'postapi_settings',
  ACTIVE_ENVIRONMENT: 'postapi_active_environment',
  ACTIVE_TAB: 'postapi_active_tab',
  LAST_REQUEST: 'postapi_last_request',
  DATA_VERSION: 'postapi_data_version'
};

// Default application settings
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  language: 'en',
  autoCleanupDays: 30,
  maxHistoryItems: 1000,
  silentHeaderMode: false,
  advancedHeaderMode: false,
  showRequestTimeline: true,
  wordWrapResponse: true,
  followRedirects: true,
  validateSSL: true,
  timeout: 30000
};

// Internal messaging types between extension components
export const MESSAGE_TYPES = {
  // Request lifecycle
  SEND_REQUEST: 'SEND_REQUEST',
  CANCEL_REQUEST: 'CANCEL_REQUEST',
  REQUEST_COMPLETE: 'REQUEST_COMPLETE',
  REQUEST_ERROR: 'REQUEST_ERROR',

  // Network capture
  START_CAPTURE: 'START_CAPTURE',
  STOP_CAPTURE: 'STOP_CAPTURE',
  REQUEST_CAPTURED: 'REQUEST_CAPTURED',
  CLEAR_CAPTURED: 'CLEAR_CAPTURED',

  // Header management
  UPDATE_HEADER_RULES: 'UPDATE_HEADER_RULES',
  HEADER_RULES_UPDATED: 'HEADER_RULES_UPDATED',

  // Cookie management
  GET_COOKIES: 'GET_COOKIES',
  SET_COOKIE: 'SET_COOKIE',
  DELETE_COOKIE: 'DELETE_COOKIE',
  COOKIES_UPDATED: 'COOKIES_UPDATED',

  // Storage sync
  STORAGE_UPDATED: 'STORAGE_UPDATED',
  SYNC_STATE: 'SYNC_STATE',

  // UI commands
  OPEN_FULLSCREEN: 'OPEN_FULLSCREEN',
  LOAD_REQUEST: 'LOAD_REQUEST',
  SHOW_TOAST: 'SHOW_TOAST',

  // DevTools
  DEVTOOLS_CONNECTED: 'DEVTOOLS_CONNECTED',
  DEVTOOLS_DISCONNECTED: 'DEVTOOLS_DISCONNECTED'
};

// Toast notification types
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Application limits
export const MAX_HISTORY = 1000;
export const MAX_BODY_PREVIEW_LENGTH = 5000;
export const MAX_RESPONSE_PREVIEW_LENGTH = 100000;
export const MAX_HEADER_RULES = 100;
export const MAX_ENVIRONMENTS = 50;
export const MAX_COLLECTIONS = 100;
export const MAX_REQUESTS_PER_COLLECTION = 500;
export const MAX_COOKIE_JARS = 20;
export const DEBOUNCE_DELAY = 300;
export const THROTTLE_DELAY = 100;
export const AUTO_SAVE_DELAY = 1000;
export const TOAST_DURATION = 3000;
export const REQUEST_TIMEOUT = 30000;

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' }
];

// Theme definitions
export const THEMES = {
  dark: {
    bgMain: '#0f1419',
    bgPanel: '#1a1f2e',
    bgCard: '#232a3b',
    primary: '#ff6b35',
    secondary: '#7c5cff',
    success: '#00c853',
    warning: '#ffd600',
    error: '#ff1744',
    text: '#e8eaed',
    textSecondary: '#9aa0a6',
    border: '#2d3548'
  },
  light: {
    bgMain: '#f5f5f5',
    bgPanel: '#ffffff',
    bgCard: '#fafafa',
    primary: '#ff6b35',
    secondary: '#7c5cff',
    success: '#00c853',
    warning: '#f9a825',
    error: '#d32f2f',
    text: '#202124',
    textSecondary: '#5f6368',
    border: '#dadce0'
  }
};

// Default request template
export const DEFAULT_REQUEST = {
  method: 'GET',
  url: '',
  headers: [],
  params: [],
  body: { type: 'none', content: '', evaluate: true },
  auth: { type: 'none' },
  assertions: []
};

// Common default headers
export const COMMON_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'X-API-Key'
];

// Content type suggestions for autocomplete
export const CONTENT_TYPE_SUGGESTIONS = [
  'application/json',
  'application/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'text/html',
  'text/xml',
  'application/octet-stream',
  'application/pdf',
  'image/png',
  'image/jpeg'
];
