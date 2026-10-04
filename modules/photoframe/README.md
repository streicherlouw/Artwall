# PhotoFrame

Install from the repository root with `./install.sh --modules photoframe` (add `--setup-display` for initial appliance setup). Configuration: `~/.config/artwall/photoframe.json`; service: `artwall-photoframe.service`.

The web configuration page defaults to port 8767. It controls album selection, interval, fade duration, shuffle, screen wake and country overlay size. Defaults: five seconds per image and a 1.7-second fade. Arrow keys navigate, Space pauses and F toggles browser fullscreen. `/player` previews in the current browser; `/player?display=1` is the Pi's remotely controlled player.

Import an album using `artwall photoframe import FOLDER --album NAME`. Supported image types: PNG, JPEG, WebP. Original files are copied without rewriting metadata. Country maps use embedded EXIF GPS; no GPS means no overlay. The importer processes one folder at a time, excluding generated preview/contact sheets.

API:

- `GET /api/status`: player state, current slide and display ownership.
- `GET/POST /api/slideshow/config`: settings (`intervalMs`, `fadeMs`, `showMap`, `mapSize`, `shuffle`, `album`, `wakeDisplay`).
- `POST /api/slideshow/command`: JSON `{"action":"start"}`; also stop, next, previous, pause, resume.

Starting without imported images is rejected. Starting while AirPlay owns the screen is rejected. Starting PhotoFrame while SplitFlap is active automatically ends SplitFlap first. If either takes over, PhotoFrame closes its kiosk. Screen power is restored after all active display owners release it. The advanced `displayOutput` setting defaults to HDMI-A-1; use `wlr-randr` in the graphical session to find your connector.
