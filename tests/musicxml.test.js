import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMusicXML } from "../worker/src/musicxml.js";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Flöte</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

test("liest Stimmen aus part-list", () => {
  const result = analyzeMusicXML(SAMPLE);
  assert.equal(result.partCount, 1);
  assert.equal(result.parts[0].name, "Flöte");
});

test("zählt Noten und ermittelt Tonumfang je Stimme", () => {
  const result = analyzeMusicXML(SAMPLE);
  assert.equal(result.parts[0].noteCount, 2);
  assert.deepEqual(result.parts[0].range, { lowest: "G4", highest: "C5" });
});

test("lehnt Dateien ohne score-partwise ab", () => {
  assert.throws(() => analyzeMusicXML("<not-musicxml/>"));
});
