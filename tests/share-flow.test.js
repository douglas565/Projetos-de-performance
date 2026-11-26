import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Fluxo de compartilhamento (js/share.js)", () => {
  const source = fs.readFileSync(path.resolve("js/share.js"), "utf8");

  test("nunca gera UID sintético ext-<timestamp>", () => {
    assert.ok(!/uid:\s*[`"']ext-/.test(source), "não deve atribuir uid ext-");
    assert.ok(!/ext-\$\{Date\.now\(\)\}/.test(source), "não deve montar ext-<timestamp>");
  });

  test("resolução do destinatário classifica o estado do diretório", () => {
    assert.ok(source.includes("export async function lookupDirectoryRecipient"), "deve expor lookupDirectoryRecipient");
    assert.ok(source.includes('getDirectoryShareStatus(item) === "active"'), "só considera ativos para acesso");
    assert.ok(source.includes("directoryLookupMessage(lookup.status"), "mensagem por estado do cadastro");
    assert.ok(source.includes("resolveDirectoryUserByEmail"), "compat mantida para o resolvedor por e-mail");
  });

  test("confirmar salvamento não exige e-mail pendente", () => {
    const start = source.indexOf("btnConfirm.onclick");
    assert.ok(start > 0, "deve existir btnConfirm.onclick");
    const body = source.slice(start);
    assert.ok(body.includes("let sharesToSave = localShares;"), "sem convite, salva a lista local (remoções e papéis)");
    assert.ok(body.includes("if (pendingInvite)"), "só resolve e-mail quando há convite digitado");
    assert.ok(body.includes("isBareEmail(typed)"), "e-mail pendente é detectado por formato, não por includes('@')");
  });

  test("persistência passa sempre pelo normalizador único", () => {
    assert.ok(source.includes("prepareKaizenSharingSave(sharesToSave)"), "confirm usa o normalizador");
    assert.ok(source.includes("prepareKaizenSharingSave(["), "adicionar usa o normalizador");
  });

  test("adicionar por e-mail digitado valida o diretório antes de gravar", () => {
    const start = source.indexOf("btnAdd.onclick");
    const body = source.slice(start, start + 1600);
    assert.ok(body.includes("lookupDirectoryRecipient(typed)"), "consulta exata antes de adicionar");
    assert.ok(body.includes('lookup.status !== "active"'), "bloqueia quem não está ativo");
  });
});
