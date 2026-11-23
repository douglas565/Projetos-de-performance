"use strict";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { handleNewUser } = require("../index");
const { getMailFileDir } = require("../lib/mailer");

/**
 * Cria banco Firestore in-memory completo para os testes integrados.
 */
function createMockDb() {
  const store = new Map();

  return {
    _store: store,
    doc: (p) => {
      return {
        path: p,
        get: async () => {
          const val = store.get(p);
          return {
            exists: val != null,
            data: () => (val ? { ...val } : null)
          };
        },
        set: async (data, opts = {}) => {
          if (opts.merge && store.has(p)) {
            store.set(p, { ...store.get(p), ...data });
          } else {
            store.set(p, { ...data });
          }
        }
      };
    },
    runTransaction: async (updateFn) => {
      const transaction = {
        get: async (docRef) => {
          const val = store.get(docRef.path);
          return {
            exists: val != null,
            data: () => (val ? { ...val } : null)
          };
        },
        set: (docRef, data, opts = {}) => {
          if (opts.merge && store.has(docRef.path)) {
            store.set(docRef.path, { ...store.get(docRef.path), ...data });
          } else {
            store.set(docRef.path, { ...data });
          }
        },
        create: (docRef, data) => {
          if (store.has(docRef.path)) {
            throw new Error(`Documento já existe: ${docRef.path}`);
          }
          store.set(docRef.path, { ...data });
        }
      };
      return await updateFn(transaction);
    },
    collection: (colName) => {
      return {
        where: (field, op, val) => {
          return {
            count: () => ({
              get: async () => {
                let count = 0;
                for (const [k, v] of store.entries()) {
                  if (k.startsWith(`${colName}/`)) {
                    if (op === ">=" && v[field] >= val) count++;
                    if (op === "==" && v[field] === val) count++;
                  }
                }
                return { data: () => ({ count }) };
              }
            }),
            get: async () => {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  let match = false;
                  if (op === "==") match = v[field] === val;
                  if (op === ">=") match = v[field] >= val;
                  if (match) {
                    docs.push({ id: k.split("/")[1], data: () => v });
                  }
                }
              }
              return {
                size: docs.length,
                docs,
                forEach: (cb) => docs.forEach(cb)
              };
            }
          };
        }
      };
    }
  };
}

describe("Integração: handleNewUser (Functions v2)", () => {
  const mailDir = getMailFileDir();

  // Limpa arquivos de teste anteriores
  beforeEach(() => {
    if (fs.existsSync(mailDir)) {
      const files = fs.readdirSync(mailDir);
      for (const f of files) {
        if (f.endsWith(".eml")) {
          fs.unlinkSync(path.join(mailDir, f));
        }
      }
    }
  });

  test("C3: Não envia e-mail para usuário cujo status não seja 'pending'", async () => {
    const db = createMockDb();
    const activeUser = {
      email: "ativo@empresa.com",
      status: "active",
      nome: "Usuário Ativo"
    };

    const res = await handleNewUser(db, "uid-active", activeUser, {
      env: { MAIL_TRANSPORT: "file" }
    });

    assert.strictEqual(res.status, "skipped");
    assert.strictEqual(res.reason, "not_pending");

    // Verifica que nada foi gravado no ledger nem em arquivo .eml
    assert.strictEqual(db._store.has("notificacoes/uid-active"), false);
    const files = fs.readdirSync(mailDir).filter((f) => f.endsWith(".eml"));
    assert.strictEqual(files.length, 0);
  });

  test("C1 & C2: 1 e-mail gerado para novo cadastro pending e idempotência garantida (2 chamadas = 1 .eml)", async () => {
    const db = createMockDb();
    // Configura destinatário no banco
    db._store.set("config/app", {
      notificacoes: {
        enabled: true,
        emailsTo: ["ghgghgc60@gmail.com"]
      }
    });

    const novoUser = {
      email: "solicitante@empresa.com",
      status: "pending",
      nome: "Douglas Silva",
      areaNegocio: "DAF",
      criadoEm: new Date("2026-11-23T11:00:00Z")
    };

    // Primeira chamada: deve enviar e gravar .eml
    const res1 = await handleNewUser(db, "uid-solicitante-1", novoUser, {
      env: { MAIL_TRANSPORT: "file" }
    });

    assert.strictEqual(res1.status, "enviado");
    assert.deepStrictEqual(res1.destinatarios, ["ghgghgc60@gmail.com"]);

    // Confere que gerou exatamente 1 arquivo .eml
    let files = fs.readdirSync(mailDir).filter((f) => f.endsWith(".eml"));
    assert.strictEqual(files.length, 1);

    // Valida conteúdo do arquivo .eml gerado
    const emlPath = path.join(mailDir, files[0]);
    const emlContent = fs.readFileSync(emlPath, "utf8");
    assert.ok(emlContent.includes("Subject: [Kaizen Hub] Novo pedido de acesso — Douglas Silva"));
    assert.ok(emlContent.includes("Nome:   Douglas Silva"));
    assert.ok(emlContent.includes("E-mail: solicitante@empresa.com"));
    assert.ok(emlContent.includes("Área:   DAF"));
    assert.ok(emlContent.includes("https://douglas565.github.io/Projetos-de-performance/admin.html?tab=users&status=pending"));

    // Confere estado do ledger
    const ledgerDoc = db._store.get("notificacoes/uid-solicitante-1");
    assert.strictEqual(ledgerDoc.status, "enviado");
    assert.strictEqual(ledgerDoc.tentativas, 1);
    assert.ok(ledgerDoc.messageId);

    // Segunda chamada com mesmo UID: deve ser ignorada pelo claim de idempotência!
    const res2 = await handleNewUser(db, "uid-solicitante-1", novoUser, {
      env: { MAIL_TRANSPORT: "file" }
    });

    assert.strictEqual(res2.status, "skipped");
    assert.strictEqual(res2.reason, "not_claimed");

    // Confere que CONTINUA exatamente 1 arquivo .eml (nenhum arquivo a mais foi gerado)
    files = fs.readdirSync(mailDir).filter((f) => f.endsWith(".eml"));
    assert.strictEqual(files.length, 1);
  });

  test("C4: Falha no transporte registra status 'falhou' no ledger e propaga erro", async () => {
    const db = createMockDb();
    db._store.set("config/app", {
      notificacoes: { enabled: true, emailsTo: ["admin@empresa.com"] }
    });

    const user = {
      email: "falha@empresa.com",
      status: "pending",
      nome: "Teste Falha",
      areaNegocio: "Operação"
    };

    await assert.rejects(
      async () => {
        await handleNewUser(db, "uid-fail-test", user, {
          env: { MAIL_TRANSPORT: "fail" }
        });
      },
      /Falha simulada de transporte/
    );

    const ledgerDoc = db._store.get("notificacoes/uid-fail-test");
    assert.ok(ledgerDoc);
    assert.strictEqual(ledgerDoc.status, "falhou");
    assert.match(ledgerDoc.erro, /Falha simulada de transporte/);
  });

  test("C5: Rate limit impede mais de 20 envios por hora", async () => {
    const db = createMockDb();
    db._store.set("config/app", {
      notificacoes: { enabled: true, emailsTo: ["admin@empresa.com"] }
    });

    const baseTime = new Date("2026-11-23T14:00:00Z");

    // Cadastra 20 usuários com sucesso
    for (let i = 1; i <= 20; i++) {
      const u = {
        email: `user${i}@empresa.com`,
        status: "pending",
        nome: `Usuário ${i}`,
        areaNegocio: "Operação"
      };
      const res = await handleNewUser(db, `uid-rate-${i}`, u, {
        env: { MAIL_TRANSPORT: "file" },
        now: new Date(baseTime.getTime() + i * 1000)
      });
      assert.strictEqual(res.status, "enviado");
    }

    let files = fs.readdirSync(mailDir).filter((f) => f.endsWith(".eml"));
    assert.strictEqual(files.length, 20);

    // Tentativas dos usuários 21 a 25: devem ser barradas pelo rate limit
    for (let i = 21; i <= 25; i++) {
      const u = {
        email: `user${i}@empresa.com`,
        status: "pending",
        nome: `Usuário ${i}`,
        areaNegocio: "Operação"
      };
      const res = await handleNewUser(db, `uid-rate-${i}`, u, {
        env: { MAIL_TRANSPORT: "file" },
        now: new Date(baseTime.getTime() + i * 1000)
      });
      assert.strictEqual(res.status, "rate_limited");

      const ledgerDoc = db._store.get(`notificacoes/uid-rate-${i}`);
      assert.strictEqual(ledgerDoc.status, "rate_limited");
    }

    // O número total de .eml deve continuar 20 (nenhum a mais gerado)
    files = fs.readdirSync(mailDir).filter((f) => f.endsWith(".eml"));
    assert.strictEqual(files.length, 20);
  });
});
