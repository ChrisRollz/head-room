# /// script
# requires-python = ">=3.12"
# dependencies = []
# [tool.orcaslicer.plugin]
# name = "Head Room"
# version = "0.1.0"
# description = "Shape and save a personal reference head for cosplay helmets."
# ///
import base64
import json
import math
import os
from pathlib import Path
import tempfile

import orca

PAGE = "__HEAD_ROOM_PAGE__"
PROFILE_KEYS = {"width", "height", "length", "circumference"}
MAX_BYTES = 32 * 1024 * 1024


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


class HeadRoomPage(orca.pages.PagesPluginCapabilityBase):
    def get_name(self):
        return "Head Room"

    def get_ui(self):
        return PAGE

    def on_message(self, data):
        try:
            folder = Path(orca.host.plugin.storage())
            path = folder / "head.json"
            action = data.get("type")
            if action == "load":
                profile = validate_profile(json.loads(path.read_text("utf-8"))) if path.exists() else None
                self.post_message({"type": "loaded", "profile": profile})
            elif action == "save":
                profile = validate_profile(data.get("profile"))
                write_atomic(path, json.dumps(profile, allow_nan=False).encode())
                self.post_message({"type": "saved"})
            elif action == "export":
                stl = folder / "head-room.stl"
                write_atomic(stl, decode_mesh(data.get("data")))
                self.post_message({"type": "exported", "path": str(stl)})
        except (ValueError, OSError, RuntimeError, TypeError) as error:
            self.post_message({"type": "error", "message": str(error)})


@orca.plugin
class HeadRoom(orca.base):
    def register_capabilities(self):
        orca.register_capability(HeadRoomPage)
