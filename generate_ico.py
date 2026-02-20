#!/usr/bin/env python3
"""Generate platform icons from a source logo, accepting SVG or PNG.

Usage:
    python generate_ico.py [path/to/logo.svg|png]

If the input is an SVG it will be rasterised at 1024×1024 using cairosvg
(install via `pip install cairosvg`). A temporary PNG is written to the
icons directory before the usual ICO generation.
"""

import os
import sys
import tempfile

from PIL import Image

# default locations inside workspace
workspace_root = r"e:\Copy\ClipPaste"
icons_dir = os.path.join(workspace_root, "src-tauri", "icons")

# determine source logo from CLI or default
if len(sys.argv) > 1:
    source_logo = sys.argv[1]
else:
    # prefer svg if it exists
    default_svg = os.path.join(icons_dir, "logo_source.svg")
    default_png = os.path.join(icons_dir, "logo_source.png")
    if os.path.exists(default_svg):
        source_logo = default_svg
    else:
        source_logo = default_png

if not os.path.exists(source_logo):
    print(f"❌ Source logo not found: {source_logo}")
    sys.exit(1)

# if we got an SVG, rasterise to PNG first
base_image_path = source_logo
if source_logo.lower().endswith('.svg'):
    try:
        import cairosvg
    except ImportError:
        print("❌ cairosvg is required to convert SVG. Install with `pip install cairosvg`.")
        sys.exit(1)
    # convert to a 1024×1024 PNG inside icons_dir
    png_path = os.path.join(icons_dir, "logo_source.png")
    print(f"Rasterising SVG -> {png_path} (1024x1024)")
    cairosvg.svg2png(url=source_logo, write_to=png_path, output_width=1024, output_height=1024)
    base_image_path = png_path

ico_path = os.path.join(icons_dir, "icon.ico")

try:
    img = Image.open(base_image_path)

    # Convert to RGBA if needed for better icon quality
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # Create ICO with multiple sizes for better quality
    sizes = [16, 32, 64, 128, 256]
    img_sizes = [img.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]

    # Save as ICO
    img_sizes[0].save(
        ico_path,
        format='ICO',
        sizes=[(s, s) for s in sizes]
    )
    print(f"✓ Generated: icon.ico (sizes: {', '.join(str(s) for s in sizes)})")
except Exception as e:
    print(f"❌ Error generating icon.ico: {e}")

