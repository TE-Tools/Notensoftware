const form = document.getElementById("analyzeForm");
const result = document.getElementById("result");

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const file = document.getElementById("file").files[0];
  if (!file) return;

  result.textContent = "Analysiere …";
  try {
    const xmlText = await file.text();
    const res = await fetch("/api/analyze-musicxml", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: xmlText,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unbekannter Fehler");
    result.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    result.textContent = `Fehler: ${err.message}`;
  }
});

const generateBtn = document.getElementById("generateBtn");
const generateResult = document.getElementById("generateResult");

const CMAJOR_SCALE_DEMO = {
  title: "C-Dur-Tonleiter (Testbeispiel)",
  tempo: 100,
  keyFifths: 0,
  parts: [
    {
      name: "Flöte",
      notes: ["C", "D", "E", "F", "G", "A", "B", "C"].map((step, i) => ({
        step,
        octave: i === 7 ? 6 : 5,
        type: "quarter",
      })),
    },
  ],
};

generateBtn.addEventListener("click", async () => {
  generateResult.textContent = "Erzeuge …";
  try {
    const res = await fetch("/api/generate-musicxml", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CMAJOR_SCALE_DEMO),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unbekannter Fehler");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    generateResult.innerHTML = `<a href="${url}" download="testbeispiel.musicxml">testbeispiel.musicxml herunterladen</a>`;
  } catch (err) {
    generateResult.textContent = `Fehler: ${err.message}`;
  }
});
