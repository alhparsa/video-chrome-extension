# Velocity Player

Velocity Player is a Manifest V3 Chrome extension for controlling media on arbitrary sites without a backend.

This repository is initialized around a plain-JavaScript `src/` structure:

- `src/content/` contains the content-script modules and the orchestration entrypoint.
- `src/background/` contains the service worker.
- `src/popup/` and `src/options/` contain extension UI surfaces.
- `src/styles/overlay.css` defines the isolated overlay styling used inside a shadow root.
- `scripts/build.sh` packages the extension for local distribution.

Implemented in this scaffold:

- Media discovery across the page, shadow roots, and same-origin iframes
- Playback speed controls and keyboard shortcuts
- Theater mode / full-window video handling
- Floating overlay controls
- Popup and options page wired to `chrome.storage.local`

Planned modules such as audio boost/EQ, A-B looping, screenshots, per-site memory, and license gating are scaffolded and ready for deeper implementation.

## Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked and select this repository

## Packaging

Run:

```bash
./scripts/build.sh
```
