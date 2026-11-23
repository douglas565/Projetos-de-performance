"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  buildTransport,
  buildMessage,
  sendNotificationEmail,
  getMailFileDir
} = require("../lib/mailer");

describe("Serviço de Envio de E-mail (lib/mailer.js)", () => {
  const testMailDir = path.join(process.env.TMPDIR || os.tmpdir(), "kaizen-mail");

  test("buildTransport com MAIL_TRANSPORT=fail rejeita envio simulando erro", async () => {
    const transport = buildTransport({ MAIL_TRANSPORT: "fail" });
    await assert.rejects(
      async () => {
        await sendNotificationEmail(transport, { to: "admin@empresa.com" });
      },
      /Falha simulada de transporte/
    );
  });

  test("buildTransport com MAIL_TRANSPORT=file grava arquivo .eml com cabeçalhos e corpo", async () => {
    const transport = buildTransport({
      MAIL_TRANSPORT: "file",
      MAIL_FROM: "Kaizen Hub <ghgghgc60@gmail.com>"
    });

    const usuario = {
      nome: "Mariana Souza",
      email: "mariana.souza@empresa.com",
      areaNegocio: "H&S",
      criadoEm: new Date("2026-11-23T10:00:00Z")
    };

    const message = buildMessage({
      usuario,
      destinatarios: ["ghgghgc60@gmail.com", "admin2@empresa.com"],
      link: "https://douglas565.github.io/Projetos-de-performance/admin.html?tab=users&status=pending",
      agora: new Date("2026-11-23T10:00:00Z")
    });

    const res = await sendNotificationEmail(transport, message);

    assert.ok(res.filePath);
    assert.ok(fs.existsSync(res.filePath));

    const emlContent = fs.readFileSync(res.filePath, "utf8");

    // Validações dos cabeçalhos RFC
    assert.match(emlContent, /^From:\s+Kaizen Hub <ghgghgc60@gmail\.com>/m);
    assert.match(emlContent, /^To:\s+ghgghgc60@gmail\.com,\s*admin2@empresa\.com/m);
    assert.match(emlContent, /^Reply-To:\s+mariana\.souza@empresa\.com/m);
    assert.match(emlContent, /^Subject:\s+\[Kaizen Hub\] Novo pedido de acesso — Mariana Souza/m);
    assert.match(emlContent, /^Content-Type:\s+multipart\/alternative/m);

    // Validações do corpo
    assert.ok(emlContent.includes("Nome:   Mariana Souza"));
    assert.ok(emlContent.includes("E-mail: mariana.souza@empresa.com"));
    assert.ok(emlContent.includes("Área:   H&S"));
    assert.ok(emlContent.includes("admin.html?tab=users&status=pending"));
  });
});
