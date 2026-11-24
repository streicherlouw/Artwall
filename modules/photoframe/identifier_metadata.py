"""Read content identifiers from the JSON next to a collage image."""
import json

def identifiers(image):
 sidecar=image.with_suffix('.json')
 if sidecar.is_symlink() or not sidecar.exists():return []
 try:
  data=json.loads(sidecar.read_text())
 except (ValueError,UnicodeError) as error:
  raise ValueError(f'{sidecar}: invalid collage JSON: {error}') from error
 if not isinstance(data,dict):return []
 photos=data.get('photos',[])
 if not isinstance(photos,list):return []
 result=set()
 for photo in photos:
  if not isinstance(photo,dict):continue
  analysis=photo.get('analysis',{})
  if not isinstance(analysis,dict):continue
  classifications=analysis.get('classifications',[])
  if not isinstance(classifications,list):continue
  for classification in classifications:
   if not isinstance(classification,dict):continue
   identifier=classification.get('identifier')
   if isinstance(identifier,str) and identifier.strip():result.add(identifier.strip())
 return sorted(result)
