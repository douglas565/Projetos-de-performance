import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { after, before, test } from "node:test";

let env;

const authContext = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "kaizen-rules-directory-tests",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, status] of [
      ["admin", "admin", "active"],
      ["member", "user", "active"],
      ["pending", "user", "pending"]
    ]) {
      await setDoc(doc(db, "users", uid), { uid, role, status });
      await setDoc(doc(db, "directory", uid), { uid, email: `${uid}@example.com`, nome: uid, status });
    }
  });
});

after(async () => env?.cleanup());

const checks = [
  ["active member can list directory", async () => assertSucceeds(getDocs(collection(authContext("member"), "directory")))],
  ["pending user cannot list directory", async () => assertFails(getDocs(collection(authContext("pending"), "directory")))],
  ["admin approval propagates status to directory", async () => {
    await assertSucceeds(updateDoc(doc(authContext("admin"), "users", "pending"), { status: "active" }));
    await assertSucceeds(updateDoc(doc(authContext("admin"), "directory", "pending"), { status: "active" }));
  }],
  ["user cannot self-approve directory status", async () => {
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "directory", "member"), { uid: "member", email: "member@example.com", nome: "member", status: "active" }));
    await assertFails(updateDoc(doc(authContext("member"), "directory", "member"), { status: "blocked" }));
  }],
  ["user repairs legacy directory without status", async () => {
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "directory", "member"), { uid: "member", email: "member@example.com", nome: "member" }));
    await assertSucceeds(updateDoc(doc(authContext("member"), "directory", "member"), { status: "active" }));
  }],
  ["user can refresh own directory without changing status", async () => {
    await assertSucceeds(updateDoc(doc(authContext("member"), "directory", "member"), { nome: "Membro" }));
  }],
  ["cannot create directory doc with status that users doc does not confirm", async () => {
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "users", "newbie"), { uid: "newbie", role: "user", status: "pending" }));
    await assertFails(setDoc(doc(authContext("newbie"), "directory", "newbie"), { uid: "newbie", email: "newbie@example.com", nome: "newbie", status: "active" }));
  }],
  ["can create directory doc matching own pending users status", async () => {
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), "users", "fresh"), { uid: "fresh", role: "user", status: "pending" }));
    await assertSucceeds(setDoc(doc(authContext("fresh"), "directory", "fresh"), { uid: "fresh", email: "fresh@example.com", nome: "fresh", status: "pending" }));
  }]
];

for (const [name, run] of checks) test(name, run);
