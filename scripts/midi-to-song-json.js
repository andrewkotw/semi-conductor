const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const input = args[0];
const output = args[1] || path.join('src', 'assets', 'song.generated.json');
const maxSecondsIndex = args.indexOf('--max-seconds');
const maxSeconds = maxSecondsIndex >= 0 ? Number(args[maxSecondsIndex + 1]) : null;
const trackMapIndex = args.indexOf('--track-map');
const trackMapArg = trackMapIndex >= 0 ? args[trackMapIndex + 1] : null;
const songNameIndex = args.indexOf('--name');
const songName = songNameIndex >= 0 ? args[songNameIndex + 1] : null;

if (!input) {
  console.error('Usage: node scripts/midi-to-song-json.js input.mid [output.json]');
  process.exit(1);
}

const APP_INSTRUMENTS = [
  'violin',
  'string ensemble 1',
  'viola',
  'cello',
  'contrabass'
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function parseTrackMap(value) {
  if (!value) return null;

  return value.split(',').reduce((map, item) => {
    const separator = item.indexOf(':');
    if (separator < 0) throw new Error(`Invalid --track-map item "${item}". Use trackNumber:instrument.`);

    const trackNumber = Number(item.slice(0, separator).trim());
    const instrument = item.slice(separator + 1).trim();
    if (!trackNumber || !instrument) throw new Error(`Invalid --track-map item "${item}".`);

    map.set(trackNumber, instrument);
    return map;
  }, new Map());
}

function readVarLen(buffer, state) {
  let value = 0;
  let byte;

  do {
    byte = buffer[state.offset++];
    value = (value << 7) + (byte & 0x7f);
  } while (byte & 0x80);

  return value;
}

function readString(buffer, state, length) {
  const value = buffer.toString('latin1', state.offset, state.offset + length);
  state.offset += length;
  return value;
}

function readUInt32(buffer, state) {
  const value = buffer.readUInt32BE(state.offset);
  state.offset += 4;
  return value;
}

function readUInt16(buffer, state) {
  const value = buffer.readUInt16BE(state.offset);
  state.offset += 2;
  return value;
}

function midiToName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function buildTempoMap(tempoEvents, division) {
  const events = tempoEvents.length ? tempoEvents : [{ tick: 0, bpm: 120 }];
  events.sort((a, b) => a.tick - b.tick);

  const map = [];
  let seconds = 0;
  let lastTick = 0;
  let bpm = events[0].tick === 0 ? events[0].bpm : 120;

  map.push({ tick: 0, seconds: 0, bpm });

  for (const event of events) {
    if (event.tick === 0) {
      bpm = event.bpm;
      map[0].bpm = bpm;
      continue;
    }

    seconds += ((event.tick - lastTick) / division) * (60 / bpm);
    lastTick = event.tick;
    bpm = event.bpm;
    map.push({ tick: event.tick, seconds, bpm });
  }

  return map;
}

function tickToSeconds(tick, tempoMap, division) {
  let tempo = tempoMap[0];

  for (const item of tempoMap) {
    if (item.tick > tick) break;
    tempo = item;
  }

  return tempo.seconds + ((tick - tempo.tick) / division) * (60 / tempo.bpm);
}

function chooseInstrument(track, used) {
  const label = track.names.join(' ').toLowerCase();
  let preferred;

  if (label.includes('violin')) preferred = 'violin';
  else if (label.includes('cello')) preferred = 'cello';
  else if (label.includes('pizzicato')) preferred = 'contrabass';
  else if (label.includes('koto')) preferred = 'viola';
  else if (label.includes('piano')) preferred = 'string ensemble 1';

  if (preferred && !used.has(preferred)) return preferred;
  return APP_INSTRUMENTS.find((name) => !used.has(name)) || APP_INSTRUMENTS[used.size % APP_INSTRUMENTS.length];
}

function parseMidi(buffer) {
  const state = { offset: 0 };
  if (readString(buffer, state, 4) !== 'MThd') throw new Error('Not a MIDI file.');

  const headerLength = readUInt32(buffer, state);
  const format = readUInt16(buffer, state);
  const trackCount = readUInt16(buffer, state);
  const division = readUInt16(buffer, state);
  state.offset += headerLength - 6;

  const tracks = [];
  const tempoEvents = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (readString(buffer, state, 4) !== 'MTrk') throw new Error(`Missing MTrk at track ${trackIndex}.`);

    const trackLength = readUInt32(buffer, state);
    const trackEnd = state.offset + trackLength;
    let tick = 0;
    let runningStatus = null;
    const names = [];
    const activeNotes = new Map();
    const notes = [];

    while (state.offset < trackEnd) {
      tick += readVarLen(buffer, state);
      let status = buffer[state.offset];

      if (status < 0x80) {
        status = runningStatus;
      } else {
        state.offset++;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        const type = buffer[state.offset++];
        const length = readVarLen(buffer, state);
        const start = state.offset;
        const payload = buffer.slice(start, start + length);
        state.offset += length;

        if (type === 0x03 || type === 0x01) names.push(payload.toString('latin1'));
        if (type === 0x51 && length === 3) {
          const microseconds = (payload[0] << 16) + (payload[1] << 8) + payload[2];
          tempoEvents.push({ tick, bpm: 60000000 / microseconds });
        }
        if (type === 0x2f) break;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        state.offset += readVarLen(buffer, state);
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;

      if (eventType === 0xc0 || eventType === 0xd0) {
        state.offset += 1;
        continue;
      }

      const noteNumber = buffer[state.offset++];
      const value = buffer[state.offset++];

      if (eventType === 0x90 && value > 0) {
        const key = `${channel}:${noteNumber}`;
        if (!activeNotes.has(key)) activeNotes.set(key, []);
        activeNotes.get(key).push({ tick, velocity: value });
      } else if (eventType === 0x80 || eventType === 0x90) {
        const key = `${channel}:${noteNumber}`;
        const queue = activeNotes.get(key);
        if (!queue || !queue.length) continue;

        const start = queue.shift();
        notes.push({
          startTick: start.tick,
          endTick: tick,
          midi: noteNumber,
          velocity: start.velocity / 127
        });
      }
    }

    state.offset = trackEnd;
    tracks.push({ index: trackIndex + 1, names, notes });
  }

  return { format, division, tracks, tempoEvents };
}

const midi = parseMidi(fs.readFileSync(input));
const tempoMap = buildTempoMap(midi.tempoEvents, midi.division);
const bpm = tempoMap[0].bpm;
const used = new Set();
const explicitTrackMap = parseTrackMap(trackMapArg);
const selectedMidiTracks = explicitTrackMap
  ? Array.from(explicitTrackMap.entries()).map(([trackNumber, instrument]) => {
      const track = midi.tracks[trackNumber - 1];
      if (!track) throw new Error(`Track ${trackNumber} was not found in ${input}.`);
      return { ...track, forcedInstrument: instrument };
    }).filter((track) => track.notes.length)
  : midi.tracks.filter((track) => track.notes.length).slice(0, APP_INSTRUMENTS.length);

const convertedTracks = selectedMidiTracks
  .map((track) => {
    const instrument = track.forcedInstrument || chooseInstrument(track, used);
    used.add(instrument);

    const notes = track.notes
      .map((note) => {
        const time = tickToSeconds(note.startTick, tempoMap, midi.division);
        const end = tickToSeconds(note.endTick, tempoMap, midi.division);

        return {
          name: midiToName(note.midi),
          midi: note.midi,
          time,
          velocity: note.velocity,
          duration: Math.max(0.01, end - time)
        };
      })
      .filter((note) => maxSeconds === null || note.time < maxSeconds)
      .map((note) => {
        if (maxSeconds !== null && note.time + note.duration > maxSeconds) {
          return { ...note, duration: Math.max(0.01, maxSeconds - note.time) };
        }
        return note;
      })
      .sort((a, b) => a.time - b.time || a.midi - b.midi);

    const duration = notes.reduce((max, note) => Math.max(max, note.time + note.duration), 0);

    return {
      startTime: 0,
      duration,
      length: notes.length,
      notes,
      name: track.names[0] || null,
      instrumentNumber: null,
      instrument,
      instrumentFamily: 'strings'
    };
  });

const tracks = [];
convertedTracks.forEach((track) => {
  const existing = explicitTrackMap && tracks.find((item) => item.instrument === track.instrument);
  if (!existing) {
    tracks.push(track);
    return;
  }

  existing.notes = existing.notes.concat(track.notes).sort((a, b) => a.time - b.time || a.midi - b.midi);
  existing.length = existing.notes.length;
  existing.duration = existing.notes.reduce((max, note) => Math.max(max, note.time + note.duration), 0);
  if (track.name) existing.name = `${existing.name || existing.instrument} + ${track.name}`;
});

const duration = tracks.reduce((max, track) => Math.max(max, track.duration), 0);

const song = {
  header: {
    PPQ: midi.division,
    bpm,
    timeSignature: [4, 4],
    name: songName || path.basename(input).replace(/\.midi?$/i, '').replace(/\.mid$/i, '')
  },
  startTime: 0,
  duration,
  tracks
};

fs.writeFileSync(output, `${JSON.stringify(song, null, 2)}\n`);

console.log(`Wrote ${output}`);
console.log(`MIDI format ${midi.format}, PPQ ${midi.division}, ${tracks.length} tracks, ${Math.round(duration)} seconds`);
tracks.forEach((track) => {
  console.log(`- ${track.name || 'Untitled'} -> ${track.instrument}: ${track.length} notes`);
});
