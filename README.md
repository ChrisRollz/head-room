<img src="dist/cloud/head-room-icon.png" width="80" height="80" alt="Head Room mannequin with a measuring tape around its brow">

# Head Room for OrcaSlicer

Create a personal reference head and try on cosplay helmets in OrcaSlicer. Head Room 0.2.1 keeps a library of measured heads and imported head scans. Each save adds a separate head, even when two have the same name. An existing head from 0.1.0 or 0.2.0 appears in the saved-head picker after the update.

## Install

- Open the [Head Room listing](https://cloud.orcaslicer.com/app/plugins/plugin-hub/47a2a727-e5bd-4a1a-a51e-2cc40e8730f9) and choose **Subscribe**. In OrcaSlicer, sign in with the same account, open **File → Plugins**, click **Refresh**, and check **Activate** beside Head Room.
- To install a local build in OrcaSlicer 2.5.0, open **File → Plugins**, click the arrow to the left of **Install plugin**, choose **Install local plugin**, then click the newly labeled button. Select `dist/cloud/head_room_any.py` and activate it. Reuse that filename when updating to keep the same local plugin identity.
- For a standalone browser preview, open `dist/HeadRoom.html`. The browser keeps its own saved heads and downloads the fitted helmet.

## Try on a helmet

1. Choose **Make my head** for four guided measurements, or **Use my own STL** for a head scan in millimetres (up to 32 MiB). Choose **Add to saved heads**. Next time, pick a name under **Your saved heads** and choose **Use saved head**.
2. Choose **Choose helmet STL**. Use a single assembled shell in millimetres, up to 96 MiB. The shell starts centered on the head. **Align helmet** turns it in quarter turns and moves it in millimetres. Line up the visor and chin before sizing.
3. Compare the head and helmet in **3D**, **Side section** and **Front section**. The section lines show the actual head (mint) and shell (gold) triangles cut by the middle plane. Change the scale uniformly or by axis. To estimate a starting scale, enter padding per side and click **Estimate scale**. The estimate samples the first inner wall in both horizontal directions along each axis through the helmet center, and the inner crown above it. Open or ambiguous samples leave the scale unchanged. Check the visor, nose, jaw and entry opening yourself.
4. Choose **Open fitted helmet in OrcaSlicer**. Only the fitted helmet goes to Orca, with all the original triangles. Orca may ask for permission to open it. On macOS it uses the normal open-document event. On Windows and Linux it launches a discoverable OrcaSlicer executable with the fitted STL, which may open another window. If the application cannot be opened, the page gives the path to the fitted file. Use **Head details** to export the mannequin separately if needed.

The opening screen includes [Uncle Jessy’s printable cosplay calipers](https://www.printables.com/model/14099-cosplay-calipers/files). The face is an approximate mannequin. The plugin currently uses brow circumference, skull width, brow-to-back depth and chin-to-crown height. Ear-to-ear crown arc and nose projection are possible future refinements.

## Build

Run `python3 build.py` to regenerate the preview and plugin. Run `node tests/geometry.cjs` and `node tests/fit.cjs` for the geometry and STL checks. Run `python3 tests/profiles.py` to check migration and preservation of same-name heads. You may pass a local high-detail helmet STL to `tests/fit.cjs` to verify that export preserves every triangle. The Orca Cloud upload and icon are in `dist/cloud/`.

Code and the original procedural headform are available under the MIT license. Wearer profiles stay local. Head Room has no runtime downloads and includes no third-party helmet files.
