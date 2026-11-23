"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  buildTemplate,
  formatDate,
  escapeHtml,
  DEFAULT_ADMIN_LINK
} = require("../lib/template");

describe("Template de E-mail (lib/template.js)", () => {
  test("escapeHtml escapa caracteres perigosos (<, >, &, \", ')", () => {
    assert.strictEqual(
      escapeHtml("<script>alert('xss' & \"hack\")</script>"),
      "&lt;script&gt;alert(&#39;xss&#39; &amp; &quot;hack&quot;)&lt;/script&gt;"
    );
    assert.strictEqual(escapeHtml(null), "");
    assert.strictEqual(escapeHtml(undefined), "");
  });

  test("formatDate formata para horário de Brasília (America/Sao_Paulo)", () => {
    // 2026-11-23 15:30 UTC = 2026-11-23 12:30 Brasília (UTC-3)
    const dateUtc = new Date("2026-11-23T15:30:00Z");
    const formatted = formatDate(dateUtc);
    assert.strictEqual(formatted, "23/11/2026 12:30");
  });

  test("buildTemplate gera assunto com o nome do usuário", () => {
    const usuario = {
      nome: "Carlos Eduardo",
      email: "carlos@empresa.com",
      areaNegocio: "DAF"
    };
    const tpl = buildTemplate({ usuario });
    assert.strictEqual(tpl.subject, "[Kaizen Hub] Novo pedido de acesso — Carlos Eduardo");
  });

  test("buildTemplate com nome ausente usa fallback do prefixo de e-mail", () => {
    const usuario = {
      email: "marcos.silva@empresa.com",
      areaNegocio: "Operação"
    };
    const tpl = buildTemplate({ usuario });
    assert.strictEqual(tpl.subject, "[Kaizen Hub] Novo pedido de acesso — marcos.silva");
  });

  test("buildTemplate gera texto e HTML com todos os campos e link de aprovação", () => {
    const usuario = {
      nome: "Renata <Admin>",
      email: "renata@empresa.com",
      areaNegocio: "TI / Digital & Inovação",
      criadoEm: new Date("2026-11-23T14:00:00Z")
    };
    const tpl = buildTemplate({ usuario });

    // Verificações no texto puro
    assert.match(tpl.text, /Novo pedido de acesso ao Kaizen Hub/);
    assert.match(tpl.text, /Nome:\s+Renata <Admin>/);
    assert.match(tpl.text, /E-mail:\s+renata@empresa\.com/);
    assert.match(tpl.text, /Área:\s+TI \/ Digital & Inovação/);
    assert.match(tpl.text, /23\/11\/2026 11:00 \(horário de Brasília\)/);
    assert.ok(tpl.text.includes(DEFAULT_ADMIN_LINK));
    assert.match(tpl.text, /Aviso automático do Kaizen Hub/);

    // Verificações no HTML (campos devem estar devidamente escapados)
    assert.ok(tpl.html.includes("Renata &lt;Admin&gt;"));
    assert.ok(!tpl.html.includes("<Admin>"));
    assert.ok(tpl.html.includes("TI / Digital &amp; Inovação"));
    assert.ok(tpl.html.includes(escapeHtml(DEFAULT_ADMIN_LINK)));
    assert.ok(!tpl.html.includes("<img")); // sem imagens remotas (requisito da spec)
  });
});
