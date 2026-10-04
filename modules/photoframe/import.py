#!/usr/bin/env python3
"""Import images into PhotoFrame; preserve originals, build offline GPS overlays."""
import argparse,json,math,re,shutil,sys
from pathlib import Path
from urllib.parse import quote
from PIL import Image,ExifTags

def unwrap(ring):
    previous=ring[0][0];out=[]
    for x,y in ring:
        x+=360*round((previous-x)/360);out.append((x,y));previous=x
    return out

def contains(lon,lat,ring):
    ring=unwrap(ring);x=lon+360*round((sum(p[0] for p in ring)/len(ring)-lon)/360);inside=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>lat)!=(b[1]>lat) and x<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]:inside=not inside
    return inside

def distance(lon,lat,ring):
    ring=unwrap(ring);x=lon+360*round((sum(p[0] for p in ring)/len(ring)-lon)/360);sx=max(.01,math.cos(math.radians(lat)));best=math.inf
    for a,b in zip(ring,ring[1:]):
        ax=(a[0]-x)*sx;ay=a[1]-lat;dx=(b[0]-a[0])*sx;dy=b[1]-a[1];t=max(0,min(1,-(ax*dx+ay*dy)/max(1e-20,dx*dx+dy*dy)));best=min(best,math.hypot(ax+t*dx,ay+t*dy)*111.2)
    return best

def country_map(location,countries):
    lon,lat=location['longitude'],location['latitude'];country=None
    for c in countries:
        if any(contains(lon,lat,p[0]) and not any(contains(lon,lat,h) for h in p[1:]) for p in c['polygons']):country=c;break
    if country is None:
        nearest=30
        for c in countries:
            for p in c['polygons']:
                d=distance(lon,lat,p[0])
                if d<nearest:nearest=d;country=c
    if country is None:return None
    rings=[]
    for polygon in country['polygons']:
        for original in polygon:
            ring=unwrap(original);mean=sum(p[0] for p in ring)/len(ring);shift=360*round((lon-mean)/360);rings.append([(x+shift,y) for x,y in ring])
    ys=[y for ring in rings for x,y in ring];coslat=max(.05,math.cos(math.radians((min(ys)+max(ys))/2)))
    rings=[[(x*coslat,-y) for x,y in ring] for ring in rings];points=[p for ring in rings for p in ring]+[(lon*coslat,-lat)]
    minx,maxx=min(x for x,y in points),max(x for x,y in points);miny,maxy=min(y for x,y in points),max(y for x,y in points);scale=min(208/max(.001,maxx-minx),168/max(.001,maxy-miny))
    def project(x,y):return (120+(x-(minx+maxx)/2)*scale,100+(y-(miny+maxy)/2)*scale)
    outline=''.join(''.join(('M' if i==0 else 'L')+'%.2f,%.2f'%project(x,y) for i,(x,y) in enumerate(ring))+'Z' for ring in rings)
    px,py=project(lon*coslat,-lat)
    return {'country':country['name'],'path':outline,'pinX':px,'pinY':py}

def gps(image):
    data=image.getexif().get_ifd(34853)
    if 2 not in data or 4 not in data:return None
    def degrees(parts):return float(parts[0])+float(parts[1])/60+float(parts[2])/3600
    lat=degrees(data[2])*(-1 if data.get(1)=='S' else 1);lon=degrees(data[4])*(-1 if data.get(3)=='W' else 1)
    if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:return None
    return {'latitude':lat,'longitude':lon}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);parser.add_argument('folder',type=Path);parser.add_argument('--album');args=parser.parse_args()
    folder=args.folder.resolve();album=args.album or folder.name
    if not folder.is_dir():parser.error('Input folder does not exist')
    if not album or album in ('.','..') or '/' in album or '\\' in album:parser.error('Album must be a simple name')
    config=json.loads(args.config.read_text());root=(args.config.parent/config['contentRoot']).resolve();root.mkdir(parents=True,exist_ok=True)
    if folder==root or root in folder.parents or folder in root.parents:parser.error('Import source must be outside the media library')
    countries=json.loads((Path(__file__).parent/'maps/countries.json').read_text());target=root/album;target.mkdir(exist_ok=True)
    existing=json.loads((root/'playlist.json').read_text()) if (root/'playlist.json').exists() else []
    def natural(p):return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)',p.name)]
    files=sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in ('.png','.jpg','.jpeg','.webp') and '.preview.' not in p.name and not p.name.startswith('contact-')],key=natural)
    if not files:parser.error('No supported images found')
    slides=[]
    for p in files:
        try:
            with Image.open(p) as image:location=gps(image);image.load()
        except Exception as e:raise RuntimeError(f'Cannot import {p.name}: {e}') from e
        dest=target/p.name;temporary=dest.with_name(dest.name+'.tmp');shutil.copy2(p,temporary);temporary.replace(dest)
        slide={'src':'/media/'+quote(album,safe='')+'/'+quote(p.name,safe=''),'name':p.stem,'album':album}
        if location:slide.update(location=location,map=country_map(location,countries))
        slides.append(slide)
    merged=[s for s in existing if s['album']!=album]+slides
    temp=root/'playlist.json.tmp';temp.write_text(json.dumps(merged,separators=(',',':')));temp.replace(root/'playlist.json')
    print(f'Imported {len(slides)} images into {album}. Restart playback to load the album.')
if __name__=='__main__':main()
