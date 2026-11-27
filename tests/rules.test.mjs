import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { after, before, test } from "node:test";

let env;
const now = new Date("2026-01-01T00:00:00Z");
const seedKaizen = {
  ownerUid: "owner",
  schemaVersion: 2,
  rev: 1,
  arquivado: false,
  atualizadoEm: now,
  projeto: "Teste",
  shares: [{ uid: "viewer", email: "viewer@example.com", nome: "Viewer", role: "view" }, { uid: "editor", email: "editor@example.com", nome: "Editor", role: "edit" }],
  viewersUids: ["viewer"],
  editorsUids: ["editor"],
  sharedWithUids: ["viewer", "editor"]
};

const authContext = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const kaizenRef = (db, id = "k1") => doc(db, "kaizens", id);
const kaizenQuery = (db, uid) => query(collection(db, "kaizens"), where("sharedWithUids", "array-contains", uid));
const uniqueKaizen = (suffix, data = {}) => ({ ...seedKaizen, ...data, projeto: `Teste ${suffix}` });
async function seedForCase(id, data = seedKaizen) {
  await env.withSecurityRulesDisabled((context) => setDoc(kaizenRef(context.firestore(), id), data));
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "kaizen-rules-tests",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, status] of [
      ["owner", "user", "active"], ["viewer", "user", "active"], ["editor", "user", "active"],
      ["admin", "admin", "active"], ["pending", "user", "pending"], ["stranger", "user", "active"],
      ["blocked", "user", "blocked"], ["blockedadmin", "admin", "blocked"]
    ]) {
      await setDoc(doc(db, "users", uid), { uid, role, status });
    }
    await setDoc(kaizenRef(db), seedKaizen);
  });
});

after(async () => env?.cleanup());

const checks = [
  ["owner can get", async () => assertSucceeds(getDoc(kaizenRef(authContext("owner"))))],
  ["owner can list", async () => assertSucceeds(getDocs(query(collection(authContext("owner"), "kaizens"), where("ownerUid", "==", "owner"))))],
  ["owner can update", async () => {
    await seedForCase("owner-update", uniqueKaizen("owner-update"));
    await assertSucceeds(updateDoc(kaizenRef(authContext("owner"), "owner-update"), { projeto: "Atualizado", rev: 2, atualizadoEm: now }));
  }],
  ["owner can delete", async () => {
    await seedForCase("owner-delete");
    await assertSucceeds(deleteDoc(kaizenRef(authContext("owner"), "owner-delete")));
  }],
  ["viewer can get", async () => assertSucceeds(getDoc(kaizenRef(authContext("viewer"))))],
  ["viewer can list by membership", async () => assertSucceeds(getDocs(kaizenQuery(authContext("viewer"), "viewer")))],
  ["editor can update content", async () => {
    await seedForCase("editor-update");
    await assertSucceeds(updateDoc(kaizenRef(authContext("editor"), "editor-update"), { projeto: "Editado", rev: 2, atualizadoEm: now }));
  }],
  ["editor cannot change shares", async () => {
    await seedForCase("editor-sharing");
    await assertFails(updateDoc(kaizenRef(authContext("editor"), "editor-sharing"), { projeto: "Editado", rev: 2, atualizadoEm: now, sharedWithUids: ["attacker"] }));
  }],
  ["non-member get denied", async () => assertFails(getDoc(kaizenRef(authContext("stranger"))))],
  ["non-member filtered list returns zero", async () => {
    const snap = await getDocs(kaizenQuery(authContext("stranger"), "stranger"));
    if (!snap.empty) throw new Error(`expected 0 docs, received ${snap.size}`);
  }],
  ["admin can list all", async () => assertSucceeds(getDocs(collection(authContext("admin"), "kaizens")))],
  ["admin can get", async () => assertSucceeds(getDoc(kaizenRef(authContext("admin"))))],
  ["admin can delete", async () => {
    await seedForCase("admin-delete");
    await assertSucceeds(deleteDoc(kaizenRef(authContext("admin"), "admin-delete")));
  }],
  ["anonymous denied", async () => assertFails(getDoc(kaizenRef(env.unauthenticatedContext().firestore())))],
  // v2.5.1 — usuário recém-cadastrado (pending) opera os PRÓPRIOS kaizens.
  ["pending cannot read others kaizen", async () => assertFails(getDoc(kaizenRef(authContext("pending"))))],
  ["pending can create own kaizen", async () => {
    const proprio = { ...seedKaizen, ownerUid: "pending", shares: [], viewersUids: [], editorsUids: [], sharedWithUids: [], projeto: "Kaizen do pendente" };
    await assertSucceeds(setDoc(kaizenRef(authContext("pending"), "pending-own"), proprio));
  }],
  ["pending can get own kaizen", async () => assertSucceeds(getDoc(kaizenRef(authContext("pending"), "pending-own")))],
  ["pending can list own kaizens", async () => assertSucceeds(getDocs(query(collection(authContext("pending"), "kaizens"), where("ownerUid", "==", "pending"))))],
  ["pending can update own kaizen", async () => assertSucceeds(updateDoc(kaizenRef(authContext("pending"), "pending-own"), { projeto: "Atualizado pelo pendente", rev: 2, atualizadoEm: now }))],
  ["blocked cannot get a kaizen", async () => assertFails(getDoc(kaizenRef(authContext("blocked"))))],
  ["blocked cannot create own kaizen", async () => {
    const proprio = { ...seedKaizen, ownerUid: "blocked", shares: [], viewersUids: [], editorsUids: [], sharedWithUids: [], projeto: "Bloqueado" };
    await assertFails(setDoc(kaizenRef(authContext("blocked"), "blocked-own"), proprio));
  }],
  ["blocked admin denied", async () => assertFails(getDoc(kaizenRef(authContext("blockedadmin"))))],
  ["cannot create with another owner uid", async () => assertFails(setDoc(kaizenRef(authContext("owner"), "wrong-owner"), { ...seedKaizen, ownerUid: "other" }))],
  ["cannot create with wrong schemaVersion", async () => assertFails(setDoc(kaizenRef(authContext("owner"), "wrong-schema"), { ...seedKaizen, ownerUid: "owner", schemaVersion: 1 }))],
  ["cannot create with wrong initial rev", async () => assertFails(setDoc(kaizenRef(authContext("owner"), "wrong-rev"), { ...seedKaizen, ownerUid: "owner", rev: 2 }))],
  ["cannot update with wrong schemaVersion", async () => {
    await seedForCase("bad-schema-update");
    await assertFails(updateDoc(kaizenRef(authContext("owner"), "bad-schema-update"), { schemaVersion: 1, rev: 2, atualizadoEm: now }));
  }],
  ["cannot update without incrementing rev", async () => {
    await seedForCase("bad-rev-update");
    await assertFails(updateDoc(kaizenRef(authContext("owner"), "bad-rev-update"), { projeto: "Sem incremento", rev: 1, atualizadoEm: now }));
  }],
  ["cannot change owner uid", async () => {
    await seedForCase("bad-owner-update");
    await assertFails(updateDoc(kaizenRef(authContext("owner"), "bad-owner-update"), { ownerUid: "other", rev: 2, atualizadoEm: now }));
  }],
  ["owner can update a field while retaining sharing", async () => {
    await seedForCase("owner-sharing-update");
    await assertSucceeds(updateDoc(kaizenRef(authContext("owner"), "owner-sharing-update"), { projeto: "OK", rev: 2, atualizadoEm: now, sharedWithUids: seedKaizen.sharedWithUids }));
  }],
  ["editor cannot alter shares list", async () => {
    await seedForCase("editor-shares-list");
    await assertFails(updateDoc(kaizenRef(authContext("editor"), "editor-shares-list"), { shares: [], rev: 2, atualizadoEm: now }));
  }],
  ["editor cannot alter viewer list", async () => {
    await seedForCase("editor-viewers-list");
    await assertFails(updateDoc(kaizenRef(authContext("editor"), "editor-viewers-list"), { viewersUids: [], rev: 2, atualizadoEm: now }));
  }],
  ["editor cannot alter editor list", async () => {
    await seedForCase("editor-editors-list");
    await assertFails(updateDoc(kaizenRef(authContext("editor"), "editor-editors-list"), { editorsUids: [], rev: 2, atualizadoEm: now }));
  }],
  ["non-member broad list denied", async () => assertFails(getDocs(collection(authContext("stranger"), "kaizens")))],
  ["viewer update denied", async () => {
    await seedForCase("viewer-update");
    await assertFails(updateDoc(kaizenRef(authContext("viewer"), "viewer-update"), { projeto: "Denied", rev: 2, atualizadoEm: now }));
  }],
];

for (const [name, run] of checks) test(name, run);