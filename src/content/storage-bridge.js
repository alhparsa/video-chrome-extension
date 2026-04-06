(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
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
  });

  const DEFAULT_STORAGE = Object.freeze({
    global: DEFAULT_GLOBAL_SETTINGS,
    sites: {},
    positions: {}
  });

  let cachedStorage = clone(DEFAULT_STORAGE);
  const subscribers = new Set();

  root.storageBridge = {
    DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_STORAGE,
    loadStorage,
    loadGlobalSettings,
    updateGlobalSettings,
    saveStorage,
    getCachedStorage,
    getCachedGlobalSettings,
    subscribe,
    isBlockedHost,
    resolveSiteSettings
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    let changed = false;

    if (changes.global) {
      cachedStorage.global = normalizeGlobalSettings(changes.global.newValue);
      changed = true;
    }

    if (changes.sites) {
      cachedStorage.sites = normalizeObject(changes.sites.newValue);
      changed = true;
    }

    if (changes.positions) {
      cachedStorage.positions = normalizeObject(changes.positions.newValue);
      changed = true;
    }

    if (changed) {
      notifySubscribers();
    }
  });

  function loadStorage() {
    return storageGet(DEFAULT_STORAGE).then((storage) => {
      cachedStorage = normalizeStorage(storage);
      return clone(cachedStorage);
    });
  }

  function loadGlobalSettings() {
    return loadStorage().then((storage) => storage.global);
  }

  function updateGlobalSettings(partialSettings) {
    const nextGlobal = normalizeGlobalSettings({
      ...cachedStorage.global,
      ...partialSettings,
      shortcuts: {
        ...cachedStorage.global.shortcuts,
        ...(partialSettings.shortcuts || {})
      }
    });

    cachedStorage.global = nextGlobal;
    return storageSet({ global: nextGlobal }).then(() => clone(nextGlobal));
  }

  function saveStorage(storage) {
    cachedStorage = normalizeStorage(storage);
    return storageSet(cachedStorage).then(() => clone(cachedStorage));
  }

  function getCachedStorage() {
    return clone(cachedStorage);
  }

  function getCachedGlobalSettings() {
    return clone(cachedStorage.global);
  }

  function subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function isBlockedHost(hostname) {
    return cachedStorage.global.blocklist.some((blockedHost) => {
      const normalizedBlockedHost = String(blockedHost || '').trim().toLowerCase();
      return normalizedBlockedHost && hostname.toLowerCase().endsWith(normalizedBlockedHost);
    });
  }

  function resolveSiteSettings(hostname) {
    return {
      ...cachedStorage.global,
      ...normalizeObject(cachedStorage.sites[hostname])
    };
  }

  function notifySubscribers() {
    const snapshot = getCachedStorage();
    subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('Velocity Player: storage subscriber failed', error);
      }
    });
  }

  function storageGet(defaults) {
    return new Promise((resolve) => {
      chrome.storage.local.get(defaults, resolve);
    });
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

  function normalizeStorage(storage) {
    return {
      global: normalizeGlobalSettings(storage.global),
      sites: normalizeObject(storage.sites),
      positions: normalizeObject(storage.positions)
    };
  }

  function normalizeGlobalSettings(settings = {}) {
    const shortcuts = {
      ...DEFAULT_GLOBAL_SETTINGS.shortcuts,
      ...normalizeObject(settings.shortcuts)
    };

    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...normalizeObject(settings),
      blocklist: normalizeArray(settings.blocklist),
      presets: Array.isArray(settings.presets) ? settings.presets : [],
      shortcuts
    };
  }

  function normalizeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
})();
