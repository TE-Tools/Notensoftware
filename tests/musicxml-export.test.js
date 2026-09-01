import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMusicXML } from "../worker/src/musicxml-export.js";

const MINIMAL_SPEC = {
  title: "Testlauf",
  tempo: 108,
  keyFifths: -1,
  parts: [
    {
      name: "Flöte",
      notes: [
        { step: "C", octave: 5, type: "quarter" },
        { step: "D", octave: 5, type: "quarter" },
        { rest: true, type: "quarter" },
        { step: "E", octave: 5, alter: -1, type: "quarter" },
      ],
    },
  ],
};

test("erzeugt eine wohlgeformte score-partwise-Datei mit Titel und Tempo", () => {
  const xml = generateMusicXML(MINIMAL_SPEC);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<score-partwise version="4.0">/);
  assert.match(xml, /<work-title>Testlauf<\/work-title>/);
  assert.match(xml, /<per-minute>108<\/per-minute>/);
  assert.match(xml, /<fifths>-1<\/fifths>/);
});

test("gruppiert Noten korrekt in 4\\/4-Takte", () => {
  const xml = generateMusicXML(MINIMAL_SPEC);
  const measureCount = (xml.match(/<measure /g) || []).length;
  assert.equal(measureCount, 1); // 4 Viertel = genau ein Takt
});

test("legt einen neuen Takt an, sobald der vorherige voll ist", () => {
  const spec = {
    parts: [
      {
        name: "Klarinette",
        notes: Array.from({ length: 8 }, () => ({ step: "G", octave: 4, type: "quarter" })),
      },
    ],
  };
  const xml = generateMusicXML(spec);
  const measureCount = (xml.match(/<measure /g) || []).length;
  assert.equal(measureCount, 2);
});

test("baut Vorzeichen (alter) korrekt ein", () => {
  const xml = generateMusicXML(MINIMAL_SPEC);
  assert.match(xml, /<step>E<\/step><alter>-1<\/alter><octave>5<\/octave>/);
});

test("baut Pausen ohne Tonhöhe", () => {
  const xml = generateMusicXML(MINIMAL_SPEC);
  assert.match(xml, /<note><rest\/><duration>4<\/duration><type>quarter<\/type><\/note>/);
});

test("mehrere Stimmen bekommen eigene part-Elemente", () => {
  const spec = {
    parts: [
      { name: "Flöte", notes: [{ step: "C", octave: 5, type: "quarter" }] },
      { name: "Klarinette", notes: [{ step: "G", octave: 4, type: "quarter" }] },
    ],
  };
  const xml = generateMusicXML(spec);
  assert.match(xml, /<score-part id="P1"><part-name>Flöte<\/part-name>/);
  assert.match(xml, /<score-part id="P2"><part-name>Klarinette<\/part-name>/);
  assert.equal((xml.match(/<part id=/g) || []).length, 2);
});

test("lehnt fehlende Stimmen ab", () => {
  assert.throws(() => generateMusicXML({ parts: [] }), /Mindestens eine Stimme/);
});

test("lehnt unbekannten Notenwert ab", () => {
  const spec = { parts: [{ name: "Flöte", notes: [{ step: "C", octave: 5, type: "hundertstel" }] }] };
  assert.throws(() => generateMusicXML(spec), /unbekannter Notenwert/);
});

test("lehnt ungültigen Notennamen ab", () => {
  const spec = { parts: [{ name: "Flöte", notes: [{ step: "H", octave: 5, type: "quarter" }] }] };
  assert.throws(() => generateMusicXML(spec), /Ungültiger Notenname/);
});

test("rundtrip: erzeugte MusicXML lässt sich vom eigenen Analyzer wieder lesen", async () => {
  const { analyzeMusicXML } = await import("../worker/src/musicxml.js");
  const xml = generateMusicXML(MINIMAL_SPEC);
  const result = analyzeMusicXML(xml);
  assert.equal(result.partCount, 1);
  assert.equal(result.parts[0].name, "Flöte");
  assert.equal(result.parts[0].noteCount, 4);
});
