(() => {
  if (window.__fullWindowVideoInjected) return;
  window.__fullWindowVideoInjected = true;

  let savedState = null;
  let isActive = false;
  let styleObserver = null;
  const trackedVideos = new WeakSet();
  const overlayButtons = new WeakMap();

  // ─── Settings ─────────────────────────────────────────────────

  let settings = {
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

  // Load settings from storage
  try {
    chrome.storage.sync.get(settings, (s) => { if (s) settings = s; });
    chrome.storage.onChanged.addListener((changes) => {
      for (const key of Object.keys(changes)) {
        settings[key] = changes[key].newValue;
      }
    });
  } catch (e) {}

  const EXPAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
  const SHRINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`;

  // ─── Video Discovery ───────────────────────────────────────────

  function deepQueryVideos(root) {
    let results = [...root.querySelectorAll('video')];
    root.querySelectorAll('*').forEach(el => {
      try {
        const shadow = el.shadowRoot ||
          (chrome.dom && chrome.dom.openOrClosedShadowRoot && el instanceof HTMLElement
            ? chrome.dom.openOrClosedShadowRoot(el) : null);
        if (shadow) results.push(...deepQueryVideos(shadow));
      } catch (e) {}
    });
    return results;
  }

  function findBestVideo() {
    const videos = deepQueryVideos(document);
    if (videos.length === 0) return null;

    const playing = videos.filter(v => !v.paused && !v.ended && v.readyState > 2);
    const candidates = playing.length > 0 ? playing : videos;

    let best = candidates[0];
    let bestArea = 0;
    for (const v of candidates) {
      const area = v.offsetWidth * v.offsetHeight;
      if (area > bestArea) { bestArea = area; best = v; }
    }
    return best;
  }

  function trackVideo(video) {
    if (trackedVideos.has(video)) return;
    trackedVideos.add(video);
    const notify = () => {
      const anyPlaying = deepQueryVideos(document).some(v => !v.paused && !v.ended && v.readyState > 2);
      try { chrome.runtime.sendMessage({ type: 'VIDEO_STATUS', playing: anyPlaying }); } catch (e) {}
    };
    video.addEventListener('play', notify);
    video.addEventListener('pause', notify);
    video.addEventListener('ended', notify);
    if (!video.paused && !video.ended && video.readyState > 2) notify();
  }

  function scanForVideos() {
    const videos = deepQueryVideos(document);
    videos.forEach(trackVideo);
    if (videos.length > 0) {
      try { chrome.runtime.sendMessage({ type: 'VIDEO_STATUS', playing: true }); } catch (e) {}
    }
  }

  // ─── Find Player Container ────────────────────────────────────

  function findPlayerContainer(videoEl) {
    // Known player selectors (check ancestors)
    const knownSelectors = [
      '#movie_player',             // YouTube
      '.html5-video-player',       // YouTube
      '.video-player',             // generic
      '.jw-wrapper',               // JW Player
      '.vjs-player',               // Video.js
      '.plyr',                     // Plyr
      '.mejs__container',          // MediaElement.js
      '[data-player]',             // generic
    ];

    for (const sel of knownSelectors) {
      const match = videoEl.closest(sel);
      if (match) {
        console.log('[FWV] found known player container:', sel);
        return match;
      }
    }

    // Heuristic: walk up and find the best positioned wrapper
    // that's roughly the same size as the video
    const videoRect = videoEl.getBoundingClientRect();
    let current = videoEl.parentElement;
    let best = null;

    while (current && current !== document.body && current !== document.documentElement) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const wRatio = rect.width / (videoRect.width || 1);
        const hRatio = rect.height / (videoRect.height || 1);
        // Container should be close in size to the video
        if (wRatio >= 0.9 && wRatio <= 1.5 && hRatio >= 0.9 && hRatio <= 1.5) {
          best = current;
        }
        // Stop if container is way bigger than video (we've gone too far)
        if (wRatio > 2 || hRatio > 2) break;
      }
      current = current.parentElement;
    }

    return best || videoEl.parentElement || videoEl;
  }

  // ─── Overlay Button ───────────────────────────────────────────

  function createOverlayButton(video) {
    if (overlayButtons.has(video)) return;
    if (!settings.fullwindowEnabled) return;
    if (video.offsetWidth < 200 || video.offsetHeight < 120) return;

    const btn = document.createElement('div');
    btn.className = '__fwv-btn';
    btn.innerHTML = EXPAND_SVG;
    btn.title = 'Full Window Video';

    Object.assign(btn.style, {
      position: 'fixed',
      width: '32px',
      height: '32px',
      padding: '5px',
      cursor: 'pointer',
      zIndex: '2147483647',
      background: 'rgba(0,0,0,0.7)',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0',
      transition: 'opacity 0.2s ease',
      pointerEvents: 'auto',
      boxSizing: 'border-box',
    });

    document.body.appendChild(btn);

    // Position the button over the video's top-right corner
    const container = findPlayerContainer(video);

    function updatePos() {
      if (!video.isConnected) {
        btn.remove();
        overlayButtons.delete(video);
        return;
      }
      // Use the player container rect so button is inside the player area
      const rect = (container && container.isConnected ? container : video).getBoundingClientRect();
      if (rect.width < 100 || rect.height < 80) {
        btn.style.display = 'none';
        return;
      }
      btn.style.display = 'flex';

      if (isActive) {
        btn.style.top = '10px';
        btn.style.right = '10px';
      } else {
        btn.style.top = (rect.top + 10) + 'px';
        btn.style.right = (window.innerWidth - rect.right + 10) + 'px';
      }
    }

    updatePos();
    const posInterval = setInterval(updatePos, 500);
    window.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });

    // Show/hide on hover — listen on the player container too
    const showBtn = () => { btn.style.opacity = '1'; };
    const hideBtn = () => { if (!isActive) btn.style.opacity = '0'; };

    const hoverTarget = container && container.isConnected ? container : video;
    hoverTarget.addEventListener('mouseenter', showBtn);
    hoverTarget.addEventListener('mouseleave', () => {
      if (!btn.matches(':hover')) hideBtn();
    });
    btn.addEventListener('mouseenter', showBtn);
    btn.addEventListener('mouseleave', () => {
      if (!hoverTarget.matches(':hover')) hideBtn();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isActive) {
        deactivate();
        btn.innerHTML = EXPAND_SVG;
        btn.title = 'Full Window Video';
      } else {
        activate(video);
        btn.innerHTML = SHRINK_SVG;
        btn.title = 'Exit Full Window';
        btn.style.opacity = '1';
      }
    });

    overlayButtons.set(video, { btn, posInterval });
  }

  function attachOverlayToVideos() {
    for (const video of deepQueryVideos(document)) {
      createOverlayButton(video);
      createSpeedController(video);
    }
  }

  // ─── Speed Controller ─────────────────────────────────────────

  const speedControllers = new WeakMap();

  function createSpeedController(video) {
    if (speedControllers.has(video)) return;
    if (!settings.speedEnabled) return;
    if (video.offsetWidth < 200 || video.offsetHeight < 120) return;

    const badge = document.createElement('div');
    badge.className = '__fwv-speed';
    badge.textContent = '1.00x';

    Object.assign(badge.style, {
      position: 'fixed',
      padding: '4px 8px',
      fontSize: '13px',
      fontWeight: '700',
      fontFamily: 'monospace',
      color: '#fff',
      background: 'rgba(0,0,0,0.7)',
      borderRadius: '4px',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      cursor: 'pointer',
      opacity: '0',
      transition: 'opacity 0.15s ease',
      userSelect: 'none',
      boxSizing: 'border-box',
      lineHeight: '1.2',
    });

    document.body.appendChild(badge);

    const container = findPlayerContainer(video);

    function updatePos() {
      if (!video.isConnected) {
        badge.remove();
        speedControllers.delete(video);
        return;
      }
      const rect = (container && container.isConnected ? container : video).getBoundingClientRect();
      if (rect.width < 100 || rect.height < 80) {
        badge.style.display = 'none';
        return;
      }
      badge.style.display = 'block';

      if (isActive) {
        badge.style.top = '10px';
        badge.style.left = '10px';
      } else {
        badge.style.top = (rect.top + 10) + 'px';
        badge.style.left = (rect.left + 10) + 'px';
      }
    }

    function updateBadgeText() {
      const rate = video.playbackRate;
      badge.textContent = rate.toFixed(2) + 'x';
      // Highlight if not 1x
      badge.style.background = rate === 1 ? 'rgba(0,0,0,0.7)' : 'rgba(66,133,244,0.85)';
    }

    updatePos();
    updateBadgeText();
    const posInterval = setInterval(updatePos, 500);
    window.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });

    // Show on hover
    let hovered = false;
    const showBadge = () => { hovered = true; badge.style.opacity = '1'; };
    const hideBadge = () => {
      hovered = false;
      // Keep visible briefly if speed != 1x
      if (video.playbackRate !== 1) {
        setTimeout(() => { if (!hovered) badge.style.opacity = '0.6'; }, 300);
      } else {
        badge.style.opacity = '0';
      }
    };

    const hoverTarget = container && container.isConnected ? container : video;
    hoverTarget.addEventListener('mouseenter', showBadge);
    hoverTarget.addEventListener('mouseleave', () => {
      if (!badge.matches(':hover')) hideBadge();
    });
    badge.addEventListener('mouseenter', showBadge);
    badge.addEventListener('mouseleave', () => {
      if (!hoverTarget.matches(':hover')) hideBadge();
    });

    // Click badge to reset speed
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      video.playbackRate = 1;
      updateBadgeText();
    });

    // Listen for external speed changes
    video.addEventListener('ratechange', updateBadgeText);

    // Show speed change popup
    let popupTimeout = null;
    function flashSpeed() {
      badge.style.opacity = '1';
      clearTimeout(popupTimeout);
      popupTimeout = setTimeout(() => {
        if (!hovered) {
          badge.style.opacity = video.playbackRate !== 1 ? '0.6' : '0';
        }
      }, 1200);
    }

    speedControllers.set(video, { badge, posInterval, video, flashSpeed, updateBadgeText });
  }

  // ─── Speed Keyboard Controls ──────────────────────────────────

  // Track which video the mouse is over for keyboard targeting
  let hoveredVideo = null;

  document.addEventListener('mouseover', (e) => {
    const video = e.target.closest('video') ||
      e.target.closest('.html5-video-player')?.querySelector('video') ||
      e.target.closest('.html5-video-container')?.querySelector('video');
    if (video) hoveredVideo = video;
  });

  document.addEventListener('keydown', (e) => {
    // Don't intercept if user is typing in an input
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;

    const video = hoveredVideo || findBestVideo();
    if (!video) return;

    const ctrl = speedControllers.get(video);
    let handled = false;
    const key = e.key.toUpperCase();

    if (settings.speedEnabled) {
      if (key === settings.key_speedUp) {
        video.playbackRate = Math.min(16, +(video.playbackRate + settings.speedStep).toFixed(2));
        handled = true;
      } else if (key === settings.key_slowDown) {
        video.playbackRate = Math.max(0.1, +(video.playbackRate - settings.speedStep).toFixed(2));
        handled = true;
      } else if (key === settings.key_reset) {
        video.playbackRate = 1;
        handled = true;
      } else if (key === settings.key_rewind) {
        video.currentTime = Math.max(0, video.currentTime - settings.seekStep);
        handled = true;
      } else if (key === settings.key_forward) {
        video.currentTime = Math.min(video.duration, video.currentTime + settings.seekStep);
        handled = true;
      }
    }

    if (settings.fullwindowEnabled && key === settings.key_fullwindow) {
      if (isActive) deactivate();
      else activate(video);
      handled = true;
    }

    if (handled && ctrl) {
      ctrl.updateBadgeText();
      ctrl.flashSpeed();
    }
  });

  // ─── Ancestor Fixup (minimal) ─────────────────────────────────
  // Only clear CSS properties that create new containing blocks,
  // which would prevent position:fixed from being relative to viewport.
  // Do NOT mess with position, overflow, etc. — that breaks layouts.

  function getAncestorChain(el) {
    const chain = [];
    let current = el.parentElement;
    while (current) {
      chain.push(current);
      if (!current.parentElement) {
        const root = current.getRootNode();
        if (root instanceof ShadowRoot) {
          current = root.host;
          chain.push(current);
          current = current.parentElement;
          continue;
        }
      }
      current = current.parentElement;
    }
    return chain;
  }

  const CONTAINING_BLOCK_PROPS = [
    'transform', 'filter', 'perspective', 'contain', 'will-change',
    'backdrop-filter', 'container-type'
  ];

  function fixAncestorsForFixed(target) {
    const ancestors = getAncestorChain(target);
    const saved = [];
    for (const el of ancestors) {
      const cs = getComputedStyle(el);
      const needsFix = CONTAINING_BLOCK_PROPS.some(p => {
        const val = cs.getPropertyValue(p);
        return val && val !== 'none' && val !== 'auto' && val !== 'normal';
      });
      if (needsFix) {
        saved.push({ element: el, style: el.getAttribute('style') || '' });
        for (const p of CONTAINING_BLOCK_PROPS) {
          el.style.setProperty(p, 'none', 'important');
        }
      }
    }
    return saved;
  }

  // ─── Activate / Deactivate ────────────────────────────────────

  function activate(videoEl) {
    console.log('[FWV] === ACTIVATE START ===');
    console.log('[FWV] video:', videoEl.offsetWidth + 'x' + videoEl.offsetHeight, 'src:', (videoEl.src || videoEl.currentSrc || '').slice(0, 60));
    console.log('[FWV] viewport:', window.innerWidth + 'x' + window.innerHeight);

    const target = findPlayerContainer(videoEl);
    console.log('[FWV] target:', target.tagName + (target.id ? '#' + target.id : ''), 'size:', target.offsetWidth + 'x' + target.offsetHeight);

    // Log the inner chain
    let dbg = videoEl.parentElement;
    let i = 0;
    while (dbg && dbg !== target) {
      console.log('[FWV] inner[' + i + ']:', dbg.tagName + (dbg.id ? '#' + dbg.id : ''), String(dbg.className).slice(0, 40), dbg.offsetWidth + 'x' + dbg.offsetHeight);
      dbg = dbg.parentElement;
      i++;
    }

    // Save state
    const fixedAncestors = fixAncestorsForFixed(target);

    // Lift all ancestors out of their stacking contexts by setting max z-index
    const zIndexAncestors = [];
    let zEl = target.parentElement;
    while (zEl && zEl !== document.documentElement) {
      zIndexAncestors.push({ element: zEl, style: zEl.getAttribute('style') || '' });
      zEl.style.setProperty('z-index', '2147483647', 'important');
      zEl.style.setProperty('position', 'relative', 'important');
      zEl = zEl.parentElement;
    }

    savedState = {
      videoEl,
      videoStyle: videoEl.getAttribute('style') || '',
      target,
      targetStyle: target.getAttribute('style') || '',
      fixedAncestors,
      zIndexAncestors,
      htmlStyle: document.documentElement.getAttribute('style') || '',
      bodyStyle: document.body.getAttribute('style') || '',
    };

    // Prevent page scroll
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');

    // Full-window the player container
    target.style.setProperty('position', 'fixed', 'important');
    target.style.setProperty('top', '0', 'important');
    target.style.setProperty('left', '0', 'important');
    target.style.setProperty('width', '100vw', 'important');
    target.style.setProperty('height', '100vh', 'important');
    target.style.setProperty('max-width', '100vw', 'important');
    target.style.setProperty('max-height', '100vh', 'important');
    target.style.setProperty('z-index', '2147483647', 'important');
    target.style.setProperty('margin', '0', 'important');
    target.style.setProperty('padding', '0', 'important');
    target.style.setProperty('border', 'none', 'important');
    target.style.setProperty('background', '#000', 'important');
    target.style.setProperty('overflow', 'visible', 'important');

    // Expand every element between the video and the player container
    const innerElements = [];
    let inner = videoEl.parentElement;
    while (inner && inner !== target) {
      innerElements.push({ element: inner, style: inner.getAttribute('style') || '' });
      inner.style.setProperty('width', '100%', 'important');
      inner.style.setProperty('height', '100%', 'important');
      inner = inner.parentElement;
    }
    savedState.innerElements = innerElements;

    // Make video fill the container — also override top/left that players set
    videoEl.style.setProperty('width', '100%', 'important');
    videoEl.style.setProperty('height', '100%', 'important');
    videoEl.style.setProperty('top', '0', 'important');
    videoEl.style.setProperty('left', '0', 'important');
    videoEl.style.setProperty('object-fit', 'contain', 'important');

    console.log('[FWV] === AFTER STYLES ===');
    console.log('[FWV] target now:', target.offsetWidth + 'x' + target.offsetHeight, 'pos:', getComputedStyle(target).position);
    let dbg2 = videoEl.parentElement;
    while (dbg2 && dbg2 !== target) {
      console.log('[FWV] inner now:', dbg2.tagName + (dbg2.id ? '#' + dbg2.id : ''), dbg2.offsetWidth + 'x' + dbg2.offsetHeight);
      dbg2 = dbg2.parentElement;
    }
    console.log('[FWV] video now:', videoEl.offsetWidth + 'x' + videoEl.offsetHeight);
    console.log('[FWV] === ACTIVATE DONE ===');

    isActive = true;

    // Watch for sites fighting back (YouTube's JS resets video width/height/left)
    styleObserver = new MutationObserver(() => {
      if (!isActive) return;
      if (target.style.getPropertyValue('position') !== 'fixed') {
        target.style.setProperty('position', 'fixed', 'important');
        target.style.setProperty('width', '100vw', 'important');
        target.style.setProperty('height', '100vh', 'important');
        target.style.setProperty('overflow', 'visible', 'important');
      }
      // YouTube constantly resets video width/height/left
      videoEl.style.setProperty('width', '100%', 'important');
      videoEl.style.setProperty('height', '100%', 'important');
      videoEl.style.setProperty('top', '0', 'important');
      videoEl.style.setProperty('left', '0', 'important');
      videoEl.style.setProperty('object-fit', 'contain', 'important');
      // Re-apply inner element sizes
      for (const { element } of innerElements) {
        element.style.setProperty('width', '100%', 'important');
        element.style.setProperty('height', '100%', 'important');
      }
    });
    styleObserver.observe(target, { attributes: true, attributeFilter: ['style'] });
    styleObserver.observe(videoEl, { attributes: true, attributeFilter: ['style'] });
    for (const { element } of innerElements) {
      styleObserver.observe(element, { attributes: true, attributeFilter: ['style'] });
    }

    if (window !== window.top) {
      try { chrome.runtime.sendMessage({ type: 'EXPAND_IFRAME' }); } catch (e) {}
    }
    try { chrome.runtime.sendMessage({ type: 'FULLWINDOW_STATE', active: true }); } catch (e) {}
  }

  function deactivate() {
    if (styleObserver) { styleObserver.disconnect(); styleObserver = null; }

    if (!savedState) { isActive = false; return; }

    // Restore target
    if (savedState.targetStyle) {
      savedState.target.setAttribute('style', savedState.targetStyle);
    } else {
      savedState.target.removeAttribute('style');
    }

    // Restore video
    if (savedState.videoStyle) {
      savedState.videoEl.setAttribute('style', savedState.videoStyle);
    } else {
      savedState.videoEl.removeAttribute('style');
    }

    // Restore inner elements between video and container
    if (savedState.innerElements) {
      for (const { element, style } of savedState.innerElements) {
        if (style) { element.setAttribute('style', style); }
        else { element.removeAttribute('style'); }
      }
    }

    // Restore ancestors that had containing block fixes
    for (const { element, style } of savedState.fixedAncestors) {
      if (style) { element.setAttribute('style', style); }
      else { element.removeAttribute('style'); }
    }

    // Restore z-index ancestors
    if (savedState.zIndexAncestors) {
      for (const { element, style } of savedState.zIndexAncestors) {
        if (style) { element.setAttribute('style', style); }
        else { element.removeAttribute('style'); }
      }
    }

    // Restore html/body
    if (savedState.htmlStyle) {
      document.documentElement.setAttribute('style', savedState.htmlStyle);
    } else { document.documentElement.removeAttribute('style'); }
    if (savedState.bodyStyle) {
      document.body.setAttribute('style', savedState.bodyStyle);
    } else { document.body.removeAttribute('style'); }

    savedState = null;
    isActive = false;

    // Reset overlay buttons
    for (const video of deepQueryVideos(document)) {
      const overlay = overlayButtons.get(video);
      if (overlay) {
        overlay.btn.innerHTML = EXPAND_SVG;
        overlay.btn.title = 'Full Window Video';
        overlay.btn.style.opacity = '0';
      }
    }

    if (window !== window.top) {
      try { chrome.runtime.sendMessage({ type: 'COLLAPSE_IFRAME' }); } catch (e) {}
    }
    try { chrome.runtime.sendMessage({ type: 'FULLWINDOW_STATE', active: false }); } catch (e) {}
  }

  // ─── Iframe parent-side handling ──────────────────────────────

  let iframeSavedState = null;

  function expandIframes() {
    const iframes = document.querySelectorAll('iframe');
    if (iframes.length === 0) return;
    let best = iframes[0];
    let bestArea = 0;
    for (const iframe of iframes) {
      const area = iframe.offsetWidth * iframe.offsetHeight;
      if (area > bestArea) { bestArea = area; best = iframe; }
    }

    const fixedAncestors = fixAncestorsForFixed(best);
    iframeSavedState = {
      iframe: best,
      iframeStyle: best.getAttribute('style') || '',
      fixedAncestors,
      htmlStyle: document.documentElement.getAttribute('style') || '',
      bodyStyle: document.body.getAttribute('style') || '',
    };

    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');

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
    if (!iframeSavedState) return;
    const iframe = iframeSavedState.iframe;
    if (iframeSavedState.iframeStyle) { iframe.setAttribute('style', iframeSavedState.iframeStyle); }
    else { iframe.removeAttribute('style'); }

    for (const { element, style } of iframeSavedState.fixedAncestors) {
      if (style) { element.setAttribute('style', style); }
      else { element.removeAttribute('style'); }
    }
    if (iframeSavedState.htmlStyle) { document.documentElement.setAttribute('style', iframeSavedState.htmlStyle); }
    else { document.documentElement.removeAttribute('style'); }
    if (iframeSavedState.bodyStyle) { document.body.setAttribute('style', iframeSavedState.bodyStyle); }
    else { document.body.removeAttribute('style'); }

    iframeSavedState = null;
  }

  // ─── Init ─────────────────────────────────────────────────────

  scanForVideos();
  attachOverlayToVideos();

  const domObserver = new MutationObserver((mutations) => {
    let found = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeName === 'VIDEO') { trackVideo(node); found = true; }
        else if (node.querySelectorAll) {
          const vids = node.querySelectorAll('video');
          if (vids.length > 0) { vids.forEach(trackVideo); found = true; }
        }
      }
    }
    if (found) { scanForVideos(); attachOverlayToVideos(); }
  });

  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      domObserver.observe(document.body, { childList: true, subtree: true });
      scanForVideos();
      attachOverlayToVideos();
    });
  }

  // ─── Message Handling ─────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_STATE') {
      const videos = deepQueryVideos(document);
      sendResponse({ hasVideo: videos.length > 0, active: isActive });
      return;
    }
    if (msg.type === 'TOGGLE_FULLWINDOW') {
      if (isActive) { deactivate(); }
      else {
        const video = findBestVideo();
        if (video) activate(video);
      }
      sendResponse({ success: true, active: isActive });
    }
    if (msg.type === 'EXPAND_IFRAME_IN_PARENT' && window === window.top) expandIframes();
    if (msg.type === 'COLLAPSE_IFRAME_IN_PARENT' && window === window.top) collapseIframes();
  });

  // ─── Escape Key ───────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isActive) deactivate();
  });

  // ─── Auto-deactivate if video removed ─────────────────────────

  setInterval(() => {
    if (isActive && savedState && !savedState.target.isConnected) deactivate();
  }, 2000);
})();
