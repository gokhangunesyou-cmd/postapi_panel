/**
 * PostAPI Panel — DevTools Entry
 * Creates the PostAPI panel inside Chrome DevTools.
 */
chrome.devtools.panels.create(
  'PostAPI',
  'assets/icons/icon-16.png',
  'app/app.html',
  (panel) => {
    console.log('[PostAPI Panel] DevTools panel created');
  }
);
