# AirPlayReceiver

A standalone UxPlay receiver, installed with `./install.sh --modules airplay`. Initial dedicated-display setup additionally needs `--setup-display`. Configuration: `~/.config/artwall/airplay.json`; user service: `artwall-airplay.service`.

Select **Artwall** from an Apple device's screen-mirroring menu. The web page on port 8768 changes receiver name, frame rate, volume ceiling and screen-power handling. `GET /api/status` reports receiver state. `GET/POST /api/airplay/config` reads or updates those settings. Applying settings restarts the receiver and is refused during an active stream or PIN prompt.

The installer builds upstream UxPlay 1.73.7. The default decoder is `avdec_h264`, which works across Pi generations; advanced pipelines can be configured in the JSON file. Native Wayland rendering and PipeWire audio need the installing user's graphical session. AirPlay takes screen priority over the other display modules. A session can wake HDMI-A-1 and restores prior screen power afterward.

The receiver uses its own application directory and has no MagicMirror or PM2 integration. UxPlay is a separately installed upstream dependency with its own license. Actual streaming and audio quality depend on the sending device, network and attached display; test with your Apple device after installation.

Mirroring defaults to 1080p at 30 fps with timestamp-based audio/video synchronization (`-vsync 0` and synchronized sinks). This prioritizes lip-sync over minimum latency.
