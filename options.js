const DEFAULTS = {
  speedEnabled: true,
  fullwindowEnabled: true,
  key_speedUp: 'D',
  key_slowDown: 'S',
  key_reset: 'R',
  key_rewind: 'Z',
  key_forward: 'X',
  key_fullwindow: 'F',
  speedStep: 0.1,
  seekStep: 10,
};

const FIELDS = Object.keys(DEFAULTS);

function load() {
  chrome.storage.sync.get(DEFAULTS, (settings) => {
    for (const key of FIELDS) {
      const el = document.getElementById(key);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = settings[key];
      else el.value = settings[key];
    }
  });
}

function save() {
  const settings = {};
  for (const key of FIELDS) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') settings[key] = el.checked;
    else if (el.type === 'number') settings[key] = parseFloat(el.value) || DEFAULTS[key];
    else settings[key] = el.value.toUpperCase() || DEFAULTS[key];
  }

  chrome.storage.sync.set(settings, () => {
    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });
}

function resetDefaults() {
  chrome.storage.sync.set(DEFAULTS, () => {
    load();
    const msg = document.getElementById('savedMsg');
    msg.textContent = 'Defaults restored';
    msg.classList.add('show');
    setTimeout(() => {
      msg.classList.remove('show');
      msg.textContent = 'Settings saved';
    }, 2000);
  });
}

// Auto-uppercase key inputs
document.querySelectorAll('.key-input').forEach(input => {
  input.addEventListener('keydown', (e) => {
    e.preventDefault();
    if (e.key.length === 1) {
      input.value = e.key.toUpperCase();
    }
  });
});

document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('resetBtn').addEventListener('click', resetDefaults);

load();
