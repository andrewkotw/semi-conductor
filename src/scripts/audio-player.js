/*
Copyright 2019 Google LLC

Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
*/

import Tone from 'tone';
import config from '../config.js';
import { getBeatLengthFromTempo, constrain } from './helpers';

export default class AudioPlayer {
  constructor(props) {
    this.props = props;
    this.activeInstruments = [];
    this.velocity = 0.7;  // Arbitrary starting point that will be overridden by user
    this.finishedInstruments = 0;
    this.totalMeasures = (props.song.duration / 60) * (props.song.header.bpm / 4);
    this.loadInstruments();
  }

  /* Called from main.js when tempo received from PoseController */
  setTempo(tempo) {
    Tone.Transport.bpm.value = constrain(tempo, {
      min: 0,
      max: config.detection.maximumBpm
    });
  }

  /* This classroom version intentionally uses synth voices instead of samples. */
  async loadInstruments() {
    const effects = await this.createEffects();
    this.generateSynths(effects);
    this.props.setInstrumentsLoaded(100);
  }

  async createEffects() {
    // Make it sound nice
    const gain = new Tone.Gain(config.tone.gain);
    const jcReverb = new Tone.JCReverb();
    const reverb = new Tone.Reverb(config.tone.reverb);
    jcReverb.wet.value = config.tone.jcReverbWet;
    reverb.wet.value = config.tone.reverbWet;
    await reverb.generate();

    return { gain, jcReverb, reverb };
  }

  getSynthSettings(instrument) {
    const settings = {
      violin: {
        voice: Tone.FMSynth,
        voices: 10,
        options: {
          harmonicity: 1.4,
          modulationIndex: 4,
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.04,
            decay: 0.12,
            sustain: 0.55,
            release: 0.9
          },
          modulation: { type: 'triangle' },
          modulationEnvelope: {
            attack: 0.08,
            decay: 0.2,
            sustain: 0.25,
            release: 0.6
          }
        }
      },
      'string ensemble 1': {
        voice: Tone.Synth,
        voices: 14,
        options: {
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.08,
            decay: 0.15,
            sustain: 0.6,
            release: 1.1
          }
        }
      },
      viola: {
        voice: Tone.Synth,
        voices: 10,
        options: {
          oscillator: { type: 'triangle' },
          envelope: {
            attack: 0.05,
            decay: 0.14,
            sustain: 0.5,
            release: 0.85
          }
        }
      },
      cello: {
        voice: Tone.MonoSynth,
        voices: 8,
        options: {
          oscillator: { type: 'triangle' },
          filter: {
            Q: 1,
            type: 'lowpass',
            rolloff: -24
          },
          envelope: {
            attack: 0.04,
            decay: 0.18,
            sustain: 0.58,
            release: 0.9
          },
          filterEnvelope: {
            attack: 0.06,
            decay: 0.25,
            sustain: 0.35,
            release: 0.8,
            baseFrequency: 180,
            octaves: 2.2
          }
        }
      },
      contrabass: {
        voice: Tone.MonoSynth,
        voices: 6,
        options: {
          oscillator: { type: 'sine' },
          filter: {
            Q: 1,
            type: 'lowpass',
            rolloff: -24
          },
          envelope: {
            attack: 0.02,
            decay: 0.2,
            sustain: 0.62,
            release: 1.0
          },
          filterEnvelope: {
            attack: 0.03,
            decay: 0.25,
            sustain: 0.28,
            release: 0.9,
            baseFrequency: 80,
            octaves: 2
          }
        }
      }
    };

    return settings[instrument] || settings.viola;
  }

  /* Generates one synth voice for each track in the piece. */
  generateSynths(effects) {
    this.activeInstruments = [];

    this.props.song.tracks.forEach((track) => {
      const synth = this.getSynthSettings(track.instrument);

      this.activeInstruments.push(track.instrument);
      track.sampler = new Tone.PolySynth(synth.voices, synth.voice, synth.options)
        .chain(effects.gain, effects.jcReverb, effects.reverb, Tone.Master);
    });
  }

  /* Queue the score on Tone.Transport. */
  queueSong() {
    const song = this.props.song;
    const startTime = this.props.song.startTime;

    Tone.Transport.bpm.value = this.startingBpm = song.header.bpm;
    Tone.Transport.timeSignature = song.header.timeSignature;
    song.tracks.forEach((track) => {
      this.queueTrack(track, track.sampler);
    });

    Tone.Transport.position = startTime;
  }

  /* Add all notes to the Transport, with the relevant synth. */
  queueTrack(track, instrument) {
    if (!instrument) return;

    new Tone.Part((time, note) => {
      const measures = parseInt(Tone.Transport.position.split(':')[0]) + 1;
      this.props.setSongProgress(100 * measures / this.totalMeasures)

      // Only play the instrument this bar if it's active
      if (this.activeInstruments.includes(track.instrument)) {
        // Adjust note duration based on tempo (slower tempo = longer notes)
        const durationRatio = this.startingBpm / Math.max(Tone.Transport.bpm.value, config.detection.minimumBpm);
        const duration = constrain(note.duration * durationRatio, {
          max: config.detection.maximumDuration,
          min: config.detection.minimumDuration
        });

        const velocity = constrain(this.velocity, {
          max: config.detection.maximumVelocity,
          min: config.detection.minimumVelocity
        });

        instrument.triggerAttackRelease(note.name, duration, time, velocity);
        this.props.triggerAnimation(track.instrument, duration, this.velocity);
      }
    }, track.notes).start();
  }

  /* Change which instruments are playing based on PoseController data */
  setInstrumentGroup(i) {
    this.activeInstruments = config.zones[i].instruments
  }

  /* Change velocity based on PoseController data */
  setVelocity(vel) {
    this.velocity = vel;
  }

  getBeatLength() {
    return getBeatLengthFromTempo(Tone.Transport.bpm.value);
  }

  start() {
    Tone.Transport.start();
  }

  stop() {
    Tone.Transport.pause();
  }

  restart() {
    Tone.Transport.stop();
    this.beatsElapsed = 0;
    Tone.Transport.bpm.value = this.startingBpm;
  }
}
