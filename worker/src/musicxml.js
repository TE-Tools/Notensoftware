// Leichtgewichtiger MusicXML-Reader.
//
// Cloudflare Workers haben kein DOMParser/XML-DOM zur Verfügung, deshalb hier ein
// schlanker, auf MusicXML zugeschnittener Tag-Leser statt eines vollständigen
// XML-Parsers. Reicht für sauber exportierte Partiturdateien (Sibelius, MuseScore,
// Capella); kein Anspruch, beliebiges XML zu verarbeiten.

export function analyzeMusicXML(xmlText) {
  if (!/<score-partwise|<score-timewise/.test(xmlText)) {
    throw new Error("Keine gültige MusicXML-Datei (score-partwise/-timewise fehlt).");
  }

  const parts = extractParts(xmlText);
  if (parts.length === 0) {
    throw new Error("Keine <part-list> mit Stimmen gefunden.");
  }

  for (const part of parts) {
    const body = extractPartBody(xmlText, part.id);
    part.noteCount = (body.match(/<note[\s>]/g) || []).length;
    part.range = notePitchRange(body);
  }

  return { partCount: parts.length, parts };
}

function extractParts(xmlText) {
  const listMatch = xmlText.match(/<part-list>([\s\S]*?)<\/part-list>/);
  if (!listMatch) return [];

  const parts = [];
  const scorePartRe = /<score-part id="([^"]+)">([\s\S]*?)<\/score-part>/g;
  let m;
  while ((m = scorePartRe.exec(listMatch[1])) !== null) {
    const [, id, body] = m;
    const nameMatch = body.match(/<part-name>([^<]*)<\/part-name>/);
    parts.push({ id, name: nameMatch ? nameMatch[1].trim() : id });
  }
  return parts;
}

function extractPartBody(xmlText, partId) {
  const re = new RegExp(`<part id="${escapeRegExp(partId)}">([\\s\\S]*?)<\\/part>`);
  const m = xmlText.match(re);
  return m ? m[1] : "";
}

function notePitchRange(partBody) {
  const steps = ["C", "D", "E", "F", "G", "A", "B"];
  let min = null;
  let max = null;
  const pitchRe = /<pitch>\s*<step>([A-G])<\/step>(?:\s*<alter>(-?\d+)<\/alter>)?\s*<octave>(\d+)<\/octave>/g;
  let m;
  while ((m = pitchRe.exec(partBody)) !== null) {
    const [, step, , octave] = m;
    const midiIsh = Number(octave) * 7 + steps.indexOf(step);
    if (min === null || midiIsh < min.value) min = { value: midiIsh, step, octave };
    if (max === null || midiIsh > max.value) max = { value: midiIsh, step, octave };
  }
  if (!min || !max) return null;
  return {
    lowest: `${min.step}${min.octave}`,
    highest: `${max.step}${max.octave}`,
  };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
