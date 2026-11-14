// Schreibt die Testabdeckung (lib/) als Markdown-Tabelle in die GitHub-Job-Zusammenfassung.
import { appendFileSync, readFileSync } from "node:fs";

const total = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8")).total;
const row = (key, name) => `| ${name} | ${total[key].pct} % | ${total[key].covered}/${total[key].total} |`;
const md = [
  "### Testabdeckung (lib/)",
  "| | Anteil | abgedeckt |",
  "|---|---|---|",
  row("statements", "Anweisungen"),
  row("branches", "Verzweigungen"),
  row("functions", "Funktionen"),
  row("lines", "Zeilen"),
  "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
