#!/usr/bin/env python3
"""Generate all logo sizes from the source logo."""

from PIL import Image
import os

# Path to source logo and output directory
source_logo = r"e:\Copy\ClipPaste\src-tauri\icons\logo_source.png"
icons_dir = r"e:\Copy\ClipPaste\src-tauri\icons"

# Define all required sizes (filename, width, height)
logo_sizes = [
    # Standard icon sizes
    ("32x32.png", 32, 32),
    ("64x64.png", 64, 64),
    ("128x128.png", 128, 128),
    ("128x128@2x.png", 256, 256),
    ("256x256.png", 256, 256),
    
    # Tray icon
    ("tray.png", 32, 32),
    
    # Windows Store square icons
    ("Square30x30Logo.png", 30, 30),
    ("Square44x44Logo.png", 44, 44),
    ("Square71x71Logo.png", 71, 71),
    ("Square89x89Logo.png", 89, 89),
    ("Square107x107Logo.png", 107, 107),
    ("Square142x142Logo.png", 142, 142),
    ("Square150x150Logo.png", 150, 150),
    ("Square284x284Logo.png", 284, 284),
    ("Square310x310Logo.png", 310, 310),
    ("StoreLogo.png", 120, 120),
]

def main():
    # Open source image
    if not os.path.exists(source_logo):
        print(f"❌ Source logo not found: {source_logo}")
        return
    
    try:
        img = Image.open(source_logo)
        print(f"✓ Opened source logo: {source_logo}")
        print(f"  Original size: {img.size}")
    except Exception as e:
        print(f"❌ Error opening source logo: {e}")
        return
    
    # Generate all sizes
    for filename, width, height in logo_sizes:
        output_path = os.path.join(icons_dir, filename)
        try:
            # Resize image using high-quality resampling
            resized = img.resize((width, height), Image.Resampling.LANCZOS)
            resized.save(output_path, "PNG", quality=95)
            print(f"✓ Generated: {filename} ({width}x{height})")
        except Exception as e:
            print(f"❌ Error generating {filename}: {e}")
    
    print("\n✓ Logo generation completed!")
    print("\n⚠️  Note: icon.ico and icon.icns still need manual conversion")
    print("   You can use an online converter or ImageMagick for these formats.")

if __name__ == "__main__":
    main()
