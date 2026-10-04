import importlib.util,json,pathlib,subprocess,sys,tempfile,unittest
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('importer',ROOT/'modules/photoframe/import.py');importer=importlib.util.module_from_spec(spec);spec.loader.exec_module(importer)
class ImportTests(unittest.TestCase):
 def test_import_preserves_bytes_gps_order_and_other_albums(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);source=root/'input';source.mkdir();library=root/'library';library.mkdir()
   exif=Image.Exif();exif[34853]={1:'N',2:(35.0,41.0,0.0),3:'E',4:(139.0,41.0,0.0)}
   Image.new('RGB',(32,20),'blue').save(source/'photo-2.png',exif=exif)
   Image.new('RGB',(32,20),'red').save(source/'photo-10.jpg')
   old={'src':'/media/old.png','album':'Previous','name':'old'};(library/'playlist.json').write_text(json.dumps([old]))
   config=root/'frame.json';config.write_text(json.dumps({'contentRoot':str(library)}))
   command=[sys.executable,str(ROOT/'modules/photoframe/import.py'),'--config',str(config),str(source),'--album','Japan']
   subprocess.run(command,check=True,capture_output=True)
   slides=json.loads((library/'playlist.json').read_text());self.assertEqual([s['name'] for s in slides],['old','photo-2','photo-10'])
   self.assertEqual(slides[1]['map']['country'],'Japan');self.assertAlmostEqual(slides[1]['location']['latitude'],35+41/60)
   self.assertNotIn('map',slides[2]);self.assertEqual((source/'photo-2.png').read_bytes(),(library/'Japan/photo-2.png').read_bytes())
   subprocess.run(command,check=True,capture_output=True);self.assertEqual(len(json.loads((library/'playlist.json').read_text())),3)
 def test_unmapped_ocean_has_no_false_country(self):
  countries=json.loads((ROOT/'modules/photoframe/maps/countries.json').read_text())
  self.assertIsNone(importer.country_map({'latitude':0,'longitude':-140},countries))
if __name__=='__main__':unittest.main()
