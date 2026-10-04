import importlib.util,pathlib,subprocess,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('installer',ROOT/'scripts/install.py');installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
class InstallerTests(unittest.TestCase):
 def test_preserves_user_preferences_and_adds_defaults(self):
  self.assertEqual(installer.merge({'web':{'port':8766,'host':'0.0.0.0'},'fps':60},{'web':{'port':9000},'custom':True}),{'web':{'port':9000,'host':'0.0.0.0'},'fps':60,'custom':True})
 def test_each_module_installable_alone(self):
  for module in installer.MANIFEST:
   result=subprocess.run([sys.executable,str(ROOT/'scripts/install.py'),'--dry-run','--modules',module],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stderr);self.assertIn('Install: '+module,result.stdout)
 def test_unknown_module_rejected(self):
  self.assertNotEqual(subprocess.run([sys.executable,str(ROOT/'scripts/install.py'),'--dry-run','--modules','unknown'],capture_output=True).returncode,0)
if __name__=='__main__':unittest.main()
