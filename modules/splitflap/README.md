# SplitFlap

A native pygame/SDL2 flap display with a Node.js HTTP controller. Install with `./install.sh --modules splitflap` (plus `--setup-display` for initial dedicated-display setup). Configuration: `~/.config/artwall/splitflap.json`; user service: `artwall-splitflap.service`.

Open port 8766 for the message composer and board designer. Text, tile colours, preview layout, optional flap sound and wake-alert expiry are supported. The default board has 27 columns and 10 rows. Advanced board dimensions, cadence, audio sink, screen connector and automatic content sources are configured in JSON. Restart the service after changing that file.

```sh
artwall splitflap show 'WELCOME HOME' --sound --beautify
artwall splitflap start
artwall splitflap stop
```

`--beautify` centres the message and adds colour accents. It can be used on its own or together with `--sound`; it is off by default.

`POST /api/message` accepts JSON with `text`, optional `sound`, `align: "center"`, `beautify`, and `powerOffAfterMs` (1,000–86,400,000). Expiry applies to wake-up alerts when the display was initially off, and starts after the message finishes animating. Use `{"type":"activate","mode":"auto"}` for automatic content. `POST /api/end` ends the session. `GET /api/status` reports state. A loopback WebSocket interface remains available on port 8765.

AirPlay prevents activation and preempts an active display. PhotoFrame is dismissed when SplitFlap takes the screen. No browser renderer, MagicMirror or PM2 is required. The native renderer opens only during an active session. The service preserves unrelated applications and the screen's previous power state.

Optional HTTP authentication: set `web.authRequired` to true and supply the environment variable named by `web.tokenEnv` (default `SPLITFLAP_WEB_TOKEN`) in a systemd service override. The browser has an access-key field. The CLI defaults to the unauthenticated local API; authenticated deployments should use HTTP with the configured token.

Automatic content defaults to BBC World RSS, quotes and historical events; source attribution appears on the board. Font licensing is in `standalone/web/FONT-LICENSE.txt`; synthetic flap audio is described in `standalone/SOUND.md`.
