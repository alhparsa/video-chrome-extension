(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.loopController = {
    createLoopController
  };

  function createLoopController() {
    const state = new WeakMap();

    function attach(media) {
      if (!state.has(media)) {
        const mediaState = { pointA: null, pointB: null };
        const onTimeUpdate = () => {
          if (mediaState.pointA == null || mediaState.pointB == null) {
            return;
          }
          if (media.currentTime >= mediaState.pointB) {
            media.currentTime = mediaState.pointA;
          }
        };

        media.addEventListener('timeupdate', onTimeUpdate);
        state.set(media, mediaState);
      }

      return state.get(media);
    }

    function togglePoint(media) {
      const mediaState = attach(media);
      if (mediaState.pointA == null) {
        mediaState.pointA = media.currentTime;
        return mediaState;
      }
      if (mediaState.pointB == null) {
        mediaState.pointB = media.currentTime;
        return mediaState;
      }
      mediaState.pointA = null;
      mediaState.pointB = null;
      return mediaState;
    }

    return {
      attach,
      togglePoint
    };
  }
})();
