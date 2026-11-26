"""Draws the installer artwork (NSIS sidebar + header BMPs). Run: python make_art.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
ICON = Image.open(HERE.parent / "icons" / "icon.png").convert("RGBA")
FONTS = Path("C:/Windows/Fonts")
BLUE, DEEP = (0, 113, 227), (16, 24, 64)


def font(name, size):
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:
        return ImageFont.load_default()


def gradient(w, h, top, bottom):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def glow(img, cx, cy, r, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(r, 0, -2):
        a = round(alpha * (1 - i / r) ** 2)
        d.ellipse((cx - i, cy - i, cx + i, cy + i), fill=(*color, a))
    return Image.alpha_composite(img.convert("RGBA"), layer)


def sidebar(scale=1):
    w, h = 164 * scale, 314 * scale
    img = gradient(w, h, BLUE, DEEP)
    img = glow(img, w // 2, int(h * 0.30), 90 * scale, (120, 200, 255), 120)
    img = glow(img, int(w * 0.1), int(h * 0.95), 80 * scale, (124, 92, 255), 90)
    s = 64 * scale
    img.alpha_composite(ICON.resize((s, s), Image.LANCZOS), ((w - s) // 2, int(h * 0.30) - s // 2))
    d = ImageDraw.Draw(img)
    title = font("segoeuib.ttf", 22 * scale)
    sub = font("segoeui.ttf", 11 * scale)
    tw = d.textlength("PinchDrop", font=title)
    d.text(((w - tw) / 2, int(h * 0.30) + s // 2 + 12 * scale), "PinchDrop", font=title, fill="white")
    for i, line in enumerate(["Pinch it on your PC.", "Drop it on your phone."]):
        lw = d.textlength(line, font=sub)
        d.text(((w - lw) / 2, int(h * 0.30) + s // 2 + 44 * scale + i * 16 * scale), line, font=sub, fill=(205, 225, 255))
    return img.convert("RGB").resize((164, 314), Image.LANCZOS)


def header(scale=1):
    w, h = 150 * scale, 57 * scale
    img = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    s = 34 * scale
    img.alpha_composite(ICON.resize((s, s), Image.LANCZOS), (w - s - 10 * scale, (h - s) // 2))
    return img.convert("RGB").resize((150, 57), Image.LANCZOS)


if __name__ == "__main__":
    sidebar(3).save(HERE / "sidebar.bmp")
    header(3).save(HERE / "header.bmp")
    print("ok")
