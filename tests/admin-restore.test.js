import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Restaurar Kaizen no painel admin (admin.js)", () => {
  const adminSource = fs.readFileSync(path.resolve("admin.js"), "utf8");
  const dbSource = fs.readFileSync(path.resolve("js/db.js"), "utf8");

  test("admin.js reutiliza restoreKaizen (caminho transacional único)", () => {
    assert.ok(
      /import\s*\{[^}]*restoreKaizen[^}]*\}\s*from\s*"\.\/js\/db\.js"/.test(adminSource),
      "admin.js deve importar restoreKaizen de js/db.js"
    );
    assert.ok(adminSource.includes("await restoreKaizen(k.id, currentUser)"), "botão Restaurar usa restoreKaizen");
  });

  test("botão Restaurar não faz mais update parcial sem rev", () => {
    const start = adminSource.indexOf("btnRestore.onclick");
    assert.ok(start > 0, "deve existir btnRestore.onclick");
    const body = adminSource.slice(start, start + 900);
    assert.ok(!body.includes('updateDoc(doc(db, "kaizens"'), "não pode gravar updateDoc parcial em kaizens");
    assert.ok(body.includes("catch (err)"), "erro de restore precisa ser tratado e visível");
    assert.ok(body.includes('showToast("Não foi possível restaurar o projeto. Tente novamente.", "error")'), "toast de erro para o admin");
  });

  test("restoreKaizen grava rev + 1 e atualizadoPor na transação", () => {
    const start = dbSource.indexOf("export async function restoreKaizen");
    assert.ok(start > 0, "deve existir restoreKaizen");
    const body = dbSource.slice(start, dbSource.indexOf("export async function hardDeleteKaizen"));
    assert.ok(body.includes("runTransaction"), "restore usa transação");
    assert.ok(body.includes("rev: (Number(snap.data().rev) || 1) + 1"), "restore incrementa rev");
    assert.ok(body.includes("atualizadoPor: user.uid"), "restore grava atualizadoPor");
  });
});
