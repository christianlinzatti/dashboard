// Startet den E2E-Workflow für einen Branch (Commits mit dem Workflow-Token lösen selbst keine Workflows aus).
const { GITHUB_TOKEN, REPO, REF } = process.env;
if (!GITHUB_TOKEN || !REPO || !REF) throw new Error("GITHUB_TOKEN, REPO und REF müssen gesetzt sein");

const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/e2e.yml/dispatches`, {
  method: "POST",
  headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
  body: JSON.stringify({ ref: REF }),
});
console.log("E2E gestartet:", res.status);
if (res.status !== 204) process.exit(1);
