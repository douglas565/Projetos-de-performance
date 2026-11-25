import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySaveError,
  MAX_SAVE_ATTEMPTS,
  RETRY_DELAYS_MS,
  retryDelayMs
} from "../js/save-errors.js";

test("classifySaveError identifica permission-denied como permanente", () => {
  assert.deepEqual(classifySaveError({ code: "permission-denied" }), {
    permanent: true,
    code: "permission-denied",
    message: "Sem permissão para salvar. Verifique se sua conta está aprovada e o e-mail confirmado."
  });
});

test("classifySaveError identifica unauthenticated como permanente", () => {
  const result = classifySaveError({ code: "unauthenticated" });
  assert.equal(result.permanent, true);
  assert.equal(result.message, "Sessão expirada. Entre novamente.");
});

test("classifySaveError identifica unavailable como transitório", () => {
  const result = classifySaveError({ code: "unavailable", message: "Serviço indisponível" });
  assert.equal(result.permanent, false);
  assert.equal(result.code, "unavailable");
  assert.equal(result.message, "Serviço indisponível");
});

test("erros desconhecidos são transitórios e têm mensagem de fallback", () => {
  const result = classifySaveError({});
  assert.equal(result.permanent, false);
  assert.equal(result.code, "unknown");
  assert.equal(result.message, "Sem conexão com o banco. Nada foi salvo ainda.");
});

test("retryDelayMs segue a sequência configurada e limita tentativas excedentes", () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => retryDelayMs(i + 1)), RETRY_DELAYS_MS);
    assert.equal(retryDelayMs(7), RETRY_DELAYS_MS.at(-1));
  } finally {
    Math.random = originalRandom;
  }
});

test("retryDelayMs adiciona jitter entre 0 e 500 ms", () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.999;
    assert.equal(retryDelayMs(1), RETRY_DELAYS_MS[0] + 500);
  } finally {
    Math.random = originalRandom;
  }
});

test("MAX_SAVE_ATTEMPTS limita salvamentos a seis tentativas", () => {
  assert.equal(MAX_SAVE_ATTEMPTS, 6);
});
