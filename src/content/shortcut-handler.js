(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.shortcutHandler = {
    createShortcutHandler
  };

  function createShortcutHandler({ getSettings, getTargetMedia, actions }) {
    let keydownHandler = null;

    function init() {
      if (keydownHandler) {
        return;
      }

      keydownHandler = async (event) => {
        if (shouldIgnoreEvent(event)) {
          return;
        }

        const settings = getSettings();
        const shortcuts = settings.shortcuts;
        const media = getTargetMedia();

        if (event.code === 'Escape' && actions.exitFullWindow) {
          const handled = await actions.exitFullWindow();
          if (handled) {
            event.preventDefault();
          }
          return;
        }

        if (!media) {
          return;
        }

        let handled = false;

        switch (event.code) {
          case shortcuts.speedUp:
            handled = !!settings.speedEnabled && !!actions.adjustSpeed?.(settings.speedStep);
            break;
          case shortcuts.speedDown:
            handled = !!settings.speedEnabled && !!actions.adjustSpeed?.(-settings.speedStep);
            break;
          case shortcuts.resetSpeed:
            handled = !!settings.speedEnabled && !!actions.resetSpeed?.();
            break;
          case shortcuts.toggleSpeed:
            handled = !!settings.speedEnabled && !!actions.toggleSpeed?.();
            break;
          case shortcuts.rewind:
            handled = !!actions.seek?.(-settings.seekStep);
            break;
          case shortcuts.advance:
            handled = !!actions.seek?.(settings.seekStep);
            break;
          case shortcuts.toggleFullWindow:
            handled = !!settings.fullWindowEnabled && !!actions.toggleFullWindow?.();
            break;
          case shortcuts.togglePictureInPicture:
            handled = !!actions.togglePictureInPicture?.();
            break;
          case shortcuts.prevFrame:
            handled = !!actions.stepFrame?.(-1);
            break;
          case shortcuts.nextFrame:
            handled = !!actions.stepFrame?.(1);
            break;
          case shortcuts.screenshot:
            handled = !!actions.captureFrame?.();
            break;
          case shortcuts.toggleLoop:
            handled = !!actions.toggleLoop?.();
            break;
          default:
            break;
        }

        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      document.addEventListener('keydown', keydownHandler, true);
    }

    function destroy() {
      if (!keydownHandler) {
        return;
      }
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }

    return {
      init,
      destroy
    };
  }

  function shouldIgnoreEvent(event) {
    if (event.defaultPrevented) {
      return true;
    }

    const activeElement = document.activeElement;
    if (!activeElement) {
      return false;
    }

    const tagName = activeElement.tagName;
    return (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      activeElement.isContentEditable
    );
  }
})();
