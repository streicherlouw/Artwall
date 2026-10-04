# Artwall Portal

Install independently with `./install.sh --modules portal`. No display session is required. The system service `artwall-portal.service` serves port 80 under the installing user's account. Configuration: `~/.config/artwall/portal.json`.

The blank-screen timeout is configurable on Portal (default 60 seconds). It never sleeps an active or paused display session. Set 0 to disable. `GET/POST /api/display/config` exposes `idleTimeoutSeconds`. Changes take effect without a restart.

Portal reads `registry.json` on every request, so installing or removing another module automatically updates its cards. Links retain the hostname used to open Portal; there is no fixed IP address.

To link another service, add an entry to `externalServices`, then restart Portal:

```json
{"id":"homebridge","name":"Homebridge","description":"Home automation","port":8581,"path":"/"}
```

`GET /api/modules` returns the installed-module cards plus these external entries. `GET /api/status` reports portal health. Portal does not proxy other modules or need their services to be running. Each module's settings remain on its own web page.
