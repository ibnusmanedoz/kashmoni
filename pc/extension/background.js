// Kash Moni AI - background service worker.
// Opens the side panel when you click the toolbar icon (or press Alt+K).
// All the AI work happens in the side panel itself.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// Fallback for browsers without side panel support: open the app in a tab.
chrome.action.onClicked.addListener(async () => {
  if (!chrome.sidePanel) {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html?tab=1") });
  }
});
