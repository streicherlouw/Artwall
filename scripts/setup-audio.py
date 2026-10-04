#!/usr/bin/env python3
"""Route installed Artwall audio modules to an available HDMI sink."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sink', help='Exact PipeWire node name; otherwise select the only available HDMI sink')
    parser.add_argument('--config', type=Path, default=Path.home()/'.config/artwall')
    args = parser.parse_args()
    nodes = json.loads(subprocess.check_output(['pw-dump'], text=True))
    sinks = [(n['id'], n.get('info', {}).get('props', {})) for n in nodes]
    sinks = [(i, p) for i, p in sinks if p.get('media.class') == 'Audio/Sink' and
             (p.get('node.name') == args.sink if args.sink else 'hdmi' in p.get('node.name', '').lower())]
    if len(sinks) != 1:
        raise SystemExit('Expected one HDMI sink. Run wpctl status and use --sink with its node.name to choose an output.')
    node_id, props = sinks[0]
    name = props['node.name']
    if not re.fullmatch(r'[A-Za-z0-9_.:-]+', name):
        raise SystemExit('Unsupported sink name')
    args.config.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='audio-backup-', dir=args.config))
    for module in ('airplay', 'splitflap'):
        file = args.config / (module + '.json')
        if not file.exists():
            continue
        data = json.loads(file.read_text())
        shutil.copy2(file, backup / file.name)
        if module == 'airplay':
            # Keep latency options on an existing PulseAudio sink.
            sink = data.get('audioSink') or 'pulsesink'
            if sink.split()[0] != 'pulsesink':
                raise SystemExit('AirPlay uses a custom audio sink; update it manually rather than replacing it.')
            sink = re.sub(r'\s+device=(?:"[^"]*"|\S+)', '', sink)
            data['audioSink'] = sink + ' device=' + name
        else:
            data['audioSink'] = name
        temp = file.with_suffix('.audio.tmp')
        temp.write_text(json.dumps(data, indent=2)+'\n')
        temp.chmod(file.stat().st_mode & 0o777)
        temp.replace(file)
    subprocess.run(['wpctl', 'set-default', str(node_id)], check=True)
    subprocess.run(['wpctl', 'set-mute', str(node_id), '0'], check=True)
    print('HDMI audio selected:', name)
    print('Configuration backup:', backup)
    print('Restart installed artwall-airplay and artwall-splitflap user services to apply.')


if __name__ == '__main__':
    main()
