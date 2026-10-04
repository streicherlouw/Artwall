#!/bin/sh
# Install only the optional Homebridge plugin; leave other Artwall modules alone.
set -eu
ARTWALL_SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$ARTWALL_SOURCE/scripts/install-homebridge.py" "$@"
