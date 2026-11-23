"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  withinMinutes,
  claimNotification,
  checkRateLimit,
  markSent,
  markNoRecipients,
  markFailed
} = require("../lib/ledger");

/**
 * Cria uma instância mock simples de Firestore in-memory com suporte a doc(),
 * runTransaction(), set(), create() e collection().where().
 */
function createMockFirestore() {
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
                  }
                }
                return { data: () => ({ count }) };
              }
            }),
            get: async () => {
              const docs = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith(`${colName}/`)) {
                  if (op === ">=" && v[field] >= val) {
                    docs.push({ id: k.split("/")[1], data: () => v });
                  }
                }
              }
              return { size: docs.length, docs };
            }
          };
        }
      };
    }
  };
}

describe("Ledger de Idempotência (lib/ledger.js)", () => {
  test("withinMinutes calcula janela de tempo com precisão", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    const twoMinAgo = new Date("2026-11-23T11:58:00Z");
    const sixMinAgo = new Date("2026-11-23T11:54:00Z");

    assert.strictEqual(withinMinutes(twoMinAgo, 5, now), true);
    assert.strictEqual(withinMinutes(sixMinAgo, 5, now), false);
    assert.strictEqual(withinMinutes(null, 5, now), false);
  });

  test("claimNotification realiza claim pela primeira vez com sucesso", async () => {
    const db = createMockFirestore();
    const usuario = { email: "teste@empresa.com", nome: "Teste" };

    const claimed = await claimNotification(db, "uid-123", usuario);
    assert.strictEqual(claimed, true);

    const doc = db._store.get("notificacoes/uid-123");
    assert.ok(doc != null);
    assert.strictEqual(doc.status, "enviando");
    assert.strictEqual(doc.tentativas, 1);
    assert.strictEqual(doc.email, "teste@empresa.com");
  });

  test("claimNotification bloqueia nova execução se já estiver em voo (< 5 min)", async () => {
    const db = createMockFirestore();
    const now = new Date("2026-11-23T12:00:00Z");
    const usuario = { email: "teste@empresa.com", nome: "Teste" };

    await claimNotification(db, "uid-123", usuario, now);

    // Segunda chamada 1 minuto depois: deve ser rejeitada pelo claim
    const oneMinLater = new Date("2026-11-23T12:01:00Z");
    const secondClaim = await claimNotification(db, "uid-123", usuario, oneMinLater);
    assert.strictEqual(secondClaim, false);
  });

  test("claimNotification bloqueia execução se status for 'enviado'", async () => {
    const db = createMockFirestore();
    const now = new Date("2026-11-23T12:00:00Z");
    db._store.set("notificacoes/uid-123", {
      status: "enviado",
      tentativas: 1,
      atualizadoEm: now
    });

    const claimed = await claimNotification(db, "uid-123", { email: "teste@empresa.com" }, now);
    assert.strictEqual(claimed, false);
  });

  test("claimNotification permite retry se a notificação anterior falhou ou expirou (e tentativas < 5)", async () => {
    const db = createMockFirestore();
    const t0 = new Date("2026-11-23T12:00:00Z");
    db._store.set("notificacoes/uid-123", {
      status: "falhou",
      tentativas: 2,
      atualizadoEm: t0
    });

    const claimed = await claimNotification(db, "uid-123", { email: "teste@empresa.com" }, t0);
    assert.strictEqual(claimed, true);

    const doc = db._store.get("notificacoes/uid-123");
    assert.strictEqual(doc.status, "enviando");
    assert.strictEqual(doc.tentativas, 3);
  });

  test("claimNotification bloqueia quando atingir 5 tentativas", async () => {
    const db = createMockFirestore();
    const t0 = new Date("2026-11-23T12:00:00Z");
    db._store.set("notificacoes/uid-123", {
      status: "falhou",
      tentativas: 5,
      atualizadoEm: t0
    });

    const claimed = await claimNotification(db, "uid-123", { email: "teste@empresa.com" }, t0);
    assert.strictEqual(claimed, false);
  });

  test("checkRateLimit bloqueia após 20 registros na última hora", async () => {
    const db = createMockFirestore();
    const now = new Date("2026-11-23T12:00:00Z");

    // Semeia 20 notificações criadas nos últimos 30 minutos
    for (let i = 0; i < 20; i++) {
      db._store.set(`notificacoes/user-${i}`, {
        status: "enviado",
        criadoEm: new Date(now.getTime() - 1000 * 60 * 10)
      });
    }

    // Cria o documento alvo no ledger (21º na última hora)
    db._store.set("notificacoes/novo-user", {
      status: "enviando",
      criadoEm: now
    });

    const isLimited = await checkRateLimit(db, "novo-user", now);
    assert.strictEqual(isLimited, true);

    const doc = db._store.get("notificacoes/novo-user");
    assert.strictEqual(doc.status, "rate_limited");
  });

  test("markSent, markNoRecipients e markFailed atualizam os status corretamente", async () => {
    const db = createMockFirestore();

    await markSent(db, "u1", { messageId: "<msg-1>", destinatarios: ["admin@empresa.com"] });
    assert.strictEqual(db._store.get("notificacoes/u1").status, "enviado");
    assert.strictEqual(db._store.get("notificacoes/u1").messageId, "<msg-1>");

    await markNoRecipients(db, "u2");
    assert.strictEqual(db._store.get("notificacoes/u2").status, "sem_destinatario");

    await markFailed(db, "u3", new Error("SMTP timeout"));
    assert.strictEqual(db._store.get("notificacoes/u3").status, "falhou");
    assert.strictEqual(db._store.get("notificacoes/u3").erro, "SMTP timeout");
  });
});
