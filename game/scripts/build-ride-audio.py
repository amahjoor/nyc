"""Bake recorded road vehicles and skateboard contacts. Requires ffmpeg and NumPy."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlopen

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "dist/assets/audio"
RATE = 32000
# Times in the original field recordings. Split the pop and landing of the same
# trick so the flight time comes from the simulation.
SKATE = {
    "boardConcrete": (243765, 7.20, 9.45, True), "boardAsphalt": (322458, 2.12, 4.18, True),
    "boardWood": (196702, 1.40, 3.64, True), "boardBrake": (273384, 7.44, 7.86, True),
    "boardRail": (348326, 6.86, 7.30, True), "railOn": (348326, 1.195, 1.32, False),
    "wheelSet": (105076, .30, .39, False),
    "shoePush.0": (273113, 3.15, 3.43, False), "shoePush.1": (273113, 4.68, 4.94, False),
    "shoePush.2": (348752, .74, .99, False),
    "olliePop.0": (348321, 5.40, 5.57, False), "olliePop.1": (105076, 0, .15, False),
    "flipPop.0": (105075, 0, .20, False), "flipPop.1": (105073, 2.08, 2.28, False),
    "wheelLand.0": (105075, .41, .70, False), "wheelLand.1": (105073, 2.54, 2.88, False),
    "wheelLand.2": (348321, 5.70, 6.05, False),
}
# Keep steady sections of the recordings. Remove bass spill from the contact
# microphones so the road and engine layers can move independently.
DRIVING = {
    "petrolPull": (370319, .03, .79, 30),
    "sportPull": (115199, 2.70, 3.84, 32),
    "dieselPull": (423607, .10, 1.37, 30),
    "electricDrive": (170421, 5.48, 6.27, 240),
    "roadTread": (60044, .30, 2.94, 85),
    "looseTread": (152657, .84, 1.72, 520),
    "brakeFriction": (425861, 6.18, 7.70, 680),
}
HORNS = {
    "accord":83465, "civic":66585, "element":178402, "altima":433578, "maxima":331540,
    "corolla":381775, "camry":322130, "sonata":381774, "charger":331542, "escape":378106,
    "silverado":377249, "mustang":118807, "a1":431841, "114i":425496, "master":425848,
    "190e":162540, "626":54187, "imiev":174840, "suzuki":329612,
}


def decode(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1",
                                   "-ar", str(RATE), "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype="<f4")


def sustain(sound):
    # Find a sustained blast rather than a loud microphone bump. Match the phase
    # at both ends of its body, keeping the original electrical attack in front.
    hop = RATE // 200
    rms = np.sqrt(np.mean(sound[:len(sound)//hop*hop].reshape(-1, hop)**2, axis=1))
    active = rms > max(np.percentile(rms, 98) * .53, rms.max() * .11)
    edges = np.diff(np.r_[False, active, False].astype(int))
    runs = list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))
    a, b = max(runs, key=lambda v: min(v[1]-v[0], 250) * rms[v[0]:v[1]].mean()**.35)
    start = max(0, (a-3)*hop)
    clip = sound[start:min(len(sound), (b+2)*hop)].copy()
    length = (b-a)*hop
    loop = a*hop - start + int(length*.24)
    width = min(320, length//8)
    lo, hi = loop + int(length*.28), loop + int(length*.63)
    reference = clip[loop:loop+width].astype(float)
    matches = np.lib.stride_tricks.sliding_window_view(clip[lo:hi+width], width)
    score = np.sum((matches-reference)**2, axis=1)
    end = lo + int(np.argmin(score))
    # Blend the last few milliseconds into the seam to suppress residual clicks.
    fade = min(width,loop)
    weight = np.linspace(0,1,fade)
    clip[end-fade:end] = clip[end-fade:end]*(1-weight) + clip[loop-fade:loop]*weight
    return clip, [loop/RATE, end/RATE]


def build(cache):
    sources = {}
    for row in (OUT / "ride-sources.tsv").read_text().splitlines()[1:]:
        ident, _, _, _, _, url = row.split("\t")
        path = cache / (ident+".wav")
        if not path.exists():
            with urlopen(url, timeout=60) as stream:
                path.write_bytes(stream.read())
        sources[int(ident)] = decode(path)
    regions, chunks, cursor = {}, [], 0

    def append(name, clip, loop_points=(), loop=False):
        nonlocal cursor
        clip = clip.copy()
        if loop:
            n = min(int(.045*RATE), len(clip)//8)
            weight = np.linspace(0,1,n)
            clip[:n] = clip[:n]*weight + clip[-n:]*(1-weight)
            clip = clip[:-n]
        else:
            clip[:32] *= np.linspace(0,1,32)
            clip[-160:] *= np.linspace(1,0,160)
        clip *= min(.85/np.abs(clip).max(), (.25 if loop_points else .17)/np.sqrt(np.mean(clip**2)))
        regions[name] = [cursor/RATE, len(clip)/RATE, *loop_points]
        chunks.extend([(clip*32767).astype("<i2").tobytes(), bytes(320)])
        cursor += len(clip)+160

    for name, ident in HORNS.items():
        append(name, *sustain(sources[ident]))
    # Retain the already licensed heavy air horn for buses and heavy trucks.
    start, length = json.loads((OUT / "regions.json").read_text())["truckHorn"]
    truck = decode(OUT / "world.flac")[round(start*RATE):round((start+length)*RATE)]
    append("airHorn", *sustain(truck))
    for name,(ident,start,end,loop) in SKATE.items():
        append(name, sources[ident][round(start*RATE):round(end*RATE)], loop=loop)
    for name, (ident, start, end, cutoff) in DRIVING.items():
        clip = sources[ident][round(start*RATE):round(end*RATE)]
        filtered = subprocess.check_output(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(RATE),
                                            "-ac", "1", "-i", "-", "-af", f"highpass=f={cutoff}",
                                            "-f", "f32le", "-"], input=clip.tobytes())
        append(name, np.frombuffer(filtered, dtype="<f4"), loop=True)
    subprocess.run(["ffmpeg","-v","error","-y","-f","s16le","-ar",str(RATE),"-ac","1",
                    "-i","-","-compression_level","8",str(OUT/"ride.flac")],input=b"".join(chunks),check=True)
    (OUT/"ride.json").write_text(json.dumps(regions,indent=2)+"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path)
    options = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        cache = options.cache or Path(temp)
        cache.mkdir(parents=True, exist_ok=True)
        build(cache)
