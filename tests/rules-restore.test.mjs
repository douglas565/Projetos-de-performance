// Cobertura das regras de update usadas por softDeleteKaizen/restoreKaizen
// (js/db.js) e pelo botão "Restaurar" do admin.js.
// Payload canônico: rev = rev atual + 1, atualizadoEm e atualizadoPor.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { after, before, test } from "node:test";

let env;
const now = new Date("2026-01-01T00:00:00Z");

const archivedKaizen = {
  ownerUid: "owner",
  schemaVersion: 2,
  rev: 3,
  arquivado: true,
  atualizadoEm: now,
  projeto: "Arquivado",
  shares: [{ uid: "viewer", email: "viewer@example.com", nome: "Viewer", role: "view" }],
  viewersUids: ["viewer"],
  editorsUids: [],
  sharedWithUids: ["viewer"]
};

const activeKaizen = { ...archivedKaizen, rev: 1, arquivado: false, projeto: "Ativo" };

const authContext = (uid) => env.authenticatedContext(uid).firestore();
const ref = (db, id = "k-restore") => doc(db, "kaizens", id);

async function seed(id, data) {
  await env.withSecurityRulesDisabled((context) => setDoc(ref(context.firestore(), id), data));
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "kaizen-rules-restore-tests",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const uid of ["owner", "admin", "editor"]) {
      await setDoc(doc(db, "users", uid), { uid, role: uid === "admin" ? "admin" : "user", status: "active" });
    }
  });
});

after(async () => env?.cleanup());

const checks = [
  ["admin can restore archived kaizen with rev+1", async () => {
    await seed("admin-restore-ok", archivedKaizen);
    await assertSucceeds(updateDoc(ref(authContext("admin"), "admin-restore-ok"), {
      arquivado: false,
      rev: archivedKaizen.rev + 1,
      atualizadoEm: now,
      atualizadoPor: "admin"
    }));
  }],
  ["admin restore without rev is denied", async () => {
    await seed("admin-restore-bad-rev", archivedKaizen);
    // Payload antigo do botão "Restaurar": sem rev, não satisfaz nk().rev == k().rev + 1.
    await assertFails(updateDoc(ref(authContext("admin"), "admin-restore-bad-rev"), {
      arquivado: false,
      atualizadoEm: now
    }));
  }],
  ["admin soft delete with rev+1 is allowed", async () => {
    await seed("admin-soft-delete", activeKaizen);
    await assertSucceeds(updateDoc(ref(authContext("admin"), "admin-soft-delete"), {
      arquivado: true,
      rev: activeKaizen.rev + 1,
      atualizadoEm: now,
      atualizadoPor: "admin"
    }));
  }],
  ["owner soft delete with rev+1 is allowed", async () => {
    await seed("owner-soft-delete", activeKaizen);
    await assertSucceeds(updateDoc(ref(authContext("owner"), "owner-soft-delete"), {
      arquivado: true,
      rev: activeKaizen.rev + 1,
      atualizadoEm: now,
      atualizadoPor: "owner"
    }));
  }],
  ["owner restore archived kaizen with rev+1 is allowed", async () => {
    await seed("owner-restore-ok", archivedKaizen);
    await assertSucceeds(updateDoc(ref(authContext("owner"), "owner-restore-ok"), {
      arquivado: false,
      rev: archivedKaizen.rev + 1,
      atualizadoEm: now,
      atualizadoPor: "owner"
    }));
  }],
  ["owner soft delete without rev is denied", async () => {
    await seed("owner-soft-delete-bad-rev", activeKaizen);
    await assertFails(updateDoc(ref(authContext("owner"), "owner-soft-delete-bad-rev"), {
      arquivado: true,
      atualizadoEm: now
    }));
  }]
];

for (const [name, run] of checks) test(name, run);
