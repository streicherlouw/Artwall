# UxPlay volume preservation

`uxplay-audio-volume.patch` applies to upstream [UxPlay v1.73.7](https://github.com/FDH2/UxPlay/tree/v1.73.7). It retains the latest requested gain even before audio SETUP and applies it before a newly selected audio pipeline starts. Explicit zero-volume commands remain muted. It does not change video decoding, synchronization, buffering or add a fade. The version suffix lets the installer distinguish the patched build from upstream.

The patch addresses lost or stale volume; it has not been established as a fix for sender-side silence or the reported rotation fade. The isolated regression harness exercises the actual patched C functions with GStreamer stubs; it does not simulate an iPhone or prove audible results.

`scripts/install-uxplay.sh` downloads the pinned source, applies the volume and timestamp patches, runs their regression harnesses and builds/installs it. Re-running the normal Artwall installer upgrades an unpatched receiver unless `--no-deps` is selected. An explicit custom `uxplayPath` in receiver settings still takes precedence.

UxPlay and this derivative patch retain the upstream GPL-3.0-or-later license. See [upstream license](https://github.com/FDH2/UxPlay/blob/v1.73.7/LICENSE). Artwall's MIT license does not relicense UxPlay.

## Optional audio-gap diagnostics

`uxplay-audio-trace.patch` applies after the volume patch. It is not part of the normal installer. When built in and `ARTWALL_AUDIO_TRACE=1` is set, it reports packet inter-arrival gaps, timestamp lead relative to the playback clock, and decoded levels before volume adjustment at 100 ms intervals. It does not save audio samples or change synchronization. These observations distinguish missing packets, decoded silence, and downstream output problems; they do not themselves fix those problems. Artwall timestamps the `ARTWALL_AUDIO` lines alongside video-format changes.

The temporary diagnostic deployment uses the user service drop-in `~/.config/systemd/user/artwall-airplay.service.d/audio-trace.conf`. Remove that file, reload the user systemd manager and restart `artwall-airplay` to disable measurement. The trace patch also retains UxPlay's GPL-3.0-or-later license.

## Mirror timestamp guard

`uxplay-audio-timestamps.patch` rejects synchronized AAC mirror frames scheduled more than five seconds ahead of the playback clock. During the October 4 test, provisional timestamps were approximately 15,443 seconds ahead for two seconds before correcting to roughly 180 ms. Queuing such frames can obstruct playback. The guard allows normal mirror timing, preserves ALAC and unsynchronized behavior, and resumes as soon as sane timestamps arrive. It does not manufacture missing startup audio or claim to fix the original rotation fade. The normal installer includes this patch and identifies the combined build as `1.73.7-artwall-audio2`.

The temporary level/packet instrumentation was removed from the Pi after YouTube malfunctioned during that test. The captured evidence cannot establish whether instrumentation contributed to that malfunction. The deployed timestamp guard contains no level instrumentation.

## Bounded resend wait for mirrored audio

`uxplay-mirror-resend.patch` limits AAC mirror retransmission waiting to a backlog of 12 packet positions (about 130 ms at 480 samples/44.1 kHz). Upstream waits until the 256-slot buffer is full, which can block roughly 2.8 seconds of later audio behind a lost packet. Once the short window fills, the patch skips the missing run and drains available packets immediately. Timely retransmissions and sequence-number wrap are covered by the regression harness. ALAC/audio-only retains the 256-slot policy.

This trades recovery of very late mirror packets for continuity. It cannot fill gaps where no later packets arrive. The October 4 rotation trace showed multi-second delivery gaps followed by bursts, consistent with this buffer behavior; the live rotation result still requires user confirmation. The combined build is `1.73.7-artwall-audio3`.

The affected `lib/raop_buffer` and RTP sources retain their upstream license notices (including LGPL-2.1-or-later where stated); the UxPlay executable retains its upstream GPL license. The normal installer applies all three fixes and runs their regression harnesses.
