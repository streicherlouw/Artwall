#!/usr/bin/env python3
"""Index root album folders in place, retaining existing GPS/map metadata."""
import argparse,importlib.util,json,os,re
from pathlib import Path
from urllib.parse import quote
from PIL import Image
spec=importlib.util.spec_from_file_location('photo_import',Path(__file__).with_name('import.py'))
metadata=importlib.util.module_from_spec(spec);spec.loader.exec_module(metadata)

def scan(root):
 root=Path(root).resolve();root.mkdir(parents=True,exist_ok=True)
 old=json.loads((root/'playlist.json').read_text()) if (root/'playlist.json').exists() else []
 cached={s['src']:s for s in old};slides=[];albums=[];skipped=0;countries=None
 natural=lambda p:[int(t) if t.isdigit() else t.casefold() for t in re.split(r'(\d+)',str(p))]
 for folder in sorted(root.iterdir(),key=natural):
  if not folder.is_dir() or folder.is_symlink() or folder.name.startswith('.'):continue
  albums.append(folder.name)
  for directory,dirs,files in os.walk(folder,followlinks=False):
   dirs[:]=sorted([d for d in dirs if not d.startswith('.') and not (Path(directory)/d).is_symlink()],key=natural)
   for name in sorted(files,key=natural):
    p=Path(directory)/name
    if p.is_symlink() or name.startswith('.') or '.preview.' in name or name.startswith('contact-') or p.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):continue
    src='/media/'+quote(p.relative_to(root).as_posix(),safe='/');stamp=[p.stat().st_size,p.stat().st_mtime_ns]
    previous=cached.get(src)
    if previous and (previous.get('_file') is None or previous.get('_file')==stamp):
     slide={**previous,'album':folder.name,'_file':stamp}
    else:
     try:
      with Image.open(p) as image:
       location=metadata.gps(image);image.load()
     except Exception:skipped+=1;continue
     slide={'src':src,'name':p.stem,'album':folder.name,'_file':stamp}
     if location:
      if countries is None:countries=json.loads((Path(__file__).parent/'maps/countries.json').read_text())
      slide.update(location=location,map=metadata.country_map(location,countries))
    slides.append(slide)
 for name,data in [('playlist.json',slides),('albums.json',albums)]:
  temp=root/(name+'.scan.tmp');temp.write_text(json.dumps(data,separators=(',',':')));temp.replace(root/name)
 return {'albums':len(albums),'images':len(slides),'skipped':skipped}
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);args=parser.parse_args();config=json.loads(args.config.read_text());print(json.dumps(scan(args.config.parent/config['contentRoot'])))
