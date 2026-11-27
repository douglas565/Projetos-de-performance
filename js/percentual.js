// ============================================================
// js/percentual.js — Percentual de conclusão automático do Kaizen
// Módulo puro (sem DOM, sem Firebase), usável no navegador e no Node.
//
// FÓRMULA CONGELADA — denominador fixo = 17 pontos:
//   1) incomodo ......... 1,0  texto preenchido
//   2) causas ........... 1,0  texto preenchido
//   3) meta ............. 1,0  texto preenchido
//   4) padronizacao ..... 1,0  texto preenchido
//   5) monitoramento .... 0,5  texto preenchido
//   6) business case .... 0,5  SOMENTE se os 4 campos do step 8 estiverem completos:
//                              beneficioPrevisto > 0 (fallback para beneficio legado),
//                              custo numérico finito >= 0, tipoBeneficio e bcObs
//                              preenchidos (bcRatio é derivado e não pontua;
//                              beneficioRealizado não entra na regra)
//   7) plano de ação .... até 5,0  ->  5 * (ações CONCLUÍDAS) / (total de ações)
//                                      status === "concluida"; 0 ações = 0; teto 5
//   8) 5W2H ............. até 7,0  ->  1 ponto por campo preenchido (7 campos)
//
//   pontos = soma exata das etapas (NENHUM arredondamento intermediário)
//   percentual = clamp(round(100 * pontos / 17), 0, 100)  -> inteiro 0..100
//
// preenchido(v): string -> trim não vazio; número -> finito (o 0 CONTA como
// preenchido); array -> length > 0; null/undefined -> false.
// ============================================================

export const PONTOS_TOTAL = 17;

export const CAMPOS_W2H = ["what", "where", "when", "who", "why", "how", "howMuch"];

/**
 * Regra única de "campo preenchido" usada por toda a fórmula.
 */
export function preenchido(valor) {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim().length > 0;
  if (typeof valor === "number") return Number.isFinite(valor);
  if (Array.isArray(valor)) return valor.length > 0;
  return false;
}

function textoPreenchido(valor) {
  return typeof valor === "string" && valor.trim().length > 0;
}

/**
 * Converte um campo monetário em número, distinguindo "vazio" de "zero".
 * Retorna null quando o campo está ausente/vazio/não numérico.
 */
function numeroPreenchido(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && valor.trim() !== "") {
    const n = Number(valor.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Business Case (step 8): 0,5 ponto apenas com os 4 campos completos.
 * v2.5.0 — a regra usa o benefício PREVISTO (fallback para o `beneficio`
 * legado quando o campo novo está ausente). O benefício REALIZADO não entra
 * na regra: é informativo e pode ficar vazio.
 */
export function avaliarBusinessCase(kaizen) {
  const k = kaizen || {};
  const temPrevisto = k.beneficioPrevisto !== undefined && k.beneficioPrevisto !== null;
  const beneficio = temPrevisto ? numeroPreenchido(k.beneficioPrevisto) : numeroPreenchido(k.beneficio);
  const custo = numeroPreenchido(k.custo);
  const completo =
    beneficio !== null &&
    beneficio > 0 &&
    custo !== null &&
    custo >= 0 &&
    textoPreenchido(k.tipoBeneficio) &&
    textoPreenchido(k.bcObs);

  return {
    completo,
    pontos: completo ? 0.5 : 0,
    beneficio,
    custo
  };
}

/**
 * Plano de ação: pool de 5 pontos proporcional às ações CONCLUÍDAS.
 * Uma ação só pontua quando `status === "concluida"` (o texto sozinho não pontua).
 */
export function calcularPontosPlanoAcao(acoes) {
  const lista = Array.isArray(acoes) ? acoes : [];
  const total = lista.length;
  if (total === 0) return { pontos: 0, total: 0, concluidas: 0 };

  const concluidas = lista.filter((a) => a && typeof a === "object" && a.status === "concluida").length;
  const pontos = Math.min(5, (5 * concluidas) / total);
  return { pontos, total, concluidas };
}

/**
 * Ferramenta 5W2H: 1 ponto por campo preenchido (teto 7).
 */
export function calcularPontosW2H(w2h) {
  const w = w2h || {};
  const preenchidos = CAMPOS_W2H.filter((campo) => textoPreenchido(w[campo]));
  return { pontos: Math.min(7, preenchidos.length), preenchidos: preenchidos.length, campos: preenchidos };
}

/**
 * Detalhamento por etapa (debug e testes). Não usar arredondamento por etapa.
 */
export function calcularPercentualDetalhado(kaizen) {
  const k = kaizen || {};

  const etapas = {
    incomodo: textoPreenchido(k.incomodo) ? 1 : 0,
    causas: textoPreenchido(k.causas) ? 1 : 0,
    meta: textoPreenchido(k.meta) ? 1 : 0,
    padronizacao: textoPreenchido(k.padronizacao) ? 1 : 0,
    monitoramento: textoPreenchido(k.monitoramento) ? 0.5 : 0,
    businessCase: avaliarBusinessCase(k).pontos,
    planoAcao: calcularPontosPlanoAcao(k.acoes).pontos,
    w2h: calcularPontosW2H(k.w2h).pontos
  };

  const pontos = Object.values(etapas).reduce((acc, v) => acc + v, 0);
  const percentual = Math.max(0, Math.min(100, Math.round((100 * pontos) / PONTOS_TOTAL)));

  return { pontos, total: PONTOS_TOTAL, percentual, etapas };
}

/**
 * Percentual inteiro 0..100 de conclusão do Kaizen.
 */
export function calcularPercentual(kaizen) {
  return calcularPercentualDetalhado(kaizen).percentual;
}

/**
 * Aplica o percentual automático no próprio objeto (mutação controlada).
 * Ponto único usado pelo modelo, pelo pipeline de gravação e pela UI.
 * Retorna o percentual calculado.
 */
export function aplicarPercentualAutomatico(kaizen) {
  if (!kaizen || typeof kaizen !== "object") return 0;
  const percentual = calcularPercentual(kaizen);
  kaizen.percentual = percentual;
  kaizen.percentualOrigem = "auto";
  return percentual;
}
