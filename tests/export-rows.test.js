import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  SHEETS,
  formatText,
  formatBoolean,
  formatNumber,
  formatDateOnly,
  formatTimestamp,
  normalizeKaizenRow,
  normalizeUserRow,
  deriveSharesRows,
  deriveActionsRows,
  deriveRisksRows,
  deriveLinksRows,
  deriveConfigRows,
  deriveDirectoryRows,
  buildSheetRows,
  buildWorkbook
} from "../js/export-rows.js";

const require = createRequire(import.meta.url);

function loadXlsx() {
  try {
    const mod = require("../js/vendor/xlsx.full.min.js");
    if (mod && mod.version) return mod;
  } catch (e) {}
  // Suporte transparente para Node 22+ onde type:module afeta require de arquivos locais
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const vendorPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../js/vendor/xlsx.full.min.js");
  const code = fs.readFileSync(vendorPath, "utf8");
  const exportsObj = {};
  const moduleObj = { exports: exportsObj };
  vm.runInNewContext(code, {
    exports: exportsObj,
    module: moduleObj,
    Date,
    console,
    setTimeout,
    clearTimeout
  });
  return exportsObj.version ? exportsObj : moduleObj.exports;
}

const XLSX = loadXlsx();

test("Aba Kaizens possui exatamente 57 colunas na ordem normatizada da spec §2.4.2", () => {
  const kaizensDef = SHEETS.find((s) => s.name === "Kaizens");
  assert.ok(kaizensDef, "Aba Kaizens deve existir");
  assert.equal(kaizensDef.headers.length, 57, "Deve conter exatamente 57 colunas");

  // Conferir primeiras e últimas colunas
  assert.equal(kaizensDef.headers[0], "ID do documento");
  assert.equal(kaizensDef.headers[1], "Código");
  assert.equal(kaizensDef.headers[2], "Projeto");
  assert.equal(kaizensDef.headers[5], "Data");
  assert.equal(kaizensDef.headers[12], "Arquivado");
  assert.equal(kaizensDef.headers[35], "Benefício Anual (R$)");
  assert.equal(kaizensDef.headers[36], "Custo de Implantação (R$)");
  assert.equal(kaizensDef.headers[37], "B/C Ratio");
  assert.equal(kaizensDef.headers[53], "Criado em");
  assert.equal(kaizensDef.headers[56], "Atualizado por");
});

test("Normalizadores tratam tipos, nulos, datas e injeção de fórmulas", () => {
  // Booleanos
  assert.equal(formatBoolean(true), "Sim");
  assert.equal(formatBoolean(false), "Não");

  // Nulos e números ausentes
  assert.equal(formatText(null), "");
  assert.equal(formatText(undefined), "");
  assert.equal(formatNumber(null), null);
  assert.equal(formatNumber(""), null);
  assert.equal(formatNumber("abc"), null);
  assert.equal(formatNumber(42), 42);
  assert.equal(formatNumber("1250.50"), 1250.50);

  // Injeção de fórmula
  assert.equal(formatText("=1+1"), "'=1+1");
  assert.equal(formatText("+SOMA(A1:A2)"), "'+SOMA(A1:A2)");
  assert.equal(formatText("-10"), "'-10");
  assert.equal(formatText("@CMD"), "'@CMD");
  assert.equal(formatText("Texto normal"), "Texto normal");

  // Datas
  const dt = formatDateOnly("2026-11-23");
  assert.ok(dt instanceof Date);
  assert.equal(dt.getFullYear(), 2026);
  assert.equal(dt.getMonth(), 10); // 0-indexed: novembro
  assert.equal(dt.getDate(), 23);
  assert.equal(dt.getHours(), 12); // Meio-dia local
});

test("normalizeKaizenRow() mapeia campos, nulos e fallbacks", () => {
  const k = {
    id: "kz-001",
    codigo: "KZ-20261123-0001",
    projeto: "Melhoria da Linha 1",
    data: "2026-11-23",
    arquivado: false,
    beneficio: 50000,
    custo: null,
    bcRatio: null,
    ownerUid: "u123",
    acoes: [{ id: "a1" }, { id: "a2" }],
    pilares: { seguranca: true, qualidade: false }
  };
  const usersById = {
    u123: { nome: "Douglas", email: "douglas@empresa.com" }
  };

  const row = normalizeKaizenRow(k, usersById);
  assert.equal(row.length, 57);

  // 1: ID
  assert.equal(row[0], "kz-001");
  // 6: Data (Date)
  assert.ok(row[5] instanceof Date);
  // 13: Arquivado ("Não")
  assert.equal(row[12], "Não");
  // 30: Pilar Segurança ("Sim")
  assert.equal(row[29], "Sim");
  // 31: Pilar Qualidade ("Não")
  assert.equal(row[30], "Não");
  // 36: Benefício (50000)
  assert.equal(row[35], 50000);
  // 37: Custo (null)
  assert.equal(row[36], null);
  // 38: bcRatio (null)
  assert.equal(row[37], null);
  // 40: Dono Nome (fallback de usersById)
  assert.equal(row[39], "Douglas");
  // 41: Dono Email (fallback de usersById)
  assert.equal(row[40], "douglas@empresa.com");
  // 43: Contagem de Ações
  assert.equal(row[42], 2);
});

test("Deduplicação de compartilhamentos funciona conforme §2.4.4", () => {
  const k = {
    id: "kz-100",
    codigo: "KZ-100",
    projeto: "Teste",
    ownerUid: "owner-1",
    shares: [
      { uid: "uA", nome: "Usuário A", role: "view" },
      { uid: "uB", nome: "Usuário B", role: "edit" }
    ],
    editorsUids: ["uB", "uC"],
    viewersUids: ["uA", "uD"],
    sharedWithUids: ["uA", "uB", "uC", "uD", "uE"]
  };
  const usersById = {
    uC: { nome: "Usuário C", email: "c@empresa.com" },
    uD: { nome: "Usuário D", email: "d@empresa.com" },
    uE: { nome: "Usuário E", email: "e@empresa.com" }
  };

  const rows = deriveSharesRows([k], usersById);
  // uA (shares), uB (shares), uC (editorsUids), uD (viewersUids), uE (sharedWithUids) = 5 UIDs distintos
  assert.equal(rows.length, 5);

  const uids = rows.map((r) => r[5]);
  assert.deepEqual(uids.sort(), ["uA", "uB", "uC", "uD", "uE"]);

  const rowB = rows.find((r) => r[5] === "uB");
  assert.equal(rowB[8], "Editar");
  assert.equal(rowB[9], "shares");

  const rowC = rows.find((r) => r[5] === "uC");
  assert.equal(rowC[8], "Editar");
  assert.equal(rowC[9], "editorsUids");
});

test("buildWorkbook() cria 9 abas válidas com autofilter e cols", () => {
  const data = {
    kaizens: [
      {
        id: "k1",
        codigo: "KZ-01",
        projeto: "Projeto 1",
        data: "2026-10-01",
        beneficio: 10000,
        custo: 2000,
        ownerUid: "u1"
      },
      {
        id: "k2",
        codigo: "KZ-02",
        projeto: "Projeto 2",
        data: "2026-10-02",
        beneficio: 20000,
        custo: 5000,
        ownerUid: "u1"
      }
    ],
    users: [
      {
        uid: "u1",
        nome: "Admin Teste",
        email: "admin@empresa.com",
        role: "admin",
        status: "active",
        criadoEm: "2026-01-01T00:00:00Z"
      }
    ],
    configDocs: {
      app: { signupMode: "approval" },
      lookups: { areas: ["Operação", "TI"] }
    },
    directory: [
      { uid: "u1", nome: "Admin Teste", email: "admin@empresa.com", atualizadoEm: "2026-01-01T00:00:00Z" }
    ]
  };

  const meta = {
    exportedBy: { uid: "u1", nome: "Admin Teste", email: "admin@empresa.com" },
    identity: { version: "2.1.0", build: "20261118-01" },
    versionUpdatedAt: "2026-11-18T11:15:47Z",
    url: "https://localhost/admin.html",
    userAgent: "NodeTest",
    duracaoSegundos: 1.2
  };

  const wb = buildWorkbook(XLSX, data, meta);

  // 9 abas
  assert.equal(wb.SheetNames.length, 9);
  assert.deepEqual(Array.from(wb.SheetNames), [
    "Resumo",
    "Kaizens",
    "Usuários",
    "Compartilhamentos",
    "Ações",
    "Riscos",
    "Links",
    "Configurações",
    "Diretório"
  ]);

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    assert.ok(ws["!autofilter"], `Aba ${name} deve conter autofilter`);
    assert.ok(Array.isArray(ws["!cols"]), `Aba ${name} deve conter !cols`);
  }

  // Round-trip SheetJS: write -> read
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer", cellDates: true, compression: true });
  assert.ok(buf.length > 0);

  const readWb = XLSX.read(buf, { type: "buffer", cellDates: true });
  assert.deepEqual(Array.from(readWb.SheetNames), Array.from(wb.SheetNames));

  const kaizenData = XLSX.utils.sheet_to_json(readWb.Sheets["Kaizens"], { header: 1 });
  // Linha 0 = cabeçalho (57 colunas)
  assert.equal(kaizenData[0].length, 57);
  // Linhas 1 e 2 = kaizens k1 e k2
  assert.equal(kaizenData.length, 3);

  // Célula de data deve ser lida como Date (cellDates: true)
  const cellData = readWb.Sheets["Kaizens"]["F2"];
  assert.equal(cellData.t, "d");
  assert.ok(cellData.v instanceof Date);
});
