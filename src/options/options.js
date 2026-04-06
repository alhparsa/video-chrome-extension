const DEFAULT_SETTINGS = {
  speedEnabled: true,
  fullWindowEnabled: true,
  overlayEnabled: true,
  preservesPitch: true,
  speedStep: 0.1,
  seekStep: 10,
  overlayTimeout: 2000,
  overlayPosition: 'floating',
  theme: 'auto',
  blocklist: [],
  licenseKey: '',
  presets: [],
  shortcuts: {
    speedUp: 'KeyS',
    speedDown: 'KeyA',
    resetSpeed: 'KeyD',
    toggleSpeed: 'KeyZ',
    boostVolumeUp: 'KeyQ',
    boostVolumeDown: 'KeyW',
    screenshot: 'KeyX',
    toggleLoop: 'KeyR',
    toggleFullWindow: 'KeyF',
    togglePictureInPicture: 'KeyP',
    prevFrame: 'Comma',
    nextFrame: 'Period',
    rewind: 'ArrowLeft',
    advance: 'ArrowRight'
  }
};

const SHORTCUT_FIELDS = [
  ['speedUp', 'Speed up'],
  ['speedDown', 'Slow down'],
  ['resetSpeed', 'Reset speed'],
  ['toggleSpeed', 'Toggle speed'],
  ['rewind', 'Rewind'],
  ['advance', 'Advance'],
  ['toggleFullWindow', 'Toggle theater'],
  ['togglePictureInPicture', 'Picture in Picture'],
  ['prevFrame', 'Previous frame'],
  ['nextFrame', 'Next frame'],
  ['screenshot', 'Screenshot'],
  ['toggleLoop', 'Toggle A-B loop']
];

const saveState = document.getElementById('save-state');
const shortcutGrid = document.getElementById('shortcut-grid');

SHORTCUT_FIELDS.forEach(([key, label]) => {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  wrapper.innerHTML = `
    <span>${label}</span>
    <input type="text" data-shortcut="${key}" maxlength="20" autocomplete="off">
  `;
  shortcutGrid.appendChild(wrapper);
});

document.getElementById('save-btn').addEventListener('click', save);
document.getElementById('reset-btn').addEventListener('click', resetDefaults);
document.addEventListener('input', () => {
  saveState.textContent = 'Unsaved changes';
});

document.querySelectorAll('[data-shortcut]').forEach((input) => {
  input.addEventListener('keydown', (event) => {
    event.preventDefault();
    input.value = describeKeyCode(event.code);
    input.dataset.code = event.code;
  });
});

load().catch((error) => {
  console.warn('Velocity Player options failed to load', error);
  saveState.textContent = 'Failed to load settings';
});

async function load() {
  const { global } = await storageGet({ global: DEFAULT_SETTINGS });
  const settings = normalizeSettings(global);

  document.getElementById('speedEnabled').checked = settings.speedEnabled;
  document.getElementById('fullWindowEnabled').checked = settings.fullWindowEnabled;
  document.getElementById('overlayEnabled').checked = settings.overlayEnabled;
  document.getElementById('preservesPitch').checked = settings.preservesPitch;
  document.getElementById('speedStep').value = settings.speedStep;
  document.getElementById('seekStep').value = settings.seekStep;
  document.getElementById('overlayTimeout').value = settings.overlayTimeout;
  document.getElementById('theme').value = settings.theme;
  document.getElementById('blocklist').value = settings.blocklist.join('\n');

  document.querySelectorAll('[data-shortcut]').forEach((input) => {
    const code = settings.shortcuts[input.dataset.shortcut];
    input.dataset.code = code;
    input.value = describeKeyCode(code);
  });

  saveState.textContent = 'All changes saved';
}

async function save() {
  const { global } = await storageGet({ global: DEFAULT_SETTINGS });
  const existing = normalizeSettings(global);

  const nextSettings = {
    ...existing,
    speedEnabled: document.getElementById('speedEnabled').checked,
    fullWindowEnabled: document.getElementById('fullWindowEnabled').checked,
    overlayEnabled: document.getElementById('overlayEnabled').checked,
    preservesPitch: document.getElementById('preservesPitch').checked,
    speedStep: Number(document.getElementById('speedStep').value) || DEFAULT_SETTINGS.speedStep,
    seekStep: Number(document.getElementById('seekStep').value) || DEFAULT_SETTINGS.seekStep,
    overlayTimeout: Number(document.getElementById('overlayTimeout').value) || DEFAULT_SETTINGS.overlayTimeout,
    theme: document.getElementById('theme').value || 'auto',
    blocklist: document.getElementById('blocklist').value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    shortcuts: {
      ...existing.shortcuts
    }
  };

  document.querySelectorAll('[data-shortcut]').forEach((input) => {
    nextSettings.shortcuts[input.dataset.shortcut] = input.dataset.code || DEFAULT_SETTINGS.shortcuts[input.dataset.shortcut];
  });

  await storageSet({ global: nextSettings });
  saveState.textContent = 'All changes saved';
}

async function resetDefaults() {
  await storageSet({ global: DEFAULT_SETTINGS });
  await load();
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    blocklist: Array.isArray(settings?.blocklist) ? settings.blocklist : [],
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(settings?.shortcuts || {})
    }
  };
}

function describeKeyCode(code) {
  if (!code) {
    return '';
  }
  if (code.startsWith('Key')) {
    return code.replace('Key', '');
  }
  if (code.startsWith('Digit')) {
    return code.replace('Digit', '');
  }

  const labels = {
    ArrowLeft: 'Left Arrow',
    ArrowRight: 'Right Arrow',
    ArrowUp: 'Up Arrow',
    ArrowDown: 'Down Arrow',
    Comma: ',',
    Period: '.',
    Space: 'Space'
  };

  return labels[code] || code;
}

function storageGet(defaults) {
  return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
}

function storageSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
