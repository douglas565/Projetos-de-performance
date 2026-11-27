// ============================================================
// tests/kaizen-model.test.js — Testes unitários com node --test
// Executável sem dependências externas: node --test tests/kaizen-model.test.js
// ============================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKaizenCode,
  normalizeString,
  extractTokens,
  calculateBcRatio,
  calculatePercentualFromActions,
  calculateRiskScore,
  generateSearchKeywords,
  syncSharingLists,
  normalizeKaizenSharing,
  needsShareBackfill,
  reconcileKaizenShares,
  getDirectoryShareStatus,
  prepareKaizenSharingSave,
  isBareEmail,
  directoryLookupMessage,
  createDefaultKaizen,
  validateKaizen,
  validateWizardStep,
  canUserRead,
  canUserEdit,
  migrateLegacyActions,
  migrateLegacyRisks,
  migrateLegacyProject
} from "../js/kaizen-model.js";

test("generateKaizenCode() gera código no formato KZ-YYYYMMDD-XXXX", () => {
  const code = generateKaizenCode(new Date("2026-11-17T12:00:00Z"));
  assert.match(code, /^KZ-20261117-[A-Z0-9]{4}$/);
});

test("normalizeString() remove acentos e converte para minúsculo", () => {
  assert.equal(normalizeString("Ação & Oportunidade Ímpar!"), "acao & oportunidade impar!");
  assert.equal(normalizeString("São Paulo - OPERAÇÃO"), "sao paulo - operacao");
});

test("extractTokens() extrai apenas palavras únicas com >= 3 caracteres", () => {
  const tokens = extractTokens("O Kaizen na Linha 3 de montagem e teste");
  assert.ok(tokens.includes("kaizen"));
  assert.ok(tokens.includes("linha"));
  assert.ok(tokens.includes("montagem"));
  assert.ok(tokens.includes("teste"));
  assert.ok(!tokens.includes("de")); // < 3 chars
  assert.ok(!tokens.includes("na")); // < 3 chars
});

test("calculateBcRatio() calcula proporção benefício / custo", () => {
  assert.equal(calculateBcRatio(48000, 12000), 4.0);
  assert.equal(calculateBcRatio(10000, 3000), 3.33);
  assert.equal(calculateBcRatio(5000, 0), null);
  assert.equal(calculateBcRatio(0, 1000), 0);
});

test("calculatePercentualFromActions() calcula percentual baseado em ações concluídas", () => {
  assert.equal(calculatePercentualFromActions([]), 0);
  const acoes = [
    { id: "1", status: "concluida" },
    { id: "2", status: "em_andamento" },
    { id: "3", status: "concluida" },
    { id: "4", status: "nao_iniciada" }
  ];
  assert.equal(calculatePercentualFromActions(acoes), 50);

  const todasConcluidas = [
    { id: "1", status: "concluida" },
    { id: "2", status: "concluida" }
  ];
  assert.equal(calculatePercentualFromActions(todasConcluidas), 100);
});

test("calculateRiskScore() calcula score 1..16 e níveis baixo, médio e alto", () => {
  const rBaixo = calculateRiskScore(2, 2);
  assert.equal(rBaixo.score, 4);
  assert.equal(rBaixo.nivel, "baixo");

  const rMedio = calculateRiskScore(3, 2);
  assert.equal(rMedio.score, 6);
  assert.equal(rMedio.nivel, "medio");

  const rAlto = calculateRiskScore(4, 3);
  assert.equal(rAlto.score, 12);
  assert.equal(rAlto.nivel, "alto");
});

test("syncSharingLists() rejeita UIDs sintéticos ext-* e entradas inválidas", () => {
  const res = syncSharingLists([
    { uid: "ext-1732628192345", email: "legacy@example.com", role: "view" },
    { uid: "u-real", email: "real@example.com", role: "edit" },
    { uid: "", email: "empty@example.com", role: "view" },
    null
  ]);

  assert.deepEqual(res.shares.map((share) => share.uid), ["u-real"]);
  assert.deepEqual(res.viewersUids, []);
  assert.deepEqual(res.editorsUids, ["u-real"]);
  assert.deepEqual(res.sharedWithUids, ["u-real"]);
});

test("syncSharingLists() é idempotente e não mantém listas pré-calculadas", () => {
  const first = syncSharingLists([
    { uid: "u-view", role: "view" },
    { uid: "u-edit", role: "edit" },
    { uid: "u-view", role: "edit" }
  ]);
  const second = syncSharingLists(first.shares);

  assert.deepEqual(second, first);
  assert.deepEqual(first.viewersUids, []);
  assert.deepEqual(first.editorsUids, ["u-view", "u-edit"]);
  assert.deepEqual(first.sharedWithUids, ["u-view", "u-edit"]);
});

test("getDirectoryShareStatus() diferencia ativos, inativos e documentos legados", () => {
  assert.equal(getDirectoryShareStatus({ id: "u1", uid: "u1", status: "active" }), "active");
  assert.equal(getDirectoryShareStatus({ id: "u2", uid: "u2", status: "pending" }), "inactive");
  assert.equal(getDirectoryShareStatus({ id: "u3", uid: "u3" }), "legacy");
  assert.equal(getDirectoryShareStatus({ id: "u4", uid: "other", status: "active" }), "invalid");
});

test("prepareKaizenSharingSave() preserva remoções e papéis sem e-mail pendente", () => {
  const existing = [
    { uid: "u-view", email: "view@example.com", role: "edit" },
    { uid: "u-removed", email: "removed@example.com", role: "view" }
  ];
  const result = prepareKaizenSharingSave(existing.filter((share) => share.uid !== "u-removed"));
  assert.deepEqual(result.shares.map(({ uid, role }) => [uid, role]), [["u-view", "edit"]]);
  assert.deepEqual(result.sharedWithUids, ["u-view"]);
  assert.deepEqual(result.editorsUids, ["u-view"]);
  assert.deepEqual(result.viewersUids, []);
});

test("isBareEmail() aceita somente e-mail completo sem espaços", () => {
  assert.equal(isBareEmail("colega@empresa.com"), true);
  assert.equal(isBareEmail("  Colega@Empresa.COM  "), true);
  assert.equal(isBareEmail("Colega (colega@empresa.com)"), false);
  assert.equal(isBareEmail("colega"), false);
  assert.equal(isBareEmail(""), false);
  assert.equal(isBareEmail(null), false);
});

test("directoryLookupMessage() explica cada estado sem culpar o usuário", () => {
  assert.match(directoryLookupMessage("missing", "x@empresa.com"), /Não existe usuário com o e-mail x@empresa\.com/);
  assert.match(directoryLookupMessage("inactive", "x@empresa.com"), /não está ativa/);
  assert.match(directoryLookupMessage("legacy", "x@empresa.com"), /cadastro antigo sem status definido/);
  assert.match(directoryLookupMessage("invalid", "x"), /e-mail completo/);
  assert.match(directoryLookupMessage("active", "x@empresa.com"), /já está na lista de acesso/);
});

test("createDefaultKaizen() inicializa schema v2 com rev=1 e valores padrão", () => {
  const user = { uid: "user-123", email: "groot@empresa.com", displayName: "Groot" };
  const k = createDefaultKaizen(user);

  assert.equal(k.schemaVersion, 2);
  assert.equal(k.rev, 1);
  assert.equal(k.etapaAtual, 0);
  assert.equal(k.ownerUid, "user-123");
  assert.equal(k.ownerEmail, "groot@empresa.com");
  assert.equal(k.ownerNome, "Groot");
  assert.equal(k.visibilidade, "privado");
  assert.equal(k.status, "em_andamento");
  assert.ok(Array.isArray(k.acoes));
  assert.ok(Array.isArray(k.riscos));
  assert.ok(Array.isArray(k.links));
});

test("validateKaizen() validação para rascunho e para conclusão", () => {
  const kInvalido = { projeto: "" };
  const v1 = validateKaizen(kInvalido, false);
  assert.equal(v1.valid, false);
  assert.ok(v1.errors.some((e) => e.includes("nome do projeto")));

  // Benefício > 0 sem tipoBeneficio
  const kSemTipoBen = { projeto: "Projeto 1", beneficio: 5000, tipoBeneficio: null };
  const v2 = validateKaizen(kSemTipoBen, false);
  assert.equal(v2.valid, false);
  assert.ok(v2.errors.some((e) => e.includes("tipo de benefício")));

  // Rascunho válido
  const kValido = { projeto: "Projeto 1", beneficio: 0 };
  const v3 = validateKaizen(kValido, false);
  assert.equal(v3.valid, true);

  // Tentativa de concluir incompleto
  const kConcluirIncompleto = {
    projeto: "Projeto 1",
    status: "concluido",
    area: "",
    acoes: []
  };
  const v4 = validateKaizen(kConcluirIncompleto, true);
  assert.equal(v4.valid, false);
  assert.ok(v4.errors.length >= 5);
});

test("canUserRead() e canUserEdit() respeitam papéis de owner, edit, view e admin", () => {
  const kaizen = {
    ownerUid: "owner-1",
    viewersUids: ["viewer-1"],
    editorsUids: ["editor-1"],
    sharedWithUids: ["viewer-1", "editor-1"],
    visibilidade: "privado"
  };

  const ownerUser = { uid: "owner-1" };
  const viewerUser = { uid: "viewer-1" };
  const editorUser = { uid: "editor-1" };
  const strangerUser = { uid: "stranger-1" };
  const adminUser = { uid: "admin-1" };
  const adminProfile = { role: "admin" };
  const normalProfile = { role: "user" };

  // Leitura
  assert.equal(canUserRead(kaizen, ownerUser, normalProfile), true, "Dono deve poder ler");
  assert.equal(canUserRead(kaizen, viewerUser, normalProfile), true, "Viewer deve poder ler");
  assert.equal(canUserRead(kaizen, editorUser, normalProfile), true, "Editor deve poder ler");
  assert.equal(canUserRead(kaizen, strangerUser, normalProfile), false, "Estranho não deve ler");
  assert.equal(canUserRead(kaizen, strangerUser, adminProfile), true, "Admin deve ler tudo");

  // Escrita
  assert.equal(canUserEdit(kaizen, ownerUser, normalProfile), true, "Dono deve poder editar");
  assert.equal(canUserEdit(kaizen, editorUser, normalProfile), true, "Editor deve poder editar");
  assert.equal(canUserEdit(kaizen, viewerUser, normalProfile), false, "Viewer NUNCA edita");
  assert.equal(canUserEdit(kaizen, strangerUser, normalProfile), false, "Estranho não deve editar");
  assert.equal(canUserEdit(kaizen, strangerUser, adminProfile), true, "Admin pode editar");
});

test("F1: visibilidade 'compartilhado' NUNCA libera leitura para terceiros (apenas view/edit explícito)", () => {
  const kaizenPrivado = {
    ownerUid: "dono-123",
    viewersUids: [],
    editorsUids: [],
    sharedWithUids: [],
    visibilidade: "privado"
  };

  const kaizenComCampoCompartilhado = {
    ownerUid: "dono-123",
    viewersUids: [],
    editorsUids: [],
    sharedWithUids: [],
    visibilidade: "compartilhado"
  };

  const terceiro = { uid: "terceiro-456" };
  const perfilComum = { role: "user" };

  // Terceiro não deve ler nenhum dos dois
  assert.equal(canUserRead(kaizenPrivado, terceiro, perfilComum), false, "Terceiro não lê kaizen privado");
  assert.equal(canUserRead(kaizenComCampoCompartilhado, terceiro, perfilComum), false, "visibilidade=='compartilhado' NUNCA deve liberar leitura a terceiro sem papel explícito");

  // Apenas a concessão explícita de papel concede leitura
  const kaizenComViewer = {
    ...kaizenComCampoCompartilhado,
    viewersUids: ["terceiro-456"],
    sharedWithUids: ["terceiro-456"]
  };
  assert.equal(canUserRead(kaizenComViewer, terceiro, perfilComum), true, "Papel view explícito libera leitura");

  const kaizenComEditor = {
    ...kaizenComCampoCompartilhado,
    editorsUids: ["terceiro-456"],
    sharedWithUids: ["terceiro-456"]
  };
  assert.equal(canUserRead(kaizenComEditor, terceiro, perfilComum), true, "Papel edit explícito libera leitura");
});

test("generateSearchKeywords() indexa campos do kaizen e links", () => {
  const k = {
    codigo: "KZ-20261117-0042",
    projeto: "Redução de refugo na montagem",
    area: "Linha 3",
    lider: "Ana Souza",
    areaNegocio: "Operação",
    links: [
      {
        titulo: "Planilha de medição",
        url: "https://empresa.sharepoint.com/sites/relatorio-refugo",
        descricao: "Base consolidada",
        tags: ["dados", "refugo"],
        indexado: true
      }
    ]
  };

  const kw = generateSearchKeywords(k);
  assert.ok(kw.includes("refugo"));
  assert.ok(kw.includes("montagem"));
  assert.ok(kw.includes("linha"));
  assert.ok(kw.includes("souza"));
  assert.ok(kw.includes("planilha"));
  assert.ok(kw.includes("dados"));
});

test("migrateLegacyProject() transforma dados legados do V6/v1 para v2", () => {
  const legacy = {
    Projeto: "Otimização de Caldeira",
    Area: "Utilidades",
    Data: "2026-05-10",
    Lider: "Carlos Silva",
    Participantes: "Carlos Silva; Marcos Lima; Rita Dias",
    AreaNegocio: "Operação",
    Tipo: "Performance",
    PilarSeguranca: true,
    PilarEntrega: true,
    Incomodo: "Consumo elevado de biomassa",
    Causas: "Oscilação de umidade",
    Meta: "Reduzir 5% de consumo",
    WWhat: "Ajustar alimentação de biomassa",
    WWhere: "Caldeira 1",
    WWhen: "Mai-Jul 2026",
    WWho: "Carlos Silva",
    WWhy: "Economia de combustível",
    WHow: "Automação da esteira",
    WHowMuch: "R$ 15.000",
    Beneficio: "60000",
    Custo: "15000",
    acoes: [
      { desc: "Mapear umidade", resp: "Marcos", prazo: "2026-05-20", status: "concluida" }
    ],
    riscos: [
      { desc: "Parada não programada", sev: "3", prob: "2", acao: "Janela técnica", resp: "Rita" }
    ],
    Percentual: 80
  };

  const user = { uid: "user-carlos", email: "carlos@empresa.com", displayName: "Carlos Silva" };
  const v2 = migrateLegacyProject(legacy, user);

  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.rev, 1);
  assert.equal(v2.projeto, "Otimização de Caldeira");
  assert.equal(v2.tipo, "performance");
  assert.equal(v2.beneficio, 60000);
  assert.equal(v2.custo, 15000);
  assert.equal(v2.bcRatio, 4.0);
  assert.equal(v2.pilares.seguranca, true);
  assert.equal(v2.pilares.qualidade, false);
  assert.deepEqual(v2.participantes, ["Carlos Silva", "Marcos Lima", "Rita Dias"]);
  assert.equal(v2.acoes.length, 1);
  assert.equal(v2.acoes[0].descricao, "Mapear umidade");
  assert.equal(v2.riscos.length, 1);
  assert.equal(v2.riscos[0].score, 6);
  assert.equal(v2.ownerUid, "user-carlos");
  assert.ok(v2.searchKeywords.includes("caldeira"));
  assert.ok(v2.searchKeywords.includes("biomassa"));
});

test("validateWizardStep() valida requisitos específicos de cada etapa do wizard", () => {
  const kIncompleto = { projeto: "" };
  const v0 = validateWizardStep(kIncompleto, 0);
  assert.equal(v0.valid, false);
  assert.ok(v0.errors.some((e) => e.includes("nome do projeto")));

  const kIdentificado = {
    projeto: "Redução de Perdas",
    area: "Linha 1",
    data: "2026-11-17",
    lider: "Groot",
    areaNegocio: "Operação"
  };
  assert.equal(validateWizardStep(kIdentificado, 0).valid, true);

  // Etapa 1: incômodo
  assert.equal(validateWizardStep(kIdentificado, 1).valid, false);
  kIdentificado.incomodo = "Perda de matéria-prima acima de 5%";
  assert.equal(validateWizardStep(kIdentificado, 1).valid, true);

  // Etapa 3: 5W2H
  assert.equal(validateWizardStep(kIdentificado, 3).valid, false);
  kIdentificado.w2h = { what: "Instalar sensor", how: "Comprar equipamento e instalar na esteira" };
  assert.equal(validateWizardStep(kIdentificado, 3).valid, true);

  // Etapa 7: Expansão horizontal sem área
  kIdentificado.expansao = true;
  kIdentificado.expansaoArea = "";
  assert.equal(validateWizardStep(kIdentificado, 7).valid, false);
  kIdentificado.expansaoArea = "Linha 2";
  assert.equal(validateWizardStep(kIdentificado, 7).valid, true);

  // Etapa 8: Benefício sem tipo
  kIdentificado.beneficio = 10000;
  kIdentificado.tipoBeneficio = "";
  assert.equal(validateWizardStep(kIdentificado, 8).valid, false);
  kIdentificado.tipoBeneficio = "hard_saving";
  assert.equal(validateWizardStep(kIdentificado, 8).valid, true);
});

test("createDefaultKaizen() já nasce com percentual automático 0 (origem auto)", () => {
  const k = createDefaultKaizen({ uid: "u1", email: "u1@empresa.com" });
  assert.equal(k.percentual, 0);
  assert.equal(k.percentualOrigem, "auto");
});

test("migrateLegacyProject() recalcula percentual dos campos e ignora valor manual legado", () => {
  const legacy = {
    Projeto: "Projeto Legado",
    Incomodo: "Perda de material",
    Causas: "Falta de padrão",
    Meta: "Reduzir 10%",
    Padronizacao: "POP revisado",
    Percentual: 100
  };
  const v2 = migrateLegacyProject(legacy, { uid: "u-legado" });
  assert.equal(v2.percentual, 24, "4/17 => 24%, não o 100% manual");
  assert.equal(v2.percentualOrigem, "auto");
  assert.equal(v2.percentualManualLegado, 100, "valor manual preservado para rollback");
});
