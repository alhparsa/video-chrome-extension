const CONTENT_SCRIPT_FILES = [
  'src/content/storage-bridge.js',
  'src/content/media-detector.js',
  'src/content/speed-controller.js',
  'src/content/audio-engine.js',
  'src/content/video-display.js',
  'src/content/loop-controller.js',
  'src/content/screenshot.js',
  'src/content/overlay-ui.js',
  'src/content/shortcut-handler.js',
  'src/content/main.js'
];

const tabState = {};

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-fullwindow') {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FULLWINDOW' });
  } catch (_error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_SCRIPT_FILES
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FULLWINDOW' });
    } catch (injectionError) {
      console.warn('Velocity Player: could not inject content scripts', injectionError);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_STATE') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse(tab?.id ? tabState[tab.id] || getDefaultTabState() : getDefaultTabState());
    });
    return true;
  }

  const tabId = sender.tab?.id;
  if (!tabId) {
    return false;
  }

  if (message.type === 'VIDEO_STATUS') {
    tabState[tabId] = {
      ...getDefaultTabState(),
      ...tabState[tabId],
      hasMedia: !!message.hasMedia,
      mediaCount: message.mediaCount || 0,
      playbackRate: normalizePlaybackRate(message.playbackRate),
      activeTag: message.activeTag || null,
      blocked: !!message.blocked
    };
    updateBadge(tabId);
  }

  if (message.type === 'FULLWINDOW_STATE') {
    tabState[tabId] = {
      ...getDefaultTabState(),
      ...tabState[tabId],
      active: !!message.active
    };
    updateBadge(tabId);
  }

  if (message.type === 'EXPAND_IFRAME' && sender.frameId !== 0) {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'EXPAND_IFRAME_IN_PARENT', sourceFrameId: sender.frameId },
      { frameId: 0 }
    ).catch(() => {});
  }

  if (message.type === 'COLLAPSE_IFRAME' && sender.frameId !== 0) {
    chrome.tabs.sendMessage(tabId, { type: 'COLLAPSE_IFRAME_IN_PARENT' }, { frameId: 0 }).catch(() => {});
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    delete tabState[tabId];
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

function getDefaultTabState() {
  return {
    hasMedia: false,
    mediaCount: 0,
    active: false,
    playbackRate: 1,
    activeTag: null,
    blocked: false
  };
}

function normalizePlaybackRate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function updateBadge(tabId) {
  const state = tabState[tabId] || getDefaultTabState();

  if (state.blocked) {
    chrome.action.setBadgeText({ text: 'OFF', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#5f6368', tabId });
    return;
  }

  if (state.active) {
    chrome.action.setBadgeText({ text: 'FW', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#d97706', tabId });
    return;
  }

  if (state.hasMedia) {
    const text = state.playbackRate === 1 ? '▶' : `${state.playbackRate.toFixed(1)}x`.slice(0, 4);
    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb', tabId });
    return;
  }

  chrome.action.setBadgeText({ text: '', tabId });
}
