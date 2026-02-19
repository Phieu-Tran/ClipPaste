#!/usr/bin/env python3
"""Generate .ico file from the source logo."""

from PIL import Image
import os

source_logo = r"e:\Copy\ClipPaste\src-tauri\icons\logo_source.png"
icons_dir = r"e:\Copy\ClipPaste\src-tauri\icons"
ico_path = os.path.join(icons_dir, "icon.ico")

try:
    img = Image.open(source_logo)
    
    # Convert to RGBA if needed for better icon quality
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Create ICO with multiple sizes for better quality
    img_sizes = [
        img.resize((16, 16), Image.Resampling.LANCZOS),
        img.resize((32, 32), Image.Resampling.LANCZOS),
        img.resize((64, 64), Image.Resampling.LANCZOS),
        img.resize((128, 128), Image.Resampling.LANCZOS),
        img.resize((256, 256), Image.Resampling.LANCZOS),
    ]
    
    # Save as ICO
    img_sizes[0].save(ico_path, format='ICO', sizes=[(size.width, size.height) for size in img_sizes])
    print(f"✓ Generated: icon.ico (multiple sizes: 16x16, 32x32, 64x64, 128x128, 256x256)")
    
except Exception as e:
    print(f"❌ Error generating icon.ico: {e}")
