# Artwall

A modular display appliance for Raspberry Pi. Choose any combination of four standalone modules; no MagicMirror installation is required.

| Module | Configuration page | What it does |
| --- | --- | --- |
| PhotoFrame | `http://artwall.local:8767/` | Full-screen photos and collages, fades, albums, GPS country maps and keyboard controls |
| SplitFlap | `http://artwall.local:8766/` | Native animated flap display, messages, board designer, optional sound and automatic feeds |
| AirPlayReceiver | `http://artwall.local:8768/` | UxPlay receiver with name, frame-rate, volume and display-power settings |
| Portal | `http://artwall.local/` | Links to the configuration pages of installed modules |

Replace `artwall.local` with your Pi's hostname. Each module has its own service and configuration file. Portal is optional; the other modules remain directly accessible without it. Timed SplitFlap announcements pause PhotoFrame and return to the same slideshow when they expire. Untimed SplitFlap sessions replace PhotoFrame. AirPlay takes priority over both; neither can replace an active AirPlay session. The interrupted display resumes automatically after AirPlay ends.

## Install

Use 64-bit Raspberry Pi OS (Debian 13 recommended), a connected HDMI display, a regular user with sudo privileges and network access. The installer supports Node.js 20 or newer and installs Debian runtime packages. Tested deployment target: Raspberry Pi 4, 8 GB RAM.

```sh
(
  set -eu
  sudo apt-get update
  sudo apt-get install -y git python3 ca-certificates
  git clone --depth 1 https://github.com/streicherlouw/Artwall.git
  cd Artwall
  ./install.sh --setup-display
)
```

For a fresh installation, paste the block above from a directory without an existing `Artwall` folder. To update an existing Git checkout, run `git -C Artwall pull --ff-only`, then rerun `./install.sh` from that checkout with your desired options.

Artwall is a public repository; no GitHub account or token is required. Alternatively, download the [source archive](https://github.com/streicherlouw/Artwall/archive/refs/heads/main.tar.gz) and extract it on the Pi.

`--setup-display` configures a dedicated labwc Wayland session with greetd automatic login and sets `graphical.target` as the boot default so the display manager starts automatically. Use it for initial appliance setup. Existing display configuration is backed up before changing it. Omit this option when a suitable Wayland session already runs under the installing user. Portal alone needs no graphical session.

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

## Optional Homebridge integration

PhotoFrame includes a standalone Homebridge plugin that creates one HomeKit switch per indexed root album folder.

Paste this entire block into the Raspberry Pi terminal on the machine running Homebridge. It installs prerequisites, downloads the latest Artwall code, installs the PhotoFrame plugin, and restarts Homebridge. Enter your Pi’s sudo password if prompted. Artwall is public: no GitHub account, sign-in, token or GitHub CLI is required.

```sh
(
  set -eu
  sudo apt-get update
  sudo apt-get install -y git python3 ca-certificates

  artwall_install_dir=$(mktemp -d)
  trap 'rm -rf "$artwall_install_dir"' EXIT
  git clone --depth 1 https://github.com/streicherlouw/Artwall.git "$artwall_install_dir/Artwall"

  sudo sh "$artwall_install_dir/Artwall/install-homebridge.sh" \
    --storage /var/lib/homebridge \
    --url http://artwall.local:8767 \
    --restart
  sudo systemctl is-active homebridge
)
```

This assumes an existing systemd Homebridge installation with storage at `/var/lib/homebridge`, and PhotoFrame running at `http://artwall.local:8767`. Change those arguments if your addresses differ. The installer backs up the configuration and previous plugin, preserves existing accessories and platform settings, and can be run again to update the plugin. An existing PhotoFrame platform’s URL is preserved; edit it in Homebridge’s plugin settings if needed. A successful restart ends with `active`.

After installation, use **Rebuild HomeKit Switches** on the [PhotoFrame admin page](http://artwall.local:8767/) after changing folders. PhotoFrame also scans on startup; it does not run a live folder watcher. See [plugin installation and configuration](modules/photoframe/homebridge/README.md) for other Homebridge layouts.

## HDMI audio

If sound goes to the Pi’s headphone jack instead of the monitor, select HDMI and pin both audio modules to that output:

```sh
python3 scripts/setup-audio.py
systemctl --user restart artwall-airplay artwall-splitflap
```

Run as the Artwall user with PipeWire running and the HDMI screen connected and on. The script backs up module settings, selects the available HDMI sink by its stable name, unmutes it without increasing its volume, and saves it as the default output. With multiple HDMI audio outputs, supply `--sink NODE_NAME` (find the name with `wpctl inspect ID`). Restart only services you have installed. The saved routing survives service restarts and reboots.

SplitFlap sound is opt-in per announcement: check **Sound** in the composer or use `artwall splitflap show "HELLO" --sound`. AirPlay uses the sender’s audio and volume controls. The monitor’s own speaker mute/volume must also allow sound.
