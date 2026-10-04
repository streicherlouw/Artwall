# homebridge-artwall-photoframe

A standalone dynamic-platform plugin for an existing Homebridge installation. It exposes every Artwall PhotoFrame root album folder as a HomeKit **Switch**. Homebridge synchronizes switches with PhotoFrame’s indexed album list. After adding or deleting folders, click **Rebuild HomeKit Switches** in the PhotoFrame admin page.

## Install with the script (Raspberry Pi / Linux)

Paste this entire block into the Raspberry Pi terminal on the machine running Homebridge. It installs prerequisites, downloads the latest Artwall code, installs the PhotoFrame plugin, and restarts Homebridge. Enter your Pi’s sudo password if prompted. Because this repository is private, the first run may show a GitHub device code and URL: complete that sign-in using an account with access to `streicherlouw/Artwall`, then let the command continue. No token needs to be pasted into the command.

```sh
(
  set -eu
  sudo apt-get update
  sudo apt-get install -y git gh python3 ca-certificates

  # Artwall is private: sign in to a GitHub account with repository access.
  gh auth status --hostname github.com >/dev/null 2>&1 || \
    gh auth login --hostname github.com --git-protocol https --web
  gh auth setup-git --hostname github.com

  artwall_install_dir=$(mktemp -d)
  trap 'rm -rf "$artwall_install_dir"' EXIT
  gh repo clone streicherlouw/Artwall "$artwall_install_dir/Artwall" -- --depth 1

  sudo sh "$artwall_install_dir/Artwall/install-homebridge.sh" \
    --storage /var/lib/homebridge \
    --url http://artwall.local:8767 \
    --restart
  sudo systemctl is-active homebridge
)
```

Requires an existing systemd Homebridge installation at `/var/lib/homebridge`. Change `--storage` and `--url` if needed. The installer backs up the configuration and previous plugin under `backups/artwall-*`, installs a self-contained copy, and preserves existing accessories and platform settings. Repeating the block updates the plugin without duplicating its platform. A successful restart ends with `active`.

`--restart` restarts the system service named `homebridge`. If Homebridge uses another service manager or runs in a container, omit that option and restart using its normal controls. For container installations, run installation inside the container using its storage path. This script targets storage-local plugins; use the package installation below for a global npm setup. The URL is used only for a new platform entry; change an existing URL in Homebridge’s plugin settings.

## Install the npm package manually

Obtain this package from the Artwall repository or its release archive. From `modules/photoframe/homebridge`, run `npm pack` to make the installable `.tgz` package. Install that file into your existing Homebridge plugin location, for example:

```sh
npm install --prefix /var/lib/homebridge /path/to/homebridge-artwall-photoframe-0.1.0.tgz
```

Use an account with write access to that installation. For a conventional global Homebridge installation, use `npm install -g /path/to/package.tgz` instead. The plugin does not install or replace Homebridge and has no npm runtime dependencies.

Add this entry to your existing `platforms` array, preserving its other entries:

```json
{
  "platform": "ArtwallPhotoFrame",
  "name": "Artwall PhotoFrame",
  "baseUrl": "http://127.0.0.1:8767",
  "pollInterval": 5
}
```

Use `http://artwall.local:8767` when Homebridge runs on another machine. Restart Homebridge once. Its configuration UI also supports these plugin settings. If the bridge is already paired, the album switches join that existing HomeKit bridge.

PhotoFrame must run the version with automatic folder indexing and the album activation API. It scans at startup and when **Rebuild HomeKit Switches** is clicked; there is no live folder watcher. Homebridge polls the indexed album list every five seconds by default, so switches update shortly after a rebuild completes.

## Behaviour

- Switch on **Holiday Japan** to select that album and start its slideshow.
- Selecting another album turns the previous album switch off.
- Switching off an inactive album does not stop the active album.
- A paused slideshow keeps its album switch on.
- AirPlay retains display priority; a blocked activation reports an error instead of falsely showing the switch as on.
- Web and CLI playback changes are reflected in HomeKit.
- Temporary PhotoFrame outages retain cached accessories; only a successful album discovery can remove them.

The plugin uses the local PhotoFrame HTTP API and does not require access to photo files, an Apple account or any cloud service. Keep Homebridge and PhotoFrame on a trusted network.
