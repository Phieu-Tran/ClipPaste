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
import platform
import time

# Đường dẫn dự án (dùng __file__ để script chạy đúng từ bất kỳ đâu)
PROJECT_ROOT = Path(__file__).resolve().parent
ICONS_DIR = PROJECT_ROOT / "src-tauri" / "icons"
SVG_FILE = ICONS_DIR / "logo_source.svg"

# Danh sách các size và tên file chuẩn cho Tauri (dựa trên docs Tauri v1/v2)
# Bao gồm cả retina (@2x) và Windows tile icons
ICON_SIZES = [
    (32,  "32x32.png"),
    (64, "64x64.png"),
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
    # On Windows, writing directly via Cairo can intermittently fail.
    # Safer approach: render to bytes, then write via Python I/O (with a small retry).
    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            png_bytes = cairosvg.svg2png(
                url=str(SVG_FILE),
                output_width=size,
                output_height=size,
                background_color="transparent",
            )

            # Write directly (some environments may block creating *.tmp files)
            try:
                output_path.unlink(missing_ok=True)
            except Exception:
                pass
            output_path.write_bytes(png_bytes)

            print(f"OK  Generated: {output_path.name} ({size}x{size})")
            return
        except Exception as e:
            last_err = e
            time.sleep(0.15 * attempt)

    print(f"ERR Error generating {output_path.name}: {last_err}")
    sys.exit(1)


def generate_ico(output_path: Path):
    """
    Generate multi-size Windows .ico from the largest PNG we generated.
    Requires Pillow: `pip install Pillow`
    """
    try:
        from PIL import Image  # type: ignore
    except Exception:
        print("ERR Pillow chua duoc cai. Chay: pip install Pillow")
        sys.exit(1)

    base_png = ICONS_DIR / "512x512.png"
    if not base_png.exists():
        print(f"ERR Khong tim thay {base_png.name}. Hay chay buoc generate PNG truoc.")
        sys.exit(1)

    try:
        img = Image.open(base_png)
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        sizes = [16, 32, 48, 64, 128, 256]
        img.save(str(output_path), format="ICO", sizes=[(s, s) for s in sizes])
        print(f"OK  Generated: {output_path.name} (sizes: {', '.join(str(s) for s in sizes)})")
    except Exception as e:
        print(f"ERR Error generating {output_path.name}: {e}")
        sys.exit(1)


def generate_icns(output_path: Path):
    """
    Best-effort .icns generation (mostly useful on macOS).
    On Windows, Pillow usually cannot write ICNS reliably—prefer running `tauri icon` on macOS/CI.
    """
    if platform.system().lower() != "darwin":
        print(f"SKIP {output_path.name}: ICNS is typically generated on macOS (run `pnpm tauri icon` on macOS/CI).")
        return

    try:
        from PIL import Image  # type: ignore
    except Exception:
        print("ERR Pillow chua duoc cai. Chay: pip install Pillow")
        sys.exit(1)

    base_png = ICONS_DIR / "512x512.png"
    if not base_png.exists():
        print(f"ERR Khong tim thay {base_png.name}. Hay chay buoc generate PNG truoc.")
        sys.exit(1)

    try:
        img = Image.open(base_png)
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        # Pillow supports saving ICNS on macOS with sizes embedded.
        sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512)]
        img.save(str(output_path), format="ICNS", sizes=sizes)
        print(f"OK  Generated: {output_path.name}")
    except Exception as e:
        print(f"ERR Error generating {output_path.name}: {e}")
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

    # Generate platform icons used by tauri.conf.json bundle.icon
    generate_ico(ICONS_DIR / "icon.ico")
    generate_icns(ICONS_DIR / "icon.icns")

    print("\n=== HOÀN TẤT ===")
    print("Tất cả PNG đã được tạo từ logo_source.svg")
    print("Đã tạo thêm icon.ico (Windows).")
    print("Bước tiếp theo:")
    print("  1. Kiểm tra các file PNG trong src-tauri/icons/")
    print("  2. Nếu bạn cần icon.icns chuẩn (macOS), chạy `pnpm tauri icon` trên macOS/CI:")
    print("     → pnpm tauri icon")
    print("     hoặc")
    print("     → cargo tauri icon")
    print("  → Tauri CLI sẽ dùng các PNG này để build icon cuối cùng.\n")


if __name__ == "__main__":
    main()