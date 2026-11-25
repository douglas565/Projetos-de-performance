import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Frente C (Client-side): Cadastro com Área e Deep Link no Admin", () => {
  test("C8: index.html possui campo Área de negócio (#areaField, #signupArea) com as opções padrão", () => {
    const html = fs.readFileSync(path.resolve("index.html"), "utf8");
    assert.ok(html.includes('id="areaField"'), "Deve conter elemento #areaField");
    assert.ok(html.includes('id="signupArea"'), "Deve conter select #signupArea");
    assert.ok(html.includes("<option>Operação</option>"), "Deve conter opção Operação");
    assert.ok(html.includes("<option>DAF</option>"), "Deve conter opção DAF");
    assert.ok(html.includes("<option>EO</option>"), "Deve conter opção EO");
    assert.ok(html.includes("<option>TI / Digital</option>"), "Deve conter opção TI / Digital");
    assert.equal(html.split("<option>Suprimentos</option>").length - 1, 2, "Suprimentos deve aparecer exatamente nos dois selects de área");
  });

  test("C8: app.js exibe #areaField no signup e envia área para registerUser", () => {
    const js = fs.readFileSync(path.resolve("app.js"), "utf8");
    assert.ok(js.includes('$("#areaField")?.classList.toggle("hidden", !isSignup)'), "Deve alternar visibilidade de #areaField com isSignup");
    assert.ok(js.includes('registerUser(email, pass, nome, area)'), "Deve passar area para registerUser");
  });

  test("C8: js/auth.js grava areaNegocio informada ou faz fallback para 'Operação'", () => {
    const js = fs.readFileSync(path.resolve("js/auth.js"), "utf8");
    assert.ok(
      js.includes('export async function registerUser(email, password, nome, area = "Operação")'),
      "Assinatura de registerUser deve receber area com default 'Operação'"
    );
    assert.ok(
      js.includes('areaNegocio: (area || "").trim() || "Operação"'),
      "Deve gravar (area || '').trim() || 'Operação'"
    );
  });

  test("C9: admin.js interpreta ?tab= e ?status= aplicando deep link para usuários pendentes", () => {
    const js = fs.readFileSync(path.resolve("admin.js"), "utf8");
    assert.ok(js.includes("applyUrlDeepLink()"), "admin.js deve chamar applyUrlDeepLink");
    assert.ok(js.includes('urlParams.get("tab")'), "Deve ler parâmetro ?tab=");
    assert.ok(js.includes('urlParams.get("status")'), "Deve ler parâmetro ?status=");
    assert.ok(js.includes('switchAdminTab(requestedTab)'), "Deve alternar para aba solicitada");
  });
});
