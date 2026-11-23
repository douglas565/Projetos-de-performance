"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  sanitizeAndDedupeEmails,
  resolveDestinatarios
} = require("../lib/recipients");

describe("Resolução de Destinatários (lib/recipients.js)", () => {
  test("sanitizeAndDedupeEmails limpa, converte para minúsculo, deduplica e respeita teto de 10", () => {
    const raw = [
      "  Admin@Empresa.com  ",
      "admin@empresa.com",
      "invalido-sem-arroba",
      "OUTRO@EMPRESA.COM",
      "u1@e.com", "u2@e.com", "u3@e.com", "u4@e.com", "u5@e.com",
      "u6@e.com", "u7@e.com", "u8@e.com", "u9@e.com", "u10@e.com", "u11@e.com"
    ];

    const result = sanitizeAndDedupeEmails(raw);
    assert.strictEqual(result.length, 10);
    assert.strictEqual(result[0], "admin@empresa.com");
    assert.strictEqual(result[1], "outro@empresa.com");
    assert.ok(!result.includes("invalido-sem-arroba"));
  });

  test("resolveDestinatarios respeita o kill switch (enabled === false)", async () => {
    const config = {
      notificacoes: {
        enabled: false,
        emailsTo: ["admin@empresa.com"]
      }
    };
    const res = await resolveDestinatarios({ config });
    assert.deepStrictEqual(res, []);
  });

  test("resolveDestinatarios prioriza emailsTo da configuração", async () => {
    const config = {
      notificacoes: {
        enabled: true,
        emailsTo: ["  Groot@Empresa.com ", "groot@empresa.com", "devops@empresa.com"]
      }
    };
    // Mock de banco que não deve ser chamado
    const mockDb = {
      collection: () => {
        throw new Error("Não deveria consultar a coleção users quando emailsTo estiver configurado!");
      }
    };

    const res = await resolveDestinatarios({ db: mockDb, config });
    assert.deepStrictEqual(res, ["groot@empresa.com", "devops@empresa.com"]);
  });

  test("resolveDestinatarios busca admins ativos no banco quando config/app não define emailsTo", async () => {
    const mockDb = {
      doc: (path) => {
        assert.strictEqual(path, "config/app");
        return {
          get: async () => ({ exists: false })
        };
      },
      collection: (colName) => {
        assert.strictEqual(colName, "users");
        return {
          where: (field, op, val) => {
            assert.strictEqual(field, "role");
            assert.strictEqual(op, "==");
            assert.strictEqual(val, "admin");
            return {
              get: async () => {
                const docs = [
                  { data: () => ({ email: "ativo1@empresa.com", status: "active", role: "admin" }) },
                  { data: () => ({ email: "pendente@empresa.com", status: "pending", role: "admin" }) }, // deve ser ignorado
                  { data: () => ({ email: "bloqueado@empresa.com", status: "blocked", role: "admin" }) }, // deve ser ignorado
                  { data: () => ({ email: "ativo2@empresa.com", status: "active", role: "admin" }) },
                  { data: () => ({ email: "ATIVO1@EMPRESA.COM", status: "active", role: "admin" }) } // duplicata case-insensitive
                ];
                return {
                  forEach: (cb) => docs.forEach(cb)
                };
              }
            };
          }
        };
      }
    };

    const res = await resolveDestinatarios({ db: mockDb });
    assert.deepStrictEqual(res, ["ativo1@empresa.com", "ativo2@empresa.com"]);
  });
});
