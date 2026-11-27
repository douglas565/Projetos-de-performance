// ============================================================
// js/kaizen-model.js — Modelo de Dados v2, Regras de Negócio e Migração
// Compatível com navegador (ESM) e Node.js (node --test)
// ============================================================

import { aplicarPercentualAutomatico } from "./percentual.js";

/**
 * Gera código único para o Kaizen no cliente: KZ-YYYYMMDD-XXXX
 */
export function generateKaizenCode(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, "0");
  return `KZ-${y}${m}${d}-${rand}`;
}

/**
 * Normaliza texto para busca (minúsculo, sem acentos/cedilha)
 */
export function normalizeString(str) {
  if (typeof str !== "string") return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Extrai tokens únicos >= 3 caracteres para indexação
 */
export function extractTokens(text) {
  if (!text) return [];
  const normalized = normalizeString(String(text));
  const words = normalized.split(/[^a-z0-9_-]+/);
  const set = new Set();
  for (const w of words) {
    if (w.length >= 3 && !set.has(w)) {
      set.add(w);
    }
  }
  return Array.from(set);
}

/**
 * Converte um valor monetário em número finito (ou null).
 * Aceita number e string ("1234.56", "1234,56", "R$ 1.234,56").
 */
export function numeroMonetario(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const s = valor.trim();
    if (!s) return null;
    const direto = Number(s);
    if (Number.isFinite(direto)) return direto;
    const bruto = s.replace(/R\$/g, "").replace(/\s/g, "");
    const n = Number(bruto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Benefício previsto vigente: campo novo com fallback para o legado
 * `beneficio`. Um 0 explícito NÃO cai no fallback.
 */
export function beneficioPrevistoDe(kaizen) {
  const k = kaizen || {};
  const previsto = numeroMonetario(k.beneficioPrevisto);
  if (previsto !== null) return previsto;
  const legado = numeroMonetario(k.beneficio);
  return legado !== null ? legado : 0;
}

/**
 * Migração idempotente do Business Case (v2.5.0):
 *   • beneficioPrevisto ausente + beneficio existente => copia o legado;
 *   • beneficioRealizado ausente/vazio => null;
 *   • `beneficio` NUNCA é alterado nem apagado (espelho legado).
 * Rodar duas vezes não muda nada.
 */
export function migrarBeneficioPrevistoRealizado(kaizen) {
  if (!kaizen || typeof kaizen !== "object" || Array.isArray(kaizen)) return kaizen;

  const temPrevisto =
    Object.prototype.hasOwnProperty.call(kaizen, "beneficioPrevisto") &&
    kaizen.beneficioPrevisto !== undefined &&
    kaizen.beneficioPrevisto !== null &&
    !(typeof kaizen.beneficioPrevisto === "string" && kaizen.beneficioPrevisto.trim() === "");

  if (!temPrevisto) {
    const legado = numeroMonetario(kaizen.beneficio);
    kaizen.beneficioPrevisto = legado !== null ? legado : 0;
  }

  if (
    kaizen.beneficioRealizado === undefined ||
    kaizen.beneficioRealizado === null ||
    (typeof kaizen.beneficioRealizado === "string" && kaizen.beneficioRealizado.trim() === "")
  ) {
    kaizen.beneficioRealizado = null;
  }

  return kaizen;
}

/**
 * Calcula B/C Ratio: benefício / custo (arredondado em 2 casas)
 */
export function calculateBcRatio(beneficio, custo) {
  const b = Number(beneficio) || 0;
  const c = Number(custo) || 0;
  if (c <= 0) return null;
  return Number((b / c).toFixed(2));
}

/**
 * Calcula % de conclusão a partir das ações do plano
 */
export function calculatePercentualFromActions(acoes) {
  if (!Array.isArray(acoes) || acoes.length === 0) return 0;
  const concluidas = acoes.filter((a) => a && a.status === "concluida").length;
  return Math.round((concluidas / acoes.length) * 100);
}

/**
 * Calcula score de risco (severidade * probabilidade) e nível de criticidade
 */
export function calculateRiskScore(severidade, probabilidade) {
  const sev = Math.min(4, Math.max(1, Number(severidade) || 1));
  const prob = Math.min(4, Math.max(1, Number(probabilidade) || 1));
  const score = sev * prob;
  let nivel = "baixo"; // 1..4 (verde)
  if (score >= 10) {
    nivel = "alto"; // 10..16 (vermelho)
  } else if (score >= 5) {
    nivel = "medio"; // 5..9 (âmbar)
  }
  return { score, severidade: sev, probabilidade: prob, nivel };
}

/**
 * Gera lista de palavras-chave para busca no Firestore (searchKeywords)
 */
export function generateSearchKeywords(kaizen) {
  if (!kaizen) return [];
  const tokenSet = new Set();

  function addText(val) {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(addText);
      return;
    }
    extractTokens(val).forEach((t) => tokenSet.add(t));
  }

  addText(kaizen.codigo);
  addText(kaizen.projeto);
  addText(kaizen.area);
  addText(kaizen.lider);
  addText(kaizen.participantes);
  addText(kaizen.areaNegocio);
  addText(kaizen.tipo);
  addText(kaizen.tipoBeneficio);
  addText(kaizen.incomodo);
  addText(kaizen.meta);
  addText(kaizen.ownerNome);
  addText(kaizen.ownerEmail);

  // Palavras-chave dos links indexados
  if (Array.isArray(kaizen.links)) {
    for (const l of kaizen.links) {
      if (l && l.indexado !== false) {
        addText(l.titulo);
        addText(l.descricao);
        addText(l.categoria);
        addText(l.tags);
        if (typeof l.url === "string") {
          try {
            const parsed = new URL(l.url);
            addText(parsed.pathname);
          } catch {
            addText(l.url);
          }
        }
      }
    }
  }

  // Palavras-chave das ações
  if (Array.isArray(kaizen.acoes)) {
    for (const a of kaizen.acoes) {
      if (a) {
        addText(a.descricao);
        addText(a.responsavel);
      }
    }
  }

  // Limite razoável de tokens para não inflar o documento
  return Array.from(tokenSet).sort().slice(0, 100);
}

/**
 * Sincroniza listas de UIDs de compartilhamento a partir da lista `shares`
 */
export function normalizeKaizenSharing(kaizen) {
  const normalized = syncSharingLists(kaizen?.shares);
  return { ...kaizen, ...normalized };
}

export function needsShareBackfill(kaizen) {
  const uids = [
    ...(Array.isArray(kaizen?.shares) ? kaizen.shares.map((share) => share?.uid) : []),
    ...(Array.isArray(kaizen?.sharedWithUids) ? kaizen.sharedWithUids : []),
    ...(Array.isArray(kaizen?.viewersUids) ? kaizen.viewersUids : []),
    ...(Array.isArray(kaizen?.editorsUids) ? kaizen.editorsUids : [])
  ];
  if (uids.some((uid) => typeof uid === "string" && uid.startsWith("ext-"))) return true;
  const normalized = syncSharingLists(kaizen?.shares);
  return ["sharedWithUids", "viewersUids", "editorsUids"].some((field) =>
    JSON.stringify(Array.isArray(kaizen?.[field]) ? kaizen[field] : []) !== JSON.stringify(normalized[field])
  );
}

export function reconcileKaizenShares(kaizen) {
  return { ...kaizen, ...syncSharingLists(kaizen?.shares) };
}

export function prepareKaizenSharingSave(shares) {
  return syncSharingLists(shares);
}

export function getDirectoryShareStatus(user) {
  if (!user || typeof user !== "object" || !user.id || user.uid !== user.id) return "invalid";
  if (user.status === "active") return "active";
  if (!Object.prototype.hasOwnProperty.call(user, "status")) return "legacy";
  return "inactive";
}

/**
 * Um e-mail colado no campo de busca (sem nome do autocomplete, sem espaços)
 */
export function isBareEmail(value) {
  if (typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

/**
 * Mensagem de UI para o resultado da consulta ao directory/ (nunca culpa o usuário)
 */
export function directoryLookupMessage(status, email) {
  const target = (email || "").trim();
  switch (status) {
    case "active":
      return "Esse colega já está na lista de acesso ou é você/dono do Kaizen.";
    case "inactive":
      return `${target} está cadastrado, mas a conta não está ativa. Peça ao administrador para ativar o acesso.`;
    case "legacy":
      return `${target} tem cadastro antigo sem status definido. Peça ao administrador para atualizar o cadastro no painel antes de compartilhar.`;
    case "invalid":
      return "Informe um e-mail completo, por exemplo nome@empresa.com.";
    default:
      return `Não existe usuário com o e-mail ${target}. Peça ao colega para criar a conta antes de compartilhar.`;
  }
}

export function syncSharingLists(shares) {
  const usersByUid = new Map();
  for (const share of Array.isArray(shares) ? shares : []) {
    const uid = typeof share?.uid === "string" ? share.uid.trim() : "";
    if (!uid || uid.startsWith("ext-")) continue;
    usersByUid.set(uid, {
      ...share,
      uid,
      role: share.role === "edit" ? "edit" : "view"
    });
  }
  const safeShares = Array.from(usersByUid.values());
  const viewersUids = [];
  const editorsUids = [];

  for (const share of safeShares) {
    if (share.role === "edit") editorsUids.push(share.uid);
    else viewersUids.push(share.uid);
  }
  const sharedWithUids = Array.from(new Set([...viewersUids, ...editorsUids]));
  return { viewersUids, editorsUids, sharedWithUids, shares: safeShares };
}

/**
 * Cria a estrutura padrão de um Kaizen v2 em branco
 * O percentual é SEMPRE derivado dos campos (automático, nunca manual).
 */
export function createDefaultKaizen(user = {}) {
  const today = new Date().toISOString().split("T")[0];
  const uid = user.uid || "";
  const email = user.email || "";
  const nome = user.displayName || (email ? email.split("@")[0] : "");

  const kaizen = {
    schemaVersion: 2,
    rev: 1,
    codigo: generateKaizenCode(),
    etapaAtual: 0,
    projeto: "",
    area: "",
    data: today,
    lider: nome,
    participantes: [],
    areaNegocio: "Operação",
    tipo: "kaizen", // kaizen | performance
    tipoBeneficio: null, // hard_saving | cost_avoidance
    pilares: {
      seguranca: false,
      qualidade: false,
      entrega: false,
      lucratividade: false,
      pessoas: false
    },
    incomodo: "",
    causas: "",
    meta: "",
    monitoramento: "",
    w2h: {
      what: "",
      where: "",
      when: "",
      who: "",
      why: "",
      how: "",
      howMuch: ""
    },
    acoes: [],
    padronizacao: "",
    aprovacao: "",
    aprovacaoStatus: "pendente", // pendente | aprovado | rejeitado
    expansao: false,
    expansaoArea: "",
    beneficio: 0, // espelho legado de beneficioPrevisto (compatibilidade)
    beneficioPrevisto: 0,
    beneficioRealizado: null,
    custo: 0,
    bcRatio: null,
    bcObs: "",
    riscos: [],
    links: [],
    anexos: [],
    status: "em_andamento", // rascunho | em_andamento | concluido | cancelado
    percentual: 0, // recalculado logo abaixo pela fórmula automática
    percentualOrigem: "auto",
    visibilidade: "privado", // Fixo: todo kaizen é individual e privado por padrão
    ownerUid: uid,
    ownerEmail: email,
    ownerNome: nome,
    viewersUids: [],
    editorsUids: [],
    sharedWithUids: [],
    shares: [],
    searchKeywords: [],
    arquivado: false,
    criadoEm: null,
    criadoPor: uid,
    atualizadoEm: null,
    atualizadoPor: uid
  };

  // Fórmula automática: kaizen novo (campos vazios) => 0
  aplicarPercentualAutomatico(kaizen);
  return kaizen;
}

/**
 * Validação de campos do Kaizen
 * isFinal = true se o usuário estiver concluindo o kaizen (status === 'concluido')
 */
export function validateKaizen(kaizen, isFinal = false) {
  const errors = [];
  if (!kaizen) {
    return { valid: false, errors: ["Documento inexistente."] };
  }

  // Validação básica para qualquer salvamento
  if (!kaizen.projeto || !kaizen.projeto.trim()) {
    errors.push("O nome do projeto é obrigatório.");
  }

  // Validação condicional: benefício previsto > 0 exige tipoBeneficio
  const b = beneficioPrevistoDe(kaizen);
  if (b > 0 && !kaizen.tipoBeneficio) {
    errors.push("Informe o tipo de benefício (Hard Saving ou Cost Avoidance) para benefício maior que zero.");
  }

  // Se expansão horizontal estiver marcada, a área deve ser informada
  if (kaizen.expansao && (!kaizen.expansaoArea || !kaizen.expansaoArea.trim())) {
    errors.push("Informe a área/UO para expansão horizontal.");
  }

  // Validação rigorosa para conclusão
  if (isFinal || kaizen.status === "concluido") {
    if (!kaizen.area || !kaizen.area.trim()) errors.push("Informe a área/processo.");
    if (!kaizen.data) errors.push("Informe a data do projeto.");
    if (!kaizen.lider || !kaizen.lider.trim()) errors.push("Informe o líder do kaizen.");
    if (!kaizen.areaNegocio) errors.push("Selecione a área de negócio.");
    if (!kaizen.incomodo || !kaizen.incomodo.trim()) errors.push("Preencha o incômodo / oportunidade (bloco 1).");
    if (!kaizen.causas || !kaizen.causas.trim()) errors.push("Preencha a análise das causas (bloco 2).");
    if (!kaizen.meta || !kaizen.meta.trim()) errors.push("Preencha a meta / objetivo SMART (bloco 3).");

    const w = kaizen.w2h || {};
    if (!w.what || !w.what.trim()) errors.push("Preencha o 'What (O quê?)' no 5W2H.");
    if (!w.how || !w.how.trim()) errors.push("Preencha o 'How (Como?)' no 5W2H.");

    if (!Array.isArray(kaizen.acoes) || kaizen.acoes.length === 0) {
      errors.push("O plano de ação deve conter ao menos 1 ação.");
    } else {
      const pendentes = kaizen.acoes.filter((a) => a && a.status !== "concluida");
      if (pendentes.length > 0) {
        errors.push("Para concluir o kaizen, todas as ações do plano devem estar marcadas como concluídas.");
      }
    }

    if (!kaizen.padronizacao || !kaizen.padronizacao.trim()) {
      errors.push("Preencha a padronização (bloco 6).");
    }
    if (!kaizen.aprovacao || !kaizen.aprovacao.trim()) {
      errors.push("Informe o responsável pela aprovação (bloco 7).");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validação de campos por etapa do fluxo guiado (wizard).
 * step: 0 a 10
 * Retorna { valid: boolean, errors: string[] }
 */
export function validateWizardStep(kaizen, step) {
  const errors = [];
  if (!kaizen) {
    return { valid: false, errors: ["Documento inexistente."] };
  }

  const s = Number(step) || 0;

  if (s === 0) {
    // 0: Identificação
    if (!kaizen.projeto || !kaizen.projeto.trim()) {
      errors.push("Informe o nome do projeto.");
    }
    if (!kaizen.area || !kaizen.area.trim()) {
      errors.push("Informe o processo ou área da melhoria.");
    }
    if (!kaizen.data) {
      errors.push("Informe a data do projeto.");
    }
    if (!kaizen.lider || !kaizen.lider.trim()) {
      errors.push("Informe o líder do kaizen.");
    }
    if (!kaizen.areaNegocio) {
      errors.push("Selecione a área de negócio.");
    }
  } else if (s === 1) {
    // 1: Incômodo / Oportunidade
    if (!kaizen.incomodo || !kaizen.incomodo.trim()) {
      errors.push("Preencha a descrição do incômodo ou oportunidade (bloco 1).");
    }
  } else if (s === 2) {
    // 2: Análise das causas
    if (!kaizen.causas || !kaizen.causas.trim()) {
      errors.push("Preencha a análise das causas raízes (bloco 2).");
    }
  } else if (s === 3) {
    // 3: 5W2H
    const w = kaizen.w2h || {};
    if (!w.what || !w.what.trim()) {
      errors.push("Preencha o campo 'What (O quê?)' no 5W2H.");
    }
    if (!w.how || !w.how.trim()) {
      errors.push("Preencha o campo 'How (Como?)' no 5W2H.");
    }
  } else if (s === 4) {
    // 4: Meta SMART
    if (!kaizen.meta || !kaizen.meta.trim()) {
      errors.push("Preencha a meta SMART (bloco 3).");
    }
  } else if (s === 5) {
    // 5: Plano de ação
    if (Array.isArray(kaizen.acoes) && kaizen.acoes.length > 0) {
      const semTexto = kaizen.acoes.some((a) => !a || !a.acao || !a.acao.trim());
      if (semTexto) {
        errors.push("Preencha a descrição de todas as ações adicionadas ao plano.");
      }
    }
  } else if (s === 6) {
    // 6: Monitoramento
    // Opcional durante rascunho
  } else if (s === 7) {
    // 7: Padronização + Aprovação / Expansão
    if (kaizen.expansao && (!kaizen.expansaoArea || !kaizen.expansaoArea.trim())) {
      errors.push("Informe a área/UO para expansão horizontal.");
    }
  } else if (s === 8) {
    // 8: Resultados (Business Case)
    const b = beneficioPrevistoDe(kaizen);
    if (b > 0 && !kaizen.tipoBeneficio) {
      errors.push("Informe o tipo de benefício (Hard Saving ou Cost Avoidance).");
    }
  } else if (s === 9) {
    // 9: Riscos e Links
    // Opcionais durante rascunho
  } else if (s === 10) {
    // 10: Revisão e Conclusão
    return validateKaizen(kaizen, true);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verifica permissão de leitura
 */
export function canUserRead(kaizen, user, userProfile) {
  if (!user || !user.uid) return false;
  if (userProfile && userProfile.role === "admin") return true;
  if (!kaizen) return false;
  if (kaizen.ownerUid === user.uid) return true;
  if (Array.isArray(kaizen.sharedWithUids) && kaizen.sharedWithUids.includes(user.uid)) return true;
  if (Array.isArray(kaizen.viewersUids) && kaizen.viewersUids.includes(user.uid)) return true;
  if (Array.isArray(kaizen.editorsUids) && kaizen.editorsUids.includes(user.uid)) return true;
  return false;
}

/**
 * Verifica permissão de escrita/edição
 * Viewer NUNCA edita!
 */
export function canUserEdit(kaizen, user, userProfile) {
  if (!user || !user.uid) return false;
  if (userProfile && userProfile.role === "admin") return true;
  if (!kaizen) return false;
  if (kaizen.ownerUid === user.uid) return true;
  if (Array.isArray(kaizen.editorsUids) && kaizen.editorsUids.includes(user.uid)) return true;
  return false;
}

/**
 * Migra array de ações legado para formato v2
 */
export function migrateLegacyActions(legacyAcoes) {
  if (!Array.isArray(legacyAcoes)) return [];
  return legacyAcoes.map((a, idx) => {
    if (!a) return null;
    return {
      id: a.id || `act-${idx + 1}-${Date.now().toString(36)}`,
      ordem: Number(a.ordem) || idx + 1,
      descricao: a.descricao || a.desc || "",
      responsavel: a.responsavel || a.resp || "",
      prazo: a.prazo || "",
      status: a.status || "nao_iniciada",
      concluidaEm: a.concluidaEm || (a.status === "concluida" ? a.prazo || null : null)
    };
  }).filter(Boolean);
}

/**
 * Migra array de riscos legado para formato v2
 */
export function migrateLegacyRisks(legacyRiscos) {
  if (!Array.isArray(legacyRiscos)) return [];
  return legacyRiscos.map((r, idx) => {
    if (!r) return null;
    const sev = Math.min(4, Math.max(1, Number(r.severidade || r.sev) || 1));
    const prob = Math.min(4, Math.max(1, Number(r.probabilidade || r.prob) || 1));
    return {
      id: r.id || `rsk-${idx + 1}-${Date.now().toString(36)}`,
      descricao: r.descricao || r.desc || "",
      severidade: sev,
      probabilidade: prob,
      score: sev * prob,
      mitigacao: r.mitigacao || r.acao || "",
      responsavel: r.responsavel || r.resp || ""
    };
  }).filter(Boolean);
}

/**
 * Migra documento antigo (v1 web ou V6 Power Apps) para o schema Firestore v2
 */
export function migrateLegacyProject(legacy, user = {}) {
  if (!legacy) return null;

  const uid = user.uid || legacy.ownerUid || "";
  const email = user.email || legacy.ownerEmail || legacy.OwnerEmail || "";
  const nome = user.displayName || legacy.ownerNome || legacy.lider || (email ? email.split("@")[0] : "");

  // Participantes: split por ponto e vírgula se for string
  let participantes = [];
  if (Array.isArray(legacy.participantes)) {
    participantes = legacy.participantes;
  } else if (typeof legacy.participantes === "string" || typeof legacy.Participantes === "string") {
    const raw = legacy.participantes || legacy.Participantes;
    participantes = raw.split(";").map((p) => p.trim()).filter(Boolean);
  }

  // Pilares
  const pilares = {
    seguranca: Boolean(legacy.pilares?.seguranca ?? legacy.pilar_seguranca ?? legacy.PilarSeguranca),
    qualidade: Boolean(legacy.pilares?.qualidade ?? legacy.pilar_qualidade ?? legacy.PilarQualidade),
    entrega: Boolean(legacy.pilares?.entrega ?? legacy.pilar_entrega ?? legacy.PilarEntrega),
    lucratividade: Boolean(legacy.pilares?.lucratividade ?? legacy.pilar_lucratividade ?? legacy.PilarLucratividade),
    pessoas: Boolean(legacy.pilares?.pessoas ?? legacy.pilar_pessoas ?? legacy.PilarPessoas)
  };

  // 5W2H
  const w2h = {
    what: legacy.w2h?.what ?? legacy.w_what ?? legacy.WWhat ?? "",
    where: legacy.w2h?.where ?? legacy.w_where ?? legacy.WWhere ?? "",
    when: legacy.w2h?.when ?? legacy.w_when ?? legacy.WWhen ?? "",
    who: legacy.w2h?.who ?? legacy.w_who ?? legacy.WWho ?? "",
    why: legacy.w2h?.why ?? legacy.w_why ?? legacy.WWhy ?? "",
    how: legacy.w2h?.how ?? legacy.w_how ?? legacy.WHow ?? "",
    howMuch: legacy.w2h?.howMuch ?? legacy.w_howmuch ?? legacy.WHowMuch ?? ""
  };

  const beneficio = numeroMonetario(legacy.beneficio ?? legacy.Beneficio) ?? 0;
  const custo = numeroMonetario(legacy.custo ?? legacy.Custo) ?? 0;
  // v2.5.0 — previsto/realizado (o campo legado `beneficio` é preservado).
  const beneficioPrevisto = numeroMonetario(
    legacy.beneficioPrevisto ?? legacy.BeneficioPrevisto
  ) ?? beneficio;
  const beneficioRealizado = numeroMonetario(
    legacy.beneficioRealizado ?? legacy.BeneficioRealizado
  );
  // Valor manual antigo preservado uma única vez (auditoria/rollback).
  const pctLegado = legacy.percentualManualLegado ?? legacy.percentual ?? legacy.Percentual;

  const acoes = migrateLegacyActions(legacy.acoes || legacy.Acoes);
  const riscos = migrateLegacyRisks(legacy.riscos || legacy.Riscos);

  const tipoRaw = String(legacy.tipo || legacy.Tipo || "kaizen").toLowerCase();
  const tipo = tipoRaw.includes("performance") ? "performance" : "kaizen";

  const sharing = syncSharingLists(legacy.shares || []);

  const v2 = {
    schemaVersion: 2,
    rev: Number(legacy.rev) || 1,
    codigo: legacy.codigo || generateKaizenCode(),
    etapaAtual: Number(legacy.etapaAtual) || 0,
    projeto: legacy.projeto || legacy.Projeto || "Projeto Migrado",
    area: legacy.area || legacy.Area || "",
    data: legacy.data || legacy.Data || new Date().toISOString().split("T")[0],
    lider: legacy.lider || legacy.Lider || nome,
    participantes,
    areaNegocio: legacy.areaNegocio || legacy.AreaNegocio || "Operação",
    tipo,
    tipoBeneficio: legacy.tipoBeneficio || null,
    pilares,
    incomodo: legacy.incomodo || legacy.Incomodo || "",
    causas: legacy.causas || legacy.Causas || "",
    meta: legacy.meta || legacy.Meta || "",
    monitoramento: legacy.monitoramento || legacy.Monitoramento || "",
    w2h,
    acoes,
    padronizacao: legacy.padronizacao || legacy.Padronizacao || "",
    aprovacao: legacy.aprovacao || legacy.Aprovacao || "",
    aprovacaoStatus: legacy.aprovacaoStatus || "pendente",
    expansao: Boolean(legacy.expansao ?? legacy.Expansao),
    expansaoArea: legacy.expansaoArea || legacy.ExpansaoArea || "",
    beneficio,
    beneficioPrevisto,
    beneficioRealizado,
    custo,
    bcRatio: calculateBcRatio(beneficioPrevisto, custo),
    bcObs: legacy.bcObs || legacy.BCObs || "",
    riscos,
    links: Array.isArray(legacy.links) ? legacy.links : [],
    anexos: [],
    status: legacy.status || "em_andamento",
    percentual: 0, // recalculado logo abaixo a partir dos campos migrados
    percentualOrigem: "auto",
    percentualManualLegado: pctLegado === undefined || pctLegado === null || pctLegado === ""
      ? null
      : (Number(pctLegado) || 0),
    visibilidade: "privado",
    ownerUid: uid,
    ownerEmail: email,
    ownerNome: nome,
    viewersUids: sharing.viewersUids,
    editorsUids: sharing.editorsUids,
    sharedWithUids: sharing.sharedWithUids,
    shares: sharing.shares,
    arquivado: Boolean(legacy.arquivado),
    criadoEm: legacy.criadoEm || legacy.CriadoEm || null,
    criadoPor: legacy.criadoPor || uid,
    atualizadoEm: legacy.atualizadoEm || legacy.AtualizadoEm || null,
    atualizadoPor: legacy.atualizadoPor || uid
  };

  // Percentual automático: recalculado dos campos migrados (ignora valor legado manual)
  aplicarPercentualAutomatico(v2);
  if (!legacy.status && v2.percentual >= 100) v2.status = "concluido";

  v2.searchKeywords = generateSearchKeywords(v2);
  return v2;
}