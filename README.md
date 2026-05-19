# Semi-Conductor Taiwanese Classroom Edition

[Try it here!](https://semi-conductor-kappa.vercel.app)

This fork is a classroom-friendly rescue version of Google Creative Lab's archived
Semi-Conductor experiment. It keeps the original Parcel 1, Tone.js, TensorFlow.js,
PoseNet, and PIXI.js stack, but makes the project usable in modern Chrome and easy
to deploy as a static site.

The student-facing UI has been translated into Traditional Chinese.

## What Changed

- Adds a full-screen "點一下開始" gate before the app initializes.
- Starts Web Audio only after a user click/tap, which modern Chrome requires.
- Keeps webcam and PoseNet conducting controls enabled.
- Uses Tone.js synth voices as the main audio engine.
- Does not load instrument sample files.
- Builds as a static site into `dist`.
- Keeps the old Parcel 1 build system instead of modernizing the project.

## Quick Start

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
2. Click `點一下開始`.
3. Click `開始`.
4. Allow camera access.
5. Follow the tutorial.
6. Stand in frame and conduct with arm movements.

Sound is generated with built-in Tone.js synths. No sample files are required.

## Deploying To Vercel

Use these Vercel project settings:

```txt
Framework Preset: Other
Install Command: yarn
Build Command: yarn build
Output Directory: dist
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
