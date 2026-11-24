"""Regenerate dialogue pronunciations and packed greetings using Piper and ffmpeg."""
import argparse
from array import array
import json
from pathlib import Path
import subprocess
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "dist/assets/audio/voices"
SAMPLE_RATE = 22050


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


def build_pack(piper, model, actors, first, greeting, output):
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        requests = [dict(text=greeting, speaker_id=speaker, output_file=str(folder / f"{slot}.wav"))
                    for slot, speaker in enumerate(actors, first)]
        subprocess.run([piper, "--model", model, "--json-input"], check=True, text=True,
                       input="\n".join(map(json.dumps, requests)) + "\n", stdout=subprocess.DEVNULL)
        bank = array("h")
        regions = {}
        for slot in range(first, first + len(actors)):
            with wave.open(str(folder / f"{slot}.wav")) as wav:
                if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (SAMPLE_RATE, 1, 2):
                    raise ValueError("Unexpected Piper audio format")
                raw = array("h", wav.readframes(wav.getnframes()))
            peak = max(map(abs, raw))
            threshold = peak * .008
            head = next(i for i, value in enumerate(raw) if abs(value) > threshold)
            tail = next(i for i, value in enumerate(reversed(raw)) if abs(value) > threshold)
            samples = raw[max(0, head - 180):min(len(raw), len(raw) - tail + 420)]
            regions[f"line0-{slot}"] = [round(len(bank) / SAMPLE_RATE, 6), round(len(samples) / SAMPLE_RATE, 6)]
            gain = .72 * 32767 / peak
            bank.extend(round(v * gain * min(1, i / 32, (len(samples) - 1 - i) / 96))
                        for i, v in enumerate(samples))
            bank.extend([0] * 551)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", str(SAMPLE_RATE),
                        "-ac", "1", "-i", "pipe:", "-codec:a", "libmp3lame", "-b:a", "40k", "-y",
                        output.with_suffix(".mp3")], check=True, input=bank.tobytes())
        write_json(output.with_suffix(".json"), regions)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("piper_dir", type=Path, help="Piper distribution with piper, piper_phonemize and espeak-ng-data")
    parser.add_argument("--phonemes-only", action="store_true", help="Only refresh the dialogue pronunciation table")
    args = parser.parse_args()
    piper = args.piper_dir.resolve()
    manifest = """
      import {reactionPhrases} from './dist/street-reactions.js';
      import {dialogue} from './dist/voice-lines.js';
      import {modelSpeakers, recordedSpeakers} from './dist/npc-voices.js';
      console.log(JSON.stringify({dialogue, reactionPhrases, modelSpeakers, recorded:recordedSpeakers.length}));
    """
    roster = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", manifest], cwd=ROOT))
    lines = list(dict.fromkeys(roster["dialogue"] + roster["reactionPhrases"]))
    output = subprocess.check_output([piper / "piper_phonemize", "-l", "en-us", "--espeak_data", piper / "espeak-ng-data"],
                                     input="\n".join(lines) + "\n", text=True)
    phones = {row["text"]: row["phoneme_ids"] for row in map(json.loads, output.splitlines())}
    if list(phones) != lines:
        raise ValueError("Piper returned an incomplete pronunciation table")
    write_json(ASSETS / "phonemes.json", phones)
    if args.phonemes_only:
        return
    (ASSETS / "hello").mkdir(exist_ok=True)
    speakers, recorded = roster["modelSpeakers"], roster["recorded"]
    for first in range(recorded, len(speakers), 32):
        output = ASSETS / "hello" / str((first - recorded) // 32)
        build_pack(piper / "piper", ASSETS / "libritts-r.onnx", speakers[first:first + 32], first, lines[0], output)


if __name__ == "__main__":
    main()
