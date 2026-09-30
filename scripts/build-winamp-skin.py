#!/usr/bin/env python3
"""Builds the PNG sprite sheets used by Winamp mode from the Winamp 2.91 base skin bitmaps.

Development-only: requires macOS (`sips`) and Pillow. The generated PNGs are committed, so the
deployed app has no build step. Run from the repository root:

    python3 scripts/build-winamp-skin.py

The sheets are straight BMP -> PNG conversions, so winamp.css uses the original Winamp sprite
coordinates. Several base-skin bitmaps are RLE8-compressed in a way Pillow mis-decodes, so they
are decoded with Apple's ImageIO (via `sips`), the same decoder Safari uses.

The generic (GEN.BMP) window used for Milkdrop is composed into fixed-width top/bottom strips
because iOS 9 CSS cannot repeat a sub-rectangle of a sprite sheet.
"""
import os
import subprocess
import tempfile
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'vendor', 'winamp-skin')
SRC = os.path.join(ROOT, 'base-2.91')
SHEETS = ['MAIN', 'TITLEBAR', 'CBUTTONS', 'POSBAR', 'VOLUME', 'BALANCE', 'NUMBERS', 'TEXT',
          'PLAYPAUS', 'MONOSTER', 'SHUFREP', 'EQMAIN', 'PLEDIT']
WIDTH = 275
LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
TMP = tempfile.mkdtemp()


def load(name):
    out = os.path.join(TMP, name + '.png')
    subprocess.check_call(['sips', '-s', 'format', 'png', os.path.join(SRC, name + '.BMP'), '--out', out],
                          stdout=subprocess.DEVNULL)
    return Image.open(out).convert('RGB')


def save(img, name):
    img.save(os.path.join(ROOT, name + '.png'), optimize=True)


def gen_letters(gen, y):
    """Same scan Webamp uses: letters are separated by single background-coloured columns."""
    bg = gen.getpixel((0, y))
    x, out = 1, {}
    for letter in LETTERS:
        end = x
        while end < gen.size[0] and gen.getpixel((end, y)) != bg:
            end += 1
        out[letter] = (x, end - x)
        x = end + 1
    return out


def sprite(gen, x, y, w, h):
    return gen.crop((x, y, x + w, y + h))


CYAN = (0, 198, 255)


def letter_sprite(gen, x, y, w):
    """GEN.BMP interleaves cyan separator rows with the letter rows; keep the first 7 real rows."""
    rows = [yy for yy in range(y, y + 9) if gen.getpixel((x, yy)) != CYAN][:7]
    out = Image.new('RGB', (w, 7), gen.getpixel((52, 4)))
    for i, yy in enumerate(rows):
        out.paste(sprite(gen, x, yy, w, 1), (0, i))
    return out


def tile_x(dest, piece, x0, x1, y=0):
    x = x0
    while x < x1:
        w = min(piece.size[0], x1 - x)
        dest.paste(piece.crop((0, 0, w, piece.size[1])), (x, y))
        x += w


def gen_top(gen, title):
    img = Image.new('RGB', (WIDTH, 41), (0, 198, 255))
    for row_y, letter_y in ((0, 88), (21, 96)):  # selected, unselected
        letters = gen_letters(gen, letter_y)
        title_w = sum(letters[c][1] for c in title) + 7  # Webamp pads the title 4px left, 3px right
        fill_total = WIDTH - 100 - title_w
        fill_l = fill_total // 2
        strip = Image.new('RGB', (WIDTH, 20))
        x = 0
        strip.paste(sprite(gen, 0, row_y, 25, 20), (x, 0)); x += 25
        tile_x(strip, sprite(gen, 104, row_y, 25, 20), x, x + fill_l); x += fill_l
        strip.paste(sprite(gen, 26, row_y, 25, 20), (x, 0)); x += 25
        tile_x(strip, sprite(gen, 52, row_y, 25, 20), x, x + title_w)
        lx = x + 4
        for c in title:
            sx, sw = letters[c]
            strip.paste(letter_sprite(gen, sx, letter_y, sw), (lx, 4))
            lx += sw
        x += title_w
        strip.paste(sprite(gen, 78, row_y, 25, 20), (x, 0)); x += 25
        tile_x(strip, sprite(gen, 104, row_y, 25, 20), x, WIDTH - 25)
        strip.paste(sprite(gen, 130, row_y, 25, 20), (WIDTH - 25, 0))
        img.paste(strip, (0, row_y))
    return img


def gen_bottom(gen):
    img = Image.new('RGB', (WIDTH, 14))
    fill = sprite(gen, 127, 72, 25, 14)
    # The fill's last row is a cyan separator in GEN.BMP; borrow the matching row of the left corner.
    for y in range(14):
        if fill.getpixel((0, y)) == CYAN:
            fill.paste(sprite(gen, 120, 42 + y, 1, 1).resize((25, 1)), (0, y))
    tile_x(img, fill, 0, WIDTH)
    img.paste(sprite(gen, 0, 42, 125, 14), (0, 0))
    img.paste(sprite(gen, 0, 57, 125, 14), (WIDTH - 125, 0))
    return img


def main():
    for name in SHEETS:
        save(load(name), name.lower())
    gen = load('GEN')
    save(gen_top(gen, 'MILKDROP'), 'gen-top')
    save(gen_bottom(gen), 'gen-bottom')
    save(sprite(gen, 127, 42, 11, 29), 'gen-left')
    save(sprite(gen, 158, 42, 11, 24), 'gen-left-bottom')
    save(sprite(gen, 139, 42, 8, 29), 'gen-right')
    save(sprite(gen, 170, 42, 8, 24), 'gen-right-bottom')


if __name__ == '__main__':
    main()
