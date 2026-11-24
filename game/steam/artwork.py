"""Render Steam artwork using the game's emblem, title font and SoHo street map.
Requires Pillow, woff2_decompress and rsvg-convert. Run from any directory.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import io
import json
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

GAME = Path(__file__).resolve().parents[1]
OUT = GAME / 'steam/artwork'
SIZES = {'header': (920, 430), 'small': (462, 174), 'main': (1232, 706),
         'vertical': (748, 896), 'library-capsule': (600, 900),
         'library-hero': (3840, 1240), 'library-logo': (1280, 720)}

def render(name, size, emblem, font_file, roads):
    w, h = size
    logo = name == 'library-logo'
    hero = name == 'library-hero'
    page = Image.new('RGBA', size, (0, 0, 0, 0) if logo else '#18322f')
    draw = ImageDraw.Draw(page)
    if not logo:
        for road in roads:
            scale = max(w, h) / 1800
            points = [(w * .52 + (x-400) * scale, h * .54 + (z-350) * scale) for x,z in road['points']]
            colour = '#36534a' if road['name'] in ['BROADWAY', 'CANAL ST'] else '#29463f'
            draw.line(points, fill=colour, width=max(1, int(road['width'] * scale * .26)))
    tall = h > w
    side = round(min(w*.82, h*.58) if tall else min(h*.9, w*.37))
    if hero:
        side = round(h * .70)
    x = (w-side)//2 if tall or hero else round(w*.035)
    y = round(h*.06) if tall else (h-side)//2
    page.alpha_composite(emblem.resize((side,side), Image.Resampling.LANCZOS), (x,y))
    if not hero:
        left = round(w*.08) if tall else x + side + round(w*.025)
        maxwidth = w-left-round(w*.04)
        font = ImageFont.truetype(font_file, 100)
        font.set_variation_by_axes([900])
        fontsize = int(min(100*maxwidth/font.getlength('Concrete'), h*(.17 if tall else .36)))
        font = ImageFont.truetype(font_file, fontsize)
        font.set_variation_by_axes([900])
        advance = int(fontsize*.92)
        block = advance + font.getbbox('Jungle', anchor='lt')[3]
        y = round(h*.90)-block if tall else (h-block)//2
        for word in ['Concrete', 'Jungle']:
            draw.text((left,y), word, font=font, fill='#f5edda', anchor='lt')
            y += advance
    if logo:
        page = page.crop(page.getbbox())
    page.save(OUT / (name + '.png'), optimize=True)

def main():
    OUT.mkdir(exist_ok=True)
    roads = {}
    for x in range(-2, 3):
        for z in range(-2, 3):
            cell = GAME / f'dist/roads/{x}_{z}.json'
            if cell.exists():
                roads.update((r['id'],r) for r in json.loads(cell.read_bytes())['roads'])
    with TemporaryDirectory() as folder:
        source = Path(folder) / 'title.woff2'
        shutil.copyfile(GAME / 'dist/assets/fonts/bitter-latin.woff2', source)
        subprocess.run(['woff2_decompress', str(source)], check=True)
        png = subprocess.check_output(['rsvg-convert', '-w', '1500', str(GAME/'dist/assets/concrete-jungle.svg')])
        emblem = Image.open(io.BytesIO(png)).convert('RGBA')
        for name, size in SIZES.items():
            render(name, size, emblem, str(source.with_suffix('.ttf')), roads.values())
        icon = emblem.resize((256,256),Image.Resampling.LANCZOS)
        icon.save(OUT / 'client-icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
        icon.save(OUT / 'client-icon.png')
        emblem.resize((1024,1024),Image.Resampling.LANCZOS).save(OUT / 'client-icon.icns')

if __name__ == '__main__':
    main()
