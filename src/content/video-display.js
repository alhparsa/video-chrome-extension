(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.videoDisplay = {
    createVideoDisplayController,
    findPlayerContainer
  };

  function createVideoDisplayController({ onFullWindowChange }) {
    let savedState = null;
    let iframeSavedState = null;
    let activeVideo = null;
    let styleObserver = null;
    let cleanupInterval = null;

    function isActive() {
      return !!savedState;
    }

    function getActiveVideo() {
      return activeVideo?.isConnected ? activeVideo : null;
    }

    function toggle(video) {
      return isActive() ? deactivate() : activate(video);
    }

    function activate(video) {
      if (!video || video.tagName !== 'VIDEO') {
        return false;
      }

      if (isActive()) {
        deactivate();
      }

      const nativeTheaterState = enableNativeTheaterModeIfNeeded(video);
      const target = findPlayerContainer(video);
      const fixedAncestors = fixAncestorsForFixed(target);
      const zIndexAncestors = [];

      let ancestor = target.parentElement;
      while (ancestor && ancestor !== document.documentElement) {
        zIndexAncestors.push({ element: ancestor, style: ancestor.getAttribute('style') || '' });
        ancestor.style.setProperty('z-index', '2147483647', 'important');
        ancestor.style.setProperty('position', 'relative', 'important');
        ancestor = ancestor.parentElement;
      }

      const innerElements = [];
      let inner = video.parentElement;
      while (inner && inner !== target) {
        innerElements.push({ element: inner, style: inner.getAttribute('style') || '' });
        inner.style.setProperty('width', '100%', 'important');
        inner.style.setProperty('height', '100%', 'important');
        inner = inner.parentElement;
      }

      savedState = {
        video,
        videoStyle: video.getAttribute('style') || '',
        target,
        targetStyle: target.getAttribute('style') || '',
        htmlStyle: document.documentElement.getAttribute('style') || '',
        bodyStyle: document.body?.getAttribute('style') || '',
        fixedAncestors,
        zIndexAncestors,
        innerElements,
        nativeTheaterManaged: nativeTheaterState.managed
      };

      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.body?.style.setProperty('overflow', 'hidden', 'important');

      target.style.setProperty('position', 'fixed', 'important');
      target.style.setProperty('top', '0', 'important');
      target.style.setProperty('left', '0', 'important');
      target.style.setProperty('width', '100vw', 'important');
      target.style.setProperty('height', '100vh', 'important');
      target.style.setProperty('max-width', '100vw', 'important');
      target.style.setProperty('max-height', '100vh', 'important');
      target.style.setProperty('margin', '0', 'important');
      target.style.setProperty('padding', '0', 'important');
      target.style.setProperty('border', 'none', 'important');
      target.style.setProperty('background', '#000', 'important');
      target.style.setProperty('z-index', '2147483647', 'important');
      applyFullWindowLayout(target, video, innerElements);

      styleObserver = new MutationObserver(() => {
        if (!savedState) {
          return;
        }

        target.style.setProperty('position', 'fixed', 'important');
        target.style.setProperty('width', '100vw', 'important');
        target.style.setProperty('height', '100vh', 'important');
        applyFullWindowLayout(target, video, innerElements);
      });

      styleObserver.observe(target, { attributes: true, attributeFilter: ['style'] });
      styleObserver.observe(video, { attributes: true, attributeFilter: ['style'] });
      innerElements.forEach(({ element }) => {
        styleObserver.observe(element, { attributes: true, attributeFilter: ['style'] });
      });

      cleanupInterval = window.setInterval(() => {
        if (savedState && !savedState.target.isConnected) {
          deactivate();
        }
      }, 2000);

      activeVideo = video;

      if (window !== window.top) {
        chrome.runtime.sendMessage({ type: 'EXPAND_IFRAME' }).catch?.(() => {});
      }

      onFullWindowChange?.({ active: true, video });
      return true;
    }

    function deactivate() {
      if (!savedState) {
        activeVideo = null;
        onFullWindowChange?.({ active: false, video: null });
        return false;
      }

      const previousVideo = activeVideo;

      if (styleObserver) {
        styleObserver.disconnect();
        styleObserver = null;
      }

      if (cleanupInterval) {
        window.clearInterval(cleanupInterval);
        cleanupInterval = null;
      }

      restoreStateValue(savedState.target, savedState.targetStyle);
      restoreStateValue(savedState.video, savedState.videoStyle);
      savedState.innerElements.forEach(({ element, style }) => restoreStateValue(element, style));
      savedState.fixedAncestors.forEach(({ element, style }) => restoreStateValue(element, style));
      savedState.zIndexAncestors.forEach(({ element, style }) => restoreStateValue(element, style));
      restoreStateValue(document.documentElement, savedState.htmlStyle);
      if (document.body) {
        restoreStateValue(document.body, savedState.bodyStyle);
      }
      if (savedState.nativeTheaterManaged) {
        disableNativeTheaterMode(previousVideo);
      }

      savedState = null;
      activeVideo = null;

      if (window !== window.top) {
        chrome.runtime.sendMessage({ type: 'COLLAPSE_IFRAME' }).catch?.(() => {});
      }

      onFullWindowChange?.({ active: false, video: previousVideo });
      return true;
    }

    async function togglePictureInPicture(video) {
      if (!video || video.tagName !== 'VIDEO' || !document.pictureInPictureEnabled) {
        return false;
      }

      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        return false;
      }

      await video.requestPictureInPicture();
      return true;
    }

    function expandIframes() {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      if (iframes.length === 0) {
        return;
      }

      const best = iframes.reduce((currentBest, iframe) => {
        const bestArea = currentBest ? currentBest.offsetWidth * currentBest.offsetHeight : 0;
        const iframeArea = iframe.offsetWidth * iframe.offsetHeight;
        return iframeArea > bestArea ? iframe : currentBest;
      }, null);

      if (!best) {
        return;
      }

      const fixedAncestors = fixAncestorsForFixed(best);
      iframeSavedState = {
        iframe: best,
        iframeStyle: best.getAttribute('style') || '',
        fixedAncestors,
        htmlStyle: document.documentElement.getAttribute('style') || '',
        bodyStyle: document.body?.getAttribute('style') || ''
      };

      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.body?.style.setProperty('overflow', 'hidden', 'important');

      best.style.setProperty('position', 'fixed', 'important');
      best.style.setProperty('top', '0', 'important');
      best.style.setProperty('left', '0', 'important');
      best.style.setProperty('width', '100vw', 'important');
      best.style.setProperty('height', '100vh', 'important');
      best.style.setProperty('max-width', '100vw', 'important');
      best.style.setProperty('max-height', '100vh', 'important');
      best.style.setProperty('z-index', '2147483647', 'important');
      best.style.setProperty('border', 'none', 'important');
      best.style.setProperty('margin', '0', 'important');
      best.style.setProperty('padding', '0', 'important');
    }

    function collapseIframes() {
      if (!iframeSavedState) {
        return;
      }

      restoreStateValue(iframeSavedState.iframe, iframeSavedState.iframeStyle);
      iframeSavedState.fixedAncestors.forEach(({ element, style }) => restoreStateValue(element, style));
      restoreStateValue(document.documentElement, iframeSavedState.htmlStyle);
      if (document.body) {
        restoreStateValue(document.body, iframeSavedState.bodyStyle);
      }
      iframeSavedState = null;
    }

    return {
      isActive,
      getActiveVideo,
      activate,
      deactivate,
      toggle,
      togglePictureInPicture,
      expandIframes,
      collapseIframes
    };
  }

  function findPlayerContainer(video) {
    const selectors = [
      '#movie_player',
      '.html5-video-player',
      '.video-player',
      '.jw-wrapper',
      '.vjs-player',
      '.plyr',
      '.mejs__container',
      '[data-player]'
    ];

    for (const selector of selectors) {
      const match = video.closest(selector);
      if (match) {
        return match;
      }
    }

    const videoRect = video.getBoundingClientRect();
    let current = video.parentElement;
    let best = video;

    while (current && current !== document.body && current !== document.documentElement) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const widthRatio = rect.width / Math.max(videoRect.width, 1);
        const heightRatio = rect.height / Math.max(videoRect.height, 1);
        if (widthRatio >= 0.9 && widthRatio <= 1.75 && heightRatio >= 0.9 && heightRatio <= 1.75) {
          best = current;
        }
        if (widthRatio > 2.5 || heightRatio > 2.5) {
          break;
        }
      }
      current = current.parentElement;
    }

    return best || video.parentElement || video;
  }

  function restoreStateValue(element, styleValue) {
    if (!element) {
      return;
    }

    if (styleValue) {
      element.setAttribute('style', styleValue);
    } else {
      element.removeAttribute('style');
    }
  }

  function applyFullWindowLayout(target, video, innerElements) {
    target.style.setProperty('overflow', 'hidden', 'important');

    if (video.controls) {
      target.style.setProperty('display', 'flex', 'important');
      target.style.setProperty('align-items', 'center', 'important');
      target.style.setProperty('justify-content', 'center', 'important');

      innerElements.forEach(({ element }) => {
        element.style.setProperty('display', 'flex', 'important');
        element.style.setProperty('align-items', 'center', 'important');
        element.style.setProperty('justify-content', 'center', 'important');
        element.style.setProperty('width', '100%', 'important');
        element.style.setProperty('height', '100%', 'important');
        element.style.setProperty('max-width', '100%', 'important');
        element.style.setProperty('max-height', '100%', 'important');
      });

      video.style.setProperty('width', 'auto', 'important');
      video.style.setProperty('height', 'auto', 'important');
      video.style.setProperty('max-width', '100%', 'important');
      video.style.setProperty('max-height', '100%', 'important');
      video.style.setProperty('top', 'auto', 'important');
      video.style.setProperty('left', 'auto', 'important');
      video.style.setProperty('object-fit', 'initial', 'important');
      video.style.setProperty('margin', 'auto', 'important');
      return;
    }

    target.style.setProperty('display', 'block', 'important');

    innerElements.forEach(({ element }) => {
      element.style.setProperty('width', '100%', 'important');
      element.style.setProperty('height', '100%', 'important');
      element.style.setProperty('max-width', '100%', 'important');
      element.style.setProperty('max-height', '100%', 'important');
    });

    video.style.setProperty('width', '100%', 'important');
    video.style.setProperty('height', '100%', 'important');
    video.style.setProperty('max-width', '100%', 'important');
    video.style.setProperty('max-height', '100%', 'important');
    video.style.setProperty('top', '0', 'important');
    video.style.setProperty('left', '0', 'important');
    video.style.setProperty('object-fit', 'cover', 'important');
    video.style.setProperty('margin', '0', 'important');
  }

  function enableNativeTheaterModeIfNeeded(video) {
    if (!isYouTubeVideo(video)) {
      return { managed: false };
    }

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const alreadyTheater = !!watchFlexy?.hasAttribute('theater');
    if (alreadyTheater) {
      return { managed: false };
    }

    const theaterButton = document.querySelector('.ytp-size-button');
    if (!(theaterButton instanceof HTMLElement)) {
      return { managed: false };
    }

    theaterButton.click();
    return { managed: true };
  }

  function disableNativeTheaterMode(video) {
    if (!isYouTubeVideo(video)) {
      return;
    }

    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (!watchFlexy?.hasAttribute('theater')) {
      return;
    }

    const theaterButton = document.querySelector('.ytp-size-button');
    if (theaterButton instanceof HTMLElement) {
      theaterButton.click();
    }
  }

  function isYouTubeVideo(video) {
    if (!video?.ownerDocument || window.top !== window) {
      return false;
    }

    const hostname = window.location.hostname;
    return hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com';
  }

  function fixAncestorsForFixed(target) {
    const saved = [];
    const containingBlockProps = [
      'transform',
      'filter',
      'perspective',
      'contain',
      'will-change',
      'backdrop-filter',
      'container-type'
    ];

    let current = target.parentElement;
    while (current) {
      const computedStyle = getComputedStyle(current);
      const needsFix = containingBlockProps.some((property) => {
        const value = computedStyle.getPropertyValue(property);
        return value && value !== 'none' && value !== 'auto' && value !== 'normal';
      });

      if (needsFix) {
        saved.push({ element: current, style: current.getAttribute('style') || '' });
        containingBlockProps.forEach((property) => {
          current.style.setProperty(property, 'none', 'important');
        });
      }

      if (!current.parentElement) {
        const rootNode = current.getRootNode();
        if (rootNode instanceof ShadowRoot) {
          current = rootNode.host;
          continue;
        }
      }

      current = current.parentElement;
    }

    return saved;
  }
})();
