import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Status do cadastro propagado para directory/", () => {
  const authSource = fs.readFileSync(path.resolve("js/auth.js"), "utf8");
  const adminSource = fs.readFileSync(path.resolve("admin.js"), "utf8");
  const rules = fs.readFileSync(path.resolve("firestore.rules"), "utf8");

  test("js/auth.js grava status no directory/ ao criar e ao atualizar o perfil", () => {
    const dirWrites = authSource.split('doc(db, "directory"').slice(1);
    assert.ok(dirWrites.length >= 2, "deve haver os dois pontos de escrita no directory");
    for (const chunk of dirWrites) {
      const body = chunk.slice(0, 320);
      assert.ok(body.includes('status: profile.status || "pending"') || body.includes("status: initialProfile.status"), "cada escrita do directory precisa persistir status");
    }
  });

  test("admin.js propaga aprovação/bloqueio para o directory", () => {
    const start = adminSource.indexOf("async function updateUserStatus");
    assert.ok(start > 0, "deve existir updateUserStatus");
    const body = adminSource.slice(start, start + 900);
    assert.ok(body.includes('doc(db, "directory", uid)'), "aprovação deve atualizar o directory");
    assert.ok(body.includes("status: newStatus"), "directory recebe o mesmo status");
    assert.ok(body.includes("merge: true"), "merge preserva e-mail/nome já gravados");
  });

  test("rules permitem admin atualizar directory e barram autoelevação", () => {
    const start = rules.indexOf("match /directory/{userId}");
    const block = rules.slice(start, start + 900);
    assert.ok(block.includes("allow read: if isAllowed();"), "leitura liberada para usuários autenticados não bloqueados (pending/active)");
    assert.ok(block.includes("isAdmin()"), "admin pode atualizar status do directory");
    assert.ok(block.includes("request.resource.data.status == get("), "status só muda para o valor de users/{uid}");
    assert.ok(block.includes("documents/users/$(userId)).data.status"), "comparação com users/{uid}.status");
  });
});
