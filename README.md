# Artwall

A modular display appliance for Raspberry Pi. Choose any combination of four standalone modules; no MagicMirror installation is required.

| Module | Configuration page | What it does |
| --- | --- | --- |
| PhotoFrame | `http://artwall.local:8767/` | Full-screen photos and collages, fades, albums, GPS country maps and keyboard controls |
| SplitFlap | `http://artwall.local:8766/` | Native animated flap display, messages, board designer, optional sound and automatic feeds |
| AirPlayReceiver | `http://artwall.local:8768/` | UxPlay receiver with name, frame-rate, volume and display-power settings |
| Portal | `http://artwall.local/` | Links to the configuration pages of installed modules |

Replace `artwall.local` with your Pi's hostname. Each module has its own service and configuration file. Portal is optional; the other modules remain directly accessible without it. AirPlay takes display priority over SplitFlap; both stop PhotoFrame when taking the screen. Restart PhotoFrame to return to your slideshow afterward.

## Install

Use 64-bit Raspberry Pi OS (Debian 13 recommended), a connected HDMI display, a regular user with sudo privileges and network access. The installer supports Node.js 20 or newer and installs Debian runtime packages. Tested deployment target: Raspberry Pi 4, 8 GB RAM.

```sh
git clone https://github.com/streicherlouw/Artwall.git
cd Artwall
./install.sh --setup-display
```

For a private repository, authenticate your GitHub client first (`gh auth login`, then `gh repo clone streicherlouw/Artwall`). Never put an access token in the clone URL. Alternatively, download the source archive from GitHub and extract it on the Pi.

`--setup-display` configures a dedicated labwc Wayland session with greetd automatic login. Use it for initial appliance setup. Existing display configuration is backed up before changing it. Omit this option when a suitable Wayland session already runs under the installing user. Portal alone needs no graphical session.

Install only the modules you want:

```sh
./install.sh --modules photoframe,portal --setup-display
./install.sh --modules splitflap
./install.sh --modules airplay
./install.sh --dry-run --modules portal
```

AirPlay builds pinned UxPlay **1.73.7** from its upstream source. Other modules do not install it. SplitFlap alone installs its npm dependencies; PhotoFrame and Portal use Node's built-in libraries. A full repository checkout contains all source, but only selected modules' dependencies and services are installed.

The CLI is installed at `~/.local/bin/artwall`; add `~/.local/bin` to your shell's `PATH` if necessary. Services start automatically at boot. Display services wait for Wayland; they start idle, ready for an activation command. AirPlay advertises automatically. A shared display service switches HDMI off after 60 seconds with no active display module. Active slideshows (including paused images), SplitFlap and AirPlay prevent this timeout. Starting a display wakes the screen. The appliance uses a transparent cursor theme to hide its pointer.

## Control locally

```sh
artwall status
artwall photoframe import /path/to/collages --album 'Holiday Japan'
artwall photoframe start
artwall photoframe pause
artwall photoframe next
artwall photoframe resume
artwall photoframe stop
artwall splitflap show 'WELCOME HOME' --sound --beautify
artwall splitflap start                 # automatic content
artwall splitflap stop
artwall airplay status
```

Imports copy PNG, JPEG and WebP originals into the managed library, read embedded EXIF GPS and generate the country overlay. Import each album folder separately. Reimporting an album replaces its playlist entries. Start playback again to load a changed library. No photos or personal settings are included in this repository. PhotoFrame displays existing images; collage generation remains on the Mac.

## Control over HTTP

```sh
curl --fail http://artwall.local:8767/api/slideshow/command \
  -H 'Content-Type: application/json' -d '{"action":"start"}'
curl --fail http://artwall.local:8767/api/slideshow/command \
  -H 'Content-Type: application/json' -d '{"action":"next"}'
curl --fail http://artwall.local:8766/api/message \
  -H 'Content-Type: application/json' -d '{"text":"DINNER IS READY","sound":true}'
curl --fail -X POST http://artwall.local:8766/api/end
```

PhotoFrame commands: `start`, `stop`, `next`, `previous`, `pause`, `resume`. Every module exposes `GET /api/status`. See each module's README for additional options. The configuration pages and APIs are intended for your trusted home network. SplitFlap can optionally require an access token; these services are not designed for direct internet exposure.

## Files, updates and removal

- Application: `~/.local/lib/artwall/`
- Configuration: `~/.config/artwall/{photoframe,splitflap,airplay,portal}.json`
- Shared display settings: `~/.config/artwall/display.json` (`idleTimeoutSeconds`, `output`)
- Installed-module registry: `~/.config/artwall/registry.json`
- Photos and playlist: `~/.local/share/artwall/photos/`
- Configuration backups: `~/.local/share/artwall/backups/`

Update your source checkout with `git pull --ff-only`, then rerun `./install.sh --modules ...` for the modules to update. Existing settings override new defaults; media is preserved. The installer backs up configuration before updates. A module update stops and restarts that module's service, so do it between display sessions. Keep the selected module list explicit; the default is all four.

```sh
./install.sh --uninstall splitflap,airplay
```

Removal disables the selected services and removes their Portal entries. It retains configuration, media, shared runtime packages and the graphical session. The shared idle service is removed when the last display module is uninstalled. Reinstalling restores the saved settings. To change advanced JSON settings, restart that module afterward:

```sh
systemctl --user restart artwall-photoframe
systemctl --user status artwall-splitflap
journalctl --user -u artwall-airplay -n 80
sudo systemctl restart artwall-portal
```

Portal alone runs as a system service, under the installing user's identity with only the capability needed to bind port 80. Display modules run as that user's systemd services. Homebridge and unrelated services are left in place. Add other configuration pages to Portal's `externalServices` list; see its README.

## Development and licenses

```sh
npm ci --ignore-scripts --prefix modules/splitflap
python3 -m pip install Pillow
npm test
npm run check
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m unittest discover -s modules/splitflap/test -p 'test_*.py'
```

The repository uses MIT-licensed application code. Retained module licenses and the DejaVu font license accompany their files. Natural Earth country outlines are public domain; attribution is in `modules/photoframe/maps/ATTRIBUTION.txt`. UxPlay and system packages retain their upstream licenses and are installed separately.
