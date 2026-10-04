# UxPlay volume preservation

`uxplay-audio-volume.patch` applies to upstream [UxPlay v1.73.7](https://github.com/FDH2/UxPlay/tree/v1.73.7). It retains the latest requested gain even before audio SETUP and applies it before a newly selected audio pipeline starts. Explicit zero-volume commands remain muted. It does not change video decoding, synchronization, buffering or add a fade. The version suffix lets the installer distinguish the patched build from upstream.

The patch addresses lost or stale volume; it has not been established as a fix for sender-side silence or the reported rotation fade. The isolated regression harness exercises the actual patched C functions with GStreamer stubs; it does not simulate an iPhone or prove audible results.

`scripts/install-uxplay.sh` downloads the pinned source, applies the patch, runs `scripts/test-uxplay-volume.py` and builds/installs it. Re-running the normal Artwall installer upgrades an unpatched receiver unless `--no-deps` is selected. An explicit custom `uxplayPath` in receiver settings still takes precedence.

UxPlay and this derivative patch retain the upstream GPL-3.0-or-later license. See [upstream license](https://github.com/FDH2/UxPlay/blob/v1.73.7/LICENSE). Artwall's MIT license does not relicense UxPlay.
