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

Metadata applies to all images in a folder and its descendants. A deeper sidecar can replace `artist` or `movements`, for example to classify an artist's periods separately; `"movements": []` clears inherited movements. Missing fields inherit. Movement and artist IDs are case-sensitive; use consistent IDs. Multiple values in one match field mean OR; specifying both artists and movements means AND. An artist with an `id` automatically gets an indexed artist collection, using `artist.name` as its label. The Artists checklist controls whether it has a HomeKit button. Explicit collection `name` is its switch label. Define `collections` only in root album sidecars. A root sidecar can also supply inherited artist/movement metadata.

Collection IDs must be unique within their root album. Keep IDs unchanged when relabeling a switch: Homebridge preserves its accessory identity and automations. Artist folder renames do not change collection identity. Renaming the root album or a collection ID creates a new identity. Root album names `all` and those starting with `collection:` are reserved.

Click **Rebuild HomeKit Switches** after changing metadata. Invalid JSON, invalid fields, or duplicate IDs fail the rebuild with the offending sidecar path before replacing the published index. Empty collections are listed in the rebuild result and retain switches, but cannot be activated. Removing a selected collection, or removing its last image, stops playback and resets selection to all. Shuffle uses the existing slideshow setting: enable it for randomized artwork order; artists with more images receive proportionally more screen time.

The scanner writes `collections.json` (IDs, labels, root albums, prominence, kind and image counts) and per-image collection memberships in `playlist.json`. API responses include `collections`; their IDs also appear in `albums` for the existing selection API. For example, select Impressionists with `{"album":"collection:Art:impressionists","on":true}` at `POST /api/slideshow/album`. The web selector displays readable collection labels. Update both PhotoFrame and the Homebridge plugin for this feature; the plugin never reads photo folders itself.

Copy or synchronize the complete album tree, including hidden `.artwall.json` files, into the configured `contentRoot`. The single-folder import command does not recursively import an artist tree or copy sidecars.


### HomeKit selection and legacy ratings

Use the scrollable **Artists** and **Movements** checklists and press **Save HomeKit buttons** to choose which collections receive switches. Every root album always receives a switch. Selection changes reach Homebridge on its next poll, require no rescan, and do not stop an already playing collection. All collections remain available for playback in the web selector.

Legacy prominence ratings remain valid metadata but no longer control button visibility. Duplicate artist folders can share an ID and contribute to one artist collection. Rebuild the library after changing sidecar membership. Folder-level movement tags classify the whole artist folder rather than individual artworks.

HomeKit bridges support 149 bridged accessories, so select a set that fits the bridge alongside other accessories. A child bridge separates this plugin from other plugins but does not increase its own accessory limit.


## Temporary collections by collage content

In the slideshow admin page, use **Temporary collection by content**:

1. Choose a **Base folder**, such as Art or Holiday Japan. Root folders include their descendants; artist and movement collections are not base-folder choices.
2. Enter identifier words, such as `horse child`, separated by spaces or commas.
3. Click **Find collages** to preview the matching count and up to ten collage names.
4. Click **Play matching collages** to start the temporary slideshow. **Clear temporary collection** restores the saved album selection.

Every search word must match an identifier word somewhere in the collage's combined photo classifications. Matching is case-insensitive and uses whole words: `horse` does not match `seahorse`, and `child` does not automatically match `children`. Underscores and punctuation separate words, so `blue_sky` contributes `blue` and `sky`. Unicode text is normalized. No confidence cutoff is applied; low-confidence identifiers are included, as in the supplied Krøyer collage containing both horse and child. Search results use the existing shuffle setting.

Put the JSON sidecar next to the image with the same basename: `Collage 12.jpg` and `Collage 12.json`. The scanner reads only string identifiers at `photos[].analysis.classifications[].identifier`, combines them across all photos and stores them in the image's indexed `identifiers` field. Artist IDs, filenames and unrelated JSON fields are not searched. Images without identifiers do not match. Symbolic-link sidecars are ignored. Malformed collage JSON fails the rebuild with its file path, preserving the previous index.

Rebuild the library after adding or editing collage JSON. Identifier metadata is refreshed even when image bytes have not changed. It is separate from folder `.artwall.json` metadata and HomeKit button selection.

The selected search is held in memory; no collection file, saved configuration entry or HomeKit switch is created. It lasts until cleared, replaced by another search or a normal album selection, or PhotoFrame restarts. Saving settings with an explicit album selection also clears it. Stop/Play retains the temporary filter, as do ordinary timing-setting changes without an album selection. If a rebuild removes its last match, playback stops and the temporary selection clears. AirPlay priority and display handoff rules still apply; failed and empty searches leave the previous selection intact. During temporary playback, root/artist/movement HomeKit switches stay off. Clearing it restores the previously saved album; if playback is already running it continues with that album.

API: `POST /api/slideshow/search` with `{"action":"preview","album":"Art","terms":"horse child"}` returns `count`, normalized `terms` and a `sample` of names. Use action `play` to activate the search, or `{"action":"clear"}` to clear it. Empty matches can be previewed but cannot be played. `GET /api/status` includes `searchCollection` with the base album, terms and current count (or null); `rootAlbums` lists the available base folders. Temporary playback uses the runtime selection ID `search:temporary`; root folder names beginning with `search:` are reserved.

## Folder slideshow timing

Version 1 `.artwall.json` files accept optional timing alongside existing artist, movement, category and collection metadata:

```json
{
  "version": 1,
  "slideshow": { "intervalSeconds": 20, "crossfadeSeconds": 5 }
}
```

The scanner walks ancestors through the containing image folder, merging the two fields independently; the nearest specified field wins. Rebuild the library after edits. Each indexed slide carries resolved timing, including in mixed albums, movement collections and temporary content searches. Artwork folders (Art, art/artwork categories or artist metadata) default to 20/5 seconds; photos default to 5/0.85. Embedded PNG Artwall artist metadata also supplies artist labels and artwork defaults. Folder category metadata accepts `"category":"Art"` or `"categories":["Art"]`.

The interval measures fade-start to fade-start and includes the fade. Loading can extend it: the player always waits for decoding. The current slide controls the next advance time, and the incoming slide controls its opacity transition. The previous image stays opaque underneath until the transition finishes. Artist labels sit within image layers and fade with them. Reduced motion disables visual fades without changing the progression interval; zero crossfade cuts immediately. Manual navigation and pause/resume reset the timer; hidden tabs pause progression and one-image playlists never auto-advance.

Timing values must be finite JSON numbers, not booleans or strings: `0 < intervalSeconds <= 86400` and `0 <= crossfadeSeconds < intervalSeconds`. Invalid values fail indexing with the sidecar path and preserve the published playlist. The two fields can appear separately, but their resolved combination must be valid.

**Use folder slideshow timing** is on by default in the admin page. Turn it off to apply the page's manual interval and fade controls to all slides. Legacy playlists without timing also use those controls. Configuration: `"useFolderTiming": true`.


## Manual HomeKit choices and Pictures playback

The slideshow configuration page has scrollable **Artists** and **Movements** checklists. Tick the entries you want, then **Save HomeKit buttons**. All indexed artists are offered, including those without importance ratings. Root folders always receive switches. Button selections persist as `selectedArtistIds` and `selectedMovementIds` in PhotoFrame settings; importance no longer controls publication. The API rejects unknown, duplicate or wrong-kind IDs. Removing a button does not stop a currently playing album or remove it from the configuration page's playback choices. New indexed artists and movements are unchecked by default. On the deployed Pi, the previous 30 artist and 20 movement switches were migrated to checked entries. Fresh installs start with empty lists. Existing selection IDs remain stable; artist button labels continue using surnames and collision numbering.

When the selected root album is **Pictures** (case insensitive), its immediate child folders are shuffled as groups. Every image from one child plays in natural relative filename order before moving to the next child. Deeper descendants stay with their immediate child; root-level images form their own group. Pictures overrides the image-shuffle checkbox. Other albums keep their existing shuffle behavior. Folder ordering is randomized each time the player playlist loads; it repeats that folder sequence until the next load. No files are copied to make these groups.

### Playback album navigation

The Album selector has Folders, Art Movements and Artists sections. Movements and artists are alphabetical. Pictures folders appear as an indented tree, including nested descendants with supported images; the selected folder’s full path appears below the selector. Selecting a Pictures subfolder plays only its subtree in natural filename order. Selecting Pictures retains shuffled child-folder playback. Subfolder choices do not create additional HomeKit switches.
