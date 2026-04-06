(() => {
  const root = globalThis.VelocityPlayer = globalThis.VelocityPlayer || {};

  root.screenshot = {
    createScreenshotController
  };

  function createScreenshotController() {
    async function captureFrame(video) {
      if (!video || video.tagName !== 'VIDEO' || !video.videoWidth || !video.videoHeight) {
        return false;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        return false;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `velocity-player-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);
      return true;
    }

    return {
      captureFrame
    };
  }
})();
