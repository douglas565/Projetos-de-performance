// ============================================================
// js/export-xlsx.js — Orquestração de Exportação do Banco em Excel
// ============================================================

import {
  collection,
  query,
  orderBy,
  documentId,
  startAfter,
  limit,
  getDocs,
  getCountFromServer,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { buildWorkbook, buildSheetRows } from "./export-rows.js";

let xlsxPromise = null;

export function ensureXlsx(buildTag = "") {
  if (typeof window !== "undefined" && window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `js/vendor/xlsx.full.min.js${buildTag ? `?v=${buildTag}` : ""}`;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX indisponível")));
    s.onerror = () => {
      xlsxPromise = null;
      reject(new Error("Falha ao carregar a biblioteca de planilhas"));
    };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

class CancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

async function readAllPaged(collRef, { pageSize = 200, isCancelled, onPage }) {
  let last = null;
  let total = 0;
  for (;;) {
    if (isCancelled && isCancelled()) throw new CancelledError();
    const q = last
      ? query(collRef, orderBy(documentId()), startAfter(last), limit(pageSize))
      : query(collRef, orderBy(documentId()), limit(pageSize));

    let snap;
    try {
      snap = await getDocs(q);
    } catch (err) {
      // 1 retry após 500ms
      await new Promise((r) => setTimeout(r, 500));
      if (isCancelled && isCancelled()) throw new CancelledError();
      snap = await getDocs(q);
    }

    if (snap.empty) break;
    total += snap.size;
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onPage(docs, total);
    last = snap.docs[snap.size - 1];
    if (snap.size < pageSize) break;
    await new Promise((r) => setTimeout(r, 0)); // Devolve controle à UI
  }
  return total;
}

export async function exportDatabaseToXlsx({
  db,
  pageSize = 200,
  onProgress = () => {},
  isCancelled = () => false,
  exportedBy,
  identity = {},
  now = () => new Date(),
  mockData = null
}) {
  // Defesa em profundidade: papel admin obrigatório
  if (!exportedBy || exportedBy.role !== "admin") {
    throw new Error("forbidden");
  }

  const startTime = Date.now();
  const observacoes = [];

  try {
    const XLSX = await ensureXlsx(identity.build);

    let kaizens = [];
    let users = [];
    let configDocs = {};
    let directory = [];

    if (mockData) {
      // Suporte para ambiente de teste/mock
      kaizens = mockData.kaizens || [];
      users = mockData.users || [];
      configDocs = mockData.configDocs || {};
      directory = mockData.directory || [];
      onProgress({ phase: "kaizens", current: kaizens.length, total: kaizens.length, message: `Lendo kaizens… ${kaizens.length} de ${kaizens.length}` });
      onProgress({ phase: "usuarios", current: users.length, total: users.length, message: `Lendo usuários… ${users.length} de ${users.length}` });
      onProgress({ phase: "config", current: 2, total: 2, message: "Lendo configurações…" });
      onProgress({ phase: "directory", current: directory.length, total: directory.length, message: `Lendo diretório… ${directory.length}` });
    } else {
      // 1. Total inicial de kaizens via getCountFromServer
      let totalKaizensCount = null;
      try {
        const countSnap = await getCountFromServer(collection(db, "kaizens"));
        totalKaizensCount = countSnap.data().count;
      } catch (e) {
        observacoes.push("getCountFromServer indisponível para kaizens");
      }

      // 2. Leitura de Kaizens
      onProgress({
        phase: "kaizens",
        current: 0,
        total: totalKaizensCount,
        message: totalKaizensCount != null ? `Lendo kaizens… 0 de ${totalKaizensCount}` : "Lendo kaizens…"
      });

      await readAllPaged(collection(db, "kaizens"), {
        pageSize,
        isCancelled,
        onPage: (pageDocs, countSoFar) => {
          kaizens.push(...pageDocs);
          if (countSoFar > 20000) {
            throw new Error("O banco possui mais de 20.000 kaizens. Para proteger a memória do navegador, exporte por período.");
          }
          onProgress({
            phase: "kaizens",
            current: countSoFar,
            total: totalKaizensCount,
            message: totalKaizensCount != null
              ? `Lendo kaizens… ${countSoFar} de ${totalKaizensCount}`
              : `Lendo kaizens… ${countSoFar}`
          });
        }
      });

      // 3. Leitura de Usuários
      let totalUsersCount = null;
      try {
        const uCountSnap = await getCountFromServer(collection(db, "users"));
        totalUsersCount = uCountSnap.data().count;
      } catch (e) {
        observacoes.push("getCountFromServer indisponível para users");
      }

      onProgress({
        phase: "usuarios",
        current: 0,
        total: totalUsersCount,
        message: totalUsersCount != null ? `Lendo usuários… 0 de ${totalUsersCount}` : "Lendo usuários…"
      });

      await readAllPaged(collection(db, "users"), {
        pageSize,
        isCancelled,
        onPage: (pageDocs, countSoFar) => {
          users.push(...pageDocs);
          onProgress({
            phase: "usuarios",
            current: countSoFar,
            total: totalUsersCount,
            message: totalUsersCount != null
              ? `Lendo usuários… ${countSoFar} de ${totalUsersCount}`
              : `Lendo usuários… ${countSoFar}`
          });
        }
      });

      // 4. Leitura de Configurações (app e lookups)
      onProgress({ phase: "config", current: 0, total: 2, message: "Lendo configurações…" });
      if (isCancelled()) throw new CancelledError();

      try {
        const appSnap = await getDoc(doc(db, "config", "app"));
        if (appSnap.exists()) configDocs.app = appSnap.data();
      } catch (e) {
        observacoes.push(`Falha ao ler config/app: ${e.message}`);
      }

      try {
        const lookupsSnap = await getDoc(doc(db, "config", "lookups"));
        if (lookupsSnap.exists()) configDocs.lookups = lookupsSnap.data();
      } catch (e) {
        observacoes.push(`Falha ao ler config/lookups: ${e.message}`);
      }
      onProgress({ phase: "config", current: 2, total: 2, message: "Lendo configurações…" });

      // 5. Leitura do Diretório
      onProgress({ phase: "directory", current: 0, total: null, message: "Lendo diretório…" });
      try {
        await readAllPaged(collection(db, "directory"), {
          pageSize,
          isCancelled,
          onPage: (pageDocs, countSoFar) => {
            directory.push(...pageDocs);
            onProgress({
              phase: "directory",
              current: countSoFar,
              total: null,
              message: `Lendo diretório… ${countSoFar}`
            });
          }
        });
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        observacoes.push(`Falha ao ler diretório: ${e.message}`);
      }
    }

    if (isCancelled()) throw new CancelledError();

    // 6. Geração do Workbook
    onProgress({ phase: "build", current: 0, total: 1, message: "Gerando planilhas…" });
    const duracaoSegundos = (Date.now() - startTime) / 1000;

    let versionUpdatedAt = "";
    try {
      const vRes = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
      if (vRes.ok) {
        const vData = await vRes.json();
        versionUpdatedAt = vData.updatedAt || "";
      }
    } catch (e) {}

    const meta = {
      exportedBy,
      identity,
      versionUpdatedAt,
      url: typeof window !== "undefined" ? window.location.origin + window.location.pathname : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      duracaoSegundos,
      observacoes,
      now
    };

    const wb = buildWorkbook(XLSX, { kaizens, users, configDocs, directory }, meta);
    const sheetData = buildSheetRows({ kaizens, users, configDocs, directory }, meta);

    if (isCancelled()) throw new CancelledError();

    // 7. Download
    onProgress({ phase: "download", current: 0, total: 1, message: "Baixando arquivo…" });

    const wbout = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
      cellDates: true,
      compression: true
    });

    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const pad2 = (n) => String(n).padStart(2, "0");
    const nowDate = typeof now === "function" ? now() : new Date();
    const dateStr = `${nowDate.getFullYear()}${pad2(nowDate.getMonth() + 1)}${pad2(nowDate.getDate())}-${pad2(nowDate.getHours())}${pad2(nowDate.getMinutes())}`;
    const filename = `kaizen-hub-backup-${dateStr}.xlsx`;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    return {
      ok: true,
      filename,
      counts: sheetData.counts
    };
  } catch (err) {
    if (err instanceof CancelledError || err.message === "cancelled") {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "error", error: err };
  }
}
