"""Rebuild the street field-recording bank with NumPy and ffmpeg.

The tab-separated source list ships with the recordings. Pass a cache directory
to retain the original Ogg previews between builds.
"""
import argparse
import collections
import fnmatch
import json
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "dist/assets/audio"
RATE = 32000
HOP = RATE // 100
LOOPS = {"avenue", "plaza", "nightStreet", "leaves"}


def recordings(samples, family):
    """Trim isolated actions, overlap loop seams, and cut phrases from longer bird recordings."""
    end = len(samples) // HOP
    rms = np.sqrt(np.mean(samples[:end * HOP].reshape(-1, HOP) ** 2, axis=1))
    if family in LOOPS:
        # Leave the microphone handling at the ends of the field recording.
        start = min(5 * RATE, len(samples) // 10)
        take = samples[start:start + 24 * RATE].copy()
        cross = RATE
        fade = np.linspace(0, 1, cross)
        take[:cross] = take[:cross] * fade + take[-cross:] * (1 - fade)
        yield take[:-cross]
        return
    phrase = {"pigeon": 3.3, "gull": 2.6, "sparrow": 3.0}.get(family)
    if phrase is None:
        active = np.flatnonzero(rms > max(.001, rms.max() * .035))
        start = max(0, active[0] - 3) * HOP
        yield samples[start:min((active[-1] + 12) * HOP, start + 4 * RATE)]
        return
    if phrase and end < (phrase + .35) * 100:
        yield samples
        return

    # Find complete, non-overlapping call phrases in the longer bird recordings.
    width = int(phrase * 100)
    energy = np.convolve(rms, np.ones(width) / width, mode="valid")
    best = energy.max()
    for _ in range(4):
        peak = int(np.argmax(energy))
        if energy[peak] < max(best * .18, .0003):
            break
        energy[max(0, peak - width):peak + width + 1] = -1
        yield samples[peak * HOP:(peak + width) * HOP]


def source_clips(cache):
    for line in (OUT / "street-sources.tsv").read_text().splitlines()[1:]:
        family, title, _, page, media, _ = line.split("\t")
        url, _, member = media.partition("#")
        if "cdn.freesound.org/" in url or "archive.org/download/" in url:
            filename = page.rstrip("/").split("/")[-1] + ".ogg"
        else:
            filename = url.split("/")[-1]
        path = cache / filename
        if not path.exists():
            with urllib.request.urlopen(url, timeout=90) as response:
                path.write_bytes(response.read())
        if member:
            with zipfile.ZipFile(path) as pack:
                names = sorted(fnmatch.filter(pack.namelist(), member))
                if not names:
                    raise ValueError(f"Missing {member} in {filename}")
                for name in names:
                    yield family, name, pack.read(name)
        else:
            yield family, title, path.read_bytes()


def build(cache):
    cache.mkdir(parents=True, exist_ok=True)
    banks = {"street": ({}, []), "bells": ({}, [])}
    cursors = collections.Counter()
    counts = collections.Counter()
    for family, title, source in source_clips(cache):
        decoded = subprocess.check_output(["ffmpeg", "-v", "error", "-i", "pipe:0",
                                           "-ar", str(RATE), "-ac", "1", "-f", "f32le", "-"], input=source)
        for clip in recordings(np.frombuffer(decoded, dtype="<f4"), family):
            clip = clip.copy()
            if family not in LOOPS:
                fade = min(len(clip) // 4, 1500 if family in {"sparrow", "pigeon", "gull"} else 140)
                clip[:fade] *= np.linspace(0, 1, fade)
                clip[-fade:] *= np.linspace(1, 0, fade)
            peak = np.max(np.abs(clip))
            if peak < .0001:
                raise ValueError(f"Silent recording: {title}")
            clip *= min(.85 / peak, .14 / np.sqrt(np.mean(clip ** 2)))
            name = f"{family}.street.{counts[family]}"
            counts[family] += 1
            bank = "bells" if family == "bikeBell" else "street"
            regions, chunks = banks[bank]
            regions[name] = [cursors[bank] / RATE, len(clip) / RATE]
            chunks.extend([(clip * 32767).astype("<i2").tobytes(), bytes(2 * HOP)])
            cursors[bank] += len(clip) + HOP
    for bank, (regions, chunks) in banks.items():
        # Keep the bell download small and independent of the long ambience beds.
        encoding = ["-compression_level", "8"] if bank == "bells" else ["-codec:a", "libmp3lame", "-q:a", "2"]
        extension = ".flac" if bank == "bells" else ".mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ar", str(RATE), "-ac", "1",
                        "-f", "s16le", "-i", "-", *encoding, str(OUT / (bank + extension))],
                       input=b"".join(chunks), check=True)
        (OUT / (bank + ".json")).write_text(json.dumps(regions, separators=(",", ":")) + "\n")
    print(sum(counts.values()), dict(counts))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path)
    options = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        build(options.cache or Path(temp))
