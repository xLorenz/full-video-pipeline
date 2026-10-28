
/*
  QUIET SIGNAL — Explainer Background Music
  Tempo: 76 BPM
  Harmony: D minor / F major colour
  Structure: 4-bar intro, 8-bar drop, 4-bar loopable outro

  Chord layer has been softened for voice-over use.
*/

const BPM = 76;

Tone.Transport.bpm.value = BPM;
Tone.Transport.timeSignature = [4, 4];

// --------------------------------------
// EFFECTS
// --------------------------------------

const master = new Tone.Gain(0.72).toDestination();

const room = new Tone.Reverb({
  decay: 2.4,
  preDelay: 0.025,
  wet: 0.20
}).connect(master);

const delay = new Tone.FeedbackDelay("8n.", 0.12)
  .connect(room);

// --------------------------------------
// INSTRUMENTS
// --------------------------------------

// Soft piano-like synth
const piano = new Tone.PolySynth(Tone.Synth, {
  oscillator: {
    type: "triangle"
  },
  envelope: {
    attack: 0.012,
    decay: 1.6,
    sustain: 0.10,
    release: 1.8
  }
}).connect(delay);

piano.volume.value = -7;

// Rounded bass
const bass = new Tone.MonoSynth({
  oscillator: {
    type: "sine"
  },
  filter: {
    Q: 0.5,
    type: "lowpass",
    rolloff: -12
  },
  envelope: {
    attack: 0.025,
    decay: 0.7,
    sustain: 0.18,
    release: 0.8
  },
  filterEnvelope: {
    attack: 0.02,
    decay: 0.25,
    sustain: 0.12,
    release: 0.5,
    baseFrequency: 90,
    octaves: 1.2
  }
}).connect(room);

bass.volume.value = -10;

// Quiet ambient pad
const pad = new Tone.PolySynth(Tone.Synth, {
  oscillator: {
    type: "sine"
  },
  envelope: {
    attack: 0.55,
    decay: 1.0,
    sustain: 0.30,
    release: 1.4
  }
}).connect(room);

pad.volume.value = -27;

// Muted melodic pluck
const pluck = new Tone.MonoSynth({
  oscillator: {
    type: "sine"
  },
  envelope: {
    attack: 0.004,
    decay: 0.48,
    sustain: 0.0,
    release: 0.15
  }
}).connect(delay);

pluck.volume.value = -19;

// Extremely quiet rhythmic accents
const tick = new Tone.MembraneSynth({
  pitchDecay: 0.015,
  octaves: 1,
  oscillator: {
    type: "sine"
  },
  envelope: {
    attack: 0.001,
    decay: 0.12,
    sustain: 0
  }
}).connect(room);

tick.volume.value = -31;

function softTick(time) {
  tick.triggerAttackRelease("C2", 0.06, time, 0.18);
}

// --------------------------------------
// HARMONY
// --------------------------------------

const chords = [
  {
    name: "Dm9",
    notes: ["D3", "A3", "C4", "E4", "G4"],
    bass: "D2"
  },
  {
    name: "Bbmaj7",
    notes: ["Bb2", "F3", "A3", "D4", "F4"],
    bass: "Bb1"
  },
  {
    name: "Fadd9",
    notes: ["C3", "F3", "A3", "C4", "G4"],
    bass: "F1"
  },
  {
    name: "C6sus2",
    notes: ["C3", "E3", "G3", "A3", "D4"],
    bass: "C2"
  }
];

const motifDegree = [3, 2, 4, 2];

// --------------------------------------
// ARRANGEMENT
// --------------------------------------

function scheduleCue() {
  Tone.Transport.cancel(0);

  const secondsPerBeat = 60 / BPM;

  for (let b = 0; b < 16; b++) {
    const chord = chords[b % 4];

    const section =
      b < 4 ? "intro" :
      b < 12 ? "drop" :
      "outro";

    const barStart = `${b}:0:0`;

    Tone.Transport.schedule((time) => {

      // ------------------------------
      // INTRO: sparse piano
      // ------------------------------

      if (section === "intro") {

        piano.triggerAttackRelease(
          chord.notes[0], 2.6, time, 0.40
        );

        piano.triggerAttackRelease(
          chord.notes[2],
          2.2,
          time + secondsPerBeat * 1.05,
          0.28
        );

        piano.triggerAttackRelease(
          chord.notes[1],
          2.6,
          time + secondsPerBeat * 2,
          0.31
        );

        piano.triggerAttackRelease(
          chord.notes[3],
          2.0,
          time + secondsPerBeat * 3,
          0.25
        );

      } else {

        // ------------------------------
        // DROP + LOOPABLE OUTRO
        // ------------------------------

        const voicing = chord.notes.map(
          (note, i) =>
            i === 0
              ? note
              : Tone.Frequency(note)
                  .transpose(12)
                  .toNote()
        );

        // Main chord layer — reduced velocity
        // Original: 0.62
        // Revised: 0.38
        piano.triggerAttackRelease(
          voicing,
          2.8,
          time,
          0.38
        );

        // Soft repeating melodic motif
        for (let k = 0; k < 4; k++) {

          const note = Tone.Frequency(
            chord.notes[motifDegree[k]]
          ).transpose(12).toNote();

          pluck.triggerAttackRelease(
            note,
            0.55,
            time + secondsPerBeat * (k + 0.5),
            0.20
          );
        }

        // Bass support
        bass.triggerAttackRelease(
          chord.bass,
          1.6,
          time,
          0.40
        );

        bass.triggerAttackRelease(
          Tone.Frequency(chord.bass)
            .transpose(7)
            .toNote(),
          1.0,
          time + secondsPerBeat * 2,
          0.20
        );

        // Rhythmic accents only during the drop
        if (section === "drop") {
          softTick(time + secondsPerBeat);
          softTick(time + secondsPerBeat * 3);
        }

        // Ambient pad, alternating bars
        if (b % 2 === 0) {
          pad.triggerAttackRelease(
            Tone.Frequency(chord.notes[4])
              .transpose(12)
              .toNote(),
            secondsPerBeat * 3.6,
            time,
            0.12
          );
        }
      }

    }, barStart);
  }

  // Stop after 16 bars
  Tone.Transport.scheduleOnce(
    () => Tone.Transport.stop(),
    "16:0:0"
  );
}

// --------------------------------------
// PLAYBACK CONTROLS
// --------------------------------------

async function startCue() {
  await Tone.start();

  Tone.Transport.stop();
  Tone.Transport.position = "0:0:0";

  scheduleCue();

  Tone.Transport.start("+0.05");
}

function stopCue() {
  Tone.Transport.stop();
  Tone.Transport.cancel(0);
}

// Connect to buttons in the HTML page
document.querySelector("#start")
  ?.addEventListener("click", startCue);

document.querySelector("#stop")
  ?.addEventListener("click", stopCue);

