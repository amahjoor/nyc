"""Pack the city's three CC0 Poly Haven scans with ImageMagick 7."""
import json
from pathlib import Path
from subprocess import check_output, run
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen

DEST = Path(__file__).resolve().parents[1] / 'dist/assets/materials'
SCANS = [('asphalt_04', 'asphalt', 2048), ('concrete_floor_02', 'concrete', 1024),
         ('brick_wall_001', 'brick', 1024)]


def download(url):
    request = Request(url, headers={'User-Agent': 'Concrete Jungle city material builder'})
    with urlopen(request, timeout=90) as response:
        return response.read()


def build(scan, name, size, work):
    manifest = json.loads(download('https://api.polyhaven.com/files/' + scan))
    maps = {}
    for kind in ('Diffuse', 'nor_gl', 'Rough'):
        path = work / (kind + '.jpg')
        path.write_bytes(download(manifest[kind]['2k']['jpg']['url']))
        maps[kind] = str(path)

    # Store luminance around middle grey so the recorded facade palette and
    # replacement slab colours still determine the mean colour of each surface.
    luma = [maps['Diffuse'], '-grayscale', 'Rec709Luma']
    mean = float(check_output(['magick', *luma, '-format', '%[fx:mean]', 'info:']))
    channels = [luma + ['-evaluate', 'add', f'{(0.5 - mean) * 100}%'],
                [maps['nor_gl'], '-channel', 'R', '-separate', '+channel'],
                [maps['nor_gl'], '-channel', 'G', '-separate', '+channel'],
                [maps['Rough'], '-grayscale', 'Rec709Luma', '+dither', '-posterize', '24']]
    paths = []
    for index, channel in enumerate(channels):
        path = work / f'{index}.pgm'
        run(['magick', *channel, '-resize', f'{size}x{size}!', '-depth', '8', str(path)], check=True)
        paths.append(str(path))
    # Keep the data untagged so the renderer samples all four channels linearly.
    run(['magick', *paths, '-channel', 'RGBA', '-combine', '-set', 'colorspace', 'sRGB',
         '-strip', '-quality', '91', '-define', 'webp:use-sharp-yuv=true', str(DEST / (name + '.webp'))], check=True)


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as tmp:
        for scan, name, size in SCANS:
            build(scan, name, size, Path(tmp))
