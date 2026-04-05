const btn = document.getElementById('toggle-btn');
const statusEl = document.getElementById('status');
let currentTabId = null;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  // Ask background for tab state (it aggregates across all frames)
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' });
    updateUI(state.hasVideo, state.active);
  } catch (e) {
    btn.disabled = true;
    btn.textContent = 'No video detected';
    statusEl.textContent = 'Navigate to a page with a video';
  }
}

function updateUI(hasVideo, active) {
  if (active) {
    btn.disabled = false;
    btn.textContent = 'Exit Full Window';
    btn.classList.add('active');
    statusEl.textContent = 'Video is in full window mode';
  } else if (hasVideo) {
    btn.disabled = false;
    btn.textContent = 'Go Full Window';
    btn.classList.remove('active');
    statusEl.textContent = 'Video detected on this page';
  } else {
    btn.disabled = true;
    btn.textContent = 'No video detected';
    btn.classList.remove('active');
    statusEl.textContent = '';
  }
}

btn.addEventListener('click', async () => {
  if (!currentTabId) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_FULLWINDOW' });
    // Re-fetch state after toggle
    const state = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' });
    updateUI(state.hasVideo, state.active);
  } catch (e) {
    console.warn('Could not toggle:', e);
  }
});

// Open settings page
document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Open BMAC link in new tab
document.getElementById('bmac').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://buymeacoffee.com/alhparsa' });
});

init();
