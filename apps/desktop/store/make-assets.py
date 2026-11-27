"""Store logos for the MSIX package, drawn from the app icon. python make-assets.py <out dir>"""
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
icon = Image.open(HERE.parent / "src-tauri" / "icons" / "icon.png").convert("RGBA")
out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "Assets"
out.mkdir(parents=True, exist_ok=True)


def square(px, name, pad=0.12):
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    s = int(px * (1 - 2 * pad))
    img.alpha_composite(icon.resize((s, s), Image.LANCZOS), ((px - s) // 2, (px - s) // 2))
    img.save(out / name)


def wide(w, h, name):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    s = int(h * 0.7)
    img.alpha_composite(icon.resize((s, s), Image.LANCZOS), ((w - s) // 2, (h - s) // 2))
    img.save(out / name)


square(50, "StoreLogo.png", 0.04)
square(150, "Square150x150Logo.png")
square(44, "Square44x44Logo.png", 0.04)
square(44, "Square44x44Logo.targetsize-44_altform-unplated.png", 0.0)
wide(310, 150, "Wide310x150Logo.png")
print("ok")
