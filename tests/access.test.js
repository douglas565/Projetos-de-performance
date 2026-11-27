import { test } from "node:test";
import assert from "node:assert";
import { podeAcessarHub } from "../js/access.js";

test("pending tem acesso ao Hub (pode criar/salvar seus kaizens)", () => {
  assert.equal(podeAcessarHub({ status: "pending" }), true);
});

test("active tem acesso ao Hub", () => {
  assert.equal(podeAcessarHub({ status: "active" }), true);
});

test("blocked NÃO tem acesso ao Hub", () => {
  assert.equal(podeAcessarHub({ status: "blocked" }), false);
});

test("sem perfil NÃO tem acesso ao Hub", () => {
  assert.equal(podeAcessarHub(null), false);
  assert.equal(podeAcessarHub(undefined), false);
});
