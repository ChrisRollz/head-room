"""Exercise the native page messages with temporary plugin storage."""
import base64
import hashlib
import json
from pathlib import Path
import runpy
import struct
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

    def test_helmets_persist_original_and_two_independent_fits(self):
        chunk = 384*1024
        source = bytes(range(256))*1600
        key = hashlib.sha256(source).hexdigest()
        def call(action, **fields):
            result = self.send('shelf'+action, id=key, requestId=12, **fields)
            self.assertEqual(result["requestId"],12)
            return result
        self.assertFalse(call("Begin",size=len(source))["exists"])
        self.assertIn("error",call("Save",head=None))
        self.assertFalse(call("List")["items"])
        call("Begin",size=len(source))
        for offset in range(0,len(source),chunk):
            self.assertNotIn("error",call("Chunk",offset=offset,data=base64.b64encode(source[offset:offset+chunk]).decode()))
        pose = dict(rotation=[1,0,0,0,1,0,0,0,1],offset=[3,1,2],scale=[.85]*3,uniform=True,padding=4)
        self.assertNotIn("error",call("Save",name="Shell.stl",thumb="data:image/png;base64,AA==",head="current",pose=pose))
        self.assertTrue(call("Begin",size=len(source))["exists"])
        different = dict(pose,scale=[1.2]*3)
        self.assertNotIn("error",call("Save",head="1"*32,pose=different))
        self.assertEqual(len(call("List")["items"]),1)
        for head,expected in [("current",pose),("1"*32,different),("2"*32,None)]:
            first = call("Read",offset=0,head=head)
            self.assertEqual(first["pose"],expected)
            self.assertEqual(base64.b64decode(first["data"])+base64.b64decode(call("Read",offset=chunk,head=head)["data"]),source)

    def test_fitted_file_survives_interrupted_transfer_and_denied_launch(self):
        data = bytes(80) + struct.pack('<I', 1) + bytes(50)
        filename = 'Workshop-fitted.stl'
        output = self.folder / filename
        output.write_bytes(b'previous')
        self.send('helmetBegin', name=filename, size=len(data))
        self.assertEqual(self.send('helmetChunk', offset=17, data='AAAA')['type'], 'error')
        self.assertEqual(output.read_bytes(), b'previous')
        for denied in [True, False]:
            self.assertEqual(self.send('helmetBegin', name=filename, size=len(data))['offset'], 0)
            for offset in [0, 80]:
                part = data[offset:80] if offset == 0 else data[offset:]
                answer = self.send('helmetChunk', offset=offset, data=base64.b64encode(part).decode())
                self.assertEqual(answer['offset'], offset + len(part))
            with patch.object(sys, 'platform', 'darwin'), patch('subprocess.run', side_effect=PermissionError if denied else None) as launch:
                answer = self.send('helmetOpen')
                launch.assert_called_once_with(['/usr/bin/open', '-b', 'com.orcaslicer.OrcaSlicer', str(output)], check=True, timeout=15)
            self.assertEqual(answer['type'], 'helmetResult')
            self.assertEqual(answer.get('path'), str(output) if denied else None)
            self.assertEqual(output.read_bytes(), data)
        self.assertEqual(list(self.folder.iterdir()), [output])


if __name__ == '__main__':
    unittest.main()
