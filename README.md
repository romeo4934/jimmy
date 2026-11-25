# SNES Web Player

A single-page SNES player for the browser, with touch controls for phones
(joystick on the left, buttons on the right). Emulation is done by the
snes9x core compiled to WebAssembly, loaded from EmulatorJS.

No game is included. Either:

- **Hosted page**: pick your own `.sfc` / `.smc` file; it is stored in your
  browser (IndexedDB) and never uploaded.
- **Local**: put a `rom.sfc` next to `index.html` and serve the folder:

  ```bash
  python3 -m http.server 8765
  ```

ROM files are git-ignored.
