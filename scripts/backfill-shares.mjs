import { readFile, writeFile } from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { needsShareBackfill, reconcileKaizenShares } from "../js/kaizen-model.js";

const flags = new Set(process.argv.slice(2));
const apply = flags.has("--apply");
const dryRun = flags.has("--dry-run") || !apply;
const inputPath = process.env.KAIZEN_BACKFILL_INPUT;
const logPath = process.env.KAIZEN_BACKFILL_LOG || "kaizen-share-backfill.jsonl";
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "projeto-de-performance-bb964";

if (apply && dryRun) throw new Error("Use --apply ou --dry-run, não ambos.");
if (apply && process.env.KAIZEN_BACKFILL_AUTHORIZED !== "yes") {
  console.error("--apply exige autorização explícita em KAIZEN_BACKFILL_AUTHORIZED=yes.");
  process.exit(2);
}
if (!inputPath) {
  console.error("Defina KAIZEN_BACKFILL_INPUT com um JSON local de exportação {documents:[{id,data}]}.");
  process.exit(2);
}

const fixture = JSON.parse(await readFile(inputPath, "utf8"));
const documents = Array.isArray(fixture) ? fixture : fixture.documents;
if (!Array.isArray(documents)) throw new Error("A fixture deve ser um array ou conter documents: [{id,data}].");

let firestore;
if (apply) {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath) throw new Error("--apply requer GOOGLE_APPLICATION_CREDENTIALS.");
  const credential = JSON.parse(await readFile(credentialPath, "utf8"));
  if (credential.project_id !== projectId) throw new Error("A credencial não corresponde ao projeto indicado.");
  initializeApp({ credential: cert(credential), projectId });
  firestore = getFirestore();
}

const changes = [];
for (const document of documents) {
  if (!document?.id || !document.data || !needsShareBackfill(document.data)) continue;
  const before = structuredClone(document.data);
  const after = reconcileKaizenShares(before);
  const record = { id: document.id, before, after };
  if (apply) await firestore.collection("kaizens").doc(document.id).set(after, { merge: true });
  changes.push(record);
  console.log(JSON.stringify(record));
}
await writeFile(logPath, changes.map((change) => JSON.stringify(change)).join("\n") + (changes.length ? "\n" : ""), "utf8");
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", projectId: apply ? projectId : null, count: changes.length, logPath, records: changes }));