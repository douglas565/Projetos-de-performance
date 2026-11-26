import { readFile } from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const logPath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!logPath || !apply || process.env.KAIZEN_BACKFILL_AUTHORIZED !== "yes") {
  console.error("Reversão exige <log.jsonl> --apply e KAIZEN_BACKFILL_AUTHORIZED=yes.");
  process.exit(2);
}
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialPath) throw new Error("Defina GOOGLE_APPLICATION_CREDENTIALS.");
const credential = JSON.parse(await readFile(credentialPath, "utf8"));
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || credential.project_id;
if (credential.project_id !== projectId) throw new Error("A credencial não corresponde ao projeto indicado.");
initializeApp({ credential: cert(credential), projectId });
const firestore = getFirestore();
const entries = (await readFile(logPath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
for (const entry of entries) {
  if (!entry.id || !entry.before || !entry.after) throw new Error("Formato de log de reversão inválido.");
  await firestore.collection("kaizens").doc(entry.id).set(entry.before, { merge: true });
  console.log(JSON.stringify({ id: entry.id, reverted: true }));
}
console.log(JSON.stringify({ mode: "revert", count: entries.length, projectId }));
