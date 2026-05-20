# Semi-Conductor Taiwanese Classroom Edition

[Try it here!](https://semi-conductor-kappa.vercel.app)

This fork is a classroom-friendly rescue version of Google Creative Lab's archived
Semi-Conductor experiment. It keeps the original Parcel 1, Tone.js, TensorFlow.js,
PoseNet, and PIXI.js stack, but makes the project usable in modern Chrome and easy
to deploy as a static site.

The student-facing web UI is translated into Traditional Chinese. The audio engine
intentionally uses built-in Tone.js synth voices, so no external sample files are
required.

## What Changed

- Adds a full-screen start gate before the app initializes.
- Starts Web Audio only after a user click/tap, which modern Chrome requires.
- Keeps webcam and PoseNet conducting controls enabled.
- Uses Tone.js synth voices as the main audio engine.
- Does not load instrument sample files.
- Builds as a static site into `dist`.
- Keeps the old Parcel 1 build system instead of modernizing the project.

## Quick Start

Use Node 12-16 for this archived Parcel 1 project. Newer Node versions can fail
while loading old native dependencies used by Parcel.

```sh
yarn
```

```sh
yarn start
```

Then open:

```txt
http://localhost:1234
```

Build the static site:

```sh
yarn build
```

The deployable output is:

```txt
dist/index.html
dist/static/
```

## How Students Use It

1. Open the deployed HTTPS URL in Chrome.
2. Click the first full-screen start button.
3. Click the app's start button.
4. Allow camera access.
5. Follow the tutorial.
6. Stand in frame and conduct with arm movements.

Sound is generated with built-in Tone.js synths. No sample files are required.

## MIDI Arrangement Tool

This repo includes a local Python tool that arranges an input MIDI file into:

- `arranged_quartet.mid`
- `arranged_quintet.mid`
- `arranged_output.mid` as a convenient alias of the quartet arrangement
- `arrangement_report.md`

The script reads `Kimi no Shiranai Monogatari trim.mid` by default and creates a
simple classical string/chamber arrangement:

- Violin I: main melody
- Violin II: harmony or counter-melody support
- Viola: inner harmony
- Cello: bass line
- Piano / String Pad: optional light chord support in the quintet output

### Python Setup

The arranger uses only the Python standard library. No paid APIs and no audio
generation are used.

Install Python 3.10 or newer from:

```txt
https://www.python.org/downloads/
```

On this Windows machine, the script can also be run with GIMP's bundled Python:

```powershell
& 'C:\Program Files\GIMP 3\bin\python.exe' scripts\arrange_midi.py
```

With a normal Python install:

```sh
python scripts/arrange_midi.py
```

To specify a different MIDI file:

```sh
python scripts/arrange_midi.py "input.mid"
```

To choose output names:

```sh
python scripts/arrange_midi.py "input.mid" --quartet-output arranged_quartet.mid --quintet-output arranged_quintet.mid --default-output arranged_output.mid --report arrangement_report.md
```

To convert an arranged MIDI into the app's `song.json` format:

```sh
node scripts/midi-to-song-json.js arranged_quartet.mid src/assets/song.kimi-quartet.json
```

To keep only specific MIDI chunks and assign them to app instruments:

```sh
node scripts/midi-to-song-json.js "canon_(faucher).mid" src/assets/song.canon-faucher.json --track-map "4:violin,5:string ensemble 1,7:string ensemble 1,2:viola,6:viola,3:cello" --name "Canon Faucher Quartet"
```

### Opening The Output MIDI

Open `arranged_output.mid`, `arranged_quartet.mid`, or `arranged_quintet.mid`
in MuseScore, Logic, GarageBand, Ableton Live, FL Studio, Reaper, or another DAW.

For notation cleanup in MuseScore:

1. Open the MIDI file.
2. Assign instrument names if needed.
3. Check clefs, octave placement, slurs, bowings, and dynamics.
4. Export PDF parts for students.

The arrangement is heuristic, so teachers should review the score before handing
it to students.

## Deploying To Vercel

Use these Vercel project settings:

```txt
Framework Preset: Other
Install Command: yarn
Build Command: yarn build
Output Directory: dist
Node.js Version: 16.x
```

The webcam requires HTTPS for students on other computers, so deploy to Vercel or
another HTTPS static host rather than sharing a local `localhost` URL.

Terminal deployment also works:

```sh
npx vercel
```

For production:

```sh
npx vercel --prod
```

## Code Structure

Semi-Conductor is built in vanilla JavaScript without a framework.

- `src/scripts/boot.js` waits for the first click/tap before loading the app.
- `src/scripts/main.js` controls primary app state and loading.
- `src/scripts/renderer.js` handles DOM and UI updates.
- `src/scripts/orchestra.js` handles the PIXI orchestra graphics.
- `src/scripts/pose-controller.js` uses TensorFlow.js/PoseNet for webcam pose state.
- `src/scripts/posenet-renderer.js` renders the pose skeleton.
- `src/scripts/audio-player.js` plays the MIDI score with Tone.js synth voices.
- `scripts/arrange_midi.py` creates quartet/quintet MIDI arrangements.

## Notes For Teachers

This version intentionally avoids external audio samples. That makes it more stable
for classroom deployment and avoids the original archive's missing sample-file issue.

The original project is old, so dependency warnings from TensorFlow source maps or
Browserslist may appear during build. They are non-fatal if `yarn build` completes.

## Original Project

Original project by Google Creative Lab:

https://github.com/googlecreativelab/semi-conductor

This fork is not an official Google product.

## License

Semi-Conductor was made available under the Apache 2.0 license. See `LICENSE` for
details.
