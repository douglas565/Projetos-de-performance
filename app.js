// ============================================================
// app.js — Kaizen Hub v2 (Módulo Principal da SPA)
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  initAuth,
  loginUser,
  registerUser,
  logoutUser,
  requestPasswordReset,
  reloadProfile,
  translateAuthError
} from "./js/auth.js";
import {
  subscribeToHubKaizens,
  getKaizenById,
  saveKaizenWithTransaction,
  enqueueSave,
  softDeleteKaizen,
  migrateUserLegacyProjects
} from "./js/db.js";
import {
  createDefaultKaizen,
  validateKaizen,
  calculateBcRatio,
  calculatePercentualFromActions,
  calculateRiskScore,
  canUserRead,
  canUserEdit
} from "./js/kaizen-model.js";
import {
  showToast,
  setSaveStatus,
  setDirtyFlag,
  getDirtyFlag,
  initBeforeUnloadProtection,
  initConnectionMonitor,
  showConflictModal,
  initThemeToggle,
  initVersionProbe
} from "./js/ui.js";
import { openSharingModal } from "./js/share.js";

// ---------- Atalhos de Seleção ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- Estado Global da Aplicação ----------
let currentUser = null;
let currentUserProfile = null;
let allHubKaizens = [];
let activeKaizen = null;
let unsubHub = null;
let authMode = "signin";

// ============================================================
// 1. INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initBeforeUnloadProtection();
  initVersionProbe();
  initConnectionMonitor(() => {
    if (activeKaizen && activeKaizen.id) {
      triggerSave();
    }
  });

  setupAuthUI();
  setupHubUI();
  setupEditorUI();

  // Inicia observação do estado de autenticação
  initAuth((firebaseUser, profile) => {
    currentUser = firebaseUser;
    currentUserProfile = profile;

    if (!firebaseUser) {
      if (unsubHub) unsubHub();
      allHubKaizens = [];
      activeKaizen = null;
      showView("login");
      return;
    }

    const nameText = profile?.nome || firebaseUser.displayName || firebaseUser.email || "Usuário";
    $("#userChip").textContent = nameText;

    // Checa permissão de administrador para o link do painel executivo
    if (profile?.role === "admin") {
      $("#linkAdmin")?.classList.remove("hidden");
    } else {
      $("#linkAdmin")?.classList.add("hidden");
    }

    // Verifica status de aprovação de conta
    if (profile?.status === "pending") {
      showView("pending");
      return;
    }
    if (profile?.status === "blocked") {
      showView("blocked");
      return;
    }

    // Conta ativa: entra no Hub
    showView("hub");
    startHubSubscription();
  });
});

// ============================================================
// 2. CONTROLE DE TELAS (VIEWS)
// ============================================================
function showView(viewName) {
  const views = {
    login: $("#viewLogin"),
    pending: $("#viewPending"),
    blocked: $("#viewBlocked"),
    hub: $("#viewHub"),
    project: $("#viewProject")
  };

  Object.values(views).forEach((el) => el?.classList.add("hidden"));
  const topbar = $("#topbar");

  if (viewName === "login" || viewName === "pending" || viewName === "blocked") {
    topbar?.classList.add("hidden");
    views[viewName]?.classList.remove("hidden");
  } else {
    topbar?.classList.remove("hidden");
    views[viewName]?.classList.remove("hidden");
    $("#viewLabel").textContent = viewName === "hub" ? "Meus projetos" : "Editor Kaizen";
  }
}

// ============================================================
// 3. FLUXO DE AUTENTICAÇÃO
// ============================================================
function setupAuthUI() {
  $$(".tab").forEach((tab) => {
    tab.onclick = () => {
      $$(".tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      authMode = tab.dataset.tab;

      const isSignup = authMode === "signup";
      $("#btnAuth").textContent = isSignup ? "Criar conta" : "Entrar";
      $("#nameField").classList.toggle("hidden", !isSignup);
      $("#confirmPassField").classList.toggle("hidden", !isSignup);
      $("#passHint").classList.toggle("hidden", !isSignup);
      $("#btnReset").classList.toggle("hidden", isSignup);
      $("#authMsg").textContent = "";
      $("#authMsg").className = "msg";
    };
  });

  $("#formAuth").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    const pass = $("#password").value;
    const msg = $("#authMsg");
    msg.className = "msg";
    msg.textContent = "Processando…";

    try {
      if (authMode === "signin") {
        await loginUser(email, pass);
      } else {
        const confirmPass = $("#confirmPassword").value;
        if (pass !== confirmPass) {
          msg.className = "msg err";
          msg.textContent = "As senhas não coincidem.";
          return;
        }
        const nome = $("#displayName").value.trim();
        await registerUser(email, pass, nome);
        showToast("Conta criada! Aguarde aprovação do administrador.", "ok");
      }
      msg.textContent = "";
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = translateAuthError(err.code || err.message);
    }
  };

  $("#btnReset").onclick = async () => {
    const email = $("#email").value.trim();
    const msg = $("#authMsg");
    if (!email) {
      msg.className = "msg err";
      msg.textContent = "Informe seu e-mail corporativo primeiro.";
      return;
    }
    try {
      await requestPasswordReset(email);
      msg.className = "msg ok";
      msg.textContent = "E-mail de recuperação enviado com sucesso.";
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = translateAuthError(err.code);
    }
  };

  $("#btnLogout").onclick = () => logoutUser();
  $("#btnPendingLogout").onclick = () => logoutUser();
  $("#btnBlockedLogout").onclick = () => logoutUser();

  $("#btnCheckApproval").onclick = async () => {
    if (!currentUser) return;
    const p = await reloadProfile(currentUser.uid);
    if (p && p.status === "active") {
      currentUserProfile = p;
      showToast("Conta aprovada! Bem-vindo ao Kaizen Hub.", "ok");
      showView("hub");
      startHubSubscription();
    } else {
      showToast("Sua conta ainda está aguardando liberação do administrador.", "warn");
    }
  };

  // Botão de migração no topbar
  $("#btnMigrate").onclick = async () => {
    if (!currentUser) return;
    const ok = confirm("Deseja importar seus kaizens da versão anterior para a versão v2?");
    if (!ok) return;

    showToast("Verificando projetos antigos...", "info");
    try {
      const res = await migrateUserLegacyProjects(currentUser);
      if (res.total === 0) {
        showToast("Nenhum kaizen legado encontrado para migrar.", "info");
      } else {
        showToast(`Migração concluída: ${res.migrated} migrados, ${res.skipped} já existentes (total: ${res.total}).`, "ok");
      }
    } catch (e) {
      console.error(e);
      showToast(`Erro na migração: ${translateAuthError(e.code || e.message)}`, "danger");
    }
  };
}

// ============================================================
// 4. HUB DE KAIZENS E FILTROS
// ============================================================
function startHubSubscription() {
  if (unsubHub) unsubHub();

  renderHubSkeletons();

  unsubHub = subscribeToHubKaizens(
    currentUser,
    currentUserProfile,
    (kaizens) => {
      allHubKaizens = kaizens;
      updateAreaFilterOptions(kaizens);
      renderHub();
    },
    (err) => {
      console.error("Erro na lista do hub:", err);
      showToast(`Erro ao sincronizar projetos: ${translateAuthError(err.code)}`, "danger");
    }
  );
}

// innerHTML = "" é utilizado estritamente para esvaziar elementos container com segurança
function renderHubSkeletons() {
  const grid = $("#projectGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const sk = document.createElement("div");
    sk.className = "skeleton-card";
    grid.appendChild(sk);
  }
}

function updateAreaFilterOptions(kaizens) {
  const sel = $("#filterArea");
  if (!sel) return;
  const currentVal = sel.value;
  const areas = [...new Set(kaizens.map((k) => k.areaNegocio).filter(Boolean))].sort();

  sel.innerHTML = "";
  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = "Todas as áreas";
  sel.appendChild(optDefault);

  areas.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    sel.appendChild(opt);
  });
  sel.value = currentVal;
}

function setupHubUI() {
  $("#btnNewProject").onclick = () => createNewKaizen();
  $("#btnFirstProject")?.addEventListener("click", () => createNewKaizen());

  ["#searchProjects", "#filterArea", "#filterTipo", "#filterBeneficio", "#filterStatus"].forEach((s) => {
    $(s)?.addEventListener("input", () => renderHub());
    $(s)?.addEventListener("change", () => renderHub());
  });

  $("#filterMine")?.addEventListener("change", () => renderHub());
}

function createNewKaizen() {
  const novo = createDefaultKaizen(currentUser);
  activeKaizen = novo;
  const newId = `kz-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  activeKaizen.id = newId;

  openEditor(activeKaizen, true);
}

function renderHub() {
  const grid = $("#projectGrid");
  const empty = $("#emptyState");
  const stats = $("#hubStats");
  if (!grid) return;

  const searchTerm = ($("#searchProjects")?.value || "").trim().toLowerCase();
  const fArea = $("#filterArea")?.value || "";
  const fTipo = $("#filterTipo")?.value || "";
  const fBeneficio = $("#filterBeneficio")?.value || "";
  const fStatus = $("#filterStatus")?.value || "";
  const fMine = $("#filterMine")?.checked || false;

  const filtered = allHubKaizens.filter((k) => {
    if (fMine && k.ownerUid !== currentUser.uid) return false;
    if (fArea && k.areaNegocio !== fArea) return false;
    if (fTipo && k.tipo !== fTipo) return false;
    if (fBeneficio && k.tipoBeneficio !== fBeneficio) return false;
    if (fStatus && k.status !== fStatus) return false;

    if (searchTerm) {
      const matchKeywords = Array.isArray(k.searchKeywords) && k.searchKeywords.some((kw) => kw.includes(searchTerm));
      const matchText = (k.projeto || "").toLowerCase().includes(searchTerm) ||
                        (k.codigo || "").toLowerCase().includes(searchTerm) ||
                        (k.lider || "").toLowerCase().includes(searchTerm) ||
                        (k.area || "").toLowerCase().includes(searchTerm);
      if (!matchKeywords && !matchText) return false;
    }
    return true;
  });

  // Estatísticas no topo
  const total = filtered.length;
  const avgPct = total > 0 ? Math.round(filtered.reduce((acc, k) => acc + (Number(k.percentual) || 0), 0) / total) : 0;
  const totalHS = filtered.filter((k) => k.tipoBeneficio === "hard_saving").reduce((acc, k) => acc + (Number(k.beneficio) || 0), 0);
  const totalCA = filtered.filter((k) => k.tipoBeneficio === "cost_avoidance").reduce((acc, k) => acc + (Number(k.beneficio) || 0), 0);

  const hsFmt = totalHS.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const caFmt = totalCA.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  stats.textContent = `${total} projeto(s) · Conclusão média: ${avgPct}% · Hard Saving: ${hsFmt} · Cost Avoidance: ${caFmt}`;

  grid.innerHTML = "";

  if (filtered.length === 0) {
    empty?.classList.remove("hidden");
    return;
  }
  empty?.classList.add("hidden");

  filtered.forEach((k) => {
    const card = document.createElement("div");
    card.className = `pcard card-${k.status || "em_andamento"}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const pct = Number(k.percentual) || 0;
    const isOwner = k.ownerUid === currentUser.uid;

    // Topo do card
    const topDiv = document.createElement("div");
    topDiv.className = "pcard-top";

    const codeSpan = document.createElement("span");
    codeSpan.className = "pcard-code";
    codeSpan.textContent = k.codigo || "";
    topDiv.appendChild(codeSpan);

    const tagRow = document.createElement("div");
    tagRow.className = "tagrow";

    if (k.tipoBeneficio === "hard_saving") {
      const hs = document.createElement("span");
      hs.className = "badge-hs";
      hs.textContent = "HS";
      tagRow.appendChild(hs);
    } else if (k.tipoBeneficio === "cost_avoidance") {
      const ca = document.createElement("span");
      ca.className = "badge-ca";
      ca.textContent = "CA";
      tagRow.appendChild(ca);
    }

    const tagTipo = document.createElement("span");
    tagTipo.className = "tag";
    tagTipo.textContent = k.tipo === "performance" ? "Performance" : "Kaizen";
    tagRow.appendChild(tagTipo);

    const pillStatus = document.createElement("span");
    pillStatus.className = "pill";
    pillStatus.style.fontSize = "11px";
    pillStatus.textContent = formatStatus(k.status);
    tagRow.appendChild(pillStatus);

    topDiv.appendChild(tagRow);
    card.appendChild(topDiv);

    // Título
    const titleH3 = document.createElement("h3");
    titleH3.textContent = k.projeto || "Sem título";
    card.appendChild(titleH3);

    // Área e Líder
    const metaArea = document.createElement("p");
    metaArea.className = "meta";
    metaArea.textContent = `Área: ${k.area || k.areaNegocio || "Não informada"}`;
    card.appendChild(metaArea);

    const metaLider = document.createElement("p");
    metaLider.className = "meta";
    metaLider.textContent = `Líder: ${k.lider || "—"}`;
    card.appendChild(metaLider);

    // Barra de progresso e rodapé
    const footerDiv = document.createElement("div");
    footerDiv.style.marginTop = "auto";

    const progInfo = document.createElement("div");
    progInfo.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";

    const shareNote = document.createElement("small");
    shareNote.className = "muted";
    if (!isOwner) {
      const badgeShared = document.createElement("span");
      badgeShared.className = "badge-shared";
      badgeShared.textContent = "Compartilhado comigo";
      shareNote.appendChild(badgeShared);
    }
    progInfo.appendChild(shareNote);

    const pctStrong = document.createElement("strong");
    pctStrong.style.fontSize = "12px";
    pctStrong.textContent = `${pct}%`;
    progInfo.appendChild(pctStrong);
    footerDiv.appendChild(progInfo);

    const barDiv = document.createElement("div");
    barDiv.className = "bar";
    const barSpan = document.createElement("span");
    barSpan.style.width = `${pct}%`;
    barDiv.appendChild(barSpan);
    footerDiv.appendChild(barDiv);

    card.appendChild(footerDiv);

    card.onclick = () => openEditor(k);
    card.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEditor(k);
      }
    };
    grid.appendChild(card);
  });
}

function formatStatus(status) {
  const map = {
    rascunho: "Rascunho",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    cancelado: "Cancelado"
  };
  return map[status] || "Em andamento";
}

// ============================================================
// 5. EDITOR KAIZEN (SOL-FR-0013)
// ============================================================
function setupEditorUI() {
  $("#btnBack").onclick = () => {
    if (getDirtyFlag()) {
      const sair = confirm("Há alterações que ainda estão sendo sincronizadas. Deseja voltar ao hub mesmo assim?");
      if (!sair) return;
    }
    activeKaizen = null;
    showView("hub");
  };

  $("#btnPrint").onclick = () => {
    if (!activeKaizen || !activeKaizen.id) return;
    window.open(`print.html?id=${encodeURIComponent(activeKaizen.id)}`, "_blank");
  };

  $("#btnShare").onclick = () => {
    if (!activeKaizen) return;
    openSharingModal({
      kaizen: activeKaizen,
      currentUser,
      onSaveShares: (synced) => {
        activeKaizen.shares = synced.shares;
        activeKaizen.viewersUids = synced.viewersUids;
        activeKaizen.editorsUids = synced.editorsUids;
        activeKaizen.sharedWithUids = synced.sharedWithUids;
        triggerSave();
      }
    });
  };

  $("#btnDelete").onclick = async () => {
    if (!activeKaizen) return;
    const nome = activeKaizen.projeto || "este Kaizen";
    const ok = confirm(`Tem certeza que deseja excluir o projeto "${nome}"?`);
    if (!ok) return;

    try {
      await softDeleteKaizen(activeKaizen.id, currentUser);
      showToast("Kaizen excluído com sucesso.", "ok");
      activeKaizen = null;
      showView("hub");
    } catch (e) {
      showToast(`Erro ao excluir: ${translateAuthError(e.code)}`, "danger");
    }
  };

  $("#btnAddAction").onclick = () => addActionRow();
  $("#btnCalcPct").onclick = () => recalculatePercentual();
  $("#btnAddRisk").onclick = () => addRiskRow();
  $("#btnAddLink").onclick = () => openLinkModal();

  // Modal de adicionar link
  $("#btnCloseLinkModal").onclick = () => $("#modalAddLink").classList.add("hidden");
  $("#btnCancelLink").onclick = () => $("#modalAddLink").classList.add("hidden");
  $("#formAddLink").onsubmit = (e) => {
    e.preventDefault();
    submitAddLink();
  };

  // Monitora alterações nos campos do formulário para disparar autosave debounced
  $("#kaizenForm").addEventListener("input", (e) => {
    handleFieldInput(e.target);
  });
  $("#kaizenForm").addEventListener("change", (e) => {
    handleFieldInput(e.target);
  });
}

function openEditor(kaizen, isNew = false) {
  activeKaizen = JSON.parse(JSON.stringify(kaizen));

  const canRead = canUserRead(activeKaizen, currentUser, currentUserProfile);
  if (!canRead) {
    showToast("Você não tem permissão para visualizar este Kaizen.", "danger");
    showView("hub");
    return;
  }

  const canEdit = canUserEdit(activeKaizen, currentUser, currentUserProfile);

  showView("project");
  populateEditorForm(activeKaizen, canEdit);

  if (isNew) {
    setSaveStatus("dirty");
    triggerSave();
  } else {
    setSaveStatus("saved");
  }
}

function populateEditorForm(k, canEdit) {
  $("#editorKaizenTitle").textContent = k.projeto || k.codigo || "Sem título";
  $("#editorStatusPill").textContent = formatStatus(k.status);

  // Pilares
  const pilares = k.pilares || {};
  $('[data-f="pilar_seguranca"]').checked = Boolean(pilares.seguranca);
  $('[data-f="pilar_qualidade"]').checked = Boolean(pilares.qualidade);
  $('[data-f="pilar_entrega"]').checked = Boolean(pilares.entrega);
  $('[data-f="pilar_lucratividade"]').checked = Boolean(pilares.lucratividade);
  $('[data-f="pilar_pessoas"]').checked = Boolean(pilares.pessoas);

  // Campos de cabeçalho
  $('[data-f="codigo"]').value = k.codigo || "";
  $('[data-f="projeto"]').value = k.projeto || "";
  $('[data-f="area"]').value = k.area || "";
  $('[data-f="data"]').value = k.data || "";
  $('[data-f="lider"]').value = k.lider || "";
  $('[data-f="participantes"]').value = Array.isArray(k.participantes) ? k.participantes.join("; ") : (k.participantes || "");
  $('[data-f="areaNegocio"]').value = k.areaNegocio || "Operação";
  $('[data-f="tipo"]').value = k.tipo || "kaizen";
  $('[data-f="status"]').value = k.status || "em_andamento";
  $('[data-f="percentual"]').value = k.percentual ?? 0;
  $('[data-f="visibilidade"]').value = k.visibilidade || "privado";

  // Blocos 1, 3 e 5
  $('[data-f="incomodo"]').value = k.incomodo || "";
  $('[data-f="meta"]').value = k.meta || "";
  $('[data-f="monitoramento"]').value = k.monitoramento || "";

  // Bloco 2 + 5W2H
  $('[data-f="causas"]').value = k.causas || "";
  const w = k.w2h || {};
  $('[data-f="w_what"]').value = w.what || "";
  $('[data-f="w_where"]').value = w.where || "";
  $('[data-f="w_when"]').value = w.when || "";
  $('[data-f="w_who"]').value = w.who || "";
  $('[data-f="w_why"]').value = w.why || "";
  $('[data-f="w_how"]').value = w.how || "";
  $('[data-f="w_howmuch"]').value = w.howMuch || "";

  // Bloco 6 e 7
  $('[data-f="padronizacao"]').value = k.padronizacao || "";
  $('[data-f="aprovacao"]').value = k.aprovacao || "";
  $('[data-f="aprovacaoStatus"]').value = k.aprovacaoStatus || "pendente";
  $('[data-f="expansao"]').checked = Boolean(k.expansao);
  $('[data-f="expansaoArea"]').value = k.expansaoArea || "";

  // Bloco 8: Resultados
  $('[data-f="beneficio"]').value = k.beneficio || "";
  $('[data-f="custo"]').value = k.custo || "";
  $('[data-f="tipoBeneficio"]').value = k.tipoBeneficio || "";
  $('[data-f="bcObs"]').value = k.bcObs || "";

  updateBcRatioDisplay();

  // Renderiza tabelas filhas (Ações, Riscos, Links)
  renderActionTable(k.acoes || [], canEdit);
  renderRiskTable(k.riscos || [], canEdit);
  renderLinksTable(k.links || [], canEdit);

  // Bloqueio se for somente leitura
  const formElements = $$("#kaizenForm input, #kaizenForm select, #kaizenForm textarea, #kaizenForm button");
  formElements.forEach((el) => {
    if (!canEdit) {
      el.setAttribute("disabled", "disabled");
    } else {
      if (el.getAttribute("data-f") !== "codigo") {
        el.removeAttribute("disabled");
      }
    }
  });

  if (!canEdit) {
    $("#btnDelete")?.classList.add("hidden");
    $("#btnShare")?.classList.add("hidden");
    setSaveStatus("saved", "Somente leitura");
  } else {
    $("#btnDelete")?.classList.remove("hidden");
    $("#btnShare")?.classList.remove("hidden");
  }
}

function updateBcRatioDisplay() {
  const b = Number($('[data-f="beneficio"]')?.value) || 0;
  const c = Number($('[data-f="custo"]')?.value) || 0;
  const ratio = calculateBcRatio(b, c);
  const ratioEl = $("#bcRatio");
  if (ratioEl) {
    ratioEl.value = ratio !== null ? `${ratio}x` : "—";
  }
}

function handleFieldInput(target) {
  if (!activeKaizen) return;
  const f = target.getAttribute("data-f");
  if (!f) return;

  if (f.startsWith("pilar_")) {
    const key = f.replace("pilar_", "");
    if (!activeKaizen.pilares) activeKaizen.pilares = {};
    activeKaizen.pilares[key] = target.checked;
  } else if (f.startsWith("w_")) {
    const key = f === "w_howmuch" ? "howMuch" : f.replace("w_", "");
    if (!activeKaizen.w2h) activeKaizen.w2h = {};
    activeKaizen.w2h[key] = target.value;
  } else if (f === "participantes") {
    activeKaizen.participantes = target.value.split(";").map((p) => p.trim()).filter(Boolean);
  } else if (f === "expansao") {
    activeKaizen.expansao = target.checked;
  } else if (f === "beneficio" || f === "custo") {
    activeKaizen[f] = Number(target.value) || 0;
    updateBcRatioDisplay();
    activeKaizen.bcRatio = calculateBcRatio(activeKaizen.beneficio, activeKaizen.custo);
  } else if (f === "percentual") {
    activeKaizen.percentual = Math.min(100, Math.max(0, Number(target.value) || 0));
  } else {
    activeKaizen[f] = target.value;
    if (f === "projeto") {
      $("#editorKaizenTitle").textContent = target.value || activeKaizen.codigo || "Sem título";
    }
    if (f === "status") {
      $("#editorStatusPill").textContent = formatStatus(target.value);
    }
  }

  triggerSave();
}

function triggerSave() {
  if (!activeKaizen || !activeKaizen.id) return;
  if (!canUserEdit(activeKaizen, currentUser, currentUserProfile)) return;

  setDirtyFlag(true);
  enqueueSave({
    kaizenId: activeKaizen.id,
    getData: () => activeKaizen,
    user: currentUser,
    onStatusChange: (status, extra) => {
      setSaveStatus(status, extra);
      if (status === "saved") {
        setDirtyFlag(false);
      }
    },
    onConflict: (serverData) => {
      showConflictModal({
        serverData,
        onReload: () => {
          activeKaizen = JSON.parse(JSON.stringify(serverData));
          activeKaizen.id = serverData.id || activeKaizen.id;
          populateEditorForm(activeKaizen, true);
          setSaveStatus("saved");
          showToast("Versão mais recente do servidor recarregada.", "info");
        },
        onOverwrite: () => {
          activeKaizen.rev = Number(serverData.rev) || 1;
          triggerSave();
          showToast("Gravando alterações por cima...", "warn");
        }
      });
    },
    onSaved: (newRev) => {
      activeKaizen.rev = newRev;
    }
  });
}

// ============================================================
// 6. PLANO DE AÇÃO (CRONOGRAMA ILIMITADO)
// ============================================================
function renderActionTable(acoes, canEdit) {
  const tbody = $("#actionTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  acoes.forEach((a, idx) => {
    const tr = document.createElement("tr");
    if (a.status === "concluida") tr.classList.add("done");

    // #
    const tdNum = document.createElement("td");
    tdNum.style.fontWeight = "700";
    tdNum.style.color = "var(--muted)";
    tdNum.textContent = String(idx + 1);
    tr.appendChild(tdNum);

    // Descrição
    const tdDesc = document.createElement("td");
    const inDesc = document.createElement("input");
    inDesc.type = "text";
    inDesc.className = "act-desc";
    inDesc.dataset.idx = String(idx);
    inDesc.value = a.descricao || "";
    inDesc.placeholder = "Descrição da ação";
    tdDesc.appendChild(inDesc);
    tr.appendChild(tdDesc);

    // Responsável
    const tdResp = document.createElement("td");
    const inResp = document.createElement("input");
    inResp.type = "text";
    inResp.className = "act-resp";
    inResp.dataset.idx = String(idx);
    inResp.value = a.responsavel || "";
    inResp.placeholder = "Responsável";
    tdResp.appendChild(inResp);
    tr.appendChild(tdResp);

    // Prazo
    const tdPrazo = document.createElement("td");
    const inPrazo = document.createElement("input");
    inPrazo.type = "date";
    inPrazo.className = "act-prazo";
    inPrazo.dataset.idx = String(idx);
    inPrazo.value = a.prazo || "";
    tdPrazo.appendChild(inPrazo);
    tr.appendChild(tdPrazo);

    // Status
    const tdStatus = document.createElement("td");
    const selStatus = document.createElement("select");
    selStatus.className = "act-status";
    selStatus.dataset.idx = String(idx);
    const opts = [
      { val: "nao_iniciada", label: "Não iniciada" },
      { val: "em_andamento", label: "Em andamento" },
      { val: "concluida", label: "Concluída" },
      { val: "atrasada", label: "Atrasada" }
    ];
    opts.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.val;
      opt.textContent = o.label;
      if (a.status === o.val) opt.selected = true;
      selStatus.appendChild(opt);
    });
    tdStatus.appendChild(selStatus);
    tr.appendChild(tdStatus);

    // Remover
    const tdRm = document.createElement("td");
    const btnRm = document.createElement("button");
    btnRm.type = "button";
    btnRm.className = "btn-rm-action rm";
    btnRm.dataset.idx = String(idx);
    btnRm.title = "Remover ação";
    btnRm.textContent = "✕";
    tdRm.appendChild(btnRm);
    tr.appendChild(tdRm);

    tbody.appendChild(tr);
  });

  if (!canEdit) {
    tbody.querySelectorAll("input, select, button").forEach((el) => el.setAttribute("disabled", "disabled"));
    return;
  }

  tbody.querySelectorAll(".act-desc").forEach((el) => {
    el.oninput = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.acoes[i].descricao = e.target.value;
      triggerSave();
    };
  });

  tbody.querySelectorAll(".act-resp").forEach((el) => {
    el.oninput = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.acoes[i].responsavel = e.target.value;
      triggerSave();
    };
  });

  tbody.querySelectorAll(".act-prazo").forEach((el) => {
    el.onchange = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.acoes[i].prazo = e.target.value;
      triggerSave();
    };
  });

  tbody.querySelectorAll(".act-status").forEach((el) => {
    el.onchange = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.acoes[i].status = e.target.value;
      if (e.target.value === "concluida" && !activeKaizen.acoes[i].concluidaEm) {
        activeKaizen.acoes[i].concluidaEm = new Date().toISOString().split("T")[0];
      }
      renderActionTable(activeKaizen.acoes, true);
      triggerSave();
    };
  });

  tbody.querySelectorAll(".btn-rm-action").forEach((btn) => {
    btn.onclick = (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      activeKaizen.acoes.splice(i, 1);
      activeKaizen.acoes.forEach((a, idx) => { a.ordem = idx + 1; });
      renderActionTable(activeKaizen.acoes, true);
      triggerSave();
    };
  });
}

function addActionRow() {
  if (!activeKaizen) return;
  if (!Array.isArray(activeKaizen.acoes)) activeKaizen.acoes = [];

  const novaOrdem = activeKaizen.acoes.length + 1;
  activeKaizen.acoes.push({
    id: `act-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    ordem: novaOrdem,
    descricao: "",
    responsavel: activeKaizen.lider || "",
    prazo: "",
    status: "nao_iniciada",
    concluidaEm: null
  });

  renderActionTable(activeKaizen.acoes, true);
  triggerSave();
}

function recalculatePercentual() {
  if (!activeKaizen || !Array.isArray(activeKaizen.acoes)) return;
  const pct = calculatePercentualFromActions(activeKaizen.acoes);
  activeKaizen.percentual = pct;
  const pctInput = $('[data-f="percentual"]');
  if (pctInput) pctInput.value = pct;

  if (pct === 100 && activeKaizen.status !== "concluido") {
    activeKaizen.status = "concluido";
    $('[data-f="status"]').value = "concluido";
    $("#editorStatusPill").textContent = "Concluído";
  }

  triggerSave();
  showToast(`Percentual recalculado para ${pct}%.`, "ok");
}

// ============================================================
// 7. ANÁLISE DE RISCOS (ILIMITADA)
// ============================================================
function renderRiskTable(riscos, canEdit) {
  const tbody = $("#riskTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  riscos.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const sev = Number(r.severidade) || 1;
    const prob = Number(r.probabilidade) || 1;
    const { score, nivel } = calculateRiskScore(sev, prob);

    // Descrição
    const tdDesc = document.createElement("td");
    const inDesc = document.createElement("input");
    inDesc.type = "text";
    inDesc.className = "risk-desc";
    inDesc.dataset.idx = String(idx);
    inDesc.value = r.descricao || "";
    inDesc.placeholder = "Descrição do risco";
    tdDesc.appendChild(inDesc);
    tr.appendChild(tdDesc);

    // Severidade
    const tdSev = document.createElement("td");
    const selSev = document.createElement("select");
    selSev.className = "risk-sev";
    selSev.dataset.idx = String(idx);
    [
      { val: 1, label: "1 - Baixa" },
      { val: 2, label: "2 - Média" },
      { val: 3, label: "3 - Alta" },
      { val: 4, label: "4 - Crítica" }
    ].forEach((o) => {
      const opt = document.createElement("option");
      opt.value = String(o.val);
      opt.textContent = o.label;
      if (sev === o.val) opt.selected = true;
      selSev.appendChild(opt);
    });
    tdSev.appendChild(selSev);
    tr.appendChild(tdSev);

    // Probabilidade
    const tdProb = document.createElement("td");
    const selProb = document.createElement("select");
    selProb.className = "risk-prob";
    selProb.dataset.idx = String(idx);
    [
      { val: 1, label: "1 - Rara" },
      { val: 2, label: "2 - Pouco prov." },
      { val: 3, label: "3 - Provável" },
      { val: 4, label: "4 - Frequente" }
    ].forEach((o) => {
      const opt = document.createElement("option");
      opt.value = String(o.val);
      opt.textContent = o.label;
      if (prob === o.val) opt.selected = true;
      selProb.appendChild(opt);
    });
    tdProb.appendChild(selProb);
    tr.appendChild(tdProb);

    // Score
    const tdScore = document.createElement("td");
    tdScore.style.textAlign = "center";
    const spanScore = document.createElement("span");
    spanScore.className = `risk-score risk-${nivel}`;
    spanScore.textContent = String(score);
    tdScore.appendChild(spanScore);
    tr.appendChild(tdScore);

    // Mitigação
    const tdMitig = document.createElement("td");
    const inMitig = document.createElement("input");
    inMitig.type = "text";
    inMitig.className = "risk-mitig";
    inMitig.dataset.idx = String(idx);
    inMitig.value = r.mitigacao || "";
    inMitig.placeholder = "Ação de mitigação";
    tdMitig.appendChild(inMitig);
    tr.appendChild(tdMitig);

    // Responsável
    const tdResp = document.createElement("td");
    const inResp = document.createElement("input");
    inResp.type = "text";
    inResp.className = "risk-resp";
    inResp.dataset.idx = String(idx);
    inResp.value = r.responsavel || "";
    inResp.placeholder = "Responsável";
    tdResp.appendChild(inResp);
    tr.appendChild(tdResp);

    // Remover
    const tdRm = document.createElement("td");
    const btnRm = document.createElement("button");
    btnRm.type = "button";
    btnRm.className = "btn-rm-risk rm";
    btnRm.dataset.idx = String(idx);
    btnRm.title = "Remover risco";
    btnRm.textContent = "✕";
    tdRm.appendChild(btnRm);
    tr.appendChild(tdRm);

    tbody.appendChild(tr);
  });

  if (!canEdit) {
    tbody.querySelectorAll("input, select, button").forEach((el) => el.setAttribute("disabled", "disabled"));
    return;
  }

  tbody.querySelectorAll(".risk-desc").forEach((el) => {
    el.oninput = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.riscos[i].descricao = e.target.value;
      triggerSave();
    };
  });

  tbody.querySelectorAll(".risk-sev, .risk-prob").forEach((el) => {
    el.onchange = (e) => {
      const i = Number(e.target.dataset.idx);
      const row = activeKaizen.riscos[i];
      if (e.target.classList.contains("risk-sev")) row.severidade = Number(e.target.value);
      if (e.target.classList.contains("risk-prob")) row.probabilidade = Number(e.target.value);
      row.score = (Number(row.severidade) || 1) * (Number(row.probabilidade) || 1);
      renderRiskTable(activeKaizen.riscos, true);
      triggerSave();
    };
  });

  tbody.querySelectorAll(".risk-mitig").forEach((el) => {
    el.oninput = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.riscos[i].mitigacao = e.target.value;
      triggerSave();
    };
  });

  tbody.querySelectorAll(".risk-resp").forEach((el) => {
    el.oninput = (e) => {
      const i = Number(e.target.dataset.idx);
      activeKaizen.riscos[i].responsavel = e.target.value;
      triggerSave();
    };
  });

  tbody.querySelectorAll(".btn-rm-risk").forEach((btn) => {
    btn.onclick = (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      activeKaizen.riscos.splice(i, 1);
      renderRiskTable(activeKaizen.riscos, true);
      triggerSave();
    };
  });
}

function addRiskRow() {
  if (!activeKaizen) return;
  if (!Array.isArray(activeKaizen.riscos)) activeKaizen.riscos = [];

  activeKaizen.riscos.push({
    id: `rsk-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    descricao: "",
    severidade: 1,
    probabilidade: 1,
    score: 1,
    mitigacao: "",
    responsavel: activeKaizen.lider || ""
  });

  renderRiskTable(activeKaizen.riscos, true);
  triggerSave();
}

// ============================================================
// 8. LINKS E REFERÊNCIAS COM INDEXAÇÃO
// ============================================================
function renderLinksTable(links, canEdit) {
  const tbody = $("#linksTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (links.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "muted";
    td.style.cssText = "text-align:center;padding:16px";
    td.textContent = "Nenhum link de referência adicionado ainda.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  links.forEach((l, idx) => {
    const tr = document.createElement("tr");
    const tagsStr = Array.isArray(l.tags) ? l.tags.join(", ") : (l.tags || "—");

    // Título
    const tdTit = document.createElement("td");
    const stTit = document.createElement("strong");
    stTit.textContent = l.titulo || "";
    tdTit.appendChild(stTit);
    tr.appendChild(tdTit);

    // URL
    const tdUrl = document.createElement("td");
    tdUrl.style.cssText = "max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const aUrl = document.createElement("a");
    aUrl.href = l.url || "";
    aUrl.target = "_blank";
    aUrl.rel = "noopener noreferrer";
    aUrl.title = l.url || "";
    aUrl.textContent = `${l.url || ""} ↗`;
    tdUrl.appendChild(aUrl);
    tr.appendChild(tdUrl);

    // Categoria
    const tdCat = document.createElement("td");
    const pillCat = document.createElement("span");
    pillCat.className = "pill";
    pillCat.style.fontSize = "11px";
    pillCat.textContent = l.categoria || "outro";
    tdCat.appendChild(pillCat);
    tr.appendChild(tdCat);

    // Tags
    const tdTags = document.createElement("td");
    const smallTags = document.createElement("small");
    smallTags.className = "muted";
    smallTags.textContent = tagsStr;
    tdTags.appendChild(smallTags);
    tr.appendChild(tdTags);

    // Indexado para busca
    const tdIdx = document.createElement("td");
    tdIdx.style.textAlign = "center";
    tdIdx.textContent = l.indexado !== false ? "✓" : "—";
    tr.appendChild(tdIdx);

    // Ações
    const tdAcoes = document.createElement("td");
    const acoesWrap = document.createElement("div");
    acoesWrap.style.cssText = "display:flex;gap:6px";

    const aOpen = document.createElement("a");
    aOpen.href = l.url || "";
    aOpen.target = "_blank";
    aOpen.rel = "noopener noreferrer";
    aOpen.className = "btn small ghost";
    aOpen.title = "Abrir link no navegador";
    aOpen.textContent = "Abrir";
    acoesWrap.appendChild(aOpen);

    const btnRmLnk = document.createElement("button");
    btnRmLnk.type = "button";
    btnRmLnk.className = "btn-rm-link rm";
    btnRmLnk.dataset.idx = String(idx);
    btnRmLnk.title = "Remover link";
    btnRmLnk.textContent = "✕";
    acoesWrap.appendChild(btnRmLnk);

    tdAcoes.appendChild(acoesWrap);
    tr.appendChild(tdAcoes);

    tbody.appendChild(tr);
  });

  if (!canEdit) {
    tbody.querySelectorAll("button").forEach((el) => el.setAttribute("disabled", "disabled"));
    return;
  }

  tbody.querySelectorAll(".btn-rm-link").forEach((btn) => {
    btn.onclick = (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      activeKaizen.links.splice(i, 1);
      renderLinksTable(activeKaizen.links, true);
      triggerSave();
    };
  });
}

function openLinkModal() {
  $("#formAddLink").reset();
  $("#linkIndexado").checked = true;
  $("#modalAddLink").classList.remove("hidden");
  $("#linkTitulo").focus();
}

function submitAddLink() {
  if (!activeKaizen) return;
  if (!Array.isArray(activeKaizen.links)) activeKaizen.links = [];

  const titulo = $("#linkTitulo").value.trim();
  const url = $("#linkUrl").value.trim();
  const categoria = $("#linkCategoria").value;
  const tags = $("#linkTags").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const descricao = $("#linkDescricao").value.trim();
  const indexado = $("#linkIndexado").checked;

  if (!url.startsWith("https://")) {
    showToast("Por segurança, a URL deve começar com https://", "warn");
    return;
  }

  activeKaizen.links.push({
    id: `lnk-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    titulo,
    url,
    categoria,
    tags,
    descricao,
    indexado,
    criadoEm: new Date().toISOString(),
    criadoPor: currentUser?.uid || ""
  });

  $("#modalAddLink").classList.add("hidden");
  renderLinksTable(activeKaizen.links, true);
  triggerSave();
  showToast("Link adicionado ao projeto.", "ok");
}
