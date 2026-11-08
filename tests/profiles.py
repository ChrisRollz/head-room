"""Exercise the native page messages with temporary plugin storage."""
import base64
import json
from pathlib import Path
import runpy
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class HeadLibraryTest(unittest.TestCase):
    def setUp(self):
        storage = tempfile.TemporaryDirectory()
        self.addCleanup(storage.cleanup)
        self.folder = Path(storage.name)
        api = SimpleNamespace(pages=SimpleNamespace(PagesPluginCapabilityBase=object),
                              base=object, plugin=lambda cls: cls,
                              host=SimpleNamespace(plugin=SimpleNamespace(storage=lambda: storage.name)))
        with patch.dict(sys.modules, orca=api):
            self.page = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'src/host.py'))['HeadRoomPage']()
        self.page.post_message = lambda answer: setattr(self, 'reply', answer)
        self.measured = dict(kind='measured', name='Sample', values=dict(width=155, height=225, length=195, circumference=560))
        self.scan = dict(kind='stl', name='Sample', data=base64.b64encode(b'sample mesh bytes').decode())

    def send(self, action, **data):
        self.page.on_message(dict(type=action, **data))
        return self.reply

    def test_add_keeps_legacy_and_same_named_heads(self):
        legacy = self.folder / 'head.json'
        legacy.write_text(json.dumps(self.measured))
        self.assertEqual(self.send('load')['heads'], [dict(id='current', name='Sample')])
        for key, head in [('1'*32, self.scan), ('2'*32, self.measured), ('1'*32, self.scan)]:
            self.assertEqual(self.send('save', id=key, profile=head)['type'], 'saved')
        self.assertEqual(self.send('save', id='1'*32, profile=self.measured)['type'], 'error')
        self.assertEqual([h['id'] for h in self.send('load')['heads']], ['2'*32, '1'*32, 'current'])
        for key, head in [('current', self.measured), ('1'*32, self.scan), ('2'*32, self.measured)]:
            self.assertEqual(self.send('getHead', id=key)['profile'], head)
        self.assertEqual(json.loads(legacy.read_text()), self.measured)


if __name__ == '__main__':
    unittest.main()
