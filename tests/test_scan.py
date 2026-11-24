import importlib.util,json,pathlib,tempfile,unittest
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('scan',ROOT/'modules/photoframe/scan.py');scanner=importlib.util.module_from_spec(spec);spec.loader.exec_module(scanner)
class ScanTests(unittest.TestCase):
 def test_dynamic_root_albums_nested_images_and_metadata(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);folder=root/'Holiday Japan';folder.mkdir();Image.new('RGB',(16,16),'blue').save(folder/'photo.png')
   first=scanner.scan(root);self.assertEqual(first['images'],1)
   playlist=json.loads((root/'playlist.json').read_text());playlist[0]['map']={'country':'Japan'};(root/'playlist.json').write_text(json.dumps(playlist))
   fourth=root/'Fourth';(fourth/'Nested').mkdir(parents=True);Image.new('RGB',(16,16),'red').save(fourth/'Nested/2.jpg');(root/'Empty').mkdir();(root/'HiddenLink').symlink_to(folder,target_is_directory=True)
   result=scanner.scan(root);self.assertEqual(result,{'albums':3,'images':2,'skipped':0});self.assertEqual(json.loads((root/'albums.json').read_text()),['Empty','Fourth','Holiday Japan'])
   slides=json.loads((root/'playlist.json').read_text());self.assertEqual(next(s for s in slides if s['album']=='Holiday Japan')['map']['country'],'Japan')
   (fourth/'Nested/2.jpg').unlink();(fourth/'Nested').rmdir();fourth.rmdir();scanner.scan(root);self.assertNotIn('Fourth',json.loads((root/'albums.json').read_text()))

class CollectionTests(unittest.TestCase):
 def test_membership_inheritance_overrides_and_rebuild(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);art=root/'Art';art.mkdir()
   def write(folder,data): (folder/'.artwall.json').write_text(json.dumps({'version':1,**data}))
   write(art,{'collections':[{'id':'impressionists','name':'Impressionists','match':{'movements':['impressionism']}},{'id':'monet','name':'Monet','match':{'artists':['monet']}}]})
   for artist in ['Monet, Claude (1840-1926)','Krøyer, Peder Severin (1851-1909)','Other']:
    folder=art/artist;folder.mkdir();Image.new('RGB',(16,16)).save(folder/'image.jpg')
    if artist!='Other':write(folder,{'artist':{'id':'monet' if artist.startswith('Monet') else 'kroyer'},'movements':['impressionism']})
   nested=art/'Monet, Claude (1840-1926)'/'Late';nested.mkdir();Image.new('RGB',(16,16)).save(nested/'late.jpg');write(nested,{'movements':['other']})
   scanner.scan(root);slides=json.loads((root/'playlist.json').read_text());groups=json.loads((root/'collections.json').read_text());self.assertEqual(len(groups),4);self.assertEqual(sum(c["kind"]=="artist" for c in groups),2)
   self.assertEqual(sum('collection:Art:impressionists' in s.get('collections',[]) for s in slides),2)
   self.assertEqual(sum('collection:Art:monet' in s.get('collections',[]) for s in slides),2)
   self.assertTrue(all(s['album']=='Art' for s in slides))
   (art/'.artwall.json').unlink();scanner.scan(root);self.assertTrue(all(c['kind']=='artist' for c in json.loads((root/'collections.json').read_text())));self.assertTrue(all('collection:Art:impressionists' not in s.get('collections',[]) for s in json.loads((root/'playlist.json').read_text())))
 def test_invalid_sidecar_preserves_published_index(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);art=root/'Art';art.mkdir();scanner.scan(root);before=(root/'playlist.json').read_text()
   (art/'.artwall.json').write_text('{"version":1,"movements":"wrong"}')
   with self.assertRaisesRegex(ValueError,'movements'):scanner.scan(root)
   self.assertEqual((root/'playlist.json').read_text(),before)

 def test_rated_artists_are_automatic_and_duplicate_folders_share_one_collection(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);art=root/'Art';art.mkdir()
   for name in ['Monet','Monet duplicate']:
    folder=art/name;folder.mkdir();Image.new('RGB',(16,16)).save(folder/'image.jpg')
    (folder/'.artwall.json').write_text(json.dumps({'version':1,'artist':{'id':'monet','name':name,'prominence':.98},'movements':['impressionism']}))
   (art/'.artwall.json').write_text(json.dumps({'version':1,'collections':[{'id':'impressionists','name':'Impressionists','prominence':.9,'match':{'movements':['impressionism']}}]}))
   scanner.scan(root);groups=json.loads((root/'collections.json').read_text());self.assertEqual(len(groups),2)
   artist=next(c for c in groups if c['kind']=='artist');self.assertEqual(artist['imageCount'],2);self.assertEqual(artist['prominence'],.98);self.assertEqual({s['artistLabel'] for s in json.loads((root/'playlist.json').read_text())},{'Monet','Monet duplicate'})
   self.assertEqual(next(c for c in groups if c['kind']=='movement')['prominence'],.9)
   data=json.loads((art/'Monet duplicate/.artwall.json').read_text());data['artist']['prominence']=.1;(art/'Monet duplicate/.artwall.json').write_text(json.dumps(data))
   before=(root/'collections.json').read_text()
   with self.assertRaisesRegex(ValueError,'conflicting metadata'):scanner.scan(root)
   self.assertEqual((root/'collections.json').read_text(),before)
 def test_invalid_ratings_and_automatic_artist_namespace(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);art=root/'Art';art.mkdir()
   for score in [-.1,1.1,True,'0.8',float('nan')]:
    (art/'.artwall.json').write_text(json.dumps({'version':1,'artist':{'id':'monet','prominence':score}}))
    with self.assertRaisesRegex(ValueError,'prominence'):scanner.scan(root)
   (art/'.artwall.json').write_text(json.dumps({'version':1,'artist':{'id':'monet','prominence':.8},'collections':[{'id':'artist:monet','name':'Collision','match':{'artists':['monet']}}]}))
   scanner.scan(root);groups=json.loads((root/'collections.json').read_text());self.assertEqual(len({c['id'] for c in groups}),2)

class IdentifierTests(unittest.TestCase):
 def test_supplied_collage_identifiers_and_cached_image_sidecar_changes(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);folder=root/'Art';folder.mkdir();image=folder/'Collage 12.png';Image.new('RGB',(16,16)).save(image)
   sidecar=image.with_suffix('.json');sidecar.write_text((ROOT/'tests/fixtures/kroyer-collage-identifiers.json').read_text())
   scanner.scan(root);slide=json.loads((root/'playlist.json').read_text())[0];self.assertIn('horse',slide['identifiers']);self.assertIn('child',slide['identifiers']);self.assertIn('blue_sky',slide['identifiers'])
   stamp=slide['_file'];sidecar.write_text(json.dumps({'photos':[{'analysis':{'classifications':[{'identifier':'boat'}]}}]}));scanner.scan(root);slide=json.loads((root/'playlist.json').read_text())[0];self.assertEqual(slide['identifiers'],['boat']);self.assertEqual(slide['_file'],stamp)
   sidecar.unlink();scanner.scan(root);self.assertNotIn('identifiers',json.loads((root/'playlist.json').read_text())[0])
 def test_only_classification_identifiers_are_indexed_and_invalid_json_preserves_index(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);folder=root/'Holiday Japan';folder.mkdir();image=folder/'collage.jpg';Image.new('RGB',(16,16)).save(image);sidecar=image.with_suffix('.json')
   sidecar.write_text(json.dumps({'identifier':'wrong','artwork':{'artists':[{'id':'horse'}]},'photos':[None,{'analysis':None},{'analysis':{'classifications':[None,{'identifier':12},{'identifier':'child'},{'identifier':'child'}]}}]}));scanner.scan(root);slide=json.loads((root/'playlist.json').read_text())[0];self.assertEqual(slide['identifiers'],['child'])
   before=(root/'playlist.json').read_text();sidecar.write_text('{broken')
   with self.assertRaisesRegex(ValueError,'collage.json'):scanner.scan(root)
   self.assertEqual((root/'playlist.json').read_text(),before)
   sidecar.unlink();sidecar.symlink_to(ROOT/'tests/fixtures/kroyer-collage-identifiers.json');scanner.scan(root);self.assertNotIn('identifiers',json.loads((root/'playlist.json').read_text())[0])

class TimingTests(unittest.TestCase):
 def test_art_photo_defaults_ancestor_inheritance_and_cached_refresh(self):
  with tempfile.TemporaryDirectory() as d:
   outer=pathlib.Path(d);root=outer/'content';root.mkdir();art=root/'Art';artist=art/'Artist';artist.mkdir(parents=True);photo=root/'Holiday Japan';photo.mkdir()
   for folder in [artist,photo]:Image.new('RGB',(16,16)).save(folder/'image.png')
   scanner.scan(root);slides=json.loads((root/'playlist.json').read_text());self.assertEqual(next(s for s in slides if s['album']=='Art')['timing'],{'intervalSeconds':20,'crossfadeSeconds':5});self.assertEqual(next(s for s in slides if s['album']=='Holiday Japan')['timing'],{'intervalSeconds':5,'crossfadeSeconds':.85})
   (outer/'.artwall.json').write_text(json.dumps({'version':1,'slideshow':{'intervalSeconds':30}}));(artist/'.artwall.json').write_text(json.dumps({'version':1,'slideshow':{'crossfadeSeconds':4}}));scanner.scan(root);slides=json.loads((root/'playlist.json').read_text());self.assertEqual(next(s for s in slides if s['album']=='Art')['timing'],{'intervalSeconds':30,'crossfadeSeconds':4});self.assertEqual(next(s for s in slides if s['album']=='Holiday Japan')['timing']['intervalSeconds'],30)
   (artist/'.artwall.json').write_text(json.dumps({'version':1,'slideshow':{'intervalSeconds':10,'crossfadeSeconds':0}}));scanner.scan(root);self.assertEqual(next(s for s in json.loads((root/'playlist.json').read_text()) if s['album']=='Art')['timing'],{'intervalSeconds':10,'crossfadeSeconds':0})
 def test_categories_and_artist_metadata_select_art_defaults_and_invalid_timing_preserves_index(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);folder=root/'Collection';folder.mkdir();Image.new('RGB',(16,16)).save(folder/'image.png')
   for data in [{'category':'Art'},{'categories':['artworks']},{'artist':{'id':'monet'}}]:
    (folder/'.artwall.json').write_text(json.dumps({'version':1,**data}));scanner.scan(root);self.assertEqual(json.loads((root/'playlist.json').read_text())[0]['timing']['intervalSeconds'],20)
   before=(root/'playlist.json').read_text()
   for fields in [{'intervalSeconds':0},{'intervalSeconds':86401},{'intervalSeconds':True},{'crossfadeSeconds':'5'},{'crossfadeSeconds':-1},{'intervalSeconds':10,'crossfadeSeconds':10},{'intervalSeconds':float('nan')}]:
    (folder/'.artwall.json').write_text(json.dumps({'version':1,'slideshow':fields}))
    with self.assertRaisesRegex(ValueError,'Seconds'):scanner.scan(root)
    self.assertEqual((root/'playlist.json').read_text(),before)

 def test_embedded_artists_use_art_timing_and_labels_survive_cached_rebuilds(self):
  from PIL.PngImagePlugin import PngInfo
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);folder=root/'Collection';folder.mkdir();info=PngInfo();info.add_itxt('Artwall',json.dumps({'version':1,'artists':[{'name':'Monet'}]}));Image.new('RGB',(16,16)).save(folder/'collage.png',pnginfo=info)
   for _ in range(2):
    scanner.scan(root);slide=json.loads((root/'playlist.json').read_text())[0];self.assertEqual(slide['artistLabel'],'Monet');self.assertEqual(slide['timing'],{'intervalSeconds':20,'crossfadeSeconds':5})

if __name__=='__main__':unittest.main()
