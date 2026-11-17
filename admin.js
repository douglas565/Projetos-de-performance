// ============================================================
// admin.js — Painel Executivo e Gestão de Usuários v2
// ============================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, initThemeToggle, escapeHtml } from "./js/ui.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let currentUser = null;
let currentProfile = null;
let allKaizens = [];
let allUsers = [];
let appConfig = { signupMode: "approval", requireEmailVerification: true };

// Formatação BRL e Percentual
const BRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PCT = (n) => `${(Number(n) || 0).toFixed(0)}%`;

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  setupTabs();
  setupFilters();

  $("#btnLogout").onclick = () => signOut(auth);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    currentUser = user;
    $("#userChip").textContent = user.displayName || user.email;

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        showDenied("Seu perfil de usuário não foi encontrado no Firestore.");
        return;
      }

      currentProfile = snap.data();
      if (currentProfile.status !== "active") {
        showDenied("Sua conta ainda não está ativa. Aguarde aprovação de um administrador.");
        return;
      }
      if (currentProfile.role !== "admin") {
        showDenied(`A conta ${user.email} não possui privilégios de administrador.`);
        return;
      }

      // Usuário é admin ativo: carrega dados
      $("#viewLoading").classList.add("hidden");
      $("#viewAdmin").classList.remove("hidden");

      await Promise.all([loadKaizens(), loadUsers(), loadConfig()]);
      renderDashboard();
    } catch (e) {
      console.error(e);
      showDenied(`Erro ao validar permissões: ${e.message}`);
    }
  });
});

function showDenied(msg) {
  $("#viewLoading")?.classList.add("hidden");
  $("#viewAdmin")?.classList.add("hidden");
  const d = $("#viewDenied");
  if (d) {
    d.classList.remove("hidden");
    const m = $("#deniedMsg");
    if (m) m.textContent = msg;
  }
}

// ============================================================
// 1. NAVEGAÇÃO POR ABAS
// ============================================================
function setupTabs() {
  $$(".admin-tab").forEach((tab) => {
    tab.onclick = () => {
      $$(".admin-tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      const target = tab.dataset.tab;
      $$(".tab-content").forEach((c) => c.classList.add("hidden"));

      if (target === "dashboard") {
        $("#tabDashboard")?.classList.remove("hidden");
        renderDashboard();
      } else if (target === "users") {
        $("#tabUsers")?.classList.remove("hidden");
        renderUsersTable();
      } else if (target === "projects") {
        $("#tabProjects")?.classList.remove("hidden");
        renderProjectsTable();
      } else if (target === "config") {
        $("#tabConfig")?.classList.remove("hidden");
        renderConfig();
      }
    };
  });
}

function setupFilters() {
  ["#fArea", "#fTipo"].forEach((s) => {
    $(s)?.addEventListener("change", renderDashboard);
  });
  $("#btnExport")?.addEventListener("click", exportCSV);

  $("#searchUsers")?.addEventListener("input", renderUsersTable);
  $("#filterUserStatus")?.addEventListener("change", renderUsersTable);

  $("#searchProjectsAdmin")?.addEventListener("input", renderProjectsTable);
  $("#showArchived")?.addEventListener("change", renderProjectsTable);

  $("#btnSaveConfig")?.addEventListener("click", saveConfig);
  $("#btnCheckVersion")?.addEventListener("click", checkPublishedVersion);
}

// ============================================================
// 2. CARREGAMENTO DOS DADOS (FIRESTORE)
// ============================================================
async function loadKaizens() {
  try {
    const snap = await getDocs(query(collection(db, "kaizens"), orderBy("atualizadoEm", "desc")));
    allKaizens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Atualiza filtro de áreas
    const areas = [...new Set(allKaizens.map((k) => k.areaNegocio).filter(Boolean))].sort();
    const sel = $("#fArea");
    if (sel) {
      sel.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = "Todas as áreas";
      sel.appendChild(optAll);
      areas.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = a;
        sel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Erro ao carregar kaizens:", e);
    showToast("Erro ao carregar lista de kaizens.", "danger");
  }
}

async function loadUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (e) {
    console.error("Erro ao carregar usuários:", e);
  }
}

async function loadConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    if (snap.exists()) {
      appConfig = { ...appConfig, ...snap.data() };
    }
  } catch (e) {
    console.warn("Configuração padrão em uso:", e);
  }
}

// ============================================================
// 3. ABA 1: DASHBOARD EXECUTIVO
// ============================================================
function getFilteredKaizens() {
  const fArea = $("#fArea")?.value || "";
  const fTipo = $("#fTipo")?.value || "";

  return allKaizens.filter((k) => {
    if (k.arquivado) return false;
    if (fArea && k.areaNegocio !== fArea) return false;
    if (fTipo && k.tipo !== fTipo) return false;
    return true;
  });
}

function renderDashboard() {
  const lista = getFilteredKaizens();

  // KPIs
  const total = lista.length;
  const concMedia = total ? lista.reduce((a, k) => a + (Number(k.percentual) || 0), 0) / total : 0;
  const hardSaving = lista.filter((k) => k.tipoBeneficio === "hard_saving").reduce((a, k) => a + (Number(k.beneficio) || 0), 0);
  const costAvoidance = lista.filter((k) => k.tipoBeneficio === "cost_avoidance").reduce((a, k) => a + (Number(k.beneficio) || 0), 0);
  const investimento = lista.reduce((a, k) => a + (Number(k.custo) || 0), 0);
  const beneficioTotal = hardSaving + costAvoidance;
  const bcMedio = investimento > 0 ? (beneficioTotal / investimento).toFixed(2) : (beneficioTotal > 0 ? "∞" : "—");
  const pendentesUsers = allUsers.filter((u) => u.status === "pending").length;

  $("#kProj").textContent = String(total);
  $("#kConc").textContent = PCT(concMedia);
  $("#kHard").textContent = BRL(hardSaving);
  $("#kCA").textContent = BRL(costAvoidance);
  $("#kInv").textContent = BRL(investimento);
  $("#kBen").textContent = BRL(beneficioTotal);
  $("#kBcAvg").textContent = bcMedio !== "—" && bcMedio !== "∞" ? `${bcMedio}x` : bcMedio;
  $("#kPending").textContent = String(pendentesUsers);

  // Agrupamento por área de negócio
  const mapAreas = {};
  lista.forEach((k) => {
    const area = k.areaNegocio || "Não informada";
    if (!mapAreas[area]) {
      mapAreas[area] = { area, n: 0, somaPct: 0, hs: 0, ca: 0, inv: 0, ben: 0 };
    }
    const g = mapAreas[area];
    const b = Number(k.beneficio) || 0;
    g.n++;
    g.somaPct += Number(k.percentual) || 0;
    g.inv += Number(k.custo) || 0;
    g.ben += b;
    if (k.tipoBeneficio === "hard_saving") g.hs += b;
    if (k.tipoBeneficio === "cost_avoidance") g.ca += b;
  });

  const resumoAreas = Object.values(mapAreas).map((g) => ({
    ...g,
    conc: g.n ? g.somaPct / g.n : 0
  })).sort((a, b) => b.ben - a.ben);

  renderTabelaArea(resumoAreas);
  renderGraficoNativo(resumoAreas);
}

function renderTabelaArea(resumo) {
  const tbody = $("#tbArea tbody");
  const tfoot = $("#tbArea tfoot");
  if (!tbody || !tfoot) return;

  tbody.innerHTML = "";

  resumo.forEach((g) => {
    const tr = document.createElement("tr");

    const tdArea = document.createElement("td");
    const stArea = document.createElement("strong");
    stArea.textContent = g.area;
    tdArea.appendChild(stArea);

    const tdN = document.createElement("td");
    tdN.className = "num";
    tdN.textContent = String(g.n);

    const tdConc = document.createElement("td");
    tdConc.className = "num";
    tdConc.textContent = PCT(g.conc);

    const tdHs = document.createElement("td");
    tdHs.className = "num";
    tdHs.textContent = BRL(g.hs);

    const tdCa = document.createElement("td");
    tdCa.className = "num";
    tdCa.textContent = BRL(g.ca);

    const tdInv = document.createElement("td");
    tdInv.className = "num";
    tdInv.textContent = BRL(g.inv);

    tr.appendChild(tdArea);
    tr.appendChild(tdN);
    tr.appendChild(tdConc);
    tr.appendChild(tdHs);
    tr.appendChild(tdCa);
    tr.appendChild(tdInv);

    tbody.appendChild(tr);
  });

  const totalN = resumo.reduce((a, g) => a + g.n, 0);
  const totalConc = totalN ? resumo.reduce((a, g) => a + g.somaPct, 0) / totalN : 0;
  const totalHs = resumo.reduce((a, g) => a + g.hs, 0);
  const totalCa = resumo.reduce((a, g) => a + g.ca, 0);
  const totalInv = resumo.reduce((a, g) => a + g.inv, 0);

  tfoot.innerHTML = "";
  const trFoot = document.createElement("tr");

  const tdTotLabel = document.createElement("td");
  tdTotLabel.textContent = "TOTAL";
  const tdTotN = document.createElement("td");
  tdTotN.className = "num";
  tdTotN.textContent = String(totalN);
  const tdTotConc = document.createElement("td");
  tdTotConc.className = "num";
  tdTotConc.textContent = PCT(totalConc);
  const tdTotHs = document.createElement("td");
  tdTotHs.className = "num";
  tdTotHs.textContent = BRL(totalHs);
  const tdTotCa = document.createElement("td");
  tdTotCa.className = "num";
  tdTotCa.textContent = BRL(totalCa);
  const tdTotInv = document.createElement("td");
  tdTotInv.className = "num";
  tdTotInv.textContent = BRL(totalInv);

  trFoot.appendChild(tdTotLabel);
  trFoot.appendChild(tdTotN);
  trFoot.appendChild(tdTotConc);
  trFoot.appendChild(tdTotHs);
  trFoot.appendChild(tdTotCa);
  trFoot.appendChild(tdTotInv);
  tfoot.appendChild(trFoot);
}

function renderGraficoNativo(resumo) {
  const container = $("#chartBarras");
  if (!container) return;
  container.innerHTML = "";

  if (resumo.length === 0) {
    container.textContent = "Nenhum dado disponível para os filtros selecionados.";
    return;
  }

  const maxVal = Math.max(...resumo.map((g) => g.ben), 1);

  resumo.forEach((g) => {
    const row = document.createElement("div");
    row.className = "chart-row";

    const label = document.createElement("div");
    label.className = "chart-label";
    label.title = g.area;
    label.textContent = g.area;

    const wrap = document.createElement("div");
    wrap.className = "chart-bar-wrap";

    const fill = document.createElement("div");
    fill.className = "chart-bar-fill";
    const widthPct = Math.max(2, Math.round((g.ben / maxVal) * 100));
    fill.style.width = `${widthPct}%`;
    wrap.appendChild(fill);

    const val = document.createElement("div");
    val.className = "chart-val";
    val.textContent = BRL(g.ben);

    row.appendChild(label);
    row.appendChild(wrap);
    row.appendChild(val);
    container.appendChild(row);
  });
}

function exportCSV() {
  const lista = getFilteredKaizens();
  const cabecalho = [
    "Código",
    "Projeto",
    "Área de Negócio",
    "Processo / Área",
    "Data",
    "Líder",
    "Participantes",
    "Tipo",
    "Status",
    "% Conclusão",
    "Tipo de Benefício",
    "Benefício Anual (R$)",
    "Custo Implantação (R$)",
    "B/C Ratio",
    "Dono (Nome)",
    "Dono (E-mail)",
    "Nº de Ações",
    "Nº de Riscos",
    "Nº de Links"
  ];

  const linhas = lista.map((k) => [
    k.codigo || "",
    k.projeto || "",
    k.areaNegocio || "",
    k.area || "",
    k.data || "",
    k.lider || "",
    Array.isArray(k.participantes) ? k.participantes.join("; ") : "",
    k.tipo || "kaizen",
    k.status || "em_andamento",
    k.percentual ?? 0,
    k.tipoBeneficio || "",
    k.beneficio || 0,
    k.custo || 0,
    k.bcRatio !== null ? k.bcRatio : "",
    k.ownerNome || "",
    k.ownerEmail || "",
    Array.isArray(k.acoes) ? k.acoes.length : 0,
    Array.isArray(k.riscos) ? k.riscos.length : 0,
    Array.isArray(k.links) ? k.links.length : 0
  ]);

  const csvContent = [cabecalho, ...linhas]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kaizen-hub-portfolio-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  showToast("Relatório CSV exportado com sucesso.", "ok");
}

// ============================================================
// 4. ABA 2: GESTÃO DE USUÁRIOS E APROVAÇÕES
// ============================================================
function renderUsersTable() {
  const tbody = $("#tbUsers tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const term = ($("#searchUsers")?.value || "").trim().toLowerCase();
  const fStatus = $("#filterUserStatus")?.value || "";

  const filtered = allUsers.filter((u) => {
    if (fStatus && u.status !== fStatus) return false;
    if (term) {
      const nome = (u.nome || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      if (!nome.includes(term) && !email.includes(term)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "muted";
    td.style.cssText = "text-align:center;padding:16px";
    td.textContent = "Nenhum usuário encontrado.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach((u) => {
    const tr = document.createElement("tr");

    // Nome
    const tdNome = document.createElement("td");
    const stNome = document.createElement("strong");
    stNome.textContent = u.nome || "—";
    tdNome.appendChild(stNome);

    // E-mail
    const tdEmail = document.createElement("td");
    tdEmail.textContent = u.email || "—";

    // Status
    const tdStatus = document.createElement("td");
    const spanStatus = document.createElement("span");
    spanStatus.className = `badge-user-${u.status || "pending"}`;
    spanStatus.textContent = formatUserStatus(u.status);
    tdStatus.appendChild(spanStatus);

    // Papel
    const tdRole = document.createElement("td");
    const spanRole = document.createElement("span");
    if (u.role === "admin") {
      spanRole.className = "badge-role-admin";
      spanRole.textContent = "Admin";
    } else {
      spanRole.className = "pill";
      spanRole.style.fontSize = "11px";
      spanRole.textContent = "Usuário";
    }
    tdRole.appendChild(spanRole);

    // Data Cadastro
    const tdData = document.createElement("td");
    const dt = u.criadoEm?.toDate ? u.criadoEm.toDate() : new Date(u.criadoEm || Date.now());
    tdData.textContent = dt.toLocaleDateString("pt-BR");

    // Ações
    const tdAcoes = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";

    if (u.status === "pending") {
      const btnAprovar = document.createElement("button");
      btnAprovar.className = "btn small primary";
      btnAprovar.textContent = "Aprovar";
      btnAprovar.onclick = () => updateUserStatus(u.uid, "active");
      wrap.appendChild(btnAprovar);

      const btnRecusar = document.createElement("button");
      btnRecusar.className = "btn small danger";
      btnRecusar.textContent = "Recusar";
      btnRecusar.onclick = () => updateUserStatus(u.uid, "blocked");
      wrap.appendChild(btnRecusar);
    } else if (u.status === "active") {
      const btnBloquear = document.createElement("button");
      btnBloquear.className = "btn small danger";
      btnBloquear.textContent = "Bloquear";
      btnBloquear.onclick = () => updateUserStatus(u.uid, "blocked");
      wrap.appendChild(btnBloquear);
    } else if (u.status === "blocked") {
      const btnDesbloquear = document.createElement("button");
      btnDesbloquear.className = "btn small ghost";
      btnDesbloquear.textContent = "Reativar";
      btnDesbloquear.onclick = () => updateUserStatus(u.uid, "active");
      wrap.appendChild(btnDesbloquear);
    }

    // Alternar papel Admin / Usuário
    if (u.uid !== currentUser.uid) {
      const btnRole = document.createElement("button");
      btnRole.className = "btn small ghost";
      btnRole.textContent = u.role === "admin" ? "Rebaixar p/ User" : "Tornar Admin";
      btnRole.onclick = () => updateUserRole(u.uid, u.role === "admin" ? "user" : "admin");
      wrap.appendChild(btnRole);
    }

    tdAcoes.appendChild(wrap);

    tr.appendChild(tdNome);
    tr.appendChild(tdEmail);
    tr.appendChild(tdStatus);
    tr.appendChild(tdRole);
    tr.appendChild(tdData);
    tr.appendChild(tdAcoes);

    tbody.appendChild(tr);
  });
}

function formatUserStatus(st) {
  const map = {
    pending: "Pendente",
    active: "Ativo",
    blocked: "Bloqueado"
  };
  return map[st] || "Pendente";
}

async function updateUserStatus(uid, newStatus) {
  try {
    await updateDoc(doc(db, "users", uid), {
      status: newStatus,
      atualizadoEm: serverTimestamp()
    });
    const target = allUsers.find((u) => u.uid === uid);
    if (target) target.status = newStatus;
    renderUsersTable();
    showToast(`Status do usuário atualizado para "${formatUserStatus(newStatus)}".`, "ok");
  } catch (e) {
    showToast(`Erro ao atualizar status: ${e.message}`, "danger");
  }
}

async function updateUserRole(uid, newRole) {
  const confirmMsg = newRole === "admin"
    ? "Conceder privilégios de administrador para este usuário?"
    : "Remover privilégios de administrador deste usuário?";
  if (!confirm(confirmMsg)) return;

  try {
    await updateDoc(doc(db, "users", uid), {
      role: newRole,
      atualizadoEm: serverTimestamp()
    });
    const target = allUsers.find((u) => u.uid === uid);
    if (target) target.role = newRole;
    renderUsersTable();
    showToast(`Papel atualizado para "${newRole}".`, "ok");
  } catch (e) {
    showToast(`Erro ao atualizar papel: ${e.message}`, "danger");
  }
}

// ============================================================
// 5. ABA 3: TODOS OS KAIZENS
// ============================================================
function renderProjectsTable() {
  const tbody = $("#tbProjects tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const term = ($("#searchProjectsAdmin")?.value || "").trim().toLowerCase();
  const showArchived = $("#showArchived")?.checked || false;

  const filtered = allKaizens.filter((k) => {
    if (!showArchived && k.arquivado) return false;
    if (term) {
      const matchText = (k.projeto || "").toLowerCase().includes(term) ||
                        (k.codigo || "").toLowerCase().includes(term) ||
                        (k.lider || "").toLowerCase().includes(term) ||
                        (k.areaNegocio || "").toLowerCase().includes(term);
      if (!matchText) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "muted";
    td.style.cssText = "text-align:center;padding:16px";
    td.textContent = "Nenhum projeto encontrado.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach((k) => {
    const tr = document.createElement("tr");
    if (k.arquivado) tr.style.opacity = "0.6";

    // Código
    const tdCode = document.createElement("td");
    tdCode.style.cssText = "font-family:monospace;font-weight:700";
    tdCode.textContent = k.codigo || "—";

    // Projeto
    const tdProj = document.createElement("td");
    const stProj = document.createElement("strong");
    stProj.textContent = k.projeto || "Sem título";
    tdProj.appendChild(stProj);

    // Área
    const tdArea = document.createElement("td");
    tdArea.textContent = k.areaNegocio || "—";

    // Proprietário
    const tdOwner = document.createElement("td");
    tdOwner.textContent = k.ownerNome || k.ownerEmail || "—";

    // % Concluída
    const tdPct = document.createElement("td");
    tdPct.className = "num";
    tdPct.textContent = `${k.percentual ?? 0}%`;

    // Benefício
    const tdBen = document.createElement("td");
    if (k.tipoBeneficio === "hard_saving") {
      const badge = document.createElement("span");
      badge.className = "badge-hs";
      badge.textContent = "HS";
      tdBen.appendChild(badge);
    } else if (k.tipoBeneficio === "cost_avoidance") {
      const badge = document.createElement("span");
      badge.className = "badge-ca";
      badge.textContent = "CA";
      tdBen.appendChild(badge);
    } else {
      tdBen.textContent = "—";
    }

    // Valor (R$)
    const tdVal = document.createElement("td");
    tdVal.className = "num";
    tdVal.textContent = BRL(k.beneficio);

    // Rev
    const tdRev = document.createElement("td");
    tdRev.className = "num";
    tdRev.textContent = String(k.rev || 1);

    // Ações
    const tdAcoes = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:6px";

    const btnPrint = document.createElement("a");
    btnPrint.href = `print.html?id=${encodeURIComponent(k.id)}`;
    btnPrint.target = "_blank";
    btnPrint.className = "btn small ghost";
    btnPrint.textContent = "🖨️";
    btnPrint.title = "Imprimir Kaizen";
    wrap.appendChild(btnPrint);

    if (k.arquivado) {
      const btnRestore = document.createElement("button");
      btnRestore.className = "btn small primary";
      btnRestore.textContent = "Restaurar";
      btnRestore.onclick = async () => {
        await updateDoc(doc(db, "kaizens", k.id), { arquivado: false, atualizadoEm: serverTimestamp() });
        k.arquivado = false;
        renderProjectsTable();
        showToast("Projeto restaurado.", "ok");
      };
      wrap.appendChild(btnRestore);
    } else {
      const btnHard = document.createElement("button");
      btnHard.className = "btn small danger";
      btnHard.textContent = "Excluir";
      btnHard.title = "Excluir definitivamente do banco";
      btnHard.onclick = async () => {
        if (!confirm(`Excluir definitivamente o Kaizen "${k.projeto}" do banco de dados?`)) return;
        await deleteDoc(doc(db, "kaizens", k.id));
        allKaizens = allKaizens.filter((item) => item.id !== k.id);
        renderProjectsTable();
        showToast("Projeto excluído em definitivo.", "ok");
      };
      wrap.appendChild(btnHard);
    }

    tdAcoes.appendChild(wrap);

    tr.appendChild(tdCode);
    tr.appendChild(tdProj);
    tr.appendChild(tdArea);
    tr.appendChild(tdOwner);
    tr.appendChild(tdPct);
    tr.appendChild(tdBen);
    tr.appendChild(tdVal);
    tr.appendChild(tdRev);
    tr.appendChild(tdAcoes);

    tbody.appendChild(tr);
  });
}

// ============================================================
// 6. ABA 4: CONFIGURAÇÕES DO SISTEMA
// ============================================================
function renderConfig() {
  const selSignup = $("#cfgSignupMode");
  const selEmail = $("#cfgRequireEmail");
  if (selSignup) selSignup.value = appConfig.signupMode || "approval";
  if (selEmail) selEmail.value = String(appConfig.requireEmailVerification !== false);

  $("#infoVersion").textContent = "v2.0.0 (build 20261117-01)";
}

async function saveConfig() {
  const signupMode = $("#cfgSignupMode")?.value || "approval";
  const requireEmailVerification = $("#cfgRequireEmail")?.value === "true";

  const msg = $("#configMsg");
  if (msg) {
    msg.className = "msg";
    msg.textContent = "Salvando...";
  }

  try {
    await setDoc(doc(db, "config", "app"), {
      signupMode,
      requireEmailVerification,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: currentUser.uid
    }, { merge: true });

    appConfig.signupMode = signupMode;
    appConfig.requireEmailVerification = requireEmailVerification;

    if (msg) {
      msg.className = "msg ok";
      msg.textContent = "Configurações salvas no Firestore.";
    }
    showToast("Configurações atualizadas com sucesso.", "ok");
  } catch (e) {
    if (msg) {
      msg.className = "msg err";
      msg.textContent = `Erro ao salvar: ${e.message}`;
    }
  }
}

async function checkPublishedVersion() {
  const msg = $("#versionMsg");
  if (msg) msg.textContent = "Consultando version.json no servidor...";

  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (msg) {
      msg.textContent = `Versão publicada no servidor: ${data.version} (${data.build || "sem build"}), atualizada em ${data.updatedAt || "—"}.`;
    }
  } catch (e) {
    if (msg) msg.textContent = `Falha ao consultar version.json: ${e.message}`;
  }
}
