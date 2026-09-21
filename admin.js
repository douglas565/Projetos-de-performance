// ============================================================
//  admin.js — Painel executivo (somente administradores)
// ============================================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collectionGroup, getDocs, query, arrayUnion, arrayRemove }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

const BRL = (n) => (Number(n) || 0).toLocaleString("pt-BR",
  { style: "currency", currency: "BRL" });
const PCT = (n) => (Number(n) || 0).toFixed(0) + "%";

const CORES = ["#0a66ff","#00c2ff","#17a673","#e8a300","#8b5cf6","#e04141","#0ea5e9","#f97316"];

let TODOS = [];      // todos os projetos do tenant
let ADMINS = [];     // e-mails administradores
let charts = {};

// ============================================================
//  1. Autenticação + verificação de administrador
// ============================================================
$("#btnLogout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "index.html"; return; }
  $("#userChip").textContent = user.displayName || user.email;

  try {
    const snap = await getDoc(doc(db, "config", "admins"));
    ADMINS = snap.exists() ? (snap.data().emails || []) : [];

    // Bootstrap: se a lista estiver vazia, o 1º acesso vira administrador
    if (ADMINS.length === 0) {
      ADMINS = [user.email.toLowerCase()];
      await setDoc(doc(db, "config", "admins"), { emails: ADMINS });
      toast("Você foi registrado como o primeiro administrador.");
    }

    if (!ADMINS.includes((user.email || "").toLowerCase())) {
      hide($("#viewLoading"));
      $("#deniedMsg").textContent =
        `A conta ${user.email} não tem permissão para o painel executivo.`;
      show($("#viewDenied"));
      return;
    }

    await carregarProjetos();
    hide($("#viewLoading"));
    show($("#viewAdmin"));
    render();
  } catch (e) {
    hide($("#viewLoading"));
    $("#deniedMsg").textContent = "Erro ao carregar: " + e.message;
    show($("#viewDenied"));
    console.error(e);
  }
});

// ============================================================
//  2. Carregar TODOS os projetos (collectionGroup)
// ============================================================
async function carregarProjetos() {
  const snap = await getDocs(query(collectionGroup(db, "projetos")));
  TODOS = snap.docs.map(d => {
    const p = d.data();
    return {
      id: d.id,
      uid: d.ref.parent.parent.id,
      area: p.areaNegocio || "Não informada",
      nome: p.projeto || "Sem título",
      pct: Number(p.percentual) || 0,
      lider: p.lider || "—",
      invest: Number(p.custo) || 0,
      tipo: p.tipo || "Kaizen",
      benef: Number(p.beneficio) || 0,
      acoes: Array.isArray(p.acoes) ? p.acoes : [],
      atualizado: p.atualizadoEm?.toDate ? p.atualizadoEm.toDate() : null
    };
  });

  // popula filtro de áreas
  const areas = [...new Set(TODOS.map(p => p.area))].sort();
  $("#fArea").innerHTML = '<option value="">Todas as áreas</option>' +
    areas.map(a => `<option>${esc(a)}</option>`).join("");
}

const esc = (s) => String(s ?? "").replace(/[<>&]/g,
  c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));

// ============================================================
//  3. Filtros e render
// ============================================================
["#fArea","#fTipo","#fBusca"].forEach(sel => {
  const el = $(sel);
  el.addEventListener(sel === "#fBusca" ? "input" : "change", render);
});

function filtrados() {
  const a = $("#fArea").value, t = $("#fTipo").value;
  const b = $("#fBusca").value.toLowerCase();
  return TODOS.filter(p =>
    (!a || p.area === a) &&
    (!t || p.tipo === t) &&
    (!b || p.nome.toLowerCase().includes(b) || p.lider.toLowerCase().includes(b))
  );
}

function render() {
  const lista = filtrados();
  renderKPIs(lista);
  const resumo = agruparPorArea(lista);
  renderTabelaArea(resumo);
  renderGraficos(resumo);
  renderTabelaProjetos(lista);
}

// ---------- KPIs (mesmas fórmulas da planilha) ----------
function renderKPIs(l) {
  const n = l.length;
  const conc = n ? l.reduce((a,p) => a + p.pct, 0) / n : 0;   // MÉDIA(% concluída)
  const inv  = l.reduce((a,p) => a + p.invest, 0);            // SOMA(Investimento)
  const ben  = l.reduce((a,p) => a + p.benef, 0);             // SOMA(Benef. Financ.)
  $("#kProj").textContent = n;
  $("#kConc").textContent = PCT(conc);
  $("#kInv").textContent  = BRL(inv);
  $("#kBen").textContent  = BRL(ben);
}

// ---------- Resumo por área ----------
function agruparPorArea(l) {
  const m = {};
  l.forEach(p => {
    (m[p.area] ??= { area: p.area, n: 0, soma: 0, inv: 0, ben: 0 });
    const g = m[p.area];
    g.n++; g.soma += p.pct; g.inv += p.invest; g.ben += p.benef;
  });
  return Object.values(m)
    .map(g => ({ ...g, conc: g.n ? g.soma / g.n : 0 }))
    .sort((a,b) => b.n - a.n);
}

function renderTabelaArea(r) {
  $("#tbArea tbody").innerHTML = r.map(g => `
    <tr>
      <td><strong>${esc(g.area)}</strong></td>
      <td class="num">${g.n}</td>
      <td>
        <div class="mini-bar">
          <div class="bar"><span style="width:${g.conc}%"></span></div>
          <span>${PCT(g.conc)}</span>
        </div>
      </td>
      <td class="num">${BRL(g.inv)}</td>
      <td class="num">${BRL(g.ben)}</td>
    </tr>`).join("");

  const tn = r.reduce((a,g) => a + g.n, 0);
  const tc = tn ? r.reduce((a,g) => a + g.soma, 0) / tn : 0;
  $("#tbArea tfoot").innerHTML = `
    <tr>
      <td>TOTAL</td>
      <td class="num">${tn}</td>
      <td>${PCT(tc)}</td>
      <td class="num">${BRL(r.reduce((a,g) => a + g.inv, 0))}</td>
      <td class="num">${BRL(r.reduce((a,g) => a + g.ben, 0))}</td>
    </tr>`;
}

// ---------- Gráficos ----------
function novoChart(id, cfg) {
  charts[id]?.destroy();
  charts[id] = new Chart($("#" + id), cfg);
}

function renderGraficos(r) {
  const labels = r.map(g => g.area);
  const cores  = labels.map((_, i) => CORES[i % CORES.length]);
  const base   = { responsive: true, maintainAspectRatio: false };

  novoChart("chConclusao", {
    type: "bar",
    data: { labels, datasets: [{ label: "Conclusão média (%)",
            data: r.map(g => +g.conc.toFixed(1)), backgroundColor: cores, borderRadius: 6 }] },
    options: { ...base, indexAxis: "y",
      scales: { x: { min: 0, max: 100, ticks: { callback: v => v + "%" } } },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => c.parsed.x + "%" } } } }
  });

  novoChart("chProjetos", {
    type: "doughnut",
    data: { labels, datasets: [{ data: r.map(g => g.n), backgroundColor: cores }] },
    options: { ...base, cutout: "58%", plugins: { legend: { position: "right" } } }
  });

  novoChart("chBeneficio", {
    type: "bar",
    data: { labels, datasets: [{ label: "Benefício (R$)",
            data: r.map(g => g.ben), backgroundColor: "#17a673", borderRadius: 6 }] },
    options: { ...base, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: c => BRL(c.parsed.y) } } },
      scales: { y: { ticks: { callback: v => "R$ " + (v/1000) + "k" } } } }
  });

  novoChart("chInvBen", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Investimento", data: r.map(g => g.inv), backgroundColor: "#e8a300", borderRadius: 6 },
      { label: "Benefício",    data: r.map(g => g.ben), backgroundColor: "#0a66ff", borderRadius: 6 }
    ]},
    options: { ...base, plugins: { tooltip: { callbacks: { label: c => c.dataset.label + ": " + BRL(c.parsed.y) } } },
      scales: { y: { ticks: { callback: v => "R$ " + (v/1000) + "k" } } } }
  });
}

// ---------- Tabela de projetos + plano de ação ----------
const classeStatus = (s) => ({
  "Concluída": "st-ok", "Em andamento": "st-run", "Atrasada": "st-late"
}[s] || "st-new");

function renderTabelaProjetos(l) {
  const ordenada = [...l].sort((a,b) =>
    a.area.localeCompare(b.area) || b.pct - a.pct);

  $("#tbProjetos tbody").innerHTML = ordenada.map((p, i) => {
    const acoes = p.acoes.filter(a => (a.desc || "").trim());
    const linha = `
      <tr>
        <td>${acoes.length ? `<button class="expander" data-i="${i}">▸</button>` : ""}</td>
        <td>${esc(p.area)}</td>
        <td><strong>${esc(p.nome)}</strong></td>
        <td>
          <div class="mini-bar">
            <div class="bar"><span style="width:${p.pct}%"></span></div>
            <span>${PCT(p.pct)}</span>
          </div>
        </td>
        <td>${esc(p.lider)}</td>
        <td class="num">${BRL(p.invest)}</td>
        <td><span class="tag">${esc(p.tipo)}</span></td>
        <td class="num">${p.benef ? BRL(p.benef) : "TBD"}</td>
        <td class="num">${acoes.length}</td>
      </tr>`;

    const sub = acoes.length ? `
      <tr class="sub hidden" data-sub="${i}">
        <td colspan="9">
          <ol class="sub-actions">
            ${acoes.map(a => `<li>${esc(a.desc)}
              ${a.resp ? " · " + esc(a.resp) : ""}
              ${a.prazo ? " · " + new Date(a.prazo + "T00:00").toLocaleDateString("pt-BR") : ""}
              <span class="st ${classeStatus(a.status)}">${esc(a.status || "Não iniciada")}</span>
            </li>`).join("")}
          </ol>
        </td>
      </tr>` : "";

    return linha + sub;
  }).join("");

  $$(".expander").forEach(b => b.onclick = () => {
    const tr = $(`tr[data-sub="${b.dataset.i}"]`);
    tr.classList.toggle("hidden");
    b.textContent = tr.classList.contains("hidden") ? "▸" : "▾";
  });
}

// ============================================================
//  4. Exportar CSV
// ============================================================
$("#btnExport").onclick = () => {
  const l = filtrados();
  const cab = ["Área de negócio","Nome","% concluída","Atribuída a",
               "Investimento","Tipo","Benef. Financ. (R$)","Nº de ações"];
  const linhas = l.map(p => [p.area, p.nome, (p.pct/100).toFixed(2), p.lider,
                             p.invest, p.tipo, p.benef,
                             p.acoes.filter(a => (a.desc||"").trim()).length]);
  const csv = [cab, ...linhas]
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n");

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `portfolio-projetos-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast("CSV exportado.");
};

// ============================================================
//  5. Gestão de administradores
// ============================================================
$("#btnAdmins").onclick = () => { renderAdmins(); show($("#modalAdmins")); };
$("#btnCloseAdmins").onclick = () => hide($("#modalAdmins"));
$("#modalAdmins").onclick = (e) => { if (e.target.id === "modalAdmins") hide($("#modalAdmins")); };

function renderAdmins() {
  $("#adminList").innerHTML = ADMINS.map(e => `
    <li><span>${esc(e)}</span>
      ${ADMINS.length > 1 ? `<button class="rm" data-email="${esc(e)}">✕</button>` : ""}
    </li>`).join("");
  $$("#adminList .rm").forEach(b => b.onclick = () => removerAdmin(b.dataset.email));
}

$("#btnAddAdmin").onclick = async () => {
  const email = $("#newAdmin").value.trim().toLowerCase();
  const msg = $("#adminMsg");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    msg.className = "msg err"; msg.textContent = "E-mail inválido."; return;
  }
  if (ADMINS.includes(email)) {
    msg.className = "msg err"; msg.textContent = "Já é administrador."; return;
  }
  await setDoc(doc(db, "config", "admins"), { emails: arrayUnion(email) }, { merge: true });
  ADMINS.push(email);
  $("#newAdmin").value = "";
  msg.className = "msg ok"; msg.textContent = "Administrador adicionado.";
  renderAdmins();
};

async function removerAdmin(email) {
  if (!confirm(`Remover ${email} dos administradores?`)) return;
  await setDoc(doc(db, "config", "admins"), { emails: arrayRemove(email) }, { merge: true });
  ADMINS = ADMINS.filter(e => e !== email);
  renderAdmins();
  toast("Administrador removido.");
}

// ============================================================
//  6. Toast
// ============================================================
let tTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; show(t);
  clearTimeout(tTimer);
  tTimer = setTimeout(() => hide(t), 2800);
}
