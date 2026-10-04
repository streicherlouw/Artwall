import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installer', pathlib.Path(__file__).resolve().parents[1] / 'scripts/install-homebridge.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def test_install_and_repeat_preserve_existing_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            original = {'bridge': {'name': 'Existing'}, 'platforms': [{'platform': 'Other'}], 'accessories': [{'name': 'Existing'}]}
            config = root / 'config.json'
            config.write_text(json.dumps(original))
            config.chmod(0o600)
            installer.install(root, 'http://artwall.local:8767')
            first = json.loads(config.read_text())
            installer.install(root, 'http://different.local:8767')
            self.assertEqual(json.loads(config.read_text()), first)
            self.assertEqual(first['platforms'][0], original['platforms'][0])
            self.assertEqual(first['accessories'], original['accessories'])
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            target = root / 'node_modules' / installer.NAME
            self.assertTrue((target / 'index.js').is_file())
            self.assertFalse(target.is_symlink())
            self.assertEqual(len(list((root / 'backups').iterdir())), 2)

    def test_migrates_existing_symlink_without_changing_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'config.json').write_text('{}')
            source = root / 'old-source'
            source.mkdir()
            (source / 'keep').write_text('untouched')
            (root / 'node_modules').mkdir()
            (root / 'node_modules' / installer.NAME).symlink_to(source)
            installer.install(root, 'http://localhost:8767')
            self.assertEqual((source / 'keep').read_text(), 'untouched')

    def test_invalid_url_does_not_modify_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'config.json').write_text('{}')
            with self.assertRaises(ValueError):
                installer.install(root, 'file:///tmp/photos')
            self.assertEqual((root / 'config.json').read_text(), '{}')

if __name__ == '__main__':
    unittest.main()
