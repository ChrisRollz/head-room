<img src="dist/cloud/head-room-icon.png" width="80" height="80" alt="Head Room mannequin with a measuring tape around its brow">

# Head Room for OrcaSlicer

Head Room 0.1.0 is a local development preview of the personal-head part of a cosplay helmet fitting plugin. It includes an original, low-detail procedural headform. The brow, eye sockets, nose and jaw are generic landmarks. The four measurements shape a reference mannequin.

## Try it

- Open `dist/HeadRoom.html` to try the same measurement screens in a desktop browser.
- In OrcaSlicer 2.5, open **Plugins**, choose **Install local plugin** from the **Browse plugins** dropdown, and select `dist/HeadRoom.py`. Activate **Head Room** and open its tab.
- Select **Make my head**. Enter the brow circumference, skull width above the ears, brow-to-back length and chin-to-crown height. The highlighted guide and head update as you enter each answer. Units may be mm, cm or inches.
- Select **Save my head** to keep one profile. **Use my own STL** accepts an ASCII or binary STL in millimetres up to 32 MiB. The preview may sample large imports. Export preserves the original imported bytes.
- **Export head STL** downloads the reference in the browser preview. In Orca it writes the file to the plugin's local storage and displays the path. Browser and Orca profiles are stored separately. The grid in the tab is a fitting view; use Orca's ordinary import if you want this reference in Prepare.

## Build

Run `python3 build.py` to regenerate the browser preview, local plugin and Orca Cloud upload (`dist/cloud/head_room_any.py`). The listing icon is `dist/cloud/head-room-icon.png`. Run `node tests/geometry.cjs` for landmark and STL checks. There are no runtime downloads or third-party mesh assets. The generated brow loop uses the measured axes and circumference together; if the dimensions exceed the model's supported shape range, Review shows the achieved circumference.

## Next milestone

Test a legitimately obtained Din Djarin helmet STL as a local fixture. Add helmet alignment around the eyes and brow; inspect cross-sections of the interior, derive uniform or independent-axis scale from the inside of the aligned shell, and preview optional padding in millimetres per side. Openings, missing interior surfaces and multipart shells need explicit handling before offering automatic scale for those cases. Pass only the accepted helmet to Prepare and verify its size after slicing. A review file can carry both meshes to Blender for local changes.

Keep wearer profiles local. The open-source package can ship with an original test shell. External helmet meshes require separate redistribution rights.

## Development references

- [Orca Pages API](https://www.orcaslicer.com/wiki/developer_reference/plugin_development/api_reference/pages)
- [Orca host API](https://github.com/OrcaSlicer/OrcaSlicer/wiki/host)
- [Local plugins](https://www.orcaslicer.com/wiki/plugin_development/)

Code and the procedural headform are available under the MIT license.
