(() => {
  if (window.__velocityPlayerInjected) {
    return;
  }
  window.__velocityPlayerInjected = true;

  const app = globalThis.VelocityPlayer;
  const storageBridge = app.storageBridge;
  const mediaDetector = app.mediaDetector;
  const speedControllerFactory = app.speedController;
  const audioEngineFactory = app.audioEngine;
  const videoDisplayFactory = app.videoDisplay;
  const loopControllerFactory = app.loopController;
  const screenshotFactory = app.screenshot;
  const overlayFactory = app.overlayUI;
  const shortcutFactory = app.shortcutHandler;

  const state = {
    settings: storageBridge.getCachedGlobalSettings(),
    blocked: false
  };

  let detector = null;
  let speedController = null;
  let audioEngine = null;
  let displayController = null;
  let loopController = null;
  let screenshotController = null;
  let overlayUI = null;
  let shortcuts = null;

  init().catch((error) => {
    console.warn('Velocity Player: initialization failed', error);
  });

  async function init() {
    const storage = await storageBridge.loadStorage();
    state.settings = storage.global;
    state.blocked = storageBridge.isBlockedHost(window.location.hostname);

    speedController = speedControllerFactory.createSpeedController({
      getSettings: () => state.settings,
      onRateChange: handleRateChange
    });
    audioEngine = audioEngineFactory.createAudioEngine();
    displayController = videoDisplayFactory.createVideoDisplayController({
      onFullWindowChange: ({ active, video }) => {
        syncOverlayState(video, active);
        chrome.runtime.sendMessage({ type: 'FULLWINDOW_STATE', active }).catch?.(() => {});
        syncBackgroundState();
      }
    });
    loopController = loopControllerFactory.createLoopController();
    screenshotController = screenshotFactory.createScreenshotController();
    overlayUI = overlayFactory.createOverlayUI({
      getSettings: () => state.settings,
      getAnchorElement: (video) => app.videoDisplay.findPlayerContainer(video),
      onAdjustSpeed: (video, delta) => {
        if (!video || state.blocked) {
          return false;
        }
        speedController.adjustRate(video, delta);
        return true;
      },
      onResetSpeed: (video) => {
        speedController.resetRate(video);
      },
      onToggleFullWindow: (video) => {
        if (!state.blocked && state.settings.fullWindowEnabled) {
          displayController.toggle(video);
        }
      }
    });
    detector = mediaDetector.createMediaDetector({
      onMediaDiscovered: handleMediaDiscovered,
      onStateChange: syncBackgroundState,
      onActiveMediaChange: () => syncBackgroundState()
    });
    shortcuts = shortcutFactory.createShortcutHandler({
      getSettings: () => state.settings,
      getTargetMedia: () => detector.getActiveMedia() || detector.findBestMedia(),
      actions: {
        adjustSpeed: (delta) => {
          const media = getPrimaryMedia();
          if (!media || state.blocked) {
            return false;
          }
          speedController.adjustRate(media, delta);
          overlayUI.flash(media);
          return true;
        },
        resetSpeed: () => {
          const media = getPrimaryMedia();
          if (!media || state.blocked) {
            return false;
          }
          speedController.resetRate(media);
          overlayUI.flash(media);
          return true;
        },
        toggleSpeed: () => {
          const media = getPrimaryMedia();
          if (!media || state.blocked) {
            return false;
          }
          speedController.toggleRate(media);
          overlayUI.flash(media);
          return true;
        },
        seek: (delta) => {
          const media = getPrimaryMedia();
          if (!media || state.blocked) {
            return false;
          }
          speedController.seek(media, delta);
          overlayUI.flash(media);
          return true;
        },
        toggleFullWindow: () => {
          const video = getPrimaryVideo();
          if (!video || state.blocked) {
            return false;
          }
          return displayController.toggle(video);
        },
        exitFullWindow: () => {
          if (!displayController.isActive()) {
            return false;
          }
          return displayController.deactivate();
        },
        togglePictureInPicture: async () => {
          const video = getPrimaryVideo();
          if (!video || state.blocked) {
            return false;
          }
          await displayController.togglePictureInPicture(video);
          return true;
        },
        stepFrame: (direction) => {
          const video = getPrimaryVideo();
          if (!video || state.blocked) {
            return false;
          }
          speedController.stepFrame(video, direction);
          overlayUI.flash(video);
          return true;
        },
        captureFrame: async () => {
          const video = getPrimaryVideo();
          if (!video || state.blocked) {
            return false;
          }
          try {
            await screenshotController.captureFrame(video);
            return true;
          } catch (error) {
            console.warn('Velocity Player: screenshot failed', error);
            return false;
          }
        },
        toggleLoop: () => {
          const media = getPrimaryMedia();
          if (!media || state.blocked) {
            return false;
          }
          loopController.togglePoint(media);
          return true;
        }
      }
    });

    storageBridge.subscribe((nextStorage) => {
      state.settings = nextStorage.global;
      state.blocked = storageBridge.isBlockedHost(window.location.hostname);
      detector.scan();
      syncBackgroundState();
    });

    detector.init();
    shortcuts.init();
    syncBackgroundState();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'GET_STATE') {
        sendResponse(buildStatePayload());
        return false;
      }

      if (message.type === 'TOGGLE_FULLWINDOW') {
        sendResponse({ success: !state.blocked && !!displayController.toggle(getPrimaryVideo()) });
        return false;
      }

      if (message.type === 'EXPAND_IFRAME_IN_PARENT' && window === window.top) {
        displayController.expandIframes();
        return false;
      }

      if (message.type === 'COLLAPSE_IFRAME_IN_PARENT' && window === window.top) {
        displayController.collapseIframes();
        return false;
      }

      if (message.type === 'VP_ACTION') {
        handlePopupAction(message)
          .then((payload) => sendResponse(payload))
          .catch((error) => {
            console.warn('Velocity Player: popup action failed', error);
            sendResponse({ success: false });
          });
        return true;
      }

      return false;
    });
  }

  function handleMediaDiscovered(media) {
    speedController.attach(media);
    audioEngine.attach(media);
    loopController.attach(media);

    media.addEventListener('ratechange', () => {
      if (media.tagName === 'VIDEO') {
        overlayUI.updateSpeed(media, media.playbackRate);
      }
      syncBackgroundState();
    });

    if (media.tagName === 'VIDEO' && !state.blocked) {
      overlayUI.attach(media);
      overlayUI.updateSpeed(media, media.playbackRate);
      syncOverlayState(media, displayController.isActive() && displayController.getActiveVideo() === media);
    }
  }

  function handleRateChange(media) {
    if (media.tagName === 'VIDEO') {
      overlayUI.updateSpeed(media, media.playbackRate);
      overlayUI.flash(media);
    }
    syncBackgroundState();
  }

  function syncOverlayState(video, active) {
    if (video?.tagName === 'VIDEO') {
      overlayUI.updateFullWindowState(video, active);
    }
  }

  function getPrimaryMedia() {
    return detector?.getActiveMedia() || detector?.findBestMedia() || null;
  }

  function getPrimaryVideo() {
    const activeMedia = getPrimaryMedia();
    if (activeMedia?.tagName === 'VIDEO') {
      return activeMedia;
    }
    return detector?.findBestMedia({ videosOnly: true }) || null;
  }

  function syncBackgroundState(snapshot = null) {
    const primaryMedia = getPrimaryMedia();
    const media = detector?.getMedia() || [];
    const payload = {
      type: 'VIDEO_STATUS',
      hasMedia: snapshot?.hasMedia ?? media.length > 0,
      mediaCount: snapshot?.mediaCount ?? media.length,
      playbackRate: snapshot?.playbackRate ?? primaryMedia?.playbackRate ?? 1,
      activeTag: snapshot?.activeTag ?? primaryMedia?.tagName ?? null,
      blocked: state.blocked
    };

    chrome.runtime.sendMessage(payload).catch?.(() => {});
  }

  async function handlePopupAction(message) {
    if (state.blocked) {
      return buildStatePayload({ success: false });
    }

    const media = getPrimaryMedia();
    const video = getPrimaryVideo();

    switch (message.action) {
      case 'setSpeed':
        if (media) {
          speedController.setRate(media, message.value);
          if (video) {
            overlayUI.flash(video);
          }
        }
        break;
      case 'resetSpeed':
        if (media) {
          speedController.resetRate(media);
          if (video) {
            overlayUI.flash(video);
          }
        }
        break;
      case 'toggleFullWindow':
        if (video) {
          displayController.toggle(video);
        }
        break;
      case 'togglePictureInPicture':
        if (video) {
          await displayController.togglePictureInPicture(video);
        }
        break;
      default:
        return buildStatePayload({ success: false });
    }

    return buildStatePayload({ success: true });
  }

  function buildStatePayload(extra = {}) {
    const media = detector?.getMedia() || [];
    const primaryMedia = getPrimaryMedia();

    return {
      success: true,
      hasMedia: media.length > 0,
      mediaCount: media.length,
      hasVideo: media.some((item) => item.tagName === 'VIDEO'),
      blocked: state.blocked,
      fullWindowActive: displayController?.isActive() || false,
      playbackRate: primaryMedia?.playbackRate || 1,
      activeTag: primaryMedia?.tagName || null,
      ...extra
    };
  }
})();
