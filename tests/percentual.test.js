// ============================================================
// tests/percentual.test.js — Testes da fórmula automática de percentual
// Executável sem dependências externas: node --test tests/percentual.test.js
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  PONTOS_TOTAL,
  preenchido,
  calcularPercentual,
  calcularPercentualDetalhado,
  aplicarPercentualAutomatico,
  avaliarBusinessCase,
  calcularPontosPlanoAcao,
  calcularPontosW2H
} from "../js/percentual.js";

function kaizenCompleto() {
  return {
    incomodo: "Perda de matéria-prima acima de 5% na linha 3",
    causas: "Umidade irregular da biomassa e esteira desalinhada",
    meta: "Reduzir perdas em 5% até julho/2026",
    padronizacao: "POP-UTI-042 revisado e treinado",
    monitoramento: "Painel diário de consumo por turno",
    beneficio: 60000,
    custo: 15000,
    tipoBeneficio: "hard_saving",
    bcObs: "Economia de combustível comprovada em 3 meses",
    acoes: [
      { acao: "Mapear umidade por lote", responsavel: "Marcos", status: "concluida" },
      { acao: "Automatizar a esteira", responsavel: "Rita", status: "concluida" }
    ],
    w2h: {
      what: "Ajustar alimentação de biomassa",
      where: "Caldeira 1",
      when: "Mai-Jul 2026",
      who: "Carlos Silva",
      why: "Economia de combustível",
      how: "Automação da esteira",
      howMuch: "R$ 15.000"
    }
  };
}

// ------------------------------------------------------------
// preenchido()
// ------------------------------------------------------------
test("preenchido() trata texto, número 0, array e nulos", () => {
  assert.equal(preenchido("texto"), true);
  assert.equal(preenchido("   "), false);
  assert.equal(preenchido(""), false);
  assert.equal(preenchido(0), true, "o número 0 conta como preenchido");
  assert.equal(preenchido(12.5), true);
  assert.equal(preenchido(Number.NaN), false);
  assert.equal(preenchido(Number.POSITIVE_INFINITY), false);
  assert.equal(preenchido([]), false);
  assert.equal(preenchido(["a"]), true);
  assert.equal(preenchido(null), false);
  assert.equal(preenchido(undefined), false);
});

// ------------------------------------------------------------
// Casos-base da especificação
// ------------------------------------------------------------
test("kaizen vazio (ou ausente) resulta em 0%", () => {
  assert.equal(calcularPercentual({}), 0);
  assert.equal(calcularPercentual(null), 0);
  assert.equal(calcularPercentual(undefined), 0);
});

test("só incômodo + causas + meta + padronização => 4/17 => 24%", () => {
  const k = {
    incomodo: "Perda",
    causas: "Causa raiz",
    meta: "Meta SMART",
    padronizacao: "POP"
  };
  const d = calcularPercentualDetalhado(k);
  assert.equal(d.pontos, 4);
  assert.equal(d.total, 17);
  assert.equal(d.percentual, 24, "Math.round(100 * 4 / 17) = 24");
  assert.equal(calcularPercentual(k), 24);
});

test("monitoramento vazio (0) vs preenchido (0,5 ponto)", () => {
  const base = { incomodo: "a", causas: "b", meta: "c", padronizacao: "d" };
  assert.equal(calcularPercentualDetalhado(base).pontos, 4);
  assert.equal(calcularPercentual(base), 24);

  const comMonitoramento = { ...base, monitoramento: "Painel diário" };
  const d = calcularPercentualDetalhado(comMonitoramento);
  assert.equal(d.etapas.monitoramento, 0.5);
  assert.equal(d.pontos, 4.5);
  assert.equal(d.percentual, 26, "Math.round(100 * 4,5 / 17) = 26");

  // Texto só com espaços não conta
  assert.equal(calcularPercentualDetalhado({ ...base, monitoramento: "   " }).pontos, 4);
});

test("business case: 3 de 4 campos => 0; 4 de 4 => 0,5", () => {
  const bc = (over) => ({
    beneficio: 10000,
    custo: 2000,
    tipoBeneficio: "hard_saving",
    bcObs: "Observação do business case",
    ...over
  });

  assert.equal(avaliarBusinessCase(bc({})).completo, true);
  assert.equal(avaliarBusinessCase(bc({})).pontos, 0.5);

  // Sem custo (campo ausente)
  assert.equal(avaliarBusinessCase(bc({ custo: undefined })).completo, false);
  assert.equal(avaliarBusinessCase(bc({ custo: undefined })).pontos, 0);
  // Sem tipo de benefício
  assert.equal(avaliarBusinessCase(bc({ tipoBeneficio: "" })).completo, false);
  assert.equal(avaliarBusinessCase(bc({ tipoBeneficio: "" })).pontos, 0);
  // Sem observação
  assert.equal(avaliarBusinessCase(bc({ bcObs: "  " })).completo, false);
  assert.equal(avaliarBusinessCase(bc({ bcObs: "  " })).pontos, 0);
  // Sem benefício
  assert.equal(avaliarBusinessCase(bc({ beneficio: undefined })).completo, false);

  // Custo 0 conta como preenchido
  assert.equal(avaliarBusinessCase(bc({ custo: 0 })).completo, true);
  assert.equal(avaliarBusinessCase(bc({ custo: 0 })).pontos, 0.5);
});

test("business case: benefício 0 não completa o BC", () => {
  const k = {
    beneficio: 0,
    custo: 0,
    tipoBeneficio: "hard_saving",
    bcObs: "Sem ganho financeiro ainda"
  };
  const bc = avaliarBusinessCase(k);
  assert.equal(bc.completo, false);
  assert.equal(bc.pontos, 0);
  assert.equal(calcularPercentualDetalhado(k).etapas.businessCase, 0);
});

test("plano de ação: 0 ações => 0; 2 ações com 1 descrita => 2,5; 2 descritas => 5", () => {
  assert.deepEqual(calcularPontosPlanoAcao([]), { pontos: 0, total: 0, comTexto: 0 });
  assert.equal(calcularPontosPlanoAcao(undefined).pontos, 0);

  const umaDeDuas = calcularPontosPlanoAcao([
    { acao: "Mapear umidade" },
    { acao: "" }
  ]);
  assert.equal(umaDeDuas.pontos, 2.5);
  assert.equal(umaDeDuas.comTexto, 1);
  assert.equal(umaDeDuas.total, 2);

  const duasDeDuas = calcularPontosPlanoAcao([
    { acao: "Mapear umidade" },
    { acao: "Automatizar esteira" }
  ]);
  assert.equal(duasDeDuas.pontos, 5, "teto de 5 pontos");

  // Compatibilidade com o schema v2 (descricao)
  assert.equal(calcularPontosPlanoAcao([{ descricao: "Ação v2" }, { acao: "" }]).pontos, 2.5);
  // Ação nula / vazia não conta e divide o pool
  assert.equal(calcularPontosPlanoAcao([null, { acao: "ok" }]).pontos, 2.5);
  // Pool nunca passa de 5
  assert.equal(calcularPontosPlanoAcao([{ acao: "a" }, { acao: "b" }, { acao: "c" }]).pontos, 5);
});

test("5W2H: 3 de 7 campos => 3 pontos", () => {
  const w = calcularPontosW2H({ what: "O quê", how: "Como", who: "Quem" });
  assert.equal(w.preenchidos, 3);
  assert.equal(w.pontos, 3);
  assert.deepEqual(w.campos, ["what", "who", "how"]);

  assert.equal(calcularPontosW2H({}).pontos, 0);
  assert.equal(calcularPontosW2H(undefined).pontos, 0);
  assert.equal(calcularPontosW2H({ what: "   " }).pontos, 0);

  const completo = calcularPontosW2H({
    what: "a", where: "b", when: "c", who: "d", why: "e", how: "f", howMuch: "g"
  });
  assert.equal(completo.pontos, 7, "teto de 7 pontos");
});

test("tudo preenchido => 17 pontos => 100%", () => {
  const k = kaizenCompleto();
  const d = calcularPercentualDetalhado(k);
  assert.equal(d.pontos, PONTOS_TOTAL);
  assert.equal(d.pontos, 17);
  assert.equal(d.total, 17);
  assert.equal(d.percentual, 100);
  assert.equal(calcularPercentual(k), 100);

  // Soma máxima por etapa = 17
  const somaEtapas = Object.values(d.etapas).reduce((a, b) => a + b, 0);
  assert.equal(somaEtapas, 17);
});

test("percentual é sempre inteiro entre 0 e 100 (clamp)", () => {
  const valores = [
    {},
    { incomodo: "x" },
    { monitoramento: "x" },
    { w2h: { what: "a", where: "b", when: "c" } },
    kaizenCompleto()
  ];
  for (const k of valores) {
    const p = calcularPercentual(k);
    assert.equal(Number.isInteger(p), true, `percentual inteiro para ${JSON.stringify(k)}`);
    assert.ok(p >= 0 && p <= 100);
  }
});

test("calcularPercentualDetalhado() expõe etapas e total=17 (debug)", () => {
  const d = calcularPercentualDetalhado(kaizenCompleto());
  assert.deepEqual(Object.keys(d).sort(), ["etapas", "percentual", "pontos", "total"]);
  assert.deepEqual(Object.keys(d.etapas).sort(), [
    "businessCase", "causas", "incomodo", "meta", "monitoramento", "padronizacao", "planoAcao", "w2h"
  ]);
  assert.equal(d.etapas.incomodo, 1);
  assert.equal(d.etapas.monitoramento, 0.5);
  assert.equal(d.etapas.businessCase, 0.5);
  assert.equal(d.etapas.planoAcao, 5);
  assert.equal(d.etapas.w2h, 7);
});

test("aplicarPercentualAutomatico() sobrescreve valor manual e marca origem auto", () => {
  const k = {
    incomodo: "a",
    causas: "b",
    meta: "c",
    padronizacao: "d",
    percentual: 99,
    percentualOrigem: "manual"
  };
  const pct = aplicarPercentualAutomatico(k);
  assert.equal(pct, 24);
  assert.equal(k.percentual, 24, "valor manual é descartado");
  assert.equal(k.percentualOrigem, "auto");
  assert.equal(aplicarPercentualAutomatico(null), 0);
});
