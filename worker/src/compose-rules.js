// Regelbasierter Kompositions-Modus — kein KI-Aufruf, keine Kosten, kein Timeout-Risiko.
//
// Echte (wenn auch einfache) Musiktheorie als Code statt eines Sprachmodells:
// Tonleiter aus der Vorzeichenzahl (fifths) ableiten, eine simple Kadenz-Akkordfolge
// abspulen, drei feste Rollen (Melodie/Pad/Arpeggio) auf die angegebenen Stimmen
// verteilen. Deterministisch: dieselbe Eingabe ergibt immer dasselbe Ergebnis — das
// unterscheidet diesen Modus bewusst von /api/compose (Claude).
//
// Ehrlich gesagt: musikalisch simpler als Claudes Vorschläge (keine freie
// Motiv-Entwicklung, keine Dynamik-Feinheiten) — dafür sofort da, kostenlos, und
// beliebig oft wiederholbar.

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const TONIC_LETTER = {
  "-7": "C", "-6": "G", "-5": "D", "-4": "A", "-3": "E", "-2": "B", "-1": "F",
  "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F", "7": "C",
};
const GERMAN_KEY_NAMES = {
  "-7": "Ces-Dur", "-6": "Ges-Dur", "-5": "Des-Dur", "-4": "As-Dur", "-3": "Es-Dur",
  "-2": "B-Dur", "-1": "F-Dur", "0": "C-Dur", "1": "G-Dur", "2": "D-Dur", "3": "A-Dur",
  "4": "E-Dur", "5": "H-Dur", "6": "Fis-Dur", "7": "Cis-Dur",
};
const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const DEFAULT_INSTRUMENTS = ["Flöte", "Klarinette", "Horn in F", "Trompete"];
const DEFAULT_BARS = 8;
const ROLES = ["melody", "arpeggio", "pad"];

function keySignatureAlters(fifths) {
  const alters = {};
  if (fifths > 0) {
    for (let i = 0; i < fifths; i++) alters[SHARP_ORDER[i]] = 1;
  } else if (fifths < 0) {
    for (let i = 0; i < -fifths; i++) alters[FLAT_ORDER[i]] = -1;
  }
  return alters;
}

export function majorScale(fifths) {
  const alters = keySignatureAlters(fifths);
  const tonicLetter = TONIC_LETTER[String(fifths)];
  const startIdx = LETTERS.indexOf(tonicLetter);
  const degrees = [];
  for (let i = 0; i < 7; i++) {
    const letter = LETTERS[(startIdx + i) % 7];
    degrees.push({ step: letter, alter: alters[letter] || 0 });
  }
  return degrees;
}

// scaleDegree ist ein vorzeichenbehafteter Index relativ zur Tonika (0 = Tonika,
// 2 = Terz, 4 = Quinte, 7 = Tonika eine Oktave höher, -1 = Leitton darunter, ...).
export function degreeToNote(fifths, scaleDegree, baseOctave, type, rest = false) {
  if (rest) return { step: null, octave: null, alter: null, rest: true, type };
  const scale = majorScale(fifths);
  const idx = ((scaleDegree % 7) + 7) % 7;
  const octaveShift = Math.floor(scaleDegree / 7);
  const note = scale[idx];
  return { step: note.step, octave: baseOctave + octaveShift, alter: note.alter, rest: false, type };
}

// Einfache Kadenz-Akkordfolge: I–IV–V–I je 4-Takt-Block, letzter Takt immer Tonika,
// vorletzter Takt (falls vorhanden) immer Dominante — klassischer Ganzschluss,
// unabhängig davon, wo der Block gerade steht.
function chordProgression(bars) {
  const cell = [0, 3, 4, 0];
  const roots = [];
  for (let i = 0; i < bars; i++) roots.push(cell[i % 4]);
  if (bars >= 1) roots[bars - 1] = 0;
  if (bars >= 2) roots[bars - 2] = 4;
  return roots;
}

function melodyBar(fifths, root, barIndex, isLastBar) {
  if (isLastBar) {
    return [degreeToNote(fifths, 0, 5, "whole")];
  }
  const shape = barIndex % 2 === 0 ? [0, 2, 4, 2] : [4, 2, 0, 2];
  const type = barIndex % 2 === 0 ? "quarter" : "quarter";
  return shape.map((offset) => degreeToNote(fifths, root + offset, 5, type));
}

function padBar(fifths, root) {
  return [degreeToNote(fifths, root, 4, "whole")];
}

function arpeggioBar(fifths, root) {
  const shape = [0, 2, 4, 2, 0, 2, 4, 2];
  return shape.map((offset) => degreeToNote(fifths, root + offset, 4, "eighth"));
}

function buildPart(role, fifths, roots, octaveShift) {
  const notes = [];
  roots.forEach((root, i) => {
    const isLast = i === roots.length - 1;
    let bar;
    if (role === "melody") bar = melodyBar(fifths, root, i, isLast);
    else if (role === "arpeggio") bar = arpeggioBar(fifths, root);
    else bar = padBar(fifths, root);
    for (const note of bar) {
      notes.push(note.rest ? note : { ...note, octave: note.octave + octaveShift });
    }
  });
  return notes;
}

export function composeWithRules(input) {
  const { idea, tempo, keyFifths, instruments, bars } = input || {};
  const fifths = Number.isInteger(keyFifths) ? keyFifths : 0;
  if (fifths < -7 || fifths > 7) {
    throw new Error("keyFifths muss zwischen -7 und 7 liegen.");
  }
  const bpm = Number.isFinite(tempo) && tempo > 0 ? tempo : 108;
  const barCount = Number.isInteger(bars) && bars > 0 ? bars : DEFAULT_BARS;
  const instrumentList =
    Array.isArray(instruments) && instruments.length > 0 ? instruments : DEFAULT_INSTRUMENTS;

  const roots = chordProgression(barCount);

  const parts = instrumentList.map((name, i) => {
    const role = ROLES[i % ROLES.length];
    const octaveShift = Math.floor(i / ROLES.length) * (i % 2 === 0 ? 1 : -1);
    return { name, role, notes: buildPart(role, fifths, roots, octaveShift) };
  });

  const chordSymbols = roots.map((r) => ROMAN[r]);
  const byRole = (role) => parts.filter((p) => p.role === role).map((p) => p.name);
  const title = idea ? `${idea} (regelbasiert)` : "Ohne Titel (regelbasiert)";
  const explanation =
    `Regelbasiert erzeugt, ohne KI-Aufruf: ${barCount} Takte in ${GERMAN_KEY_NAMES[String(fifths)]}, ` +
    `Tempo ${bpm}. Akkordfolge (vereinfachte Kadenz): ${chordSymbols.join(" – ")}. ` +
    `${byRole("melody").join(", ") || "—"} trägt die Melodie (Akkordtöne, auf-/absteigend), ` +
    `${byRole("arpeggio").join(", ") || "—"} spielt gebrochene Akkorde in Achteln, ` +
    `${byRole("pad").join(", ") || "—"} hält liegende Grundtöne. Schluss auf dem Grundton. ` +
    `Deterministisch: dieselbe Eingabe ergibt immer dasselbe Ergebnis.`;

  return {
    explanation,
    spec: {
      title,
      tempo: bpm,
      keyFifths: fifths,
      parts: parts.map(({ name, notes }) => ({ name, notes })),
    },
  };
}
