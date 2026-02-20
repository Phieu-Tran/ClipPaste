#!/usr/bin/env python3
"""
Tauri Icon Generator from SVG
- Sử dụng logo_source.svg để tạo tất cả PNG cần thiết
- Tạo các size PNG chuẩn cho Tauri (desktop + Windows tiles)
- Sau khi chạy xong → chạy `pnpm tauri icon` hoặc `cargo tauri icon` để tạo .ico / .icns nếu cần
"""

from pathlib import Path
import cairosvg
import sys

# Đường dẫn dự án (dùng __file__ để script chạy đúng từ bất kỳ đâu)
PROJECT_ROOT = Path(__file__).resolve().parent
ICONS_DIR = PROJECT_ROOT / "src-tauri" / "icons"
SVG_FILE = ICONS_DIR / "logo_source.svg"

# Danh sách các size và tên file chuẩn cho Tauri (dựa trên docs Tauri v1/v2)
# Bao gồm cả retina (@2x) và Windows tile icons
ICON_SIZES = [
    (32,  "32x32.png"),
    (128, "128x128.png"),
    (256, "256x256.png"),
    (512, "512x512.png"),
    (256, "128x128@2x.png"),          # Retina cho macOS/Windows
    (32,  "tray.png"),                 # Tray icon (thường nhỏ)
    # Windows tile / Store icons
    (30,  "Square30x30Logo.png"),
    (44,  "Square44x44Logo.png"),
    (71,  "Square71x71Logo.png"),
    (89,  "Square89x89Logo.png"),
    (107, "Square107x107Logo.png"),
    (142, "Square142x142Logo.png"),
    (150, "Square150x150Logo.png"),
    (284, "Square284x284Logo.png"),
    (310, "Square310x310Logo.png"),
    (120, "StoreLogo.png"),
]

def generate_icon(size: int, output_path: Path):
    """
    Convert SVG → PNG với kích thước chính xác, giữ vector quality
    """
    try:
        cairosvg.svg2png(
            url=str(SVG_FILE),              # đường dẫn đến SVG
            write_to=str(output_path),      # nơi lưu PNG
            output_width=size,
            output_height=size,
            background_color="transparent"  # giữ trong suốt nếu SVG có alpha
        )
        print(f"✓ Generated: {output_path.name} ({size}x{size})")
    except Exception as e:
        print(f"✗ Error generating {output_path.name}: {e}")
        sys.exit(1)


def main():
    print("=== Tauri Icon Generator from SVG ===")
    print(f"Icons directory: {ICONS_DIR}")
    print(f"Source SVG     : {SVG_FILE}\n")

    if not SVG_FILE.exists():
        print(f"ERROR: Không tìm thấy file SVG gốc: {SVG_FILE}")
        print("→ Hãy kiểm tra file logo_source.svg có tồn tại trong src-tauri/icons/")
        sys.exit(1)

    # Tạo thư mục nếu chưa có (dù thường đã có)
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # Generate tất cả icons
    for size, filename in ICON_SIZES:
        output = ICONS_DIR / filename
        generate_icon(size, output)

    print("\n=== HOÀN TẤT ===")
    print("Tất cả PNG đã được tạo từ logo_source.svg")
    print("Bước tiếp theo:")
    print("  1. Kiểm tra các file PNG trong src-tauri/icons/")
    print("  2. Chạy lệnh để tạo .ico + .icns (nếu cần):")
    print("     → pnpm tauri icon")
    print("     hoặc")
    print("     → cargo tauri icon")
    print("  → Tauri CLI sẽ dùng các PNG này để build icon cuối cùng.\n")


if __name__ == "__main__":
    main()