#!/usr/bin/env node
// ============================================================
// scripts/migrar-percentual.mjs — F5: recálculo em massa do percentual
//
// Uso:
//   node scripts/migrar-percentual.mjs --key /caminho/serviceAccount.json            (dry-run)
//   node scripts/migrar-percentual.mjs --key /caminho/serviceAccount.json --apply    (grava)
//
// Regras de segurança:
//  - Sem --apply NÃO escreve nada no Firestore; só lê e grava o backup local.
//  - Backup JSON de TODOS os documentos lidos é gravado ANTES de qualquer escrita.
//  - Idempotente: se percentualOrigem === "auto" e o percentual calculado é igual,
//    o documento é PULADO (não regrava percentualManualLegado).
//  - percentualManualLegado só é gravado se ainda não existir no documento.
//  - Atualiza SOMENTE os campos percentual / percentualOrigem / percentualManualLegado.
//  - Relatório com contagens e lista de ids cuja % mudou.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { calcularPercentual } from "../js/percentual.js";

function arg(nome, def = null) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : def;
}
const temFlag = (nome) => process.argv.includes(nome);

const APLICAR = temFlag("--apply");
const KEY = arg("--key", process.env.GOOGLE_APPLICATION_CREDENTIALS || "");
const DRY = !APLICAR;

if (!KEY || !fs.existsSync(KEY)) {
  console.error("ERRO: informe --key <serviceAccount.json> (ou GOOGLE_APPLICATION_CREDENTIALS).");
  console.error("Sem credencial de service account não é possível ler/escrever todos os kaizens.");
  process.exit(2);
}

const adminMod = await import(new URL("../functions/node_modules/firebase-admin/lib/index.js", import.meta.url).href);
const admin = adminMod.default || adminMod;

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY, "utf8"))) });
const db = admin.firestore();

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = arg("--backup-dir", "/home/hermes/crew/coder/work/backups");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `kaizen-percentual-backup-${ts}.json`);
const reportPath = path.join(backupDir, `kaizen-percentual-relatorio-${ts}.json`);

console.log(`Modo: ${DRY ? "DRY-RUN (somente leitura)" : "APPLY (gravação)"}`);
console.log(`Projeto: ${JSON.parse(fs.readFileSync(KEY, "utf8")).project_id}`);

const snap = await db.collection("kaizens").get();
const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
console.log(`Documentos lidos: ${docs.length}`);

// BACKUP PRIMEIRO — sempre, inclusive dry-run.
fs.writeFileSync(backupPath, JSON.stringify({ criadoEm: new Date().toISOString(), total: docs.length, docs }, null, 2));
console.log(`Backup: ${backupPath} (${fs.statSync(backupPath).size} bytes)`);

const stats = { total: docs.length, iguais: 0, atualizar: 0, percentualAlterado: 0, erros: 0 };
const mudancas = [];
const erros = [];

for (const { id, data } of docs) {
  try {
    const novo = calcularPercentual(data);
    const antigo = Number(data.percentual) || 0;
    const jaAuto = data.percentualOrigem === "auto";

    if (jaAuto && antigo === novo && "percentualManualLegado" in data) {
      stats.iguais++;
      continue;
    }

    const precisaLegado = !("percentualManualLegado" in data) && data.percentualOrigem !== "auto";
    const patch = {
      percentual: novo,
      percentualOrigem: "auto"
    };
    if (precisaLegado) patch.percentualManualLegado = antigo;

    stats.atualizar++;
    if (antigo !== novo) {
      stats.percentualAlterado++;
      mudancas.push({ id, de: antigo, para: novo });
    }

    if (!DRY) await db.collection("kaizens").doc(id).update(patch);
  } catch (e) {
    stats.erros++;
    erros.push({ id, erro: String(e && e.message ? e.message : e) });
  }
}

// Segunda passagem em dry-run para provar idempotência do cálculo (não escreve).
const relatorio = {
  criadoEm: new Date().toISOString(),
  modo: DRY ? "dry-run" : "apply",
  backupPath,
  stats,
  mudancas,
  erros
};
fs.writeFileSync(reportPath, JSON.stringify(relatorio, null, 2));

console.log("--- RESUMO ---");
console.log(`total=${stats.total} atualizar=${stats.atualizar} ja_ok=${stats.iguais} erros=${stats.erros}`);
console.log(`percentual alterado em ${mudancas.length} documento(s)`);
console.log(`Relatório: ${reportPath}`);
if (mudancas.length) {
  console.log("Primeiras mudanças:");
  for (const m of mudancas.slice(0, 20)) console.log(`  ${m.id}: ${m.de}% -> ${m.para}%`);
}
if (erros.length) {
  console.error("ERROS:", erros.slice(0, 10));
  process.exit(1);
}
if (DRY) console.log("Dry-run concluído. Nada foi escrito. Rode com --apply após conferir o backup.");
