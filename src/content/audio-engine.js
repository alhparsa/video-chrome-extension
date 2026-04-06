(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.audioEngine = {
    createAudioEngine
  };

  function createAudioEngine() {
    const state = new WeakMap();

    function attach(media) {
      if (!state.has(media)) {
        state.set(media, {
          boost: 1,
          compressorEnabled: false,
          eq: { bass: 0, mid: 0, treble: 0 }
        });
      }

      return state.get(media);
    }

    function setBoost(media, boost) {
      const mediaState = attach(media);
      mediaState.boost = Math.min(6, Math.max(1, Number(boost) || 1));
      return mediaState.boost;
    }

    function setEq(media, eqPatch) {
      const mediaState = attach(media);
      mediaState.eq = { ...mediaState.eq, ...eqPatch };
      return mediaState.eq;
    }

    function toggleCompressor(media) {
      const mediaState = attach(media);
      mediaState.compressorEnabled = !mediaState.compressorEnabled;
      return mediaState.compressorEnabled;
    }

    return {
      attach,
      setBoost,
      setEq,
      toggleCompressor
    };
  }
})();
