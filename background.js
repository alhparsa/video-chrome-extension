// Per-tab state tracking
const tabState = {};

// Keyboard shortcut handler (popup blocks onClicked, so we use commands)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-fullwindow') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FULLWINDOW' });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FULLWINDOW' });
    } catch (err) {
      console.warn('Full Window Video: could not inject content script', err);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Popup asks background for tab state
  if (msg.type === 'GET_TAB_STATE') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tabState[tab.id]) {
        sendResponse(tabState[tab.id]);
      } else {
        sendResponse({ hasVideo: false, active: false });
      }
    })();
    return true; // keep sendResponse alive for async
  }

  const tabId = sender.tab?.id;
  if (!tabId) return;

  if (msg.type === 'VIDEO_STATUS') {
    if (!tabState[tabId]) tabState[tabId] = { hasVideo: false, active: false };
    tabState[tabId].hasVideo = msg.playing;
    updateBadge(tabId);
  }

  if (msg.type === 'FULLWINDOW_STATE') {
    if (!tabState[tabId]) tabState[tabId] = { hasVideo: false, active: false };
    tabState[tabId].active = msg.active;
    updateBadge(tabId);
  }

  // Iframe coordination: iframe found a video, tell top frame to expand the iframe
  if (msg.type === 'EXPAND_IFRAME' && sender.frameId !== 0) {
    chrome.tabs.sendMessage(tabId, {
      type: 'EXPAND_IFRAME_IN_PARENT',
      sourceFrameId: sender.frameId
    }, { frameId: 0 }).catch(() => {});
  }

  if (msg.type === 'COLLAPSE_IFRAME' && sender.frameId !== 0) {
    chrome.tabs.sendMessage(tabId, {
      type: 'COLLAPSE_IFRAME_IN_PARENT'
    }, { frameId: 0 }).catch(() => {});
  }
});

function updateBadge(tabId) {
  const state = tabState[tabId];
  if (!state) return;

  if (state.active) {
    chrome.action.setBadgeText({ text: 'ON', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4285f4', tabId });
  } else if (state.hasVideo) {
    chrome.action.setBadgeText({ text: '▶', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#34a853', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// Clean up state when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
});

// Clean up state on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    delete tabState[tabId];
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
