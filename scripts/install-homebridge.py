#!/usr/bin/env python3
"""Install PhotoFrame switches into an existing Homebridge (without replacing it)."""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import urllib.parse

NAME = 'homebridge-artwall-photoframe'


def install(storage, url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('--url must be an HTTP(S) PhotoFrame URL without credentials')
    config = storage / 'config.json'
    data = json.loads(config.read_text())
    platforms = data.setdefault('platforms', [])
    if not isinstance(platforms, list):
        raise ValueError('Homebridge platforms must be an array')
    if not any(p.get('platform') == 'ArtwallPhotoFrame' for p in platforms):
        platforms.append({'platform': 'ArtwallPhotoFrame', 'name': 'Artwall PhotoFrame',
                          'baseUrl': url.rstrip('/'), 'pollInterval': 5})
    source = pathlib.Path(__file__).resolve().parent.parent / 'modules/photoframe/homebridge'
    target = storage / 'node_modules' / NAME
    if target.exists() and not target.is_symlink():
        if json.loads((target / 'package.json').read_text()).get('name') != NAME:
            raise ValueError('Refusing to replace an unrelated plugin directory')
    stat = config.stat()
    backups = storage / 'backups'
    backups.mkdir(exist_ok=True)
    backup = pathlib.Path(tempfile.mkdtemp(prefix='artwall-', dir=backups))
    shutil.copy2(config, backup / 'config.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = pathlib.Path(tempfile.mkdtemp(prefix='.artwall-', dir=target.parent))
    moved = False
    try:
        for name in ('index.js', 'package.json', 'config.schema.json', 'README.md', 'LICENSE'):
            shutil.copy2(source / name, stage / name)
        shutil.copytree(source / 'homebridge-ui', stage / 'homebridge-ui')
        stage.chmod(0o755)
        temp = backup / 'new-config.json'
        temp.write_text(json.dumps(data, indent=2) + '\n')
        temp.chmod(stat.st_mode & 0o777)
        if os.geteuid() == 0:
            for file in (backup, backup / 'config.json', temp, stage, *stage.rglob('*')):
                os.chown(file, stat.st_uid, stat.st_gid)
        if target.exists() or target.is_symlink():
            target.rename(backup / 'plugin')
            moved = True
        stage.rename(target)
        try:
            temp.replace(config)
        except Exception:
            shutil.rmtree(target)
            raise
    except Exception:
        if moved and not target.exists():
            (backup / 'plugin').rename(target)
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    print(f'Installed {NAME} in {target}. Backup: {backup}')
    print('Existing platform settings were preserved. Use Rebuild HomeKit Switches after changing folders.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--storage', type=pathlib.Path, default=pathlib.Path('/var/lib/homebridge'))
    parser.add_argument('--url', default='http://127.0.0.1:8767', help='PhotoFrame URL for a new platform entry')
    parser.add_argument('--restart', action='store_true', help='Restart the system Homebridge service after installation')
    args = parser.parse_args()
    install(args.storage.resolve(), args.url)
    if args.restart:
        subprocess.run(['systemctl', 'restart', 'homebridge'], check=True)
        print('Homebridge restarted.')
    else:
        print('Restart Homebridge once using its admin UI to load the plugin.')


if __name__ == '__main__':
    main()
