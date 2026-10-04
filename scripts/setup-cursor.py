#!/usr/bin/env python3
"""Install a transparent Xcursor theme used by labwc and Wayland clients."""
from pathlib import Path
import os,signal,struct,subprocess
home=Path.home();theme=home/'.local/share/icons/ArtwallHidden';cursors=theme/'cursors';cursors.mkdir(parents=True,exist_ok=True)
# Xcursor file header, one TOC entry, one image chunk, one transparent ARGB pixel.
# Format: https://xorg.freedesktop.org/archive/X11R6.8.1/doc/Xcursor.3.html
kind=0xfffd0002
(cursors/'left_ptr').write_bytes(struct.pack('<17I',0x72756358,16,0x10000,1,kind,24,28,36,kind,24,1,1,1,0,0,0,0))
(theme/'index.theme').write_text('[Icon Theme]\nName=ArtwallHidden\nComment=Transparent cursor for the Artwall display\n')
names=set('default arrow pointer hand hand1 hand2 crosshair text xterm wait progress watch move grab grabbing not-allowed help zoom-in zoom-out all-scroll copy alias context-menu cell vertical-text e-resize w-resize n-resize s-resize ne-resize nw-resize se-resize sw-resize ew-resize ns-resize nesw-resize nwse-resize col-resize row-resize'.split())
for base in [Path('/usr/share/icons'),Path('/usr/share/cursors')]:
 for directory in base.glob('**/cursors'):
  names.update(p.name for p in directory.iterdir() if p.is_file())
for name in names-{'left_ptr'}:
 p=cursors/name
 if not p.exists() and not p.is_symlink():p.symlink_to('left_ptr')
env=home/'.config/labwc/environment.d';env.mkdir(parents=True,exist_ok=True)
(env/'artwall-cursor.env').write_text('XCURSOR_THEME=ArtwallHidden\nXCURSOR_SIZE=24\n')
print('Installed transparent Artwall cursor theme')

# labwc reloads environment files on SIGHUP; SSH sessions do not have LABWC_PID.
pids=subprocess.run(['pgrep','-u',str(os.getuid()),'-x','labwc'],capture_output=True,text=True)
for value in pids.stdout.split():
 try:os.kill(int(value),signal.SIGHUP)
 except ProcessLookupError:pass
