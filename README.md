<img src="dist/cloud/head-room-icon.png" width="80" height="80" alt="A silver helmet outline over a mint mannequin wearing a gold measuring tape">

# Head Room for OrcaSlicer

Create a personal reference head and try on cosplay helmets in OrcaSlicer. Head Room 0.5.0 keeps a library of measured heads and imported head scans. Each save adds a separate head, even when two have the same name. An existing head from 0.1.0 or 0.2.0 appears in the portrait library after the update.

## Install

- Open the [Head Room listing](https://cloud.orcaslicer.com/app/plugins/plugin-hub/47a2a727-e5bd-4a1a-a51e-2cc40e8730f9) and choose **Subscribe**. In OrcaSlicer, sign in with the same account, open **File → Plugins**, click **Refresh**, and check **Activate** beside Head Room.
- To install a local build in OrcaSlicer 2.5.0, open **File → Plugins**, click the arrow to the left of **Install plugin**, choose **Install local plugin**, then click the newly labeled button. Select `dist/cloud/head_room_any.py` and activate it. Reuse that filename when updating to keep the same local plugin identity.
- For a standalone browser preview, open `dist/HeadRoom.html`. The browser keeps its own saved heads and downloads the fitted helmet.

Local and Cloud installations have separate head libraries. Update the installation you already use; only one Head Room page can be active at a time. Switching between the two can make saved heads appear to disappear.

## Try on a helmet

1. Choose **Make my head** for four guided measurements, or **Use my own STL** for a head scan in millimetres (up to 32 MiB). Choose **Add to saved heads**. Next time, click its portrait under **Your heads**.
2. Drop your helmet STL onto the preview, or click **Choose helmet STL**. Use a single assembled shell in millimetres, up to 96 MiB. The shell starts centered on the head. Drag **Move** arrows or **Rotate** rings to position the helmet on its local axes. Drag the background to orbit, scroll to zoom, and Shift-drag or middle-drag to pan. **Reset view** resets the camera. **Precise alignment** offers translations and quarter turns. Line up the visor and chin before sizing.
3. Compare the head and helmet in **3D**, **Front cut**, **Side cut** and **Top cut**. The section lines show the actual head (mint) and shell (gold) triangles at the selected plane. Slide the cut through the shell to check clearances. Drag in a cut to move the shell in that plane; arrow keys nudge it by 1 mm. The 3D viewport draws every helmet triangle. Use the opacity slider to reveal the head; it starts at 50%. Change the helmet scale uniformly or by axis. The reference head and camera keep their size. Enter **Preview padding (mm)** to see representative foam patches on the inner shell in 3D and in the cuts. Open **Foam locations and clearances** to choose the pads you plan to use, inspect one in a cut, or read its remaining room. Measurements are at pad centers and assume uncompressed foam. Ambiguous inner walls are labeled; they never receive an invented pad. **Suggest helmet scale** previews a change. Apply it explicitly. When padding is enabled, it preserves your current proportions.
4. Click **Save fit…** while fitting. Name the fit and accept the next version or type your own. **Helmets → saved fits** opens that exact wearer, alignment, scale, and pad layout. Editing and saving again keeps the older versions and the source STL. A fit from 0.4.0 appears as **Original fit · v1**. **Open fitted helmet in OrcaSlicer** sends only the shell, with a versioned filename when saved. New handoffs do not overwrite old files. The browser preview downloads the same STL.
5. In **Top cut**, sweep to the opening, expand **Check the entry opening**, then **Measure opening** or send a 4 mm test band to Orca. A closed contour gives width and depth; an open-front helmet yields an open band when the section is unambiguous. Printed gauges test the selected section, not the entire path onto the head.

## Refine or modify a head

The first four measurements stay the same. At review, choose **Refine visor and ear fit** for crown-to-eye height, pupil distance, back-of-head to nose tip, and separate left and right ear stand-off. Each is optional. The cyan markers show eye position; if only one eye measurement was supplied the other dimension is estimated. For an existing measured head, choose its portrait and **Modify head**. The wizard reopens with saved values; **Save head revision** adds a new profile and preserves earlier heads and their fits. For a scan, **Make measured copy** starts a separate editable reference.

## Back up your library

From the heads screen, **Library backup → Back up library** includes the measurements, head scans, original shells and named fits in one local `.headroom` file. In Orca choose **Show backup file** and copy it somewhere outside plugin storage; the browser downloads the archive. **Restore backup…** checks the archive and adds missing items without replacing existing files. Restoring the same archive twice does not duplicate items. Cloud and local installs otherwise maintain separate libraries. No wearer data goes online.

## Build

Run `python3 build.py` to regenerate the preview and plugin. Run `node tests/geometry.cjs` and `node tests/fit.cjs` for the geometry and STL checks. Run `python3 tests/profiles.py` to check migration and preservation of same-name heads. You may pass a local high-detail helmet STL to `tests/fit.cjs` to verify that export preserves every triangle. On macOS with Chrome, run `node tests/viewport.cjs /path/to/helmet.stl` to exercise actual mouse gestures, stable framing, opacity and the full triangle count in an isolated profile. On other platforms set `CHROME_BIN` to the browser executable. With Playwright and Chrome installed, run `node tests/navigation.cjs` to test the guide, library, imported heads, fit changes, downloads, and handoff recovery. The Orca Cloud upload and icon are in `dist/cloud/`.

Head Room and its procedural headform are available under the MIT license. The offline 3D viewport bundles Three.js r128, OrbitControls and TransformControls ([MIT notice](src/vendor/LICENSE)). A device without WebGL can still use all three cuts and numeric alignment. Wearer profiles stay local. Head Room has no runtime downloads and includes no third-party helmet files.
