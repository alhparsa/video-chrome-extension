(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  const FALLBACK_CSS = `
    :host { all: initial; }
    .vp-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
    .vp-chip {
      position: fixed;
      pointer-events: auto;
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      font: 700 12px/1.1 ui-rounded, "SF Pro Rounded", "Avenir Next", sans-serif;
      color: #f8fafc;
      background: rgba(15, 23, 42, 0.88);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);
      cursor: pointer;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
      backdrop-filter: blur(10px);
    }
    .vp-chip-small {
      width: 32px;
      height: 32px;
      padding: 0;
      display: grid;
      place-items: center;
      font-size: 18px;
      line-height: 1;
    }
    .vp-chip[data-visible="true"] { opacity: 1; transform: translateY(0); }
    .vp-chip[data-accent="true"] { background: rgba(37, 99, 235, 0.9); }
    .vp-chip:hover { background: rgba(30, 41, 59, 0.96); }
  `;

  root.overlayUI = {
    createOverlayUI
  };

  function createOverlayUI({ getSettings, getAnchorElement, onAdjustSpeed, onResetSpeed, onToggleFullWindow }) {
    const overlays = new WeakMap();
    let overlayCssPromise = null;

    function attach(video) {
      if (!video || video.tagName !== 'VIDEO' || overlays.has(video)) {
        return overlays.get(video) || null;
      }

      const host = document.createElement('div');
      host.setAttribute('data-vp-overlay-host', 'true');
      host.style.position = 'fixed';
      host.style.inset = '0';
      host.style.pointerEvents = 'none';
      host.style.zIndex = '2147483647';

      const shadowRoot = host.attachShadow({ mode: 'closed' });
      const layer = document.createElement('div');
      layer.className = 'vp-layer';

      const speedChip = document.createElement('button');
      speedChip.type = 'button';
      speedChip.className = 'vp-chip';
      speedChip.textContent = `${video.playbackRate.toFixed(2)}x`;
      speedChip.title = 'Reset speed to 1.0x';

      const decreaseChip = document.createElement('button');
      decreaseChip.type = 'button';
      decreaseChip.className = 'vp-chip vp-chip-small';
      decreaseChip.textContent = '−';
      decreaseChip.title = 'Decrease playback speed';

      const increaseChip = document.createElement('button');
      increaseChip.type = 'button';
      increaseChip.className = 'vp-chip vp-chip-small';
      increaseChip.textContent = '+';
      increaseChip.title = 'Increase playback speed';

      const actionChip = document.createElement('button');
      actionChip.type = 'button';
      actionChip.className = 'vp-chip';
      actionChip.textContent = 'Fill';
      actionChip.title = 'Toggle theater mode';

      layer.append(decreaseChip, speedChip, increaseChip, actionChip);
      shadowRoot.append(layer);
      document.documentElement.appendChild(host);

      const overlay = {
        host,
        decreaseChip,
        speedChip,
        increaseChip,
        actionChip,
        visible: false,
        hideTimer: null,
        positionTimer: window.setInterval(() => updatePosition(video), 250)
      };

      overlays.set(video, overlay);

      loadCssText().then((cssText) => {
        const style = document.createElement('style');
        style.textContent = cssText;
        shadowRoot.prepend(style);
      });

      const hoverTarget = getAnchorElement(video);
      const show = () => showOverlay(video);
      const hide = () => scheduleHide(video);

      hoverTarget?.addEventListener('mouseenter', show);
      hoverTarget?.addEventListener('mouseleave', hide);
      decreaseChip.addEventListener('mouseenter', show);
      speedChip.addEventListener('mouseenter', show);
      increaseChip.addEventListener('mouseenter', show);
      actionChip.addEventListener('mouseenter', show);
      decreaseChip.addEventListener('mouseleave', hide);
      speedChip.addEventListener('mouseleave', hide);
      increaseChip.addEventListener('mouseleave', hide);
      actionChip.addEventListener('mouseleave', hide);

      decreaseChip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const didAdjust = onAdjustSpeed?.(video, -getSettings().speedStep);
        if (didAdjust) {
          flash(video);
        }
      });

      speedChip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onResetSpeed?.(video);
        flash(video);
      });

      increaseChip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const didAdjust = onAdjustSpeed?.(video, getSettings().speedStep);
        if (didAdjust) {
          flash(video);
        }
      });

      actionChip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleFullWindow?.(video);
        showOverlay(video);
      });

      updatePosition(video);
      updateSpeed(video, video.playbackRate);

      return overlay;
    }

    function remove(video) {
      const overlay = overlays.get(video);
      if (!overlay) {
        return;
      }

      window.clearInterval(overlay.positionTimer);
      window.clearTimeout(overlay.hideTimer);
      overlay.host.remove();
      overlays.delete(video);
    }

    function updateSpeed(video, playbackRate) {
      const overlay = overlays.get(video);
      if (!overlay) {
        return;
      }

      overlay.speedChip.textContent = `${Number(playbackRate || 1).toFixed(2)}x`;
      overlay.speedChip.dataset.accent = playbackRate !== 1 ? 'true' : 'false';
    }

    function updateFullWindowState(video, active) {
      const overlay = overlays.get(video);
      if (!overlay) {
        return;
      }

      overlay.actionChip.textContent = active ? 'Exit' : 'Fill';
      overlay.actionChip.dataset.accent = active ? 'true' : 'false';
      updatePosition(video);
      if (active) {
        showOverlay(video);
      }
    }

    function flash(video) {
      showOverlay(video);
      scheduleHide(video, Math.max(getSettings().overlayTimeout, 1200));
    }

    function showOverlay(video) {
      const overlay = overlays.get(video);
      if (!overlay) {
        return;
      }

      window.clearTimeout(overlay.hideTimer);
      overlay.visible = true;
      overlay.decreaseChip.dataset.visible = 'true';
      overlay.speedChip.dataset.visible = 'true';
      overlay.increaseChip.dataset.visible = 'true';
      overlay.actionChip.dataset.visible = 'true';
    }

    function scheduleHide(video, timeout = getSettings().overlayTimeout) {
      const overlay = overlays.get(video);
      if (!overlay) {
        return;
      }

      window.clearTimeout(overlay.hideTimer);
      overlay.hideTimer = window.setTimeout(() => {
        if (!video.isConnected) {
          remove(video);
          return;
        }

        overlay.visible = false;
        overlay.decreaseChip.dataset.visible = video.playbackRate !== 1 ? 'true' : 'false';
        overlay.speedChip.dataset.visible = video.playbackRate !== 1 ? 'true' : 'false';
        overlay.increaseChip.dataset.visible = video.playbackRate !== 1 ? 'true' : 'false';
        overlay.actionChip.dataset.visible = 'false';
      }, timeout);
    }

    function updatePosition(video) {
      const overlay = overlays.get(video);
      if (!overlay) {
        return;
      }

      if (!video.isConnected) {
        remove(video);
        return;
      }

      const settings = getSettings();
      const active = overlay.actionChip.textContent === 'Exit';
      const anchor = getAnchorElement(video) || video;
      const rect = anchor.getBoundingClientRect();

      if (rect.width < 120 || rect.height < 80 || !settings.overlayEnabled) {
        overlay.decreaseChip.style.display = 'none';
        overlay.speedChip.style.display = 'none';
        overlay.increaseChip.style.display = 'none';
        overlay.actionChip.style.display = 'none';
        return;
      }

      overlay.decreaseChip.style.display = 'block';
      overlay.speedChip.style.display = 'block';
      overlay.increaseChip.style.display = 'block';
      overlay.actionChip.style.display = settings.fullWindowEnabled ? 'block' : 'none';

      if (active) {
        overlay.decreaseChip.style.top = '16px';
        overlay.decreaseChip.style.left = '16px';
        overlay.speedChip.style.top = '16px';
        overlay.speedChip.style.left = '56px';
        overlay.increaseChip.style.top = '16px';
        overlay.increaseChip.style.left = '132px';
        overlay.actionChip.style.top = '16px';
        overlay.actionChip.style.right = '16px';
      } else {
        const top = Math.max(12, rect.top + 12);
        const left = Math.max(12, rect.left + 12);
        overlay.decreaseChip.style.top = `${top}px`;
        overlay.decreaseChip.style.left = `${left}px`;
        overlay.speedChip.style.top = `${top}px`;
        overlay.speedChip.style.left = `${left + 40}px`;
        overlay.increaseChip.style.top = `${top}px`;
        overlay.increaseChip.style.left = `${left + 116}px`;
        overlay.actionChip.style.top = `${Math.max(12, rect.top + 12)}px`;
        overlay.actionChip.style.right = `${Math.max(12, window.innerWidth - rect.right + 12)}px`;
      }
    }

    function loadCssText() {
      if (!overlayCssPromise) {
        overlayCssPromise = fetch(chrome.runtime.getURL('src/styles/overlay.css'))
          .then((response) => (response.ok ? response.text() : FALLBACK_CSS))
          .catch(() => FALLBACK_CSS);
      }

      return overlayCssPromise;
    }

    return {
      attach,
      remove,
      updateSpeed,
      updateFullWindowState,
      flash,
      showOverlay
    };
  }
})();
