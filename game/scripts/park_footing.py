"""Build a compact foot-contact map from the same surveyed surfaces the park renderer uses."""
import struct
from itertools import groupby

import numpy as np
from PIL import Image


def write_footing(directory, surface, cover):
    # One cell per four surface texels. Point sampling preserves the survey's categories.
    height, width = surface.shape[:2]
    size = (max(1, width // 4), max(1, height // 4))
    def sample(image):
        return np.asarray(Image.fromarray(image).resize(size, Image.Resampling.NEAREST))
    paved, lawn, bare, rock = (sample(surface) >= 128).transpose(2, 0, 1)
    _, woodland, court, inside = (sample(cover) >= 128).transpose(2, 0, 1)
    categories = np.select([~inside, paved | court, rock, bare, lawn, woodland], [0, 1, 2, 3, 4, 5], 3).astype('uint8')
    encoded = bytearray(struct.pack('<HH', *size))
    for material, cells in groupby(categories.tobytes()):
        count = sum(1 for _ in cells)
        while count:
            span = min(count, 65535)
            encoded.extend(struct.pack('<BH', material, span))
            count -= span
    (directory / 'footing.bin').write_bytes(encoded)
