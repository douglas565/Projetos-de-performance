// ============================================================
// js/export-rows.js — Definição das Abas, Normalizadores e Workbook
// ============================================================

import { beneficioPrevistoDe, beneficioRealizadoDe } from "./dashboard-metrics.js";

export const SHEETS = [
  {
    name: "Resumo",
    headers: ["Campo", "Valor"]
  },
  {
    name: "Kaizens",
    headers: [
      "ID do documento",
      "Código",
      "Projeto",
      "Área de Negócio",
      "Processo / Área",
      "Data",
      "Líder",
      "Participantes",
      "Tipo",
      "Etapa Atual",
      "Status",
      "% Conclusão",
      "Arquivado",
      "Incômodo / Oportunidade",
      "Causas",
      "Meta (SMART)",
      "Monitoramento",
      "5W2H · What",
      "5W2H · Where",
      "5W2H · When",
      "5W2H · Who",
      "5W2H · Why",
      "5W2H · How",
      "5W2H · How Much",
      "Padronização",
      "Aprovação",
      "Status da Aprovação",
      "Expansão",
      "Área de Expansão",
      "Pilar · Segurança",
      "Pilar · Qualidade",
      "Pilar · Entrega",
      "Pilar · Lucratividade",
      "Pilar · Pessoas",
      "Tipo de Benefício",
      "Benefício Anual (R$)",
      "Benefício Previsto (R$)",
      "Benefício Realizado (R$)",
      "Custo de Implantação (R$)",
      "B/C Ratio",
      "Observação B/C",
      "Dono · Nome",
      "Dono · E-mail",
      "Dono · UID",
      "Nº de Ações",
      "Nº de Riscos",
      "Nº de Links",
      "Nº de Anexos",
      "Nº de Compartilhamentos",
      "Visibilidade",
      "Viewers (UIDs)",
      "Editores (UIDs)",
      "Compartilhados (UIDs)",
      "rev",
      "schemaVersion",
      "Criado em",
      "Criado por",
      "Atualizado em",
      "Atualizado por"
    ]
  },
  {
    name: "Usuários",
    headers: [
      "UID",
      "Nome",
      "E-mail",
      "Área de Negócio",
      "Papel",
      "Status",
      "Criado em",
      "Atualizado em",
      "Último login",
      "Preferências",
      "Dias desde o cadastro"
    ]
  },
  {
    name: "Compartilhamentos",
    headers: [
      "Kaizen ID",
      "Código",
      "Projeto",
      "Dono · Nome",
      "Dono · E-mail",
      "UID",
      "Nome",
      "E-mail",
      "Papel",
      "Fonte"
    ]
  },
  {
    name: "Ações",
    headers: [
      "Kaizen ID",
      "Código",
      "Projeto",
      "Ordem",
      "ID da Ação",
      "Descrição",
      "Responsável",
      "Prazo",
      "Status",
      "Concluída em"
    ]
  },
  {
    name: "Riscos",
    headers: [
      "Kaizen ID",
      "Código",
      "Projeto",
      "ID do Risco",
      "Descrição",
      "Severidade (1-4)",
      "Probabilidade (1-4)",
      "Score (S×P)",
      "Mitigação",
      "Responsável"
    ]
  },
  {
    name: "Links",
    headers: [
      "Kaizen ID",
      "Código",
      "Projeto",
      "Título",
      "URL",
      "Descrição",
      "Categoria",
      "Tags",
      "Indexado"
    ]
  },
  {
    name: "Configurações",
    headers: [
      "Coleção",
      "Documento",
      "Chave",
      "Valor",
      "Atualizado em",
      "Atualizado por"
    ]
  },
  {
    name: "Diretório",
    headers: [
      "UID",
      "Nome",
      "E-mail",
      "Atualizado em"
    ]
  }
];

// ---------- Helpers de Normalização ----------

export function formatText(val) {
  if (val == null) return "";
  let str = String(val);
  if (str.length > 32000) {
    str = str.slice(0, 31990) + "…[truncado]";
  }
  // Formula injection defense: prefixa apóstrofo se iniciar com =, +, -, @
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  return str;
}

export function formatBoolean(val) {
  if (val === true) return "Sim";
  if (val === false) return "Não";
  return "";
}

export function formatNumber(val) {
  if (val == null || val === "") return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

export function formatDateOnly(val) {
  if (!val) return "";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    const [y, m, d] = val.trim().split("-").map(Number);
    // Meio-dia local para evitar shift de fuso
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  if (val instanceof Date) return val;
  return formatText(val);
}

export function formatTimestamp(val) {
  if (!val) return "";
  if (typeof val === "object" && typeof val.toDate === "function") {
    return val.toDate();
  }
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === "number") {
    return new Date(val);
  }
  if (typeof val === "string" && val.trim()) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return new Date(parsed);
    return formatText(val);
  }
  return "";
}

// ---------- Normalizadores de Linhas ----------

export function normalizeKaizenRow(k = {}, usersById = {}) {
  const w2h = k.w2h || {};
  const pilares = k.pilares || {};
  const ownerUid = k.ownerUid || "";
  const ownerFromUsers = usersById[ownerUid] || {};

  return [
    formatText(k.id),
    formatText(k.codigo),
    formatText(k.projeto),
    formatText(k.areaNegocio),
    formatText(k.area),
    formatDateOnly(k.data),
    formatText(k.lider),
    Array.isArray(k.participantes) ? k.participantes.filter(Boolean).map(formatText).join("; ") : "",
    formatText(k.tipo),
    formatNumber(k.etapaAtual),
    formatText(k.status),
    formatNumber(k.percentual),
    formatBoolean(Boolean(k.arquivado)),
    formatText(k.incomodo),
    formatText(k.causas),
    formatText(k.meta),
    formatText(k.monitoramento),
    formatText(w2h.what),
    formatText(w2h.where),
    formatText(w2h.when),
    formatText(w2h.who),
    formatText(w2h.why),
    formatText(w2h.how),
    formatText(w2h.howMuch),
    formatText(k.padronizacao),
    formatText(k.aprovacao),
    formatText(k.aprovacaoStatus),
    formatBoolean(Boolean(k.expansao)),
    formatText(k.expansaoArea),
    formatBoolean(Boolean(pilares.seguranca)),
    formatBoolean(Boolean(pilares.qualidade)),
    formatBoolean(Boolean(pilares.entrega)),
    formatBoolean(Boolean(pilares.lucratividade)),
    formatBoolean(Boolean(pilares.pessoas)),
    formatText(k.tipoBeneficio),
    formatNumber(k.beneficio != null ? k.beneficio : beneficioPrevistoDe(k)),
    formatNumber(beneficioPrevistoDe(k)),
    formatNumber(beneficioRealizadoDe(k)),
    formatNumber(k.custo),
    formatNumber(k.bcRatio),
    formatText(k.bcObs),
    formatText(k.ownerNome || ownerFromUsers.nome || ""),
    formatText(k.ownerEmail || ownerFromUsers.email || ""),
    formatText(ownerUid),
    Array.isArray(k.acoes) ? k.acoes.length : 0,
    Array.isArray(k.riscos) ? k.riscos.length : 0,
    Array.isArray(k.links) ? k.links.length : 0,
    Array.isArray(k.anexos) ? k.anexos.length : 0,
    Array.isArray(k.shares) ? k.shares.length : 0,
    formatText(k.visibilidade),
    Array.isArray(k.viewersUids) ? k.viewersUids.join("; ") : "",
    Array.isArray(k.editorsUids) ? k.editorsUids.join("; ") : "",
    Array.isArray(k.sharedWithUids) ? k.sharedWithUids.join("; ") : "",
    formatNumber(k.rev != null ? k.rev : 1),
    formatNumber(k.schemaVersion != null ? k.schemaVersion : 2),
    formatTimestamp(k.criadoEm),
    formatText(k.criadoPor),
    formatTimestamp(k.atualizadoEm),
    formatText(k.atualizadoPor)
  ];
}

export function normalizeUserRow(u = {}, now = () => new Date()) {
  const criadoDate = formatTimestamp(u.criadoEm);
  let diasDesdeCadastro = null;
  if (criadoDate instanceof Date) {
    const nowDate = typeof now === "function" ? now() : new Date();
    const diffMs = nowDate.getTime() - criadoDate.getTime();
    diasDesdeCadastro = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  let prefsText = "";
  if (u.preferencias) {
    prefsText = typeof u.preferencias === "object" ? JSON.stringify(u.preferencias) : String(u.preferencias);
  }

  return [
    formatText(u.uid || u.id),
    formatText(u.nome),
    formatText(u.email),
    formatText(u.areaNegocio),
    formatText(u.role),
    formatText(u.status),
    criadoDate,
    formatTimestamp(u.atualizadoEm),
    u.ultimoLogin ? formatTimestamp(u.ultimoLogin) : "",
    formatText(prefsText),
    formatNumber(diasDesdeCadastro)
  ];
}

export function deriveSharesRows(kaizens = [], usersById = {}) {
  const rows = [];
  for (const k of kaizens) {
    const kaizenId = formatText(k.id);
    const codigo = formatText(k.codigo);
    const projeto = formatText(k.projeto);
    const ownerUid = k.ownerUid || "";
    const ownerName = formatText(k.ownerNome || usersById[ownerUid]?.nome || "");
    const ownerEmail = formatText(k.ownerEmail || usersById[ownerUid]?.email || "");

    const seenUids = new Set();

    // 1. Array shares[]
    if (Array.isArray(k.shares)) {
      for (const s of k.shares) {
        if (!s || !s.uid) continue;
        seenUids.add(s.uid);
        const u = usersById[s.uid] || {};
        rows.push([
          kaizenId,
          codigo,
          projeto,
          ownerName,
          ownerEmail,
          formatText(s.uid),
          formatText(s.nome || u.nome || ""),
          formatText(s.email || u.email || ""),
          s.role === "edit" || s.role === "editor" ? "Editar" : "Visualizar",
          "shares"
        ]);
      }
    }

    // 2. editorsUids
    if (Array.isArray(k.editorsUids)) {
      for (const uid of k.editorsUids) {
        if (!uid || seenUids.has(uid)) continue;
        seenUids.add(uid);
        const u = usersById[uid] || {};
        rows.push([
          kaizenId,
          codigo,
          projeto,
          ownerName,
          ownerEmail,
          formatText(uid),
          formatText(u.nome || ""),
          formatText(u.email || ""),
          "Editar",
          "editorsUids"
        ]);
      }
    }

    // 3. viewersUids
    if (Array.isArray(k.viewersUids)) {
      for (const uid of k.viewersUids) {
        if (!uid || seenUids.has(uid)) continue;
        seenUids.add(uid);
        const u = usersById[uid] || {};
        rows.push([
          kaizenId,
          codigo,
          projeto,
          ownerName,
          ownerEmail,
          formatText(uid),
          formatText(u.nome || ""),
          formatText(u.email || ""),
          "Visualizar",
          "viewersUids"
        ]);
      }
    }

    // 4. sharedWithUids
    if (Array.isArray(k.sharedWithUids)) {
      for (const uid of k.sharedWithUids) {
        if (!uid || seenUids.has(uid)) continue;
        seenUids.add(uid);
        const u = usersById[uid] || {};
        rows.push([
          kaizenId,
          codigo,
          projeto,
          ownerName,
          ownerEmail,
          formatText(uid),
          formatText(u.nome || ""),
          formatText(u.email || ""),
          "Visualizar",
          "sharedWithUids"
        ]);
      }
    }
  }

  // Ordenação por (kaizenId, nome)
  rows.sort((a, b) => {
    const kCmp = String(a[0]).localeCompare(String(b[0]));
    if (kCmp !== 0) return kCmp;
    return String(a[6]).localeCompare(String(b[6]));
  });

  return rows;
}

export function deriveActionsRows(kaizens = []) {
  const rows = [];
  for (const k of kaizens) {
    const kaizenId = formatText(k.id);
    const codigo = formatText(k.codigo);
    const projeto = formatText(k.projeto);
    if (Array.isArray(k.acoes)) {
      k.acoes.forEach((a, idx) => {
        if (!a) return;
        rows.push([
          kaizenId,
          codigo,
          projeto,
          formatNumber(a.ordem != null ? a.ordem : idx + 1),
          formatText(a.id),
          formatText(a.descricao),
          formatText(a.responsavel),
          formatDateOnly(a.prazo),
          formatText(a.status),
          formatDateOnly(a.concluidaEm)
        ]);
      });
    }
  }
  // Ordenação por (kaizenId, ordem)
  rows.sort((a, b) => {
    const kCmp = String(a[0]).localeCompare(String(b[0]));
    if (kCmp !== 0) return kCmp;
    return (Number(a[3]) || 0) - (Number(b[3]) || 0);
  });
  return rows;
}

export function deriveRisksRows(kaizens = []) {
  const rows = [];
  for (const k of kaizens) {
    const kaizenId = formatText(k.id);
    const codigo = formatText(k.codigo);
    const projeto = formatText(k.projeto);
    if (Array.isArray(k.riscos)) {
      for (const r of k.riscos) {
        if (!r) continue;
        const sev = formatNumber(r.severidade);
        const prob = formatNumber(r.probabilidade);
        const score = r.score != null ? formatNumber(r.score) : (sev || 0) * (prob || 0);
        rows.push([
          kaizenId,
          codigo,
          projeto,
          formatText(r.id),
          formatText(r.descricao),
          sev,
          prob,
          score,
          formatText(r.mitigacao),
          formatText(r.responsavel)
        ]);
      }
    }
  }
  // Ordenação por score desc (fallback kaizenId)
  rows.sort((a, b) => {
    const sA = Number(a[7]) || 0;
    const sB = Number(b[7]) || 0;
    if (sB !== sA) return sB - sA;
    return String(a[0]).localeCompare(String(b[0]));
  });
  return rows;
}

export function deriveLinksRows(kaizens = []) {
  const rows = [];
  for (const k of kaizens) {
    const kaizenId = formatText(k.id);
    const codigo = formatText(k.codigo);
    const projeto = formatText(k.projeto);
    if (Array.isArray(k.links)) {
      for (const l of k.links) {
        if (!l) continue;
        rows.push([
          kaizenId,
          codigo,
          projeto,
          formatText(l.titulo),
          formatText(l.url),
          formatText(l.descricao),
          formatText(l.categoria),
          Array.isArray(l.tags) ? l.tags.filter(Boolean).map(formatText).join("; ") : "",
          formatBoolean(l.indexado !== false)
        ]);
      }
    }
  }
  // Ordenação por (kaizenId, titulo)
  rows.sort((a, b) => {
    const kCmp = String(a[0]).localeCompare(String(b[0]));
    if (kCmp !== 0) return kCmp;
    return String(a[3]).localeCompare(String(b[3]));
  });
  return rows;
}

export function deriveConfigRows(configDocs = {}) {
  const rows = [];
  const docNames = ["app", "lookups"];

  function flatten(obj, prefix = "") {
    const entries = [];
    if (!obj || typeof obj !== "object") return entries;
    for (const [k, v] of Object.entries(obj)) {
      // Pula metadados de auditoria que ficam em colunas próprias
      if (!prefix && (k === "atualizadoEm" || k === "atualizadoPor")) continue;
      const keyPath = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && typeof v.toDate !== "function") {
        entries.push(...flatten(v, keyPath));
      } else if (Array.isArray(v)) {
        v.forEach((item, idx) => {
          if (item !== null && typeof item === "object") {
            entries.push(...flatten(item, `${keyPath}.${idx}`));
          } else {
            entries.push([`${keyPath}.${idx}`, formatText(item)]);
          }
        });
      } else {
        entries.push([keyPath, formatText(v)]);
      }
    }
    return entries;
  }

  for (const docName of docNames) {
    const docData = configDocs[docName];
    if (!docData) {
      rows.push(["config", docName, "(documento ausente)", "", "", ""]);
      continue;
    }

    const atualizadoEm = formatTimestamp(docData.atualizadoEm);
    const atualizadoPor = formatText(docData.atualizadoPor);
    const flattened = flatten(docData);

    if (flattened.length === 0) {
      rows.push(["config", docName, "(vazio)", "", atualizadoEm, atualizadoPor]);
    } else {
      for (const [keyPath, val] of flattened) {
        rows.push(["config", docName, keyPath, val, atualizadoEm, atualizadoPor]);
      }
    }
  }
  return rows;
}

export function deriveDirectoryRows(directory = []) {
  const rows = [];
  for (const d of directory) {
    if (!d) continue;
    rows.push([
      formatText(d.uid || d.id),
      formatText(d.nome),
      formatText(d.email),
      formatTimestamp(d.atualizadoEm)
    ]);
  }
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return rows;
}

export function buildSheetRows(data = {}, meta = {}) {
  const kaizens = Array.isArray(data.kaizens) ? [...data.kaizens] : [];
  const users = Array.isArray(data.users) ? [...data.users] : [];
  const configDocs = data.configDocs || {};
  const directory = Array.isArray(data.directory) ? [...data.directory] : [];

  const usersById = {};
  for (const u of users) {
    if (u && (u.uid || u.id)) usersById[u.uid || u.id] = u;
  }

  // Ordenação primária
  kaizens.sort((a, b) => {
    const cA = String(a.codigo || a.id || "");
    const cB = String(b.codigo || b.id || "");
    return cA.localeCompare(cB);
  });
  users.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));

  const kaizenRows = kaizens.map((k) => normalizeKaizenRow(k, usersById));
  const userRows = users.map((u) => normalizeUserRow(u, meta.now));
  const sharesRows = deriveSharesRows(kaizens, usersById);
  const actionsRows = deriveActionsRows(kaizens);
  const risksRows = deriveRisksRows(kaizens);
  const linksRows = deriveLinksRows(kaizens);
  const configRows = deriveConfigRows(configDocs);
  const dirRows = deriveDirectoryRows(directory);

  // Aba Resumo
  const counts = {
    kaizens: kaizenRows.length,
    usuarios: userRows.length,
    compartilhamentos: sharesRows.length,
    acoes: actionsRows.length,
    riscos: risksRows.length,
    links: linksRows.length,
    diretorio: dirRows.length
  };

  const expBy = meta.exportedBy || {};
  const ident = meta.identity || {};
  const exportadoDate = meta.now ? (typeof meta.now === "function" ? meta.now() : meta.now) : new Date();

  // Formata data/hora em America/Sao_Paulo + ISO UTC
  const spDateStr = exportadoDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const utcStr = exportadoDate.toISOString();
  const exportadoEmFormatado = `${spDateStr} (${utcStr})`;

  const resumoRows = [
    ["Exportado em", exportadoEmFormatado],
    ["Exportado por", `${expBy.nome || ""} <${expBy.email || ""}>`],
    ["UID do exportador", expBy.uid || ""],
    ["Versão do app", ident.version || ""],
    ["Build", ident.build || ""],
    ["version.json atualizado em", meta.versionUpdatedAt || ""],
    ["Schema dos dados", "v2 (kaizens)"],
    ["URL", meta.url || ""],
    ["Navegador", meta.userAgent || ""],
    ["Total de kaizens", counts.kaizens],
    ["Total de usuários", counts.usuarios],
    ["Total de compartilhamentos", counts.compartilhamentos],
    ["Total de ações", counts.acoes],
    ["Total de riscos", counts.riscos],
    ["Total de links", counts.links],
    ["Total de entradas no diretório", counts.diretorio],
    ["Duração da exportação", meta.duracaoSegundos != null ? `${Number(meta.duracaoSegundos).toFixed(1)}s` : ""],
    ["Observações", Array.isArray(meta.observacoes) && meta.observacoes.length ? meta.observacoes.join("; ") : "—"]
  ];

  return {
    Resumo: resumoRows,
    Kaizens: kaizenRows,
    Usuários: userRows,
    Compartilhamentos: sharesRows,
    Ações: actionsRows,
    Riscos: risksRows,
    Links: linksRows,
    Configurações: configRows,
    Diretório: dirRows,
    counts
  };
}

/**
 * Constrói o workbook XLSX completo com as 9 abas
 * @param {object} XLSX Biblioteca SheetJS
 * @param {object} data { kaizens, users, configDocs, directory }
 * @param {object} meta { exportedBy, identity, versionUpdatedAt, url, userAgent, duracaoSegundos, observacoes, now }
 * @returns {object} Workbook SheetJS
 */
export function buildWorkbook(XLSX, data = {}, meta = {}) {
  const wb = XLSX.utils.book_new();
  const sheetRows = buildSheetRows(data, meta);

  for (const sheetDef of SHEETS) {
    const rows = sheetRows[sheetDef.name] || [];
    const aoa = [sheetDef.headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

    // Autofilter A1:<lastCol>1
    const lastColLetter = XLSX.utils.encode_col(sheetDef.headers.length - 1);
    ws["!autofilter"] = { ref: `A1:${lastColLetter}1` };

    // Largura calculada das colunas (!cols) mín. 10, máx. 60
    const cols = sheetDef.headers.map((h, colIdx) => {
      let maxLen = String(h || "").length;
      const sampleLimit = Math.min(rows.length, 100);
      for (let i = 0; i < sampleLimit; i++) {
        const cell = rows[i][colIdx];
        if (cell != null) {
          const l = cell instanceof Date ? 19 : String(cell).length;
          if (l > maxLen) maxLen = l;
        }
      }
      return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
    });
    ws["!cols"] = cols;

    XLSX.utils.book_append_sheet(wb, ws, sheetDef.name);
  }

  return wb;
}
