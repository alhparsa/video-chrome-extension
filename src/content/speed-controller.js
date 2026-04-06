(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.speedController = {
    createSpeedController
  };

  function createSpeedController({ getSettings, onRateChange }) {
    const mediaState = new WeakMap();

    function attach(media) {
      if (mediaState.has(media)) {
        return mediaState.get(media);
      }

      const state = {
        lastNonDefaultRate: media.playbackRate === 1 ? 1.75 : media.playbackRate
      };

      mediaState.set(media, state);

      if (getSettings().preservesPitch && 'preservesPitch' in media) {
        media.preservesPitch = true;
      }

      media.addEventListener('ratechange', () => {
        if (media.playbackRate !== 1) {
          state.lastNonDefaultRate = media.playbackRate;
        }
        onRateChange?.(media);
      });

      return state;
    }

    function setRate(media, value) {
      if (!media) {
        return 1;
      }

      attach(media);
      const clampedRate = clamp(Number(value) || 1, 0.25, 5);
      media.playbackRate = Number(clampedRate.toFixed(2));

      if (getSettings().preservesPitch && 'preservesPitch' in media) {
        media.preservesPitch = true;
      }

      onRateChange?.(media);
      return media.playbackRate;
    }

    function adjustRate(media, delta) {
      const step = Number(delta) || 0;
      return setRate(media, (media?.playbackRate || 1) + step);
    }

    function resetRate(media) {
      return setRate(media, 1);
    }

    function toggleRate(media) {
      if (!media) {
        return 1;
      }

      const state = attach(media);
      return media.playbackRate === 1 ? setRate(media, state.lastNonDefaultRate || 1.75) : resetRate(media);
    }

    function seek(media, deltaSeconds) {
      if (!media || !Number.isFinite(media.duration)) {
        return media?.currentTime || 0;
      }

      media.currentTime = clamp(media.currentTime + deltaSeconds, 0, media.duration);
      return media.currentTime;
    }

    function stepFrame(media, direction) {
      if (!media || media.tagName !== 'VIDEO') {
        return media?.currentTime || 0;
      }

      media.pause();
      const frameDuration = 1 / 30;
      media.currentTime = Math.max(0, media.currentTime + frameDuration * direction);
      return media.currentTime;
    }

    return {
      attach,
      setRate,
      adjustRate,
      resetRate,
      toggleRate,
      seek,
      stepFrame
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
