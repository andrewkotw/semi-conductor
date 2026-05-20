# Arrangement Report

Input MIDI: `Kimi no Shiranai Monogatari trim.mid`

## What The Script Detected

- Input format: MIDI type 1, 3 source tracks, PPQ 480.
- Tempo events detected: 1.
- Time signature: 4/4.
- Melody source: Piano (track 2).

## Melody Assignment

- Violin I carries the detected melody line.
- The script prefers a prominent upper line and preserves note starts, durations, and melodic contour as much as possible.
- Notes are octave-transposed only when needed to keep them inside violin range.

## Harmony And Bass

- Chords are inferred from simultaneous notes and nearby note clusters on the beat grid.
- Cello uses the lowest active note when possible, otherwise inferred roots or fifths.
- Viola and Violin II use middle and upper chord tones, with rests during busy melody passages.
- The quintet version adds light sustained chord support using a piano/string-pad track.

## Output Summary

### Quartet

- Melody notes assigned to Violin I: 303.
- Bass/cello part: derived from the lowest active notes and inferred roots/fifths on the beat.
- Harmony parts: generated from inferred chord tones with lighter texture during busy melody passages.
- Violin I: 303 notes, range B4 to A5.
- Violin II: 93 notes, range B4 to A5.
- Viola: 225 notes, range E4 to D#5.
- Cello: 225 notes, range D#3 to D4.

### Quintet

- Melody notes assigned to Violin I: 303.
- Bass/cello part: derived from the lowest active notes and inferred roots/fifths on the beat.
- Harmony parts: generated from inferred chord tones with lighter texture during busy melody passages.
- Violin I: 303 notes, range B4 to A5.
- Violin II: 93 notes, range B4 to A5.
- Viola: 225 notes, range E4 to D#5.
- Cello: 225 notes, range D#3 to D4.
- Piano / String Pad: 420 notes, range A#3 to A4.

## Limitations And Assumptions

- This is a heuristic arrangement, not a human-edited score.
- Chord roots may be approximate when the source MIDI is sparse or highly contrapuntal.
- MuseScore or a DAW can be used for final notation cleanup, slurs, dynamics, bowings, and page layout.
- The texture is intentionally conservative for intermediate/student players.
