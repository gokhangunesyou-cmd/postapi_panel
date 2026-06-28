/**
 * PostAPI Panel — Content Script
 * Injected at document_start to monkey-patch window.fetch and XMLHttpRequest in the page context,
 * capturing web requests and routing them to the background service worker.
 */

const PAGE_MESSAGE_SOURCE = '__POSTAPI_PAGE__';
const CS_MESSAGE_SOURCE = '__POSTAPI_CS__';

// Only inject in HTML documents (skip scripts, image resources, frames without DOM)
if (document instanceof HTMLDocument || (document.contentType && document.contentType.includes('html'))) {
  injectInterceptionScript();
}

/**
 * Injects a script block into the target page's main world context
 * to bypass content script isolation and intercept raw XHR/Fetch API calls.
 */
function injectInterceptionScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/intercept.js');
    
    // Inject script tag
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
      script.remove(); // Clean up tag immediately from DOM representation
    };
  } catch (err) {
    console.error('[PostAPI Content Script] Injected script load failed:', err);
  }
}

// ─── Listen for Page Script Interceptions ───────────────────────────────────
window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.source === PAGE_MESSAGE_SOURCE) {
    const payload = e.data.payload;
    if (payload) {
      // Forward captured request to Background Service Worker if extension context is valid
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: 'REQUEST_CAPTURED_CS',
          data: payload
        }, (response) => {
          // Suppress extension runtime errors if background isn't listening (e.g. extension reloaded)
          const lastErr = chrome.runtime.lastError;
        });
      }
    }
  }
});
