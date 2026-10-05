# PhotoFrame

Install from the repository root with `./install.sh --modules photoframe` (add `--setup-display` for initial appliance setup). Configuration: `~/.config/artwall/photoframe.json`; service: `artwall-photoframe.service`.

The web configuration page defaults to port 8767. It controls album selection, interval, fade duration, shuffle, screen wake and country overlay size. Defaults: five seconds per image and a 1.7-second fade. Arrow keys navigate, Space pauses and F toggles browser fullscreen. `/player` previews in the current browser; `/player?display=1` is the Pi's remotely controlled player.

Import an album using `artwall photoframe import FOLDER --album NAME`. Supported image types: PNG, JPEG, WebP. Original files are copied without rewriting metadata. Country maps use embedded EXIF GPS; no GPS means no overlay. The importer processes one folder at a time, excluding generated preview/contact sheets.

API:

- `GET /api/status`: player state, current slide and display ownership.
- `GET/POST /api/slideshow/config`: settings (`intervalMs`, `fadeMs`, `showMap`, `mapSize`, `shuffle`, `album`, `wakeDisplay`).
- `POST /api/slideshow/command`: JSON `{"action":"start"}`; also stop, next, previous, pause, resume.

Starting without imported images is rejected. Starting while AirPlay owns the screen is rejected. Starting PhotoFrame while SplitFlap is active automatically ends SplitFlap first. Timed SplitFlap announcements keep the kiosk open underneath and pause playback. On expiry, PhotoFrame returns to the same album and photo, retaining its previous paused/playing state. Untimed SplitFlap sessions close the kiosk and cancel this return. AirPlay pauses it and resumes the same photo and pause state after streaming ends. Screen power is restored after all active display owners release it. The advanced `displayOutput` setting defaults to HDMI-A-1; use `wlr-randr` in the graphical session to find your connector.

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

Playback controls and the mouse cursor start hidden. Moving or clicking a mouse reveals them; both hide after 2.5 seconds without mouse activity. Keyboard and remote playback commands do not reveal the controls. PhotoFrame draws a visible arrow cursor over its controls and uses Adwaita as its browser cursor theme; the appliance desktop retains its hidden cursor.

## Curated collections: artists and movements

Root albums remain automatic. To add curated switches within an album, put a `.artwall.json` file in that root album folder, for example `contentRoot/Art/.artwall.json`:

```json
{
  "version": 1,
  "collections": [
    { "id": "impressionists", "name": "Impressionists", "prominence": 0.98, "match": { "movements": ["impressionism"] } },
    { "id": "cubists", "name": "Cubists", "prominence": 0.95, "match": { "movements": ["cubism"] } }
  ]
}
```

Put artist metadata in each artist folder, regardless of its folder name. For example, `Art/Monet, Claude (1840-1926)/.artwall.json`:

```json
{
  "version": 1,
  "artist": { "id": "claude-monet", "name": "Monet", "prominence": 0.98 },
  "movements": ["impressionism"]
}
```

For `Art/Krøyer, Peder Severin (1851-1909)/.artwall.json`:

```json
{
  "version": 1,
  "artist": { "id": "peder-severin-kroyer", "name": "Peder Severin Krøyer", "prominence": 0.70 },
  "movements": ["impressionism"]
}
```

Both artists contribute to **Impressionists**. At the default cutoff of 0.8, Monet gets an individual switch and Krøyer does not; lowering the cutoff to 0.7 exposes both artist switches. **Art** still includes every supported image in every descendant folder, including folders without metadata. No artwork is copied or duplicated. Collections are scoped to their root album.

Metadata applies to all images in a folder and its descendants. A deeper sidecar can replace `artist` or `movements`, for example to classify an artist's periods separately; `"movements": []` clears inherited movements. Missing fields inherit. Movement and artist IDs are case-sensitive; use consistent IDs. Multiple values in one match field mean OR; specifying both artists and movements means AND. An artist with `prominence` automatically gets an indexed artist collection, with `artist.name` as its switch label. An artist without `prominence` contributes metadata without creating an automatic switch (backward compatibility). Explicit collection `name` is its switch label. Define `collections` only in root album sidecars. A root sidecar can also supply inherited artist/movement metadata.

Collection IDs must be unique within their root album. Keep IDs unchanged when relabeling a switch: Homebridge preserves its accessory identity and automations. Artist folder renames do not change collection identity. Renaming the root album or a collection ID creates a new identity. Root album names `all` and those starting with `collection:` are reserved.

Click **Rebuild HomeKit Switches** after changing metadata. Invalid JSON, invalid fields, or duplicate IDs fail the rebuild with the offending sidecar path before replacing the published index. Empty collections are listed in the rebuild result and retain switches, but cannot be activated. Removing a selected collection, or removing its last image, stops playback and resets selection to all. Shuffle uses the existing slideshow setting: enable it for randomized artwork order; artists with more images receive proportionally more screen time.

The scanner writes `collections.json` (IDs, labels, root albums, prominence, kind and image counts) and per-image collection memberships in `playlist.json`. API responses include `collections`; their IDs also appear in `albums` for the existing selection API. For example, select Impressionists with `{"album":"collection:Art:impressionists","on":true}` at `POST /api/slideshow/album`. The web selector displays readable collection labels. Update both PhotoFrame and the Homebridge plugin for this feature; the plugin never reads photo folders itself.

Copy or synchronize the complete album tree, including hidden `.artwall.json` files, into the configured `contentRoot`. The single-folder import command does not recursively import an artist tree or copy sidecars.


### Prominence cutoff

Set **Artist and movement prominence cutoff** on the PhotoFrame settings page, or set `"prominenceCutoff": 0.8` in the module configuration. The accepted range is 0–1, inclusive; missing settings default to 0.8. A collection appears when its prominence is **greater than or equal to** the cutoff. All root albums remain visible, and Art always includes all artworks. Unrated explicit collections have prominence 1 for backward compatibility.

Saving a cutoff immediately refreshes the web selector and Homebridge discovery on its next poll; no rescan is needed. All collection memberships remain indexed, including hidden ones. If a higher cutoff hides the selected collection, playback stops and selection resets to all. Changing sidecar ratings or movement membership still requires **Rebuild HomeKit Switches**. The settings page reports the visible artist and movement counts.

Artist scores live in their folder sidecars. Movement scores live in their root album's collection definitions. Duplicate artist folders can share an ID; their name and score must agree, and their images contribute to one artist switch. Conflicting artist metadata fails the rebuild. Scores must be finite numbers from 0 to 1; booleans and numeric strings are rejected.

Automatic artist selection IDs have the form `collection:Art:artist:claude-monet`. Root collection IDs retain their previous form. Lowering the cutoff re-exposes the same IDs, but HomeKit may require restoring automations for accessories removed by an earlier higher cutoff.

The supplied Art library has an editable, subjective prominence scale calibrated to 30 artists and 20 movement/period/school groups at 0.8. See [the library rating inventory](../../docs/art-prominence.md). Folder-level movement tags classify the whole artist folder; they are broad navigation groups rather than artwork-by-artwork attribution.

HomeKit bridges support 149 bridged accessories. Very low cutoffs can exceed that, particularly alongside other plugins. Use a cutoff that fits the available bridge capacity; exposing the entire library requires splitting accessories across bridges. A child bridge separates this plugin from other plugins, but does not increase its own accessory limit. See [Homebridge child bridges](https://github.com/homebridge/homebridge/wiki/Child-Bridges).
