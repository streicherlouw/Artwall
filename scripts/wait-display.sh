#!/bin/sh
set -eu
for attempt in $(seq 1 90); do
 test -S "${XDG_RUNTIME_DIR:?}/${WAYLAND_DISPLAY:-wayland-0}" && exit 0
 sleep 1
done
echo 'No Wayland session. Run install.sh --setup-display or start your desktop.' >&2
exit 1
