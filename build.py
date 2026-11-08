"""Build the local Orca plugin and desktop-browser preview with the standard library."""
from pathlib import Path

root = Path(__file__).resolve().parent
source = root / "src"
dist = root / "dist"
dist.mkdir(exist_ok=True)
page = (source / "page.html").read_text()
for key, file in [("GEOMETRY", "geometry.js"), ("VIEW", "view.js"), ("APP", "app.js")]:
    page = page.replace(f"/*{key}*/", (source / file).read_text())
license_text = (root / "LICENSE").read_text()
page += "\n<!--\n" + license_text + "-->\n"
host = (source / "host.py").read_text().replace('"__HEAD_ROOM_PAGE__"', repr(page))
compile(host, "HeadRoom.py", "exec")
(dist / "HeadRoom.py").write_text(host)
(dist / "HeadRoom.html").write_text(page)
cloud = dist / "cloud"
cloud.mkdir(exist_ok=True)
(cloud / "head_room_any.py").write_text(host)
