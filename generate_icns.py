#!/usr/bin/env python3
"""Generate .icns file from PNG logo."""

from PIL import Image
import os
import struct

source_logo = r"e:\Copy\ClipPaste\src-tauri\icons\256x256.png"
icons_dir = r"e:\Copy\ClipPaste\src-tauri\icons"
icns_path = os.path.join(icons_dir, "icon.icns")

def create_icns(png_path, output_path):
    """Create ICNS file from PNG"""
    try:
        # Open and prepare image
        img = Image.open(png_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Create icon suite with multiple sizes
        # ICNS format requires specific icon types
        icon_sizes = [
            ("ic09", 512),  # 512x512
            ("ic08", 256),  # 256x256
            ("ic07", 128),  # 128x128
            ("ic06", 64),   # 64x64
            ("ic05", 32),   # 32x32
            ("ic04", 16),   # 16x16
        ]
        
        # Start building ICNS file
        icon_data = []
        
        for icon_type, size in icon_sizes:
            if size <= img.width:
                resized = img.resize((size, size), Image.Resampling.LANCZOS)
                # Convert RGBA to RGB with alpha mask for ICNS
                rgb_img = Image.new('RGB', (size, size), (255, 255, 255))
                rgb_img.paste(resized, mask=resized.split()[3] if resized.mode == 'RGBA' else None)
                
                # Get image data
                img_data = rgb_img.tobytes()
                
                # Create icon chunk
                chunk_data = img_data
                chunk_size = len(chunk_data) + 8
                chunk = struct.pack('>4sI', icon_type.encode(), chunk_size) + chunk_data
                icon_data.append(chunk)
        
        # Combine all chunks with ICNS header
        all_data = b''.join(icon_data)
        file_size = len(all_data) + 8
        
        icns_header = struct.pack('>4sI', b'icns', file_size) + all_data
        
        with open(output_path, 'wb') as f:
            f.write(icns_header)
        
        print(f"✓ Generated: icon.icns (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)")
        
    except Exception as e:
        print(f"❌ Error generating icon.icns: {e}")
        print("\n⚠️  Alternative: Use online converter")
        print("   1. Go to: https://convertio.co/png-icns/")
        print("   2. Upload: src-tauri/icons/256x256.png")
        print("   3. Download: icon.icns")
        print("   4. Save to: src-tauri/icons/icon.icns")

if __name__ == "__main__":
    create_icns(source_logo, icns_path)
