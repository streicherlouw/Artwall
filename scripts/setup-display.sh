#!/bin/bash
set -euo pipefail
# Dedicated appliance session; explicitly selected with --setup-display.
artwall_user=$(id -un)
artwall_home=$HOME
backup="$HOME/.local/share/artwall/backups/display-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup" "$HOME/.config/labwc"
chmod 700 "$backup"
if test -f /etc/greetd/config.toml; then sudo cp /etc/greetd/config.toml "$backup/greetd-config.toml"; fi
if test -f "$HOME/.config/labwc/autostart"; then cp "$HOME/.config/labwc/autostart" "$backup/labwc-autostart"; fi
if ! grep -q 'Artwall session environment' "$HOME/.config/labwc/autostart" 2>/dev/null; then
 cat >> "$HOME/.config/labwc/autostart" <<'SESSION'
# Artwall session environment
systemctl --user import-environment WAYLAND_DISPLAY DISPLAY XDG_CURRENT_DESKTOP
systemctl --user start pipewire.service pipewire-pulse.service wireplumber.service
SESSION
fi
chmod +x "$HOME/.config/labwc/autostart"
cat > "$backup/new-greetd.toml" <<CONFIG
[terminal]
vt = 7
[default_session]
command = "/usr/bin/labwc"
user = "$artwall_user"
[initial_session]
command = "/usr/bin/labwc"
user = "$artwall_user"
CONFIG
sudo install -m 644 "$backup/new-greetd.toml" /etc/greetd/config.toml
sudo systemctl enable greetd.service
sudo systemctl restart greetd.service
