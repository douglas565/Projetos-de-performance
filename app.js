// ============================================================
//  app.js — Kaizen Hub (Auth + Firestore + autosave)
// ============================================================
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, addDoc, setDoc, getDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- atalhos ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

let currentUser = null;
let currentProjectId = null;
let unsubProjects = null;
let saveTimer = null;
let cacheProjects = [];

// ============================================================
//  1. AUTENTICAÇÃO
// ============================================================
let authMode = "signin";

$$(".tab").forEach(t => t.onclick = () => {
  $$(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  authMode = t.dataset.tab;
  $("#btnAuth").textContent = authMode === "signin" ? "Entrar" : "Criar conta";
  $("#nameField").classList.toggle("hidden", authMode === "signin");
  $("#authMsg").textContent = "";
});

$("#formAuth").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  const pass  = $("#password").value;
  const msg = $("#authMsg");
  msg.className = "msg"; msg.textContent = "Processando...";
  try {
    if (authMode === "signin") {
      await signInWithEmailAndPassword(auth, email, pass);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const nome = $("#displayName").value.trim();
      if (nome) await updateProfile(cred.user, { displayName: nome });
    }
    msg.textContent = "";
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = traduzErro(err.code);
  }
});

$("#btnReset").onclick = async () => {
  const email = $("#email").value.trim();
  const msg = $("#authMsg");
  if (!email) { msg.className = "msg err"; msg.textContent = "Informe o e-mail primeiro."; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    msg.className = "msg ok"; msg.textContent = "E-mail de redefinição enviado.";
  } catch (err) { msg.className = "msg err"; msg.textContent = traduzErro(err.code); }
};

$("#btnLogout").onclick = () => signOut(auth);

function traduzErro(code) {
  const m = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "Senha fraca (mínimo 6 caracteres).",
    "auth/too-many-requests": "Muitas tentativas. Tente mais tarde."
  };
  return m[code] || "Erro: " + code;
}

// ---------- link do painel executivo (só administradores) ----------
async function checarAdmin(user) {
  const link = $("#linkAdmin");
  if (!link) return;
  try {
    const s = await getDoc(doc(db, "config", "admins"));
    const admins = s.exists() ? (s.data().emails || []) : [];
    if (admins.length === 0 || admins.includes((user.email || "").toLowerCase())) {
      show(link);
    } else {
      hide(link);
    }
  } catch (e) {
    hide(link);
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    hide($("#viewLogin")); show($("#topbar"));
    $("#userChip").textContent = user.displayName || user.email;
    checarAdmin(user);
    abrirHub();
  } else {
    $("#linkAdmin")?.classList.add("hidden");
    if (unsubProjects) unsubProjects();
    hide($("#topbar")); hide($("#viewHub")); hide($("#viewProject"));
    show($("#viewLogin"));
    $("#formAuth").reset();
  }
});

// ============================================================
//  2. HUB DE PROJETOS
// ============================================================
const projCol = () => collection(db, "users", currentUser.uid, "projetos");

function abrirHub() {
  currentProjectId = null;
  hide($("#viewProject")); show($("#viewHub"));
  $("#viewLabel").textContent = "Meus projetos";
  $("#saveStatus").textContent = "";
  if (unsubProjects) unsubProjects();
  unsubProjects = onSnapshot(query(projCol(), orderBy("atualizadoEm", "desc")), (snap) => {
    cacheProjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProjects();
  });
}

$("#searchProjects").oninput = renderProjects;

function renderProjects() {
  const termo = $("#searchProjects").value.toLowerCase();
  const lista = cacheProjects.filter(p =>
    (p.projeto || "").toLowerCase().includes(termo) ||
    (p.area || "").toLowerCase().includes(termo) ||
    (p.lider || "").toLowerCase().includes(termo));

  $("#hubCount").textContent = `${cacheProjects.length} projeto(s) · conclusão média ${mediaConclusao()}%`;
  $("#projectGrid").innerHTML = lista.map(p => cardHTML(p)).join("");
  $("#emptyState").classList.toggle("hidden", cacheProjects.length > 0);
  $$(".pcard").forEach(c => c.onclick = () => abrirProjeto(c.dataset.id));
}

function mediaConclusao() {
  if (!cacheProjects.length) return 0;
  const s = cacheProjects.reduce((a, p) => a + (Number(p.percentual) || 0), 0);
  return Math.round(s / cacheProjects.length);
}

function cardHTML(p) {
  const pct = Number(p.percentual) || 0;
  const data = p.atualizadoEm?.toDate ? p.atualizadoEm.toDate().toLocaleString("pt-BR") : "—";
  return `<article class="pcard" data-id="${p.id}">
    <div class="tagrow">
      ${p.areaNegocio ? `<span class="tag">${esc(p.areaNegocio)}</span>` : ""}
      <span class="tag">${esc(p.tipo || "Kaizen")}</span>
    </div>
    <h3>${esc(p.projeto || "Projeto sem título")}</h3>
    <div class="meta">${esc(p.area || "Área não definida")} · Líder: ${esc(p.lider || "—")}</div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <div class="meta"><strong>${pct}%</strong> concluído · atualizado em ${data}</div>
  </article>`;
}
const esc = (s) => String(s ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// ---------- novo projeto (modelo Kaizen em branco) ----------
$("#btnNewProject").onclick = async () => {
  const ref = await addDoc(projCol(), modeloKaizen());
  abrirProjeto(ref.id);
  toast("Novo Kaizen criado — preencha, o salvamento é automático.");
};

$("#btnFirstProject")?.addEventListener("click", () => $("#btnNewProject").click());

function modeloKaizen() {
  return {
    projeto: "Novo projeto Kaizen",
    area: "", data: new Date().toISOString().slice(0, 10),
    lider: currentUser.displayName || currentUser.email,
    participantes: "", areaNegocio: "", percentual: 0, tipo: "Kaizen",
    pilar_seguranca: false, pilar_qualidade: false, pilar_entrega: false,
    pilar_lucratividade: false, pilar_pessoas: false,
    incomodo: "", meta: "", monitoramento: "", causas: "",
    w_what: "", w_where: "", w_when: "", w_who: "", w_why: "", w_how: "", w_howmuch: "",
    acoes: [
      { desc: "", resp: "", prazo: "", status: "Não iniciada" },
      { desc: "", resp: "", prazo: "", status: "Não iniciada" },
      { desc: "", resp: "", prazo: "", status: "Não iniciada" }
    ],
    riscos: [{ desc: "", sev: 1, prob: 1, acao: "", resp: "" }],
    padronizacao: "", aprovacao: "", expansao: false, expansaoArea: "",
    beneficio: "", custo: "", bcObs: "",
    criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
  };
}

// ============================================================
//  3. EDITOR + AUTOSAVE
// ============================================================
async function abrirProjeto(id) {
  currentProjectId = id;
  const snap = await getDoc(doc(db, "users", currentUser.uid, "projetos", id));
  if (!snap.exists()) { toast("Projeto não encontrado."); return; }
  preencherForm(snap.data());
  hide($("#viewHub")); show($("#viewProject"));
  $("#viewLabel").textContent = "Editando Kaizen";
  window.scrollTo(0, 0);
}

$("#btnBack").onclick = async () => { await salvarAgora(); abrirHub(); };
$("#btnPrint").onclick = () => window.print();

$("#btnDelete").onclick = async () => {
  if (!confirm("Excluir este projeto definitivamente?")) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "projetos", currentProjectId));
  toast("Projeto excluído."); abrirHub();
};

function preencherForm(d) {
  $$("[data-f]").forEach(el => {
    const v = d[el.dataset.f];
    if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
  });
  renderAcoes(d.acoes || []);
  renderRiscos(d.riscos || []);
  calcBC();
  $("#pillUpdated").textContent = d.atualizadoEm?.toDate
    ? "Salvo em " + d.atualizadoEm.toDate().toLocaleString("pt-BR") : "Rascunho";
}

function coletarForm() {
  const o = {};
  $$("[data-f]").forEach(el => {
    o[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
  });
  o.percentual = Number(o.percentual) || 0;
  o.acoes = [...$$("#actionTable tbody tr")].map(tr => ({
    desc: tr.querySelector(".a-desc").value,
    resp: tr.querySelector(".a-resp").value,
    prazo: tr.querySelector(".a-prazo").value,
    status: tr.querySelector(".a-status").value
  }));
  o.riscos = [...$$("#riskTable tbody tr")].map(tr => ({
    desc: tr.querySelector(".r-desc").value,
    sev: Number(tr.querySelector(".r-sev").value),
    prob: Number(tr.querySelector(".r-prob").value),
    acao: tr.querySelector(".r-acao").value,
    resp: tr.querySelector(".r-resp").value
  }));
  o.atualizadoEm = serverTimestamp();
  return o;
}

// -------- autosave com debounce (900 ms) --------
function agendarSalvar() {
  if (!currentProjectId) return;
  status("Salvando...", "saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(salvarAgora, 900);
}

async function salvarAgora() {
  if (!currentProjectId) return;
  clearTimeout(saveTimer);
  try {
    await setDoc(doc(db, "users", currentUser.uid, "projetos", currentProjectId),
                 coletarForm(), { merge: true });
    status("Salvo ✓", "saved");
    $("#pillUpdated").textContent = "Salvo em " + new Date().toLocaleString("pt-BR");
  } catch (e) {
    status("Erro ao salvar", "");
    console.error(e);
  }
}

function status(txt, cls) {
  const el = $("#saveStatus");
  el.textContent = txt; el.className = "save-status " + cls;
}

$("#kaizenForm").addEventListener("input", (e) => {
  if (e.target.closest("#riskTable")) atualizarScores();
  calcBC();
  agendarSalvar();
});
$("#kaizenForm").addEventListener("change", () => { marcarLinhas(); agendarSalvar(); });
window.addEventListener("beforeunload", () => { if (saveTimer) salvarAgora(); });

// ============================================================
//  4. TABELAS DINÂMICAS
// ============================================================
const STATUS = ["Não iniciada", "Em andamento", "Concluída", "Atrasada"];

function renderAcoes(lista) {
  const tb = $("#actionTable tbody");
  tb.innerHTML = "";
  lista.forEach(a => tb.appendChild(linhaAcao(a)));
  renumerar(); marcarLinhas();
}

function linhaAcao(a = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="num"></td>
    <td><input class="a-desc" type="text" value="${esc(a.desc || "")}" placeholder="Descrição da ação"></td>
    <td><input class="a-resp" type="text" value="${esc(a.resp || "")}" placeholder="Responsável"></td>
    <td><input class="a-prazo" type="date" value="${a.prazo || ""}"></td>
    <td><select class="a-status">${STATUS.map(s =>
        `<option ${s === (a.status || "Não iniciada") ? "selected" : ""}>${s}</option>`).join("")}</select></td>
    <td><button type="button" class="rm" title="Remover">✕</button></td>`;
  tr.querySelector(".rm").onclick = () => { tr.remove(); renumerar(); agendarSalvar(); };
  return tr;
}

$("#btnAddAction").onclick = () => {
  $("#actionTable tbody").appendChild(linhaAcao());
  renumerar(); agendarSalvar();
};

const renumerar = () => $$("#actionTable tbody tr").forEach((tr, i) => tr.querySelector(".num").textContent = i + 1);
const marcarLinhas = () => $$("#actionTable tbody tr").forEach(tr =>
  tr.classList.toggle("done", tr.querySelector(".a-status")?.value === "Concluída"));

$("#btnCalcPct").onclick = () => {
  const linhas = [...$$("#actionTable tbody tr")].filter(tr => tr.querySelector(".a-desc").value.trim());
  if (!linhas.length) { toast("Cadastre ações no plano primeiro."); return; }
  const ok = linhas.filter(tr => tr.querySelector(".a-status").value === "Concluída").length;
  $("[data-f='percentual']").value = Math.round(ok / linhas.length * 100);
  agendarSalvar(); toast("% concluída recalculada pelo plano de ação.");
};

function renderRiscos(lista) {
  const tb = $("#riskTable tbody");
  tb.innerHTML = "";
  lista.forEach(r => tb.appendChild(linhaRisco(r)));
  atualizarScores();
}

function linhaRisco(r = {}) {
  const opt = (n, sel) => `<option value="${n}" ${n == sel ? "selected" : ""}>${n}</option>`;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="r-desc" type="text" value="${esc(r.desc || "")}" placeholder="Descrição do risco"></td>
    <td><select class="r-sev">${[1,2,3,4].map(n => opt(n, r.sev || 1)).join("")}</select></td>
    <td><select class="r-prob">${[1,2,3,4].map(n => opt(n, r.prob || 1)).join("")}</select></td>
    <td class="score">—</td>
    <td><input class="r-acao" type="text" value="${esc(r.acao || "")}" placeholder="Mitigação"></td>
    <td><input class="r-resp" type="text" value="${esc(r.resp || "")}" placeholder="Responsável"></td>
    <td><button type="button" class="rm">✕</button></td>`;
  tr.querySelector(".rm").onclick = () => { tr.remove(); agendarSalvar(); };
  return tr;
}

$("#btnAddRisk").onclick = () => {
  $("#riskTable tbody").appendChild(linhaRisco());
  atualizarScores(); agendarSalvar();
};

function atualizarScores() {
  $$("#riskTable tbody tr").forEach(tr => {
    const s = Number(tr.querySelector(".r-sev").value) * Number(tr.querySelector(".r-prob").value);
    const td = tr.querySelector(".score");
    td.textContent = s;
    td.style.color = s >= 9 ? "var(--danger)" : s >= 4 ? "var(--warn)" : "var(--ok)";
    td.style.fontWeight = "700";
  });
}

function calcBC() {
  const b = Number($("[data-f='beneficio']").value) || 0;
  const c = Number($("[data-f='custo']").value) || 0;
  $("#bcRatio").value = c > 0 ? (b / c).toFixed(2) : (b > 0 ? "∞" : "—");
}

// ============================================================
//  5. TOAST
// ============================================================
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; show(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(t), 2800);
}
