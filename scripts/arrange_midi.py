#!/usr/bin/env python3
"""
Create simple student-playable string/chamber arrangements from a MIDI file.

This script intentionally uses only the Python standard library. It parses the
input MIDI, estimates a melody line and chord/bass material, then writes:

- arranged_quartet.mid
- arranged_quintet.mid
- arranged_output.mid, an alias of the quartet version
- arrangement_report.md

The arranger is heuristic, not a replacement for a human orchestrator, but it is
designed to produce clear, playable classroom material.
"""

from __future__ import annotations

import argparse
import bisect
import dataclasses
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

RANGES = {
    "violin": (55, 100),  # G3 to E7
    "viola": (48, 93),   # C3 to A6
    "cello": (36, 79),   # C2 to G5
    "piano": (21, 108),  # A0 to C8
}

PROGRAMS = {
    "Violin I": 40,
    "Violin II": 40,
    "Viola": 41,
    "Cello": 42,
    "Piano / String Pad": 48,
}


@dataclasses.dataclass
class Note:
    start: int
    end: int
    pitch: int
    velocity: int
    track: int
    channel: int

    @property
    def duration(self) -> int:
        return max(1, self.end - self.start)


@dataclasses.dataclass
class MidiData:
    format_type: int
    ticks_per_beat: int
    track_count: int
    tracks: List[List[Note]]
    tempo_events: List[Tuple[int, int]]
    time_signature: Tuple[int, int]
    track_names: List[str]


@dataclasses.dataclass
class Arrangement:
    name: str
    tracks: Dict[str, List[Note]]
    report_lines: List[str]


def read_var_len(data: bytes, offset: int) -> Tuple[int, int]:
    value = 0
    while True:
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, offset


def write_var_len(value: int) -> bytes:
    value = max(0, int(value))
    buffer = value & 0x7F
    value >>= 7
    while value:
        buffer <<= 8
        buffer |= ((value & 0x7F) | 0x80)
        value >>= 7

    out = bytearray()
    while True:
        out.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(out)


def parse_midi(path: Path) -> MidiData:
    data = path.read_bytes()
    offset = 0

    if data[offset:offset + 4] != b"MThd":
      raise ValueError(f"{path} is not a Standard MIDI file.")
    offset += 4

    header_length = int.from_bytes(data[offset:offset + 4], "big")
    offset += 4
    format_type = int.from_bytes(data[offset:offset + 2], "big")
    offset += 2
    track_count = int.from_bytes(data[offset:offset + 2], "big")
    offset += 2
    division = int.from_bytes(data[offset:offset + 2], "big")
    offset += 2
    offset += header_length - 6

    if division & 0x8000:
        raise ValueError("SMPTE time division is not supported.")

    tracks: List[List[Note]] = []
    tempos: List[Tuple[int, int]] = []
    time_signature = (4, 4)
    track_names: List[str] = []

    for track_index in range(track_count):
        if data[offset:offset + 4] != b"MTrk":
            raise ValueError(f"Missing MTrk header for track {track_index}.")
        offset += 4
        track_length = int.from_bytes(data[offset:offset + 4], "big")
        offset += 4
        track_end = offset + track_length

        tick = 0
        running_status: Optional[int] = None
        notes: List[Note] = []
        active: Dict[Tuple[int, int], List[Tuple[int, int]]] = defaultdict(list)
        name = f"Track {track_index + 1}"

        while offset < track_end:
            delta, offset = read_var_len(data, offset)
            tick += delta
            status = data[offset]

            if status < 0x80:
                if running_status is None:
                    raise ValueError("Running status found before a MIDI status byte.")
                status = running_status
            else:
                offset += 1
                if status < 0xF0:
                    running_status = status

            if status == 0xFF:
                meta_type = data[offset]
                offset += 1
                length, offset = read_var_len(data, offset)
                payload = data[offset:offset + length]
                offset += length

                if meta_type in (0x01, 0x03) and payload:
                    try:
                        text = payload.decode("utf-8")
                    except UnicodeDecodeError:
                        text = payload.decode("latin1", errors="replace")
                    if meta_type == 0x03:
                        name = text
                elif meta_type == 0x51 and length == 3:
                    tempos.append((tick, int.from_bytes(payload, "big")))
                elif meta_type == 0x58 and length >= 2:
                    time_signature = (payload[0], 2 ** payload[1])
                elif meta_type == 0x2F:
                    break
                continue

            if status in (0xF0, 0xF7):
                length, offset = read_var_len(data, offset)
                offset += length
                continue

            event_type = status & 0xF0
            channel = status & 0x0F

            if event_type in (0xC0, 0xD0):
                offset += 1
                continue

            if event_type not in (0x80, 0x90, 0xA0, 0xB0, 0xE0):
                continue

            pitch = data[offset]
            value = data[offset + 1]
            offset += 2

            if event_type == 0x90 and value > 0:
                active[(channel, pitch)].append((tick, value))
            elif event_type == 0x80 or (event_type == 0x90 and value == 0):
                stack = active.get((channel, pitch))
                if stack:
                    start, velocity = stack.pop(0)
                    if tick > start:
                        notes.append(Note(start, tick, pitch, velocity, track_index, channel))

        offset = track_end
        tracks.append(notes)
        track_names.append(name)

    if not tempos:
        tempos.append((0, 500000))
    tempos = sorted(set(tempos), key=lambda item: item[0])
    if tempos[0][0] != 0:
        tempos.insert(0, (0, 500000))

    return MidiData(format_type, division, track_count, tracks, tempos, time_signature, track_names)


def midi_name(pitch: int) -> str:
    return f"{NOTE_NAMES[pitch % 12]}{pitch // 12 - 1}"


def transpose_into_range(pitch: int, low: int, high: int, prefer: Optional[int] = None) -> int:
    candidates = [pitch + 12 * octave for octave in range(-6, 7) if low <= pitch + 12 * octave <= high]
    if not candidates:
        return min(high, max(low, pitch))
    if prefer is None:
        prefer = (low + high) // 2
    return min(candidates, key=lambda item: abs(item - prefer))


def clamp_duration(note: Note, minimum: int = 30) -> Note:
    if note.duration >= minimum:
        return note
    return dataclasses.replace(note, end=note.start + minimum)


def all_notes(midi: MidiData) -> List[Note]:
    return sorted([note for track in midi.tracks for note in track], key=lambda n: (n.start, n.pitch))


def estimate_track_score(notes: Sequence[Note]) -> float:
    if not notes:
        return -1
    count = len(notes)
    avg_pitch = sum(n.pitch for n in notes) / count
    avg_dur = sum(n.duration for n in notes) / count
    unique_onsets = len({n.start for n in notes})
    polyphony_penalty = count / max(1, unique_onsets)
    high_weight = max(0, avg_pitch - 52)
    activity = math.log(count + 1) * 8
    duration_bonus = min(12, avg_dur / 80)
    return high_weight + activity + duration_bonus - (polyphony_penalty - 1) * 10


def select_melody_notes(midi: MidiData) -> Tuple[List[Note], str]:
    scored = [(estimate_track_score(track), index, track) for index, track in enumerate(midi.tracks)]
    scored.sort(reverse=True, key=lambda item: item[0])

    best_score, best_index, best_track = scored[0] if scored else (-1, 0, [])
    if best_track and best_score > 15:
        source = f"{midi.track_names[best_index]} (track {best_index + 1})"
        return clean_melody_line(best_track, midi.ticks_per_beat), source

    source = "highest prominent note line across all tracks"
    return clean_melody_line(all_notes(midi), midi.ticks_per_beat), source


def clean_melody_line(notes: Sequence[Note], ticks_per_beat: int) -> List[Note]:
    if not notes:
        return []

    min_duration = max(1, ticks_per_beat // 16)
    candidates = [n for n in notes if n.duration >= min_duration and n.pitch >= 55]
    if not candidates:
        candidates = list(notes)

    bucket = max(1, ticks_per_beat // 24)
    by_onset: Dict[int, List[Note]] = defaultdict(list)
    for note in candidates:
        by_onset[round(note.start / bucket) * bucket].append(note)

    melody: List[Note] = []
    last_pitch: Optional[int] = None
    for onset in sorted(by_onset):
        group = by_onset[onset]
        group.sort(key=lambda n: (n.pitch, n.velocity, n.duration), reverse=True)
        if last_pitch is None:
            chosen = group[0]
        else:
            chosen = min(group[:4], key=lambda n: abs(n.pitch - last_pitch) * 0.35 - n.pitch)
        pitch = transpose_into_range(chosen.pitch, *RANGES["violin"], prefer=76)
        melody.append(dataclasses.replace(chosen, pitch=pitch))
        last_pitch = pitch

    melody.sort(key=lambda n: (n.start, n.pitch))
    trimmed: List[Note] = []
    for note in melody:
        if trimmed and note.start < trimmed[-1].end:
            previous = trimmed[-1]
            trimmed[-1] = dataclasses.replace(previous, end=max(previous.start + min_duration, note.start))
        trimmed.append(clamp_duration(note, min_duration))
    return trimmed


def build_grid(midi: MidiData) -> List[int]:
    notes = all_notes(midi)
    end_tick = max((n.end for n in notes), default=midi.ticks_per_beat * 4)
    step = midi.ticks_per_beat
    return list(range(0, end_tick + step, step))


def active_notes_at(notes: Sequence[Note], tick: int, window: int) -> List[Note]:
    return [n for n in notes if n.start <= tick < n.end or abs(n.start - tick) <= window]


def chord_at(notes: Sequence[Note], tick: int, ticks_per_beat: int) -> Tuple[int, List[int], List[int]]:
    active = active_notes_at(notes, tick, ticks_per_beat // 3)
    if not active:
        return 0, [0, 4, 7], []

    pitch_classes = Counter(n.pitch % 12 for n in active)
    bass = min(active, key=lambda n: (n.pitch, n.start)).pitch
    likely_roots = [bass % 12] + [pc for pc, _ in pitch_classes.most_common()]
    quality_templates = [
        [0, 4, 7],
        [0, 3, 7],
        [0, 5, 7],
        [0, 4, 9],
        [0, 3, 8],
        [0, 2, 7],
    ]

    best_root = likely_roots[0]
    best_template = quality_templates[0]
    best_score = -999
    pcs = set(pitch_classes)
    for root in likely_roots:
        for template in quality_templates:
            tones = {(root + interval) % 12 for interval in template}
            score = sum(3 + pitch_classes[pc] for pc in tones if pc in pcs)
            score -= len([pc for pc in pcs if pc not in tones]) * 0.35
            if score > best_score:
                best_root = root
                best_template = template
                best_score = score

    tones = sorted({(best_root + interval) % 12 for interval in best_template})
    return best_root, tones, [n.pitch for n in active]


def nearest_chord_tone(pc_list: Sequence[int], low: int, high: int, prefer: int, avoid: Sequence[int] = ()) -> int:
    candidates: List[int] = []
    for pc in pc_list:
        base = pc
        while base < low:
            base += 12
        while base <= high:
            candidates.append(base)
            base += 12
    if not candidates:
        return prefer
    avoid_set = set(avoid)
    candidates.sort(key=lambda p: (p in avoid_set, abs(p - prefer), p))
    return candidates[0]


def melody_density(melody: Sequence[Note], start: int, end: int, ticks_per_beat: int) -> float:
    count = sum(1 for note in melody if start <= note.start < end)
    beats = max(1, (end - start) / ticks_per_beat)
    return count / beats


def make_support_note(start: int, duration: int, pitch: int, velocity: int, track: int = 0) -> Note:
    return Note(start, start + max(1, duration), pitch, velocity, track, 0)


def thin_overlaps(notes: Sequence[Note], min_gap: int = 0) -> List[Note]:
    result: List[Note] = []
    for note in sorted(notes, key=lambda n: (n.start, n.pitch)):
        if result and note.start < result[-1].end + min_gap:
            prev = result[-1]
            result[-1] = dataclasses.replace(prev, end=max(prev.start + 1, note.start - min_gap))
        if note.end > note.start:
            result.append(note)
    return result


def arrange(midi: MidiData, quintet: bool = False) -> Arrangement:
    notes = all_notes(midi)
    melody, melody_source = select_melody_notes(midi)
    grid = build_grid(midi)
    beat = midi.ticks_per_beat
    half = beat * 2

    tracks: Dict[str, List[Note]] = {
        "Violin I": melody[:],
        "Violin II": [],
        "Viola": [],
        "Cello": [],
    }
    if quintet:
        tracks["Piano / String Pad"] = []

    previous = {"Violin II": 67, "Viola": 55, "Cello": 43, "Piano / String Pad": 60}

    for index, tick in enumerate(grid[:-1]):
        next_tick = grid[index + 1]
        duration = next_tick - tick
        root, chord_tones, active_pitches = chord_at(notes, tick, beat)
        busy = melody_density(melody, tick, tick + beat, beat) > 1.7
        on_strong_beat = (tick // beat) % 2 == 0

        bass_source = min(active_pitches) if active_pitches else root + 48
        bass_pc = bass_source % 12 if active_pitches else root
        cello_pitch = nearest_chord_tone([bass_pc, root, (root + 7) % 12], *RANGES["cello"], prefer=previous["Cello"])
        if on_strong_beat or not busy:
            dur = half if on_strong_beat else beat
            tracks["Cello"].append(make_support_note(tick, dur, cello_pitch, 68))
            previous["Cello"] = cello_pitch

        if not busy or on_strong_beat:
            viola_pitch = nearest_chord_tone(chord_tones, 48, 74, previous["Viola"], avoid=[cello_pitch])
            tracks["Viola"].append(make_support_note(tick, half if on_strong_beat else beat, viola_pitch, 58))
            previous["Viola"] = viola_pitch

        if not busy and tick % (beat * 2) == 0:
            current_melody = [n.pitch for n in melody if n.start <= tick < n.end or abs(n.start - tick) < beat // 2]
            avoid = current_melody + [previous["Viola"]]
            violin2_pitch = nearest_chord_tone(chord_tones, 55, 86, previous["Violin II"], avoid=avoid)
            if not current_melody or abs(violin2_pitch - current_melody[0]) not in (0, 12):
                tracks["Violin II"].append(make_support_note(tick, half, violin2_pitch, 54))
                previous["Violin II"] = violin2_pitch

        if quintet and tick % half == 0:
            pad_notes = []
            for prefer in (52, 60, 67):
                pad_notes.append(nearest_chord_tone(chord_tones, 40, 84, prefer, avoid=pad_notes))
            for pad_pitch in sorted(set(pad_notes)):
                tracks["Piano / String Pad"].append(make_support_note(tick, half, pad_pitch, 38))

    for name in tracks:
        low, high = RANGES["violin" if "Violin" in name else "viola" if name == "Viola" else "cello" if name == "Cello" else "piano"]
        fixed = []
        for note in tracks[name]:
            fixed.append(dataclasses.replace(note, pitch=transpose_into_range(note.pitch, low, high)))
        tracks[name] = thin_overlaps(fixed) if name != "Piano / String Pad" else sorted(fixed, key=lambda n: (n.start, n.pitch))

    report_lines = [
        f"Input format: MIDI type {midi.format_type}, {midi.track_count} source tracks, PPQ {midi.ticks_per_beat}.",
        f"Tempo events detected: {len(midi.tempo_events)}.",
        f"Time signature: {midi.time_signature[0]}/{midi.time_signature[1]}.",
        f"Melody source: {melody_source}.",
        f"Melody notes assigned to Violin I: {len(tracks['Violin I'])}.",
        "Bass/cello part: derived from the lowest active notes and inferred roots/fifths on the beat.",
        "Harmony parts: generated from inferred chord tones with lighter texture during busy melody passages.",
    ]
    for name, part in tracks.items():
        if part:
            report_lines.append(
                f"{name}: {len(part)} notes, range {midi_name(min(n.pitch for n in part))} to {midi_name(max(n.pitch for n in part))}."
            )
        else:
            report_lines.append(f"{name}: no notes generated.")

    return Arrangement("quintet" if quintet else "quartet", tracks, report_lines)


def tempo_track(midi: MidiData) -> bytes:
    events: List[Tuple[int, bytes]] = []
    for tick, mpqn in midi.tempo_events:
        events.append((tick, b"\xFF\x51\x03" + int(mpqn).to_bytes(3, "big")))
    numerator, denominator = midi.time_signature
    dd = int(math.log2(denominator)) if denominator > 0 else 2
    events.append((0, bytes([0xFF, 0x58, 0x04, numerator, dd, 24, 8])))
    return build_track(events)


def build_track(events: Sequence[Tuple[int, bytes]]) -> bytes:
    out = bytearray()
    last_tick = 0
    for tick, payload in sorted(events, key=lambda item: (item[0], item[1])):
        tick = max(0, int(tick))
        out.extend(write_var_len(tick - last_tick))
        out.extend(payload)
        last_tick = tick
    out.extend(write_var_len(0))
    out.extend(b"\xFF\x2F\x00")
    return b"MTrk" + len(out).to_bytes(4, "big") + bytes(out)


def instrument_track(name: str, notes: Sequence[Note], channel: int) -> bytes:
    events: List[Tuple[int, bytes]] = []
    safe_name = name.encode("ascii", errors="replace")
    events.append((0, b"\xFF\x03" + write_var_len(len(safe_name)) + safe_name))
    events.append((0, bytes([0xC0 | channel, PROGRAMS.get(name, 40)])))

    for note in sorted(notes, key=lambda n: (n.start, n.pitch)):
        velocity = min(110, max(20, int(note.velocity)))
        events.append((note.start, bytes([0x90 | channel, note.pitch, velocity])))
        events.append((note.end, bytes([0x80 | channel, note.pitch, 0])))
    return build_track(events)


def write_midi(path: Path, midi: MidiData, arrangement: Arrangement) -> None:
    track_chunks = [tempo_track(midi)]
    for channel, (name, notes) in enumerate(arrangement.tracks.items()):
        track_chunks.append(instrument_track(name, notes, channel))

    header = b"MThd" + (6).to_bytes(4, "big")
    header += (1).to_bytes(2, "big")
    header += len(track_chunks).to_bytes(2, "big")
    header += midi.ticks_per_beat.to_bytes(2, "big")
    path.write_bytes(header + b"".join(track_chunks))


def write_report(path: Path, source: Path, quartet: Arrangement, quintet: Arrangement) -> None:
    lines = [
        "# Arrangement Report",
        "",
        f"Input MIDI: `{source.name}`",
        "",
        "## What The Script Detected",
        "",
        *[f"- {line}" for line in quartet.report_lines[:4]],
        "",
        "## Melody Assignment",
        "",
        "- Violin I carries the detected melody line.",
        "- The script prefers a prominent upper line and preserves note starts, durations, and melodic contour as much as possible.",
        "- Notes are octave-transposed only when needed to keep them inside violin range.",
        "",
        "## Harmony And Bass",
        "",
        "- Chords are inferred from simultaneous notes and nearby note clusters on the beat grid.",
        "- Cello uses the lowest active note when possible, otherwise inferred roots or fifths.",
        "- Viola and Violin II use middle and upper chord tones, with rests during busy melody passages.",
        "- The quintet version adds light sustained chord support using a piano/string-pad track.",
        "",
        "## Output Summary",
        "",
        "### Quartet",
        "",
        *[f"- {line}" for line in quartet.report_lines[4:]],
        "",
        "### Quintet",
        "",
        *[f"- {line}" for line in quintet.report_lines[4:]],
        "",
        "## Limitations And Assumptions",
        "",
        "- This is a heuristic arrangement, not a human-edited score.",
        "- Chord roots may be approximate when the source MIDI is sparse or highly contrapuntal.",
        "- MuseScore or a DAW can be used for final notation cleanup, slurs, dynamics, bowings, and page layout.",
        "- The texture is intentionally conservative for intermediate/student players.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Arrange a MIDI file for student string/chamber ensemble.")
    parser.add_argument(
        "input",
        nargs="?",
        default="Kimi no Shiranai Monogatari trim.mid",
        help="Input MIDI file. Defaults to the project MIDI file.",
    )
    parser.add_argument("--quartet-output", default="arranged_quartet.mid")
    parser.add_argument("--quintet-output", default="arranged_quintet.mid")
    parser.add_argument("--default-output", default="arranged_output.mid")
    parser.add_argument("--report", default="arrangement_report.md")
    args = parser.parse_args()

    source = Path(args.input)
    midi = parse_midi(source)
    quartet = arrange(midi, quintet=False)
    quintet = arrange(midi, quintet=True)

    write_midi(Path(args.quartet_output), midi, quartet)
    write_midi(Path(args.quintet_output), midi, quintet)
    write_midi(Path(args.default_output), midi, quartet)
    write_report(Path(args.report), source, quartet, quintet)

    print(f"Wrote {args.quartet_output}")
    print(f"Wrote {args.quintet_output}")
    print(f"Wrote {args.default_output}")
    print(f"Wrote {args.report}")
    print("Quartet parts:")
    for name, notes in quartet.tracks.items():
        print(f"- {name}: {len(notes)} notes")
    print("Quintet parts:")
    for name, notes in quintet.tracks.items():
        print(f"- {name}: {len(notes)} notes")


if __name__ == "__main__":
    main()
