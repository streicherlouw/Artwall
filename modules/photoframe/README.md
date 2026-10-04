# PhotoFrame

Install from the repository root with `./install.sh --modules photoframe` (add `--setup-display` for initial appliance setup). Configuration: `~/.config/artwall/photoframe.json`; service: `artwall-photoframe.service`.

The web configuration page defaults to port 8767. It controls album selection, interval, fade duration, shuffle, screen wake and country overlay size. Defaults: five seconds per image and a 1.7-second fade. Arrow keys navigate, Space pauses and F toggles browser fullscreen. `/player` previews in the current browser; `/player?display=1` is the Pi's remotely controlled player.

Import an album using `artwall photoframe import FOLDER --album NAME`. Supported image types: PNG, JPEG, WebP. Original files are copied without rewriting metadata. Country maps use embedded EXIF GPS; no GPS means no overlay. The importer processes one folder at a time, excluding generated preview/contact sheets.

API:

- `GET /api/status`: player state, current slide and display ownership.
- `GET/POST /api/slideshow/config`: settings (`intervalMs`, `fadeMs`, `showMap`, `mapSize`, `shuffle`, `album`, `wakeDisplay`).
- `POST /api/slideshow/command`: JSON `{"action":"start"}`; also stop, next, previous, pause, resume.

Starting without imported images is rejected. Starting while AirPlay owns the screen is rejected. Starting PhotoFrame while SplitFlap is active automatically ends SplitFlap first. If either takes over, PhotoFrame closes its kiosk. Screen power is restored after all active display owners release it. The advanced `displayOutput` setting defaults to HDMI-A-1; use `wlr-randr` in the graphical session to find your connector.

## HomeKit album switches

PhotoFrame scans its `contentRoot` on startup. After changing folders or images, click **Rebuild HomeKit Switches** on the PhotoFrame admin page to rescan. There is no live folder watcher. Each immediate child folder is an album; supported images within that folder and its subfolders are indexed in natural filename order. New images get GPS country maps; existing map metadata is preserved. Hidden folders, symlinks, previews and contact sheets are excluded. Files are indexed in place, without copying or changing originals.

The optional Homebridge plugin creates one standard Switch accessory per root folder. After adding or removing folders, click **Rebuild HomeKit Switches**. Once indexing completes, Homebridge adds or removes the corresponding switches on its next poll (normally within five seconds). No restart is required. Empty albums appear too, but cannot be switched on until they contain a supported image.

Install into an existing Homebridge installation, under an account that can write its storage directory:

```sh
./install-homebridge.sh --storage /var/lib/homebridge
```

Restart Homebridge once after initial installation. The installer backs up its configuration and previous plugin, preserves other accessories/platforms, and installs a self-contained copy. Add `--restart` when running with permission to restart the system Homebridge service, or restart from Homebridge’s admin UI. The platform is `ArtwallPhotoFrame`; its `baseUrl` defaults to `http://127.0.0.1:8767` and can point to another Pi. Homebridge's plugin settings page exposes the URL and polling interval.

Turning a switch on selects that album and starts PhotoFrame, replacing SplitFlap if necessary. AirPlay retains priority. Only the currently active album's switch is on, including when playback is paused. Turning off an inactive album does not stop a different album. Changes through web controls and CLI are reflected in HomeKit. Removing the playing album stops playback.

The plugin uses `GET /api/status` for discovery/state and `POST /api/slideshow/album` with `{"album":"Holiday Japan","on":true}` for serialized album activation. Set `on` to false to stop that album. If the existing Homebridge bridge is already paired with HomeKit, new switches are added to that bridge automatically.

`POST /api/homekit/rebuild` with `{}` performs the same rebuild as the admin button. Concurrent requests share one scan; failures are reported without claiming success.
