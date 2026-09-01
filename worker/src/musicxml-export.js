// Baut aus einer einfachen Vorgabe eine valide MusicXML-Datei (score-partwise 4.0).
//
// Eingabeformat:
// {
//   title: "Mein Stück",           // optional
//   tempo: 108,                    // optional, Viertel pro Minute, default 120
//   keyFifths: 0,                  // optional, Quintenzirkel-Zahl (-7..7), default 0
//   parts: [
//     {
//       name: "Flöte",             // Pflicht
//       notes: [
//         { step: "C", octave: 5, type: "quarter" },
//         { rest: true, type: "quarter" },
//         { step: "D", octave: 5, alter: 1, type: "eighth" },  // Dis
//       ],
//     },
//   ],
// }
//
// Noten werden anhand von `type` automatisch in Takte zu 4/4 gruppiert. Duration
// wird aus `type` abgeleitet (nicht separat angegeben), damit beides nie auseinanderläuft.

const DIVISIONS = 4; // 1 Viertel = 4 Einheiten, erlaubt bis zu Sechzehntel ohne Bruch
const TYPE_DURATIONS = {
  whole: DIVISIONS * 4,
  half: DIVISIONS * 2,
  quarter: DIVISIONS,
  eighth: DIVISIONS / 2,
  "16th": DIVISIONS / 4,
};
const BEATS_PER_MEASURE = 4;
const MEASURE_DURATION = DIVISIONS * BEATS_PER_MEASURE;
const VALID_STEPS = ["A", "B", "C", "D", "E", "F", "G"];

export function generateMusicXML(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Keine Vorgabe übergeben.");
  }
  const { title, tempo = 120, keyFifths = 0, parts } = spec;

  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Mindestens eine Stimme (parts) wird benötigt.");
  }
  if (!Number.isInteger(keyFifths) || keyFifths < -7 || keyFifths > 7) {
    throw new Error("keyFifths muss eine ganze Zahl zwischen -7 und 7 sein.");
  }
  if (!Number.isFinite(tempo) || tempo <= 0) {
    throw new Error("tempo muss eine positive Zahl sein.");
  }

  const scoreParts = parts.map((part, i) => {
    if (!part.name || typeof part.name !== "string") {
      throw new Error(`Stimme ${i + 1}: name fehlt.`);
    }
    if (!Array.isArray(part.notes) || part.notes.length === 0) {
      throw new Error(`Stimme "${part.name}": mindestens eine Note wird benötigt.`);
    }
    return { id: `P${i + 1}`, name: part.name, notes: part.notes };
  });

  const partListXml = scoreParts
    .map((p) => `<score-part id="${p.id}"><part-name>${escapeXml(p.name)}</part-name></score-part>`)
    .join("");

  const partsXml = scoreParts
    .map((p, i) => buildPartXml(p, i === 0, { tempo, keyFifths }))
    .join("");

  const workXml = title ? `<work><work-title>${escapeXml(title)}</work-title></work>` : "";

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ` +
    `"http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0">${workXml}<part-list>${partListXml}</part-list>${partsXml}</score-partwise>`
  );
}

function buildPartXml(part, isFirstPart, { tempo, keyFifths }) {
  const measures = groupIntoMeasures(part.notes, part.name);

  const measuresXml = measures
    .map((notes, i) => {
      const attributesXml =
        i === 0
          ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${keyFifths}</fifths></key>` +
            `<time><beats>${BEATS_PER_MEASURE}</beats><beat-type>4</beat-type></time>` +
            `<clef><sign>G</sign><line>2</line></clef></attributes>`
          : "";
      const tempoXml =
        i === 0 && isFirstPart
          ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
            `<per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>`
          : "";
      const notesXml = notes.map(noteXml).join("");
      return `<measure number="${i + 1}">${attributesXml}${tempoXml}${notesXml}</measure>`;
    })
    .join("");

  return `<part id="${part.id}">${measuresXml}</part>`;
}

function groupIntoMeasures(notes, partName) {
  const measures = [];
  let current = [];
  let currentDuration = 0;

  for (const note of notes) {
    const duration = durationFor(note, partName);
    if (currentDuration + duration > MEASURE_DURATION) {
      throw new Error(
        `Stimme "${partName}": Note passt nicht mehr in den Takt (4/4) — Auftakte/Bindungen ` +
          `über Taktgrenzen werden noch nicht unterstützt.`
      );
    }
    current.push({ ...note, duration });
    currentDuration += duration;
    if (currentDuration === MEASURE_DURATION) {
      measures.push(current);
      current = [];
      currentDuration = 0;
    }
  }
  if (current.length > 0) measures.push(current); // letzter, unvollständiger Takt
  return measures;
}

function durationFor(note, partName) {
  const duration = TYPE_DURATIONS[note.type];
  if (duration === undefined) {
    throw new Error(
      `Stimme "${partName}": unbekannter Notenwert "${note.type}" ` +
        `(erlaubt: ${Object.keys(TYPE_DURATIONS).join(", ")}).`
    );
  }
  return duration;
}

function noteXml(note) {
  if (note.rest) {
    return `<note><rest/><duration>${note.duration}</duration><type>${note.type}</type></note>`;
  }
  if (!VALID_STEPS.includes(note.step)) {
    throw new Error(`Ungültiger Notenname "${note.step}" (erlaubt: ${VALID_STEPS.join(", ")}).`);
  }
  if (!Number.isInteger(note.octave) || note.octave < 0 || note.octave > 9) {
    throw new Error(`Ungültige Oktave "${note.octave}" (erlaubt: 0-9).`);
  }
  const alterXml = note.alter ? `<alter>${note.alter}</alter>` : "";
  return (
    `<note><pitch><step>${note.step}</step>${alterXml}<octave>${note.octave}</octave></pitch>` +
    `<duration>${note.duration}</duration><type>${note.type}</type></note>`
  );
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
