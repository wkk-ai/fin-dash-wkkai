// Bundles the stock-screener front end (stocks/src) into one file the Ações page loads on demand.
import fs from "node:fs";

const src = ["core", "charts", "views"]
  .map((f) => fs.readFileSync(`stocks/src/${f}.js`, "utf8").replace(/^"use strict";\s*$/m, ""))
  .join("\n");
fs.mkdirSync("public/stocks", { recursive: true });
fs.writeFileSync(
  "public/stocks/app.js",
  `/* Generated from stocks/src by scripts/build-stocks.mjs. Do not edit. */\n(function () {\n"use strict";\nif (window.StocksApp) return;\n${src}\n})();\n`
);
console.log("stocks bundle written: public/stocks/app.js");
