#!/usr/bin/env python3
"""Index root album folders in place, retaining existing GPS/map metadata."""
import argparse,importlib.util,json,os,re
from pathlib import Path
from urllib.parse import quote
from PIL import Image
spec_col=importlib.util.spec_from_file_location("artwall_collections",Path(__file__).with_name("collection_metadata.py"))
collection_metadata=importlib.util.module_from_spec(spec_col);spec_col.loader.exec_module(collection_metadata)
spec_ident=importlib.util.spec_from_file_location("artwall_identifiers",Path(__file__).with_name("identifier_metadata.py"))
identifier_metadata=importlib.util.module_from_spec(spec_ident);spec_ident.loader.exec_module(identifier_metadata)
spec=importlib.util.spec_from_file_location('photo_import',Path(__file__).with_name('import.py'))
metadata=importlib.util.module_from_spec(spec);spec.loader.exec_module(metadata)

def scan(root,defaults=None):
 root=Path(root).resolve();root.mkdir(parents=True,exist_ok=True)
 old=json.loads((root/'playlist.json').read_text()) if (root/'playlist.json').exists() else []
 cached={s['src']:s for s in old};slides=[];albums=[];collections=[];skipped=0;countries=None
 # Ancestor timing is read once; root metadata continues to define collections.
 ancestor_timing={};ancestor_artwork=False
 for directory in reversed([root,*root.parents]):
  data=collection_metadata.sidecar(directory)
  ancestor_timing.update(data.get('slideshow',{}))
  ancestor_artwork=ancestor_artwork or collection_metadata.artwork_folder(data,directory.name)
 natural=lambda p:[int(t) if t.isdigit() else t.casefold() for t in re.split(r'(\d+)',str(p))]
 for folder in sorted(root.iterdir(),key=natural):
  if not folder.is_dir() or folder.is_symlink() or folder.name.startswith('.'):continue
  if folder.name=="all" or folder.name.startswith(("collection:","search:")):raise ValueError("Reserved root album name: "+folder.name)
  albums.append(folder.name)
  root_metadata=collection_metadata.sidecar(folder)
  definitions=root_metadata.get("collections",[])
  group_ids={c["id"]:"collection:"+quote(folder.name,safe="")+":"+quote(c["id"],safe="") for c in definitions}
  collections.extend({"id":group_ids[c["id"]],"name":c["name"],"album":folder.name,"prominence":c.get("prominence",1),"kind":"movement" if set(c["match"])=={"movements"} else "collection"} for c in definitions)
  artists={}
  inherited={};timings={root:ancestor_timing};artwork_folders={root:ancestor_artwork}
  for directory,dirs,files in os.walk(folder,followlinks=False):
   directory_path=Path(directory)
   data=root_metadata if directory_path==folder else collection_metadata.sidecar(directory_path)
   if directory_path!=folder and "collections" in data:raise ValueError(str(directory_path/".artwall.json")+": define collections only in root album folders")
   info={**inherited.get(directory_path.parent,{}),**{k:v for k,v in data.items() if k in ("artist","movements")}}
   inherited[directory_path]=info
   timing_fields={**timings[directory_path.parent],**data.get('slideshow',{})}
   timings[directory_path]=timing_fields
   artwork=artwork_folders[directory_path.parent] or collection_metadata.artwork_folder(data,directory_path.name)
   artwork_folders[directory_path]=artwork
   timing=collection_metadata.resolved_timing(timing_fields,artwork,directory_path/'.artwall.json',defaults)
   artist=info.get("artist",{})
   artist_group=None
   if artist.get("id"):
    artist_group="collection:"+quote(folder.name,safe="")+":artist:"+quote(artist["id"],safe="")
    entry={"id":artist_group,"name":artist.get("name",artist["id"]),"album":folder.name,"prominence":artist.get("prominence",0),"kind":"artist"}
    if artist_group in artists and artists[artist_group]['prominence']!=entry['prominence']:raise ValueError(str(directory_path/".artwall.json")+": conflicting metadata for artist "+artist["id"])
    artists.setdefault(artist_group,entry)
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
     refresh_location=not slide.get('_gpsIndexed',False)
    else:
     try:
      with Image.open(p) as image:image.verify()
     except Exception:skipped+=1;continue
     slide={'src':src,'name':p.stem,'album':folder.name,'_file':stamp}
     refresh_location=True
    if refresh_location:
     try:
      with Image.open(p) as image:location=metadata.gps(image)
     except Exception:skipped+=1;continue
     slide.pop('location',None);slide.pop('map',None)
     if location:
      if countries is None:countries=json.loads((Path(__file__).parent/'maps/countries.json').read_text())
      slide.update(location=location,map=metadata.country_map(location,countries))
     slide['_gpsIndexed']=True
    embedded_label=previous.get('_embeddedArtistLabel') if previous and previous.get('_file')==stamp else None
    if embedded_label is None:
     with Image.open(p) as image:
      raw=image.info.get('Artwall')
     embedded_label=''
     if isinstance(raw,str):
      try:artwork_data=json.loads(raw)
      except ValueError:artwork_data={}
      if isinstance(artwork_data,dict) and isinstance(artwork_data.get('artists'),list):
       embedded_label='\n'.join(dict.fromkeys(a['name'] for a in artwork_data['artists'] if isinstance(a,dict) and isinstance(a.get('name'),str) and a['name'].strip()))
    slide['_embeddedArtistLabel']=embedded_label
    label=embedded_label or info.get('artist',{}).get('name','')
    slide.pop('artistLabel',None)
    if label:slide['artistLabel']=label
    slide.pop('folderLabel',None)
    if not (artwork or bool(label)):
     folders=p.parent.relative_to(root).parts
     visible_folders=folders[1:] if len(folders)>1 else folders
     if visible_folders:slide['folderLabel']=' > '.join(visible_folders)
    slide["timing"]=collection_metadata.resolved_timing(timing_fields,artwork or bool(label),p,defaults)
    slide.pop("identifiers",None)
    identifiers=identifier_metadata.identifiers(p)
    if identifiers:slide["identifiers"]=identifiers
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
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);args=parser.parse_args();config=json.loads(args.config.read_text());print(json.dumps(scan(args.config.parent/config['contentRoot'],{'intervalSeconds':config.get('intervalMs',25000)/1000,'crossfadeSeconds':config.get('fadeMs',5000)/1000})))
