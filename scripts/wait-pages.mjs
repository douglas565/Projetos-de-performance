#!/usr/bin/env node
// ============================================================
// scripts/wait-pages.mjs — Polling do version.json no GitHub Pages
// ============================================================

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    build: { type: "string" },
    timeout: { type: "string", default: "240" },
    url: {
      type: "string",
      default: "https://douglas565.github.io/Projetos-de-performance/version.json"
    }
  }
});

const targetBuild = values.build;
const timeoutSec = parseInt(values.timeout, 10) || 240;
const url = values.url;

if (!targetBuild) {
  console.error("Erro: especifique --build <build> (ex: --build 20261123-01)");
  process.exit(1);
}

console.log(`[wait-pages] Aguardando GitHub Pages publicar build "${targetBuild}"...`);
console.log(`[wait-pages] URL: ${url} (timeout: ${timeoutSec}s)`);

const start = Date.now();
const timeoutMs = timeoutSec * 1000;

async function check() {
  while (Date.now() - start < timeoutMs) {
    try {
      const fetchUrl = `${url}?t=${Date.now()}`;
      const res = await fetch(fetchUrl, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.build === targetBuild) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          console.log(`[wait-pages] Sucesso! Build "${targetBuild}" publicado em ${elapsed}s (versão: ${data.version}).`);
          process.exit(0);
        }
        console.log(`[wait-pages] Build remoto atual: "${data?.build || "desconhecido"}" (aguardando "${targetBuild}")...`);
      } else {
        console.log(`[wait-pages] HTTP ${res.status} ao consultar ${url}...`);
      }
    } catch (e) {
      console.log(`[wait-pages] Falha de conexão: ${e.message}...`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.error(`[wait-pages] TIMEOUT: Build "${targetBuild}" não foi detectado após ${timeoutSec}s.`);
  process.exit(1);
}

check();
