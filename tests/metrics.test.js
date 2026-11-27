// ============================================================
// tests/metrics.test.js — Métricas do dashboard (previsto × realizado)
// Fixture SINTÉTICA que reproduz o snapshot de referência:
//   16 projetos · 90% · investimento 53.622,65
//   previsto 740.997,78 · realizado 184.939,78
//   HS 607.670,00 / 51.612,00 · CA 133.327,78 / 133.327,78
//   11 concluídos · 6 linhas por área
// O fixture é de TESTE; o dashboard real usa o Firestore.
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  agregarDashboard,
  beneficioPrevistoDe,
  beneficioRealizadoDe,
  numeroFinito
} from "../js/dashboard-metrics.js";

function k(over) {
  return {
    projeto: "Projeto",
    areaNegocio: "Operação",
    percentual: 0,
    tipoBeneficio: null,
    beneficioPrevisto: 0,
    beneficioRealizado: null,
    custo: 0,
    ...over
  };
}

function fixtureReferencia() {
  return [
    // Operação — 5 projetos, 4 concluídos, previsto 200.250, nenhum realizado informado
    k({ projeto: "OP-1", areaNegocio: "Operação", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 40050, beneficio: 40050, beneficioRealizado: null, custo: 4000 }),
    k({ projeto: "OP-2", areaNegocio: "Operação", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 40050, beneficio: 40050, beneficioRealizado: "", custo: 4000 }),
    k({ projeto: "OP-3", areaNegocio: "Operação", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 40050, beneficio: 40050, beneficioRealizado: "TBD", custo: 4000 }),
    k({ projeto: "OP-4", areaNegocio: "Operação", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 40050, beneficio: 40050, beneficioRealizado: null, custo: 4000 }),
    k({ projeto: "OP-5", areaNegocio: "Operação", percentual: 8, tipoBeneficio: "hard_saving", beneficioPrevisto: 40050, beneficio: 40050, beneficioRealizado: undefined, custo: 4000 }),

    // DAF — 4 projetos, 2 concluídos, previsto 407.420, realizado 51.612
    k({ projeto: "DAF-1", areaNegocio: "DAF", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 100000, beneficio: 100000, beneficioRealizado: 51612, custo: 6250 }),
    k({ projeto: "DAF-2", areaNegocio: "DAF", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 100000, beneficio: 100000, beneficioRealizado: null, custo: 6250 }),
    k({ projeto: "DAF-3", areaNegocio: "DAF", percentual: 86, tipoBeneficio: "hard_saving", beneficioPrevisto: 100000, beneficio: 100000, beneficioRealizado: null, custo: 6250 }),
    k({ projeto: "DAF-4", areaNegocio: "DAF", percentual: 86, tipoBeneficio: "hard_saving", beneficioPrevisto: 107420, beneficio: 107420, beneficioRealizado: null, custo: 6250 }),

    // EO — 1 projeto concluído, sem valores
    k({ projeto: "EO-1", areaNegocio: "EO", percentual: 100, tipoBeneficio: "hard_saving", beneficioPrevisto: 0, beneficio: 0, beneficioRealizado: 0, custo: 0 }),

    // H&S — 2 projetos concluídos, cost avoidance 18.127,78 previsto = realizado
    k({ projeto: "HS-1", areaNegocio: "H&S", percentual: 100, tipoBeneficio: "cost_avoidance", beneficioPrevisto: 9063.89, beneficio: 9063.89, beneficioRealizado: 9063.89, custo: 1750 }),
    k({ projeto: "HS-2", areaNegocio: "H&S", percentual: 100, tipoBeneficio: "cost_avoidance", beneficioPrevisto: 9063.89, beneficio: 9063.89, beneficioRealizado: 9063.89, custo: 1750 }),

    // J&E — 3 projetos, 1 concluído, cost avoidance 115.200 previsto = realizado
    k({ projeto: "JE-1", areaNegocio: "J&E", percentual: 100, tipoBeneficio: "cost_avoidance", beneficioPrevisto: 38400, beneficio: 38400, beneficioRealizado: 38400, custo: 1707.55 }),
    k({ projeto: "JE-2", areaNegocio: "J&E", percentual: 80, tipoBeneficio: "cost_avoidance", beneficioPrevisto: 38400, beneficio: 38400, beneficioRealizado: 38400, custo: 1707.55 }),
    k({ projeto: "JE-3", areaNegocio: "J&E", percentual: 80, tipoBeneficio: "cost_avoidance", beneficioPrevisto: 38400, beneficio: 38400, beneficioRealizado: 38400, custo: 1707.55 }),

    // P&C — 1 projeto concluído, sem valores e sem tipo de benefício
    k({ projeto: "PC-1", areaNegocio: "P&C", percentual: 100, tipoBeneficio: null, beneficioPrevisto: 0, beneficio: 0, beneficioRealizado: 0, custo: 0 })
  ];
}

test("agregarDashboard() reproduz o snapshot de referência (16/90%/11 concluídos)", () => {
  const r = agregarDashboard(fixtureReferencia());

  assert.equal(r.total, 16);
  assert.equal(r.conclusaoMedia, 90);
  assert.equal(r.concluidos, 11);

  assert.equal(r.investimento, 53622.65);
  assert.equal(r.beneficioPrevisto, 740997.78);
  assert.equal(r.beneficioRealizado, 184939.78);

  assert.deepEqual(r.hardSaving, { previsto: 607670, realizado: 51612 });
  assert.deepEqual(r.costAvoidance, { previsto: 133327.78, realizado: 133327.78 });
});

test("agregarDashboard() reproduz as 6 linhas por área", () => {
  const r = agregarDashboard(fixtureReferencia());
  assert.equal(r.areas.length, 6);

  const porArea = new Map(r.areas.map((a) => [a.area, a]));

  const op = porArea.get("Operação");
  assert.deepEqual(
    { n: op.n, conc: op.conc, previsto: op.beneficioPrevisto, realizado: op.beneficioRealizado, inv: op.inv },
    { n: 5, conc: 81.6, previsto: 200250, realizado: 0, inv: 20000 }
  );
  assert.equal(Math.round(op.conc), 82, "dashboard exibe 82%");
  assert.deepEqual({ hsPrev: op.hsPrev, hsReal: op.hsReal, caPrev: op.caPrev, caReal: op.caReal }, { hsPrev: 200250, hsReal: 0, caPrev: 0, caReal: 0 });

  const daf = porArea.get("DAF");
  assert.deepEqual(
    { n: daf.n, conc: daf.conc, previsto: daf.beneficioPrevisto, realizado: daf.beneficioRealizado, inv: daf.inv },
    { n: 4, conc: 93, previsto: 407420, realizado: 51612, inv: 25000 }
  );
  assert.equal(Math.round(daf.conc), 93);

  const eo = porArea.get("EO");
  assert.deepEqual(
    { n: eo.n, conc: eo.conc, previsto: eo.beneficioPrevisto, realizado: eo.beneficioRealizado, inv: eo.inv },
    { n: 1, conc: 100, previsto: 0, realizado: 0, inv: 0 }
  );

  const hs = porArea.get("H&S");
  assert.deepEqual(
    { n: hs.n, conc: hs.conc, previsto: hs.beneficioPrevisto, realizado: hs.beneficioRealizado, inv: hs.inv },
    { n: 2, conc: 100, previsto: 18127.78, realizado: 18127.78, inv: 3500 }
  );
  assert.deepEqual({ caPrev: hs.caPrev, caReal: hs.caReal }, { caPrev: 18127.78, caReal: 18127.78 });

  const je = porArea.get("J&E");
  assert.deepEqual(
    { n: je.n, conc: je.conc, previsto: je.beneficioPrevisto, realizado: je.beneficioRealizado, inv: je.inv },
    { n: 3, conc: 86.67, previsto: 115200, realizado: 115200, inv: 5122.65 }
  );
  assert.equal(Math.round(je.conc), 87, "dashboard exibe 87%");

  const pc = porArea.get("P&C");
  assert.deepEqual(
    { n: pc.n, conc: pc.conc, previsto: pc.beneficioPrevisto, realizado: pc.beneficioRealizado, inv: pc.inv },
    { n: 1, conc: 100, previsto: 0, realizado: 0, inv: 0 }
  );

  // Ordenação: previsto desc, empate por nome
  assert.deepEqual(r.areas.map((a) => a.area), ["DAF", "Operação", "J&E", "H&S", "EO", "P&C"]);
});

test("realizado: vazio/null/TBD ficam fora; zero informado conta", () => {
  const lista = [
    k({ beneficioPrevisto: 1000, beneficioRealizado: null }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: undefined }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: "" }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: "   " }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: "TBD" }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: "a definir" }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: 0 }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: "0" }),
    k({ beneficioPrevisto: 1000, beneficioRealizado: 250.5 })
  ];

  const r = agregarDashboard(lista);
  assert.equal(r.beneficioRealizado, 250.5, "só 0 + '0' + 250,5 entram");
  assert.equal(r.beneficioPrevisto, 9000);

  const todosVazios = agregarDashboard([
    k({ beneficioPrevisto: 500, beneficioRealizado: null }),
    k({ beneficioPrevisto: 500, beneficioRealizado: "" }),
    k({ beneficioPrevisto: 500, beneficioRealizado: "TBD" })
  ]);
  assert.equal(todosVazios.beneficioRealizado, 0, "nenhum informado => soma 0");
});

test("previsto usa fallback do legado; 0 explícito não cai no fallback", () => {
  const r = agregarDashboard([
    k({ beneficio: 1500, beneficioPrevisto: undefined }),
    k({ beneficio: 1500, beneficioPrevisto: null }),
    k({ beneficio: 9999, beneficioPrevisto: 0 }),
    k({ beneficio: 2500, beneficioPrevisto: 2500 })
  ]);
  assert.equal(r.beneficioPrevisto, 5500, "1500 + 1500 + 0 + 2500");
});

test("kaizen sem tipoBeneficio entra só no total (não infla HS nem CA)", () => {
  const r = agregarDashboard([
    k({ tipoBeneficio: "hard_saving", beneficioPrevisto: 100 }),
    k({ tipoBeneficio: "cost_avoidance", beneficioPrevisto: 200 }),
    k({ tipoBeneficio: null, beneficioPrevisto: 300 }),
    k({ tipoBeneficio: "outro", beneficioPrevisto: 400 })
  ]);
  assert.equal(r.beneficioPrevisto, 1000);
  assert.equal(r.hardSaving.previsto, 100);
  assert.equal(r.costAvoidance.previsto, 200);
});

test("lista vazia / inválida devolve estrutura zerada", () => {
  for (const entrada of [[], null, undefined]) {
    const r = agregarDashboard(entrada);
    assert.equal(r.total, 0);
    assert.equal(r.conclusaoMedia, 0);
    assert.equal(r.investimento, 0);
    assert.equal(r.beneficioPrevisto, 0);
    assert.equal(r.beneficioRealizado, 0);
    assert.deepEqual(r.hardSaving, { previsto: 0, realizado: 0 });
    assert.deepEqual(r.costAvoidance, { previsto: 0, realizado: 0 });
    assert.equal(r.concluidos, 0);
    assert.deepEqual(r.areas, []);
  }
});

test("helpers normalizam número, string BR e texto não numérico", () => {
  assert.equal(numeroFinito(0), 0);
  assert.equal(numeroFinito("0"), 0);
  assert.equal(numeroFinito("1.234,56"), 1234.56);
  assert.equal(numeroFinito("R$ 1.234,56"), 1234.56);
  assert.equal(numeroFinito("TBD"), null);
  assert.equal(numeroFinito(""), null);
  assert.equal(numeroFinito(null), null);
  assert.equal(numeroFinito(Number.NaN), null);

  assert.equal(beneficioPrevistoDe({ beneficio: 10 }), 10);
  assert.equal(beneficioPrevistoDe({ beneficioPrevisto: 0, beneficio: 10 }), 0);
  assert.equal(beneficioRealizadoDe({ beneficioRealizado: 0 }), 0);
  assert.equal(beneficioRealizadoDe({ beneficioRealizado: "TBD" }), null);
});
