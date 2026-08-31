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
