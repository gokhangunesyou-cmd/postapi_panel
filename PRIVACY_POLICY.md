# Privacy Policy — PostAPI Panel Chrome Extension

**Effective Date:** June 28, 2025  
**Last Updated:** June 28, 2025

---

## 1. Introduction

PostAPI Panel ("the Extension") is a developer productivity tool built as a Google Chrome Extension. This Privacy Policy explains how the Extension handles data when installed and used in your browser.

By installing or using PostAPI Panel, you agree to the terms described in this Privacy Policy.

---

## 2. Data We Collect

PostAPI Panel does **not** collect, transmit, sell, or share any personal data with any external server or third party.

All data generated and used by the Extension stays **entirely on your local device** within Chrome's storage APIs.

The following types of data are stored **locally only**:

| Data Type | Storage Location | Purpose |
|-----------|-----------------|---------|
| API request configurations (URL, method, headers, body) | `chrome.storage.local` | Persist your request builder state |
| Collections and folder structures | `chrome.storage.local` | Save and organize API request collections |
| Request history | `chrome.storage.local` | Display recent API calls |
| Environment variables and values | `chrome.storage.local` | Enable variable substitution in requests |
| User preferences (theme, language, layout) | `chrome.storage.sync` | Sync preferences across your Chrome profiles |
| Captured network requests (from active tab) | In-memory only | Temporarily display intercepted HTTP traffic |
| Cookies (read for selected tabs) | In-memory only | Allow sending cookies with API requests |

---

## 3. Data We Do NOT Collect

PostAPI Panel **never**:

- Sends any data to an external server, API, or analytics service.
- Collects personally identifiable information (PII) such as name, email, or IP address.
- Tracks your browsing history or behavior.
- Transmits captured network requests or API responses to any third party.
- Uses advertising or tracking SDKs.
- Requires account creation or authentication.

---

## 4. Permissions Explained

The Extension requests the following Chrome permissions for the reasons stated:

| Permission | Reason |
|-----------|--------|
| `activeTab` | Access the currently active browser tab to capture network requests. |
| `tabs` | Read tab metadata (URL, title) to associate captured requests with tabs. |
| `cookies` | Read cookies for the current tab to include them in API requests. |
| `storage` | Persist request collections, history, and settings locally on your device. |
| `debugger` | Attach to a tab via Chrome DevTools Protocol (CDP) to intercept network traffic. |
| `declarativeNetRequest` | Inject or modify HTTP request headers dynamically for header injection rules. |
| `declarativeNetRequestFeedback` | Receive feedback on applied header injection rules. |
| `scripting` | Inject scripts into pages to facilitate network interception. |
| `sidePanel` | Render the Extension's interface in Chrome's side panel. |
| `<all_urls>` (host permission) | Intercept and send HTTP requests to any domain the user chooses to test. |

---

## 5. Network Access

PostAPI Panel makes HTTP/HTTPS requests **only to URLs explicitly entered by the user** in the request builder. These requests are initiated by you and are sent directly from your browser — the Extension does not act as a proxy and does not relay data through any intermediate server.

---

## 6. Third-Party Services

PostAPI Panel does **not** integrate with or depend on any third-party services, analytics platforms, crash reporting tools, or advertising networks.

---

## 7. Data Security

Since all data is stored locally within Chrome's sandboxed storage environment (`chrome.storage.local` and `chrome.storage.sync`), it is subject to Chrome's own security model. No data leaves your device through the Extension.

---

## 8. Children's Privacy

PostAPI Panel is a developer tool intended for adults and professional developers. It is not directed at children under the age of 13, and we do not knowingly collect any data from children.

---

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in the **Last Updated** date at the top of this document. Continued use of the Extension after changes constitutes acceptance of the updated policy.

---

## 10. Contact

If you have questions or concerns about this Privacy Policy, please open an issue on the GitHub repository:

📌 **GitHub:** [https://github.com/gokhangunesyou-cmd/postapi_panel](https://github.com/gokhangunesyou-cmd/postapi_panel)

---

*PostAPI Panel is an open-source developer tool. No personal data is collected, stored externally, or shared.*
