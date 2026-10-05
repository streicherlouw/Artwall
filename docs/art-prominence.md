# Art library prominence inventory

The library at `/Users/Streicher/Pictures/ArtWallPhotos/Art` has 402 immediate folders: 400 artist folders representing 394 distinct artists, plus two mixed collections. All folders receive `.artwall.json`; the Art root receives the rated movement catalog. Every distinct artist has a prominence score, as do all 50 movement, period, school and navigation groups.

Ratings are editorial choices for this library, calibrated to the requested default, rather than externally measured fame or historical importance. Scores are editable in the sidecars. Artist-folder tags include broad periods and schools and can overlap. They cover an artist's whole folder, so collections do not claim that every artwork represents every tagged movement. Use deeper folder overrides for more precise classification.

| Cutoff | Artist switches | Movement/group switches | Art switches |
|---|---:|---:|---:|
| 0 | 394 | 50 | 1 |
| 0.4 | 394 | 50 | 1 |
| 0.5 | 278 | 50 | 1 |
| 0.6 | 198 | 40 | 1 |
| 0.7 | 147 | 30 | 1 |
| 0.8 | 30 | 20 | 1 |
| 0.9 | 18 | 10 | 1 |
| 1 | 1 | 1 | 1 |

Other root photo albums are additional switches and are unaffected by the cutoff. The complete editable reference inventory is [art-prominence.csv](art-prominence.csv); sidecars are authoritative at runtime. CSV changes alone do not update sidecars.

## Artist aliases and mixed collections

Duplicate Van Gogh, Jean Hey and Gerard Horenbout folders share artist IDs. The apparent Frans Francken alias (`Ancken, Frans II`), duplicate Duccio folders, and Perugino/Pietro Vannucci folders also share IDs. No folders or artworks were renamed.

`Moxon, Edward` contains illustrations by multiple artists; it is tagged Pre-Raphaelite without falsely attributing its artwork to the publisher. `Russia painting 1850-1910` is tagged Russian Realism/Realism without inventing a single artist. Both remain included in Art and their movement collections. The folder titled Ambrosius Bosschaert II has dates and filenames for Bosschaert the Elder; its sidecar uses the Elder's identity.

## Artists at 0.8

| Switch | Score |
|---|---:|
| Leonardo da Vinci | 1.00 |
| Michelangelo | 0.99 |
| Picasso | 0.99 |
| Monet | 0.98 |
| Van Gogh | 0.98 |
| Rembrandt | 0.97 |
| Raphael | 0.96 |
| Vermeer | 0.96 |
| Dalí | 0.95 |
| Matisse | 0.94 |
| Cézanne | 0.93 |
| Kandinsky | 0.93 |
| Klimt | 0.92 |
| Renoir | 0.92 |
| Frida Kahlo | 0.91 |
| Munch | 0.91 |
| Goya | 0.90 |
| Velázquez | 0.90 |
| Botticelli | 0.89 |
| Caravaggio | 0.89 |
| Dürer | 0.88 |
| Rubens | 0.88 |
| J. M. W. Turner | 0.87 |
| Manet | 0.87 |
| Magritte | 0.86 |
| Klee | 0.85 |
| Pollock | 0.84 |
| Rothko | 0.83 |
| Seurat | 0.82 |
| Hopper | 0.80 |

## Classification references

These museum references informed the movement vocabulary and key identity checks; the individual ratings are our curation choices. Many folder-level assignments are inferred from the artists' known periods and styles, rather than verified against each image.

- [The Met: Impressionism](https://www.metmuseum.org/essays/impressionism-art-and-modernity)
- [The Met: Post-Impressionism](https://www.metmuseum.org/essays/post-impressionism)
- [MoMA: Cubism](https://www.moma.org/collection/terms/cubism)
- [National Gallery of Art: Romanticism](https://www.nga.gov/artworks/romanticism)
- [National Gallery: Ambrosius Bosschaert the Elder](https://www.nationalgallery.org.uk/artists/ambrosius-bosschaert-the-elder)
- [British Museum: Moxon-published Tennyson illustrations](https://www.britishmuseum.org/collection/object/P_1862-1011-133)

HomeKit's per-bridge accessory limit means low cutoffs may require multiple bridges. The 0.8 default adds 51 accessories for Art; 0.7 adds 178. See [Homebridge child bridges](https://github.com/homebridge/homebridge/wiki/Child-Bridges).
