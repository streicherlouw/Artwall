#!/usr/bin/env python3
"""Index root album folders in place, retaining existing GPS/map metadata."""
import argparse,importlib.util,json,os,re
from pathlib import Path
from urllib.parse import quote
from PIL import Image
spec_col=importlib.util.spec_from_file_location("artwall_collections",Path(__file__).with_name("collection_metadata.py"))
collection_metadata=importlib.util.module_from_spec(spec_col);spec_col.loader.exec_module(collection_metadata)
spec=importlib.util.spec_from_file_location('photo_import',Path(__file__).with_name('import.py'))
metadata=importlib.util.module_from_spec(spec);spec.loader.exec_module(metadata)

def scan(root):
 root=Path(root).resolve();root.mkdir(parents=True,exist_ok=True)
 old=json.loads((root/'playlist.json').read_text()) if (root/'playlist.json').exists() else []
 cached={s['src']:s for s in old};slides=[];albums=[];collections=[];skipped=0;countries=None
 natural=lambda p:[int(t) if t.isdigit() else t.casefold() for t in re.split(r'(\d+)',str(p))]
 for folder in sorted(root.iterdir(),key=natural):
  if not folder.is_dir() or folder.is_symlink() or folder.name.startswith('.'):continue
  if folder.name=="all" or folder.name.startswith("collection:"):raise ValueError("Reserved root album name: "+folder.name)
  albums.append(folder.name)
  root_metadata=collection_metadata.sidecar(folder)
  definitions=root_metadata.get("collections",[])
  group_ids={c["id"]:"collection:"+quote(folder.name,safe="")+":"+quote(c["id"],safe="") for c in definitions}
  collections.extend({"id":group_ids[c["id"]],"name":c["name"],"album":folder.name,"prominence":c.get("prominence",1),"kind":"movement" if set(c["match"])=={"movements"} else "collection"} for c in definitions)
  artists={}
  inherited={}
  for directory,dirs,files in os.walk(folder,followlinks=False):
   directory_path=Path(directory)
   data=root_metadata if directory_path==folder else collection_metadata.sidecar(directory_path)
   if directory_path!=folder and "collections" in data:raise ValueError(str(directory_path/".artwall.json")+": define collections only in root album folders")
   info={**inherited.get(directory_path.parent,{}),**{k:v for k,v in data.items() if k in ("artist","movements")}}
   inherited[directory_path]=info
   artist=info.get("artist",{})
   artist_group=None
   if "prominence" in artist:
    artist_group="collection:"+quote(folder.name,safe="")+":artist:"+quote(artist["id"],safe="")
    entry={"id":artist_group,"name":artist.get("name",artist["id"]),"album":folder.name,"prominence":artist["prominence"],"kind":"artist"}
    if artist_group in artists and artists[artist_group]!=entry:raise ValueError(str(directory_path/".artwall.json")+": conflicting metadata for artist "+artist["id"])
    artists[artist_group]=entry
   memberships=[group_ids[c["id"]] for c in definitions if collection_metadata.matches(info,c["match"])]
   if artist_group:memberships.append(artist_group)
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
    slide.pop("collections",None)
    if memberships:slide["collections"]=memberships
    slides.append(slide)
  collections.extend(artists.values())
 for collection in collections:
  collection["imageCount"]=sum(collection["id"] in slide.get("collections",[]) for slide in slides)
 for name,data in [('playlist.json',slides),('albums.json',albums),('collections.json',collections)]:
  temp=root/(name+'.scan.tmp');temp.write_text(json.dumps(data,separators=(',',':')));temp.replace(root/name)
 return {'albums':len(albums),'images':len(slides),'skipped':skipped}
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);args=parser.parse_args();config=json.loads(args.config.read_text());print(json.dumps(scan(args.config.parent/config['contentRoot'])))
