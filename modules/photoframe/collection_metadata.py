"""Validated folder metadata for curated PhotoFrame collections."""
import json,math

def sidecar(directory):
 file=directory/'.artwall.json'
 if not file.exists() and not file.is_symlink():return {}
 try:
  if file.is_symlink():raise ValueError('sidecars cannot be symbolic links')
  data=json.loads(file.read_text())
  if not isinstance(data,dict) or data.get('version')!=1:raise ValueError('expected an object with version 1')
  if set(data)-{'version','artist','movements','collections'}:raise ValueError('unknown sidecar field')
  if 'artist' in data:
   artist=data['artist']
   if not isinstance(artist,dict) or not isinstance(artist.get('id'),str) or not artist['id'].strip():raise ValueError('artist requires a nonempty id')
   if set(artist)-{'id','name','prominence'}:raise ValueError('unknown artist field')
   if 'prominence' in artist:rating(artist['prominence'])
   if 'name' in artist and not isinstance(artist['name'],str):raise ValueError('artist name must be a string')
  if 'movements' in data:strings(data['movements'],'movements')
  if 'collections' in data:
   if not isinstance(data['collections'],list):raise ValueError('collections must be an array')
   ids=set()
   for collection in data['collections']:
    if not isinstance(collection,dict) or set(collection)-{'id','name','match','prominence'}:raise ValueError('invalid collection fields')
    for field in ('id','name'):
     if not isinstance(collection.get(field),str) or not collection[field].strip():raise ValueError('collection requires nonempty id and name')
    if collection['id'] in ids:raise ValueError('duplicate collection id')
    if 'prominence' in collection:rating(collection['prominence'])
    ids.add(collection['id']);match=collection.get('match')
    if not isinstance(match,dict) or not match or set(match)-{'artists','movements'}:raise ValueError('match requires artists and/or movements')
    for key,value in match.items():strings(value,key,nonempty=True)
  return data
 except (ValueError,TypeError) as error:raise ValueError(f'{file}: {error}') from error

def strings(value,field,nonempty=False):
 if not isinstance(value,list) or (nonempty and not value) or any(not isinstance(v,str) or not v.strip() for v in value):raise ValueError(f'{field} must be an array of nonempty strings')

def matches(metadata,query):
 # OR within each field, AND between fields.
 return all(metadata.get('artist',{}).get('id') in values if key=='artists' else bool(set(metadata.get('movements',[]))&set(values)) for key,values in query.items())

def rating(value):
 if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=1:raise ValueError('prominence must be a number from 0 to 1')
