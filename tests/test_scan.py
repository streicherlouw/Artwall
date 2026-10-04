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
if __name__=='__main__':unittest.main()
