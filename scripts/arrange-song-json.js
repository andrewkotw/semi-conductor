const fs = require('fs');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3] || path.join('src', 'assets', 'song.arranged.json');

if (!input) {
  console.error('Usage: node scripts/arrange-song-json.js input.json [output.json]');
  process.exit(1);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const INSTRUMENT_ORDER = ['violin', 'string ensemble 1', 'viola', 'cello', 'contrabass'];

const RANGES = {
  violin: { min: 60, max: 96 },
  'string ensemble 1': { min: 55, max: 86 },
  viola: { min: 48, max: 76 },
  cello: { min: 36, max: 67 },
  contrabass: { min: 28, max: 55 }
};

function midiToName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function transposeIntoRange(note, instrument) {
  const range = RANGES[instrument];
  let midi = note.midi;

  while (midi < range.min) midi += 12;
  while (midi > range.max) midi -= 12;

  return {
    ...note,
    midi,
    name: midiToName(midi)
  };
}

function quantizeTime(time, bpm) {
  const sixteenth = 60 / bpm / 4;
  return Math.round(time / sixteenth) * sixteenth;
}

function uniqueByPitch(notes) {
  const seen = new Set();
  return notes.filter((note) => {
    const key = `${Math.round(note.time * 1000)}:${note.midi}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pushNote(targets, instrument, note, velocityScale = 1) {
  const arranged = transposeIntoRange(note, instrument);
  targets[instrument].push({
    name: arranged.name,
    midi: arranged.midi,
    time: arranged.time,
    velocity: Math.min(1, Math.max(0.1, arranged.velocity * velocityScale)),
    duration: arranged.duration
  });
}

function getTrackTemplate(instrument) {
  return {
    startTime: 0,
    duration: 0,
    length: 0,
    notes: [],
    name: instrument,
    instrumentNumber: null,
    instrument,
    instrumentFamily: 'strings'
  };
}

const song = JSON.parse(fs.readFileSync(input, 'utf8'));
const bpm = song.header && song.header.bpm ? song.header.bpm : 120;
const buckets = new Map();

const flattened = uniqueByPitch(
  song.tracks
    .flatMap((track) => track.notes || [])
    .filter((note) => note.duration > 0)
    .map((note) => ({
      name: note.name,
      midi: note.midi,
      time: quantizeTime(note.time, bpm),
      velocity: note.velocity || 0.7,
      duration: Math.max(0.05, note.duration)
    }))
);

flattened.forEach((note) => {
  const key = note.time.toFixed(4);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(note);
});

const targets = INSTRUMENT_ORDER.reduce((acc, instrument) => {
  acc[instrument] = [];
  return acc;
}, {});

Array.from(buckets.entries())
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .forEach(([, notes]) => {
    const sorted = notes.slice().sort((a, b) => a.midi - b.midi);
    const low = sorted.filter((note) => note.midi <= 55);
    const mid = sorted.filter((note) => note.midi > 55 && note.midi < 72);
    const high = sorted.filter((note) => note.midi >= 72);

    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    const secondLowest = sorted.find((note) => note !== lowest && note.midi <= 67);

    if (lowest) pushNote(targets, 'contrabass', lowest, 0.82);
    if (secondLowest && Math.abs(secondLowest.midi - lowest.midi) >= 5) {
      pushNote(targets, 'cello', secondLowest, 0.86);
    } else if (low[1]) {
      pushNote(targets, 'cello', low[1], 0.86);
    }

    if (highest && highest.midi >= 60 && highest !== lowest) {
      pushNote(targets, 'violin', highest, 0.96);
    }

    const innerNotes = sorted
      .filter((note) => note !== lowest && note !== highest && note !== secondLowest)
      .sort((a, b) => b.midi - a.midi);

    const upperHarmony = innerNotes.find((note) => note.midi >= 60) || high[0];
    const middleHarmony = innerNotes.find((note) => note.midi >= 48 && note.midi < 72) || mid[0];

    if (upperHarmony) pushNote(targets, 'string ensemble 1', upperHarmony, 0.72);
    if (middleHarmony && middleHarmony !== upperHarmony) pushNote(targets, 'viola', middleHarmony, 0.74);
  });

const tracks = INSTRUMENT_ORDER.map((instrument) => {
  const track = getTrackTemplate(instrument);
  track.notes = targets[instrument].sort((a, b) => a.time - b.time || a.midi - b.midi);
  track.length = track.notes.length;
  track.duration = track.notes.reduce((max, note) => Math.max(max, note.time + note.duration), 0);
  return track;
});

const duration = tracks.reduce((max, track) => Math.max(max, track.duration), 0);
const arrangedSong = {
  ...song,
  header: {
    ...song.header,
    name: `${song.header.name} - Ensemble Arrangement`
  },
  duration,
  tracks
};

fs.writeFileSync(output, `${JSON.stringify(arrangedSong, null, 2)}\n`);

console.log(`Wrote ${output}`);
tracks.forEach((track) => {
  const low = track.notes.filter((note) => note.midi < 48).length;
  const mid = track.notes.filter((note) => note.midi >= 48 && note.midi < 67).length;
  const high = track.notes.filter((note) => note.midi >= 67).length;
  console.log(`${track.instrument}: ${track.length} notes, duration ${track.duration.toFixed(2)}s, low/mid/high ${low}/${mid}/${high}`);
});
