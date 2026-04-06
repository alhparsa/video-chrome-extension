(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.mediaDetector = {
    createMediaDetector
  };

  function createMediaDetector({ onMediaDiscovered, onStateChange, onActiveMediaChange }) {
    const trackedMedia = new WeakSet();
    let activeMedia = null;
    let mutationObserver = null;
    let pollInterval = null;
    let lastSnapshot = null;

    function init() {
      scan();

      const startObserver = () => {
        if (mutationObserver || !document.documentElement) {
          return;
        }

        mutationObserver = new MutationObserver((mutations) => {
          let shouldScan = false;

          for (const mutation of mutations) {
            if (mutation.type !== 'childList') {
              continue;
            }

            for (const node of mutation.addedNodes) {
              if (!(node instanceof Element)) {
                continue;
              }

              if (node.matches?.('video, audio, iframe') || node.querySelector?.('video, audio, iframe')) {
                shouldScan = true;
                break;
              }
            }

            if (shouldScan) {
              break;
            }
          }

          if (shouldScan) {
            scan();
          }
        });

        mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
      };

      if (document.documentElement) {
        startObserver();
      } else {
        document.addEventListener('DOMContentLoaded', startObserver, { once: true });
      }

      pollInterval = window.setInterval(scan, 2000);
    }

    function destroy() {
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
    }

    function scan() {
      const media = collectMedia(document);
      media.forEach(trackMedia);
      emitSnapshot(media);
      return media;
    }

    function getMedia() {
      return collectMedia(document);
    }

    function getActiveMedia() {
      if (activeMedia?.isConnected) {
        return activeMedia;
      }

      const bestMedia = findBestMedia();
      if (bestMedia) {
        setActiveMedia(bestMedia);
      }
      return bestMedia;
    }

    function setActiveMedia(media) {
      if (!media || activeMedia === media) {
        return;
      }

      activeMedia = media;
      onActiveMediaChange?.(media);
      emitSnapshot(getMedia());
    }

    function findBestMedia({ videosOnly = false } = {}) {
      const media = getMedia().filter((item) => !videosOnly || item.tagName === 'VIDEO');
      if (media.length === 0) {
        return null;
      }

      const playing = media.filter((item) => !item.paused && !item.ended && item.readyState > 1);
      const candidates = playing.length > 0 ? playing : media;

      return candidates.reduce((best, item) => {
        if (!best) {
          return item;
        }

        const bestArea = getMediaArea(best);
        const itemArea = getMediaArea(item);

        if (itemArea !== bestArea) {
          return itemArea > bestArea ? item : best;
        }

        return item.readyState > best.readyState ? item : best;
      }, null);
    }

    function trackMedia(media) {
      if (trackedMedia.has(media)) {
        return;
      }

      trackedMedia.add(media);
      onMediaDiscovered?.(media);

      const markActive = () => setActiveMedia(media);
      const syncState = () => emitSnapshot(getMedia());

      media.addEventListener('play', () => {
        markActive();
        syncState();
      });
      media.addEventListener('pause', syncState);
      media.addEventListener('ended', syncState);
      media.addEventListener('ratechange', () => {
        markActive();
        syncState();
      });
      media.addEventListener('volumechange', syncState);
      media.addEventListener('pointerdown', markActive);
      media.addEventListener('mouseenter', markActive);
      media.addEventListener('focus', markActive);
      media.addEventListener('loadedmetadata', syncState);
    }

    function emitSnapshot(media) {
      const currentActiveMedia = activeMedia?.isConnected ? activeMedia : findBestMedia();
      if (currentActiveMedia && currentActiveMedia !== activeMedia) {
        activeMedia = currentActiveMedia;
        onActiveMediaChange?.(activeMedia);
      }

      const snapshot = {
        hasMedia: media.length > 0,
        mediaCount: media.length,
        activeTag: currentActiveMedia?.tagName || null,
        playbackRate: currentActiveMedia?.playbackRate || 1
      };

      if (
        lastSnapshot &&
        lastSnapshot.hasMedia === snapshot.hasMedia &&
        lastSnapshot.mediaCount === snapshot.mediaCount &&
        lastSnapshot.activeTag === snapshot.activeTag &&
        lastSnapshot.playbackRate === snapshot.playbackRate
      ) {
        return;
      }

      lastSnapshot = snapshot;
      onStateChange?.(snapshot);
    }

    return {
      init,
      destroy,
      scan,
      getMedia,
      getActiveMedia,
      setActiveMedia,
      findBestMedia
    };
  }

  function collectMedia(rootNode, visitedDocuments = new WeakSet()) {
    if (!rootNode) {
      return [];
    }

    const results = [];
    const documents = [];

    if (rootNode instanceof Document || rootNode instanceof ShadowRoot) {
      documents.push(rootNode);
    }

    while (documents.length > 0) {
      const currentRoot = documents.pop();
      if (!currentRoot || visitedDocuments.has(currentRoot)) {
        continue;
      }
      visitedDocuments.add(currentRoot);

      results.push(...currentRoot.querySelectorAll('video, audio'));

      currentRoot.querySelectorAll('*').forEach((element) => {
        if (element.shadowRoot) {
          documents.push(element.shadowRoot);
        }

        if (element.tagName === 'IFRAME') {
          try {
            if (element.contentDocument) {
              documents.push(element.contentDocument);
            }
          } catch (_error) {}
        }
      });
    }

    return Array.from(new Set(results)).filter((element) => element.isConnected);
  }

  function getMediaArea(media) {
    const rect = media.getBoundingClientRect?.();
    return rect ? rect.width * rect.height : 0;
  }
})();
