#!/usr/bin/env python3
"""Render the iPad2Spotify favicon and Home Screen icons (requires Pillow).

The artwork is drawn at 1024 px and downscaled, so every size stays crisp.
iOS rounds the corners of apple-touch-icons itself, so they are full-bleed
opaque squares; only the favicon gets its own rounded corners.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'icons')
S = 1024
BG = (16, 18, 17)
LIME = (182, 214, 75)
CREAM = (245, 241, 232)


def artwork():
    img = Image.new('RGB', (S, S), BG)

    glow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(glow).ellipse((112, 112, 912, 912), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.paste(Image.new('RGB', (S, S), LIME), (0, 0), glow)

    d = ImageDraw.Draw(img)
    d.ellipse((192, 192, 832, 832), fill=LIME)

    # Beamed pair of eighth notes, centred on the disc.
    ink = BG
    d.polygon([(420, 330), (700, 272), (700, 352), (420, 410)], fill=ink)
    d.rectangle((420, 360, 464, 650), fill=ink)
    d.rectangle((656, 300, 700, 590), fill=ink)
    for cx, cy in ((392, 660), (628, 600)):
        d.ellipse((cx - 72, cy - 54, cx + 72, cy + 54), fill=ink)

    # Small cream equalizer bars along the bottom edge of the disc.
    for i, h in enumerate((40, 76, 56, 96, 64, 44)):
        x = 362 + i * 54
        d.rounded_rectangle((x, 780 - h, x + 30, 780), radius=10, fill=CREAM)
    return img


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0) + img.size, radius=radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    art = artwork()
    # 76/152 iPad, 120/180 iPhone, 167 iPad Pro.
    for size in (76, 120, 152, 167, 180):
        art.resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT, 'apple-touch-icon-%dx%d.png' % (size, size)), optimize=True)
    # Some iOS versions request /apple-touch-icon.png at the site root without reading the page.
    art.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'apple-touch-icon.png'), optimize=True)

    fav = rounded(art, 180)
    fav.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'favicon-32x32.png'), optimize=True)
    fav.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'icon-192.png'), optimize=True)
    fav.save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == '__main__':
    main()
