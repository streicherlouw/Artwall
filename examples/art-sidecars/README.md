# Art library sidecars

Versioned copy of the 403 `.artwall.json` files added to the Art library. This directory contains metadata only; artwork is not included. Its root sidecar defines 50 rated movement/period/school collections, and the 402 folder sidecars describe 394 distinct artists and two mixed collections.

To restore metadata, copy each `.artwall.json` into the matching folder under your Art album, including the root sidecar. Keep hidden files when synchronizing. Review existing sidecars before overwriting them. Rebuild HomeKit Switches after restoring or editing metadata. The default prominence cutoff of 0.8 exposes 30 artist collections and 20 movement collections, alongside Art.

See [the ratings inventory](../../docs/art-prominence.md) and [the PhotoFrame sidecar format](../../modules/photoframe/README.md#curated-collections-artists-and-movements).
