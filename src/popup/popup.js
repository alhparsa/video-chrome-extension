const elements = {
  statusPill: document.getElementById('status-pill'),
  statusText: document.getElementById('status-text'),
  rateText: document.getElementById('rate-text'),
  speedSlider: document.getElementById('speed-slider'),
  fullwindowButton: document.getElementById('fullwindow-btn'),
  pipButton: document.getElementById('pip-btn'),
  resetButton: document.getElementById('reset-btn'),
  settingsButton: document.getElementById('settings-btn'),
  presetButtons: Array.from(document.querySelectorAll('.preset-btn'))
};

let activeTabId = null;

init().catch((error) => {
  console.warn('Velocity Player popup failed to initialize', error);
  setUnavailableState('This tab does not allow extension control.');
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setUnavailableState('No active tab.');
    return;
  }

  activeTabId = tab.id;
  wireEvents();
  await refreshState();
}

function wireEvents() {
  elements.speedSlider.addEventListener('input', () => {
    sendAction('setSpeed', Number(elements.speedSlider.value));
  });

  elements.fullwindowButton.addEventListener('click', async () => {
    await sendAction('toggleFullWindow');
    await refreshState();
  });

  elements.pipButton.addEventListener('click', async () => {
    await sendAction('togglePictureInPicture');
    await refreshState();
  });

  elements.resetButton.addEventListener('click', async () => {
    await sendAction('resetSpeed');
    await refreshState();
  });

  elements.settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  elements.presetButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      elements.speedSlider.value = button.dataset.speed;
      await sendAction('setSpeed', Number(button.dataset.speed));
      await refreshState();
    });
  });
}

async function refreshState() {
  try {
    const state = await chrome.tabs.sendMessage(activeTabId, { type: 'GET_STATE' });
    renderState(state);
  } catch (_error) {
    setUnavailableState('Open a page with accessible media to use Velocity Player.');
  }
}

async function sendAction(action, value) {
  if (!activeTabId) {
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(activeTabId, {
      type: 'VP_ACTION',
      action,
      value
    });
  } catch (_error) {
    setUnavailableState('This tab does not allow extension control.');
    return null;
  }
}

function renderState(state) {
  const enabled = !!state?.hasMedia && !state?.blocked;

  elements.rateText.textContent = `${Number(state?.playbackRate || 1).toFixed(2)}x`;
  elements.speedSlider.value = Number(state?.playbackRate || 1);
  elements.speedSlider.disabled = !enabled;
  elements.fullwindowButton.disabled = !enabled || !state?.hasVideo;
  elements.pipButton.disabled = !enabled || !state?.hasVideo;
  elements.resetButton.disabled = !enabled;
  elements.presetButtons.forEach((button) => {
    button.disabled = !enabled;
  });

  if (state?.blocked) {
    elements.statusPill.dataset.state = 'blocked';
    elements.statusPill.textContent = 'Blocked';
    elements.statusText.textContent = 'Velocity Player is disabled on this domain by your blocklist.';
    return;
  }

  if (state?.hasMedia) {
    elements.statusPill.dataset.state = 'ready';
    elements.statusPill.textContent = state.fullWindowActive ? 'Theater on' : 'Ready';
    elements.statusText.textContent = `${state.mediaCount} media element${state.mediaCount === 1 ? '' : 's'} detected in this tab.`;
    return;
  }

  elements.statusPill.dataset.state = '';
  elements.statusPill.textContent = 'No media';
  elements.statusText.textContent = 'No audio or video elements detected on this page.';
}

function setUnavailableState(message) {
  elements.statusPill.dataset.state = 'blocked';
  elements.statusPill.textContent = 'Unavailable';
  elements.statusText.textContent = message;
  elements.rateText.textContent = '1.00x';
  elements.speedSlider.disabled = true;
  elements.fullwindowButton.disabled = true;
  elements.pipButton.disabled = true;
  elements.resetButton.disabled = true;
  elements.presetButtons.forEach((button) => {
    button.disabled = true;
  });
}
