# /// script
# requires-python = ">=3.12"
# dependencies = []
# [tool.orcaslicer.plugin]
# name = "Head Room"
# version = "0.3.1"
# description = "Create a personal head, try on a cosplay helmet and open the fitted shell in OrcaSlicer."
# ///
import base64
from contextlib import closing, contextmanager
import json
import math
import os
import re
import shutil
import sqlite3
import struct
import subprocess
import sys
from pathlib import Path
import tempfile

import orca

PAGE = "__HEAD_ROOM_PAGE__"
PROFILE_KEYS = {"width", "height", "length", "circumference"}
MAX_BYTES = 32 * 1024 * 1024
MAX_HELMET = 96 * 1024 * 1024


def decode_mesh(value):
    if not isinstance(value, str) or len(value) > 4 * ((MAX_BYTES + 2) // 3):
        raise ValueError("STL exceeds the 32 MiB import limit.")
    data = base64.b64decode(value, validate=True)
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Invalid STL length.")
    return data


def validate_profile(value):
    if not isinstance(value, dict):
        raise ValueError("Invalid head profile.")
    name = value.get("name")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        raise ValueError("Use a head name of 1 to 80 characters.")
    if value.get("kind") == "stl":
        decode_mesh(value.get("data"))
        return {"kind": "stl", "name": name, "data": value["data"]}
    values = value.get("values")
    if value.get("kind") != "measured" or not isinstance(values, dict) or set(values) != PROFILE_KEYS:
        raise ValueError("Complete all four measurements.")
    if any(type(n) not in (int, float) or not math.isfinite(n) or not 10 <= n <= 1500 for n in values.values()):
        raise ValueError("Invalid measurement.")
    return {"kind": "measured", "name": name, "values": values}


def write_atomic(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
        temp_path = Path(file.name)
        try:
            file.write(data)
            file.close()
            os.replace(temp_path, path)
        finally:
            temp_path.unlink(missing_ok=True)


@contextmanager
def head_library(folder):
    with closing(sqlite3.connect(folder / "heads.sqlite3")) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS heads (id TEXT PRIMARY KEY, name TEXT NOT NULL, profile TEXT NOT NULL)")
        legacy = folder / "head.json"
        if legacy.is_file() and db.execute("SELECT 1 FROM heads WHERE id = 'current'").fetchone() is None:
            head = validate_profile(json.loads(legacy.read_text("utf-8")))
            db.execute("INSERT OR IGNORE INTO heads VALUES ('current', ?, ?)", (head["name"], json.dumps(head)))
        yield db


class HeadRoomPage(orca.pages.PagesPluginCapabilityBase):
    upload = None

    def cancel_upload(self):
        if self.upload is not None:
            self.upload.close()
            Path(self.upload.name).unlink(missing_ok=True)
            self.upload = None

    def begin_helmet(self, folder, data):
        self.cancel_upload()
        size = data.get("size")
        if type(size) is not int or not 134 <= size <= MAX_HELMET or (size - 84) % 50:
            raise ValueError("Fitted helmet must be a binary STL under 96 MiB.")
        name = re.sub(r"[^\w .()-]", "_", str(data.get("name", "")))[:140].strip(" .")
        if not name.lower().endswith("-fitted.stl"):
            name = "helmet-fitted.stl"
        self.output = folder / name
        self.expected = size
        self.upload = tempfile.NamedTemporaryFile(mode="w+b", dir=folder, delete=False)
        self.post_message({"type": "helmetReady", "offset": 0})

    def append_chunk(self, data):
        if self.upload is None or data.get("offset") != self.upload.tell():
            raise ValueError("Helmet transfer interrupted. Try again.")
        encoded = data.get("data")
        if not isinstance(encoded, str) or not 0 < len(encoded) <= 512 * 1024:
            raise ValueError("Invalid helmet chunk.")
        chunk = base64.b64decode(encoded, validate=True)
        if self.upload.tell() + len(chunk) > self.expected:
            raise ValueError("Helmet exceeds the announced size.")
        self.upload.write(chunk)
        self.post_message({"type": "helmetReady", "offset": self.upload.tell()})

    def open_helmet(self):
        if self.upload is None or self.upload.tell() != self.expected:
            raise ValueError("Helmet transfer incomplete.")
        self.upload.seek(80)
        triangles, = struct.unpack("<I", self.upload.read(4))
        if 84 + 50 * triangles != self.expected:
            raise ValueError("Invalid fitted STL.")
        temp = self.upload.name
        self.upload.close()
        os.replace(temp, self.output)
        self.upload = None
        try:
            if sys.platform == "darwin":
                subprocess.run(["/usr/bin/open", "-b", "com.orcaslicer.OrcaSlicer", str(self.output)], check=True, timeout=15)
            else:
                candidates = [sys.executable, os.environ.get("APPIMAGE", ""), shutil.which("orca-slicer") or ""]
                if sys.platform == "win32":
                    candidates.append(str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "OrcaSlicer" / "orca-slicer.exe"))
                executable = next((p for p in candidates if p and re.fullmatch(r"orca-?slicer(?:[._-].*)?", Path(p).name, re.I) and Path(p).is_file()), None)
                if not executable:
                    raise OSError("Could not locate the OrcaSlicer application.")
                subprocess.Popen([executable, str(self.output)])
        except (OSError, RuntimeError, subprocess.SubprocessError):
            self.post_message({"type": "helmetResult", "message": "The fitted STL is ready. Open this file in OrcaSlicer.", "path": str(self.output)})
        else:
            self.post_message({"type": "helmetResult", "message": "Sent the fitted helmet to OrcaSlicer. Open Prepare to check the plate."})

    def get_name(self):
        return "Head Room"

    def get_ui(self):
        return PAGE

    def on_message(self, data):
        try:
            folder = Path(orca.host.plugin.storage())
            action = data.get("type")
            if action == "load":
                with head_library(folder) as db:
                    heads = [{"id": key, "name": name} for key, name in db.execute("SELECT id, name FROM heads ORDER BY rowid DESC")]
                self.post_message({"type": "loaded", "heads": heads})
            elif action == "getHead":
                with head_library(folder) as db:
                    row = db.execute("SELECT profile FROM heads WHERE id = ?", (data.get("id"),)).fetchone()
                if row is None:
                    raise ValueError("That saved head could not be found.")
                self.post_message({"type": "head", "id": data["id"], "profile": json.loads(row[0])})
            elif action == "save":
                key = data.get("id")
                if not isinstance(key, str) or not re.fullmatch(r"[0-9a-f]{32}", key):
                    raise ValueError("Invalid head ID.")
                head = validate_profile(data.get("profile"))
                payload = json.dumps(head, sort_keys=True, allow_nan=False)
                with head_library(folder) as db:
                    added = db.execute("INSERT OR IGNORE INTO heads VALUES (?, ?, ?)", (key, head["name"], payload))
                    if not added.rowcount and db.execute("SELECT profile FROM heads WHERE id = ?", (key,)).fetchone()[0] != payload:
                        raise ValueError("A different head already uses this ID.")
                self.post_message({"type": "saved", "id": key})
            elif action == "export":
                stl = folder / "head-room.stl"
                write_atomic(stl, decode_mesh(data.get("data")))
                self.post_message({"type": "exported", "path": str(stl)})
            elif action == "helmetBegin":
                self.begin_helmet(folder, data)
            elif action == "helmetChunk":
                self.append_chunk(data)
            elif action == "helmetOpen":
                self.open_helmet()
        except (ValueError, OSError, RuntimeError, TypeError, sqlite3.Error) as error:
            if data.get("type") in ("helmetBegin", "helmetChunk", "helmetOpen"):
                self.cancel_upload()
            self.post_message({"type": "error", "message": str(error), "id": data.get("id")})


@orca.plugin
class HeadRoom(orca.base):
    def register_capabilities(self):
        orca.register_capability(HeadRoomPage)
