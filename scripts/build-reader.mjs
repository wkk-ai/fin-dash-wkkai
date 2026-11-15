// Copies what the Fechamento (print reader) page loads on demand into public/reader:
// the reader engine (reader/*.py), Pyodide (runs it in the browser) and Tesseract (reads the prints' text).
// Everything is served from this site: no third-party CDN sees the page or the prints.
import fs from "node:fs";
import path from "node:path";

const out = "public/reader";
fs.rmSync(out, { recursive: true, force: true });
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

// 1. Python engine
const py = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (!["tests", "__pycache__"].includes(f)) walk(p); }
    else if (/\.(py|txt)$/.test(f)) py.push(path.relative("reader", p));
  }
};
walk("reader");
for (const f of py) copy(path.join("reader", f), path.join(out, "py", f));
fs.writeFileSync(path.join(out, "py", "files.json"), JSON.stringify(py));

// 2. Pyodide runtime (core only: the engine needs nothing outside Python's standard library)
for (const f of ["pyodide.js", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"])
  copy(path.join("node_modules/pyodide", f), path.join(out, "pyodide", f));

// 3. Tesseract: worker, the LSTM cores (the worker picks the one the browser supports) and Portuguese
copy("node_modules/tesseract.js/dist/tesseract.min.js", path.join(out, "tess/tesseract.min.js"));
copy("node_modules/tesseract.js/dist/worker.min.js", path.join(out, "tess/worker.min.js"));
for (const f of fs.readdirSync("node_modules/tesseract.js-core"))
  if (/-lstm\.wasm\.js$/.test(f)) copy(path.join("node_modules/tesseract.js-core", f), path.join(out, "tess/core", f));
copy("node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz", path.join(out, "tess/lang/por.traineddata.gz"));

// 4. The page's script
copy("reader-ui/app.js", path.join(out, "app.js"));
console.log(`reader assets written: ${py.length} engine files + pyodide + tesseract`);
