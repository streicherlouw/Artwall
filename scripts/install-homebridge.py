#!/usr/bin/env python3
"""Link the optional album-switch plugin into an existing Homebridge installation."""
import argparse,json,pathlib,shutil,time
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--storage',type=pathlib.Path,default=pathlib.Path('/var/lib/homebridge'));parser.add_argument('--url',default='http://127.0.0.1:8767');args=parser.parse_args()
source=pathlib.Path(__file__).resolve().parent.parent/'modules/photoframe/homebridge';config=args.storage/'config.json';data=json.loads(config.read_text());backup=args.storage/'backups'/('artwall-'+time.strftime('%Y%m%d-%H%M%S'));backup.mkdir(parents=True,mode=0o700);shutil.copy2(config,backup/'config.json')
name='homebridge-artwall-photoframe';target=args.storage/'node_modules'/name
if target.is_symlink():target.unlink()
elif target.exists():raise RuntimeError('Existing plugin directory is not a managed symlink; leave it in place and update manually')
target.symlink_to(source,target_is_directory=True)
platforms=data.setdefault('platforms',[])
if not any(p.get('platform')=='ArtwallPhotoFrame' for p in platforms):platforms.append({'platform':'ArtwallPhotoFrame','name':'Artwall PhotoFrame','baseUrl':args.url,'pollInterval':5})
temp=config.with_suffix('.artwall.tmp');temp.write_text(json.dumps(data,indent=2)+'\n');temp.chmod(config.stat().st_mode&0o777);temp.replace(config)
print('Album-switch plugin installed. Restart Homebridge to load it; subsequent folder changes are automatic.')
