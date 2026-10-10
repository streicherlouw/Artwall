# homebridge-artwall-photoframe

A standalone dynamic-platform plugin for an existing Homebridge installation. It exposes every Artwall PhotoFrame root album folder as a HomeKit **Switch**. Homebridge synchronizes switches with PhotoFrame’s indexed album list. After adding or deleting folders, click **Rebuild HomeKit Switches** in the PhotoFrame admin page.

## Install with the script (Raspberry Pi / Linux)

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

## Album list in Homebridge settings

Open **Plugins → Artwall PhotoFrame → Settings** to see every registered album and its HomeKit switch name above the usual configuration fields. **Refresh album list** reloads Homebridge’s accessory cache. After adding or removing folders, first use **Rebuild HomeKit Switches** in PhotoFrame; allow a polling interval for Homebridge to update, then refresh the list. Cached switches remain listed during PhotoFrame outages. Empty and failed loads show an explanatory message.

The settings panel uses Homebridge’s [custom plugin UI and cached-accessory API](https://github.com/homebridge/plugin-ui-utils#user-interface-api), with no extra runtime dependency.

## Behaviour

- Switch on **Holiday Japan** to select that album and start its slideshow.
- Selecting another album turns the previous album switch off.
- Switching off an inactive album does not stop the active album.
- A paused slideshow keeps its album switch on.
- AirPlay retains display priority; a blocked activation reports an error instead of falsely showing the switch as on.
- Web and CLI playback changes are reflected in HomeKit.
- Temporary PhotoFrame outages retain cached accessories; only a successful album discovery can remove them.

The plugin uses the local PhotoFrame HTTP API and does not require access to photo files, an Apple account or any cloud service. Keep Homebridge and PhotoFrame on a trusted network.

## Artist and movement switches

Version 0.2.0 also exposes curated collections defined by `.artwall.json` sidecars in PhotoFrame's media library. See [the sidecar format and examples](../README.md#curated-collections-artists-and-movements). Update PhotoFrame as well as this plugin, then rebuild the switches from PhotoFrame. Root album switches and their identities remain unchanged. Collections use stable IDs separately from their display names, so relabeling a collection preserves its accessory and automations. Only the selected collection switch is on; the Art switch is on only when Art itself is selected. Empty collections cannot be activated.

Artists with prominence ratings are discovered automatically. Set `prominenceCutoff` in PhotoFrame (default 0.8), or use its web settings page. Saving changes the discovered switch list without rebuilding images. Unrated existing explicit collections remain visible. The cutoff applies to artist and movement collections; root albums are always exposed.

## Switch responsiveness

HomeKit reads return the latest successfully polled state immediately and never wait behind slideshow commands or other switch reads. Before the first successful poll, after a failed poll, or when cached status expires, reads report a communication error promptly. Normal state freshness follows `pollInterval` (five seconds by default). Version 0.2.1 fixes read-handler timeouts caused by the shared command queue.

Artist switch labels use the surname before the comma in the folder-derived artist name, with lifespan removed. Names without a comma use the final word. Artists sharing a surname receive numbers (for example, Kahlo 1 and Kahlo 2) sorted by stable collection ID, independent of scan order. A single artist keeps the unnumbered surname. Accessory IDs and slideshow artist overlays remain unchanged. Movement and root album labels retain their full names.
