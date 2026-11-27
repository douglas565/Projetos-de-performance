// ============================================================
// js/dashboard-metrics.js — Métricas puras do dashboard executivo
// Módulo SEM DOM, SEM Firebase e SEM efeitos colaterais.
// Usável no navegador (ESM) e no Node (node --test).
//
// Regras de soma (Business Case):
//   • Previsto .......... beneficioPrevisto ?? beneficio (legado) ?? 0
//   • Realizado ......... SOMENTE quando informado de fato:
//                         número finito (o 0 CONTA como informado).
//                         null / undefined / "" / "TBD" / texto ficam FORA.
//   • Hard Saving / Cost Avoidance pelo tipoBeneficio vigente.
//     Kaizen sem tipo entra apenas no total.
//   • concluidos ......... kaizens com percentual === 100
//   • conclusaoMedia ..... média dos percentuais
// ============================================================

export const TIPO_HARD_SAVING = "hard_saving";
export const TIPO_COST_AVOIDANCE = "cost_avoidance";

/**
 * Converte um valor monetário em número finito, ou null quando não é um
 * número de verdade. Aceita number e string (inclusive "R$ 1.234,56").
 */
export function numeroFinito(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const s = valor.trim();
    if (!s) return null;
    const direto = Number(s);
    if (Number.isFinite(direto)) return direto;
    const bruto = s.replace(/R\$/g, "").replace(/\s/g, "");
    const br = bruto.replace(/\./g, "").replace(",", ".");
    const n = Number(br);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Benefício PREVISTO do kaizen: campo novo com fallback para o legado
 * `beneficio`. Valor explicitamente 0 NÃO cai no fallback.
 */
export function beneficioPrevistoDe(kaizen) {
  const k = kaizen || {};
  const previsto = numeroFinito(k.beneficioPrevisto);
  if (previsto !== null) return previsto;
  const legado = numeroFinito(k.beneficio);
  return legado !== null ? legado : 0;
}

/**
 * Benefício REALIZADO do kaizen: número finito quando informado (0 conta),
 * null quando vazio / "TBD" / não numérico.
 */
export function beneficioRealizadoDe(kaizen) {
  const k = kaizen || {};
  return numeroFinito(k.beneficioRealizado);
}

function arredondar2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function novoGrupo(area) {
  return {
    area,
    n: 0,
    somaPct: 0,
    beneficioPrevisto: 0,
    beneficioRealizado: 0,
    hsPrev: 0,
    hsReal: 0,
    caPrev: 0,
    caReal: 0,
    inv: 0
  };
}

/**
 * Agrega a lista de kaizens para o dashboard.
 * @param {Array<object>} kaizens
 * @returns {{
 *   total: number,
 *   conclusaoMedia: number,
 *   investimento: number,
 *   beneficioPrevisto: number,
 *   beneficioRealizado: number,
 *   hardSaving: {previsto: number, realizado: number},
 *   costAvoidance: {previsto: number, realizado: number},
 *   concluidos: number,
 *   areas: Array<object>
 * }}
 */
export function agregarDashboard(kaizens) {
  const lista = Array.isArray(kaizens) ? kaizens.filter(Boolean) : [];
  const grupos = new Map();

  let somaPct = 0;
  let investimento = 0;
  let beneficioPrevisto = 0;
  let beneficioRealizado = 0;
  let concluidos = 0;
  const hardSaving = { previsto: 0, realizado: 0 };
  const costAvoidance = { previsto: 0, realizado: 0 };

  for (const k of lista) {
    const area = k.areaNegocio || "Não informada";
    if (!grupos.has(area)) grupos.set(area, novoGrupo(area));
    const g = grupos.get(area);

    const previsto = beneficioPrevistoDe(k);
    const realizado = beneficioRealizadoDe(k);
    const inv = numeroFinito(k.custo) ?? 0;
    const pct = numeroFinito(k.percentual) ?? 0;

    somaPct += pct;
    investimento += inv;
    beneficioPrevisto += previsto;
    g.n += 1;
    g.somaPct += pct;
    g.inv += inv;
    g.beneficioPrevisto += previsto;

    if (pct === 100) concluidos += 1;

    // Realizado só entra quando informado (0 informado conta).
    if (realizado !== null) {
      beneficioRealizado += realizado;
      g.beneficioRealizado += realizado;
    }

    if (k.tipoBeneficio === TIPO_HARD_SAVING) {
      hardSaving.previsto += previsto;
      g.hsPrev += previsto;
      if (realizado !== null) {
        hardSaving.realizado += realizado;
        g.hsReal += realizado;
      }
    } else if (k.tipoBeneficio === TIPO_COST_AVOIDANCE) {
      costAvoidance.previsto += previsto;
      g.caPrev += previsto;
      if (realizado !== null) {
        costAvoidance.realizado += realizado;
        g.caReal += realizado;
      }
    }
  }

  const areas = Array.from(grupos.values())
    .map((g) => ({
      area: g.area,
      n: g.n,
      conc: g.n ? arredondar2(g.somaPct / g.n) : 0,
      beneficioPrevisto: arredondar2(g.beneficioPrevisto),
      beneficioRealizado: arredondar2(g.beneficioRealizado),
      hsPrev: arredondar2(g.hsPrev),
      hsReal: arredondar2(g.hsReal),
      caPrev: arredondar2(g.caPrev),
      caReal: arredondar2(g.caReal),
      inv: arredondar2(g.inv),
      // Alias mantido para os gráficos G2/G3 existentes.
      ben: arredondar2(g.beneficioPrevisto)
    }))
    .sort((a, b) => (b.beneficioPrevisto - a.beneficioPrevisto) || a.area.localeCompare(b.area, "pt-BR"));

  return {
    total: lista.length,
    conclusaoMedia: lista.length ? arredondar2(somaPct / lista.length) : 0,
    investimento: arredondar2(investimento),
    beneficioPrevisto: arredondar2(beneficioPrevisto),
    beneficioRealizado: arredondar2(beneficioRealizado),
    hardSaving: {
      previsto: arredondar2(hardSaving.previsto),
      realizado: arredondar2(hardSaving.realizado)
    },
    costAvoidance: {
      previsto: arredondar2(costAvoidance.previsto),
      realizado: arredondar2(costAvoidance.realizado)
    },
    concluidos,
    areas
  };
}
