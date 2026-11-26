// ============================================================
// js/share.js — Compartilhamento de Kaizen e Diretório de Usuários
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  syncSharingLists,
  normalizeKaizenSharing,
  getDirectoryShareStatus,
  prepareKaizenSharingSave,
  isBareEmail,
  directoryLookupMessage
} from "./kaizen-model.js";
import { showToast } from "./ui.js";

/**
 * Busca usuários ativos no diretório público (directory/) por e-mail ou nome
 */
export async function searchDirectoryUsers(term) {
  const cleanTerm = (term || "").trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) return [];

  const dirRef = collection(db, "directory");
  const results = [];

  if (isBareEmail(cleanTerm)) {
    try {
      const exactMatches = await getDocs(query(dirRef, where("email", "==", cleanTerm), limit(50)));
      const users = exactMatches.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => getDirectoryShareStatus(item) === "active");
      results.push(...users.map((user) => ({ uid: user.uid, email: user.email || "", nome: user.nome || user.email || "" })));
    } catch (err) {
      console.error("Erro ao buscar usuário por e-mail no diretório:", err);
    }
    return results;
  }

  try {
    const snap = await getDocs(query(dirRef, limit(50)));
    for (const d of snap.docs) {
      const user = { id: d.id, ...d.data() };
      if (getDirectoryShareStatus(user) !== "active") continue;
      if ((user.nome || "").toLowerCase().includes(cleanTerm)) {
        results.push({ uid: user.uid, email: user.email || "", nome: user.nome || user.email || "" });
      }
    }
    return results;
  } catch (err) {
    console.error("Erro ao buscar usuários no diretório:", err);
    return [];
  }
}

/**
 * Consulta exata por e-mail e classifica o resultado:
 * { status: "active" | "inactive" | "legacy" | "missing" | "invalid", user }
 */
export async function lookupDirectoryRecipient(term) {
  const email = (term || "").trim().toLowerCase();
  if (!isBareEmail(email)) return { status: "invalid", user: null };
  const snap = await getDocs(query(collection(db, "directory"), where("email", "==", email), limit(5)));
  const docs = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  if (docs.length === 0) return { status: "missing", user: null };

  const active = docs.find((item) => getDirectoryShareStatus(item) === "active");
  if (active) {
    return {
      status: "active",
      user: { uid: active.uid, email: active.email || email, nome: active.nome || email.split("@")[0] }
    };
  }
  if (docs.some((item) => getDirectoryShareStatus(item) === "legacy")) return { status: "legacy", user: null };
  return { status: "inactive", user: null };
}

/**
 * Compat: devolve o usuário apenas quando ele pode receber acesso
 */
export async function resolveDirectoryUserByEmail(term) {
  const lookup = await lookupDirectoryRecipient(term);
  return lookup.status === "active" ? lookup.user : null;
}

/**
 * Abre o modal de compartilhamento para o Kaizen atual
 */
export function openSharingModal({ kaizen, currentUser, onSaveShares }) {
  let modal = document.getElementById("modalShare");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalShare";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-labelledby="shareModalTitle">
        <div class="card-head">
          <h4 id="shareModalTitle">Compartilhar Kaizen</h4>
          <button type="button" id="btnCloseShare" class="rm" aria-label="Fechar">✕</button>
        </div>
        <p class="hint">
          Defina quem pode visualizar ou editar este projeto. Por padrão, cada Kaizen é privado.
        </p>

        <div style="margin:16px 0">
          <label for="shareUserSearch" style="margin-bottom:6px">Adicionar colega (por e-mail ou nome)
            <div style="display:flex;gap:8px;margin-top:6px">
              <input type="text" id="shareUserSearch" placeholder="Digite para buscar..." autocomplete="off">
              <select id="shareNewRole" style="width:130px;margin-top:0">
                <option value="view">Visualizar</option>
                <option value="edit">Editar</option>
              </select>
              <button type="button" id="btnAddShareUser" class="btn primary">Adicionar</button>
            </div>
          </label>
          <div id="shareSearchResults" class="admin-list hidden" style="max-height:140px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:4px;margin-top:4px"></div>
          <div id="shareSearchFeedback" class="muted" role="status" style="font-size:12px;min-height:16px;margin-top:4px"></div>
        </div>

        <h5 style="margin:14px 0 8px;font-size:13px;text-transform:uppercase;color:var(--muted)">Pessoas com acesso</h5>
        <div id="shareList" class="admin-list" style="max-height:220px;overflow-y:auto"></div>

        <div class="modal-actions" style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;border-top:1px solid var(--line);padding-top:14px">
          <button type="button" id="btnCancelShare" class="btn ghost">Fechar</button>
          <button type="button" id="btnConfirmShare" class="btn primary">Salvar permissões</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Clona shares locais para manipulação
  let localShares = normalizeKaizenSharing(kaizen).shares;
  let selectedUserToAdd = null;

  const searchInput = modal.querySelector("#shareUserSearch");
  const roleSelect = modal.querySelector("#shareNewRole");
  const btnAdd = modal.querySelector("#btnAddShareUser");
  const resultsBox = modal.querySelector("#shareSearchResults");
  const feedback = modal.querySelector("#shareSearchFeedback");
  const shareListBox = modal.querySelector("#shareList");
  const btnClose = modal.querySelector("#btnCloseShare");
  const btnCancel = modal.querySelector("#btnCancelShare");
  const btnConfirm = modal.querySelector("#btnConfirmShare");

  function renderShareList() {
    shareListBox.innerHTML = "";

    // Linha do Dono (imutável)
    const ownerLi = document.createElement("div");
    ownerLi.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:var(--surface-2)";
    const ownerInfo = document.createElement("div");
    const ownerStrong = document.createElement("strong");
    ownerStrong.textContent = kaizen.ownerNome || "Dono";
    const ownerSmall = document.createElement("small");
    ownerSmall.className = "muted";
    ownerSmall.style.display = "block";
    ownerSmall.textContent = kaizen.ownerEmail || "";
    ownerInfo.appendChild(ownerStrong);
    ownerInfo.appendChild(ownerSmall);

    const ownerBadge = document.createElement("span");
    ownerBadge.className = "pill";
    ownerBadge.style.fontSize = "11px";
    ownerBadge.textContent = "Proprietário";

    ownerLi.appendChild(ownerInfo);
    ownerLi.appendChild(ownerBadge);
    shareListBox.appendChild(ownerLi);

    if (localShares.length === 0) {
      const emptyLi = document.createElement("p");
      emptyLi.className = "muted";
      emptyLi.style.cssText = "font-size:12px;margin:8px 0";
      emptyLi.textContent = "Nenhum colega compartilhado ainda. Este projeto está visível apenas para você.";
      shareListBox.appendChild(emptyLi);
      return;
    }

    localShares.forEach((s, idx) => {
      const li = document.createElement("div");
      li.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px";
      
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
      const strongName = document.createElement("strong");
      strongName.textContent = s.nome || s.email;
      const smallEmail = document.createElement("small");
      smallEmail.className = "muted";
      smallEmail.style.display = "block";
      smallEmail.textContent = s.email;
      infoDiv.appendChild(strongName);
      infoDiv.appendChild(smallEmail);

      const actionDiv = document.createElement("div");
      actionDiv.style.cssText = "display:flex;align-items:center;gap:8px";
      
      const roleSel = document.createElement("select");
      roleSel.dataset.idx = String(idx);
      roleSel.className = "role-changer";
      roleSel.style.cssText = "width:115px;margin:0;padding:4px 8px;font-size:12px";
      roleSel.innerHTML = '<option value="view">Visualizar</option><option value="edit">Editar</option>';
      roleSel.value = s.role === "edit" ? "edit" : "view";

      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.dataset.idx = String(idx);
      rmBtn.className = "btn-rm-share rm";
      rmBtn.title = "Remover acesso";
      rmBtn.textContent = "✕";

      actionDiv.appendChild(roleSel);
      actionDiv.appendChild(rmBtn);

      li.appendChild(infoDiv);
      li.appendChild(actionDiv);
      shareListBox.appendChild(li);
    });

    shareListBox.querySelectorAll(".role-changer").forEach((sel) => {
      sel.onchange = (e) => {
        const i = Number(e.target.dataset.idx);
        localShares[i].role = e.target.value;
      };
    });

    shareListBox.querySelectorAll(".btn-rm-share").forEach((btn) => {
      btn.onclick = (e) => {
        const i = Number(e.currentTarget.dataset.idx);
        localShares.splice(i, 1);
        renderShareList();
      };
    });
  }

  // Busca debounced no diretório
  let searchTimer = null;
  searchInput.value = "";
  selectedUserToAdd = null;
  resultsBox.innerHTML = "";
  resultsBox.classList.add("hidden");

  searchInput.oninput = () => {
    selectedUserToAdd = null;
    clearTimeout(searchTimer);
    const term = searchInput.value.trim();
    const exactEmailQuery = isBareEmail(term);
    if (feedback) { feedback.textContent = ""; feedback.style.color = ""; }
    if (term.length < 2) {
      resultsBox.classList.add("hidden");
      resultsBox.innerHTML = "";
      return;
    }

    searchTimer = setTimeout(async () => {
      const found = await searchDirectoryUsers(term);
      const filtered = found
        .map((user) => {
          return syncSharingLists([user]).shares[0] || null;
        })
        .filter((user) => user && user.uid !== kaizen.ownerUid && user.uid !== currentUser?.uid && !localShares.some((share) => share.uid === user.uid));
      resultsBox.innerHTML = "";

      if (filtered.length === 0) {
        resultsBox.innerHTML = '<div style="padding:6px;font-size:12px;color:var(--muted)">Nenhum usuário encontrado</div>';
        if (exactEmailQuery && feedback) {
          try {
            const lookup = await lookupDirectoryRecipient(term);
            feedback.textContent = directoryLookupMessage(lookup.status, term);
            if (lookup.status !== "active") feedback.style.color = "var(--danger, #c0392b)";
          } catch (err) {
            console.error("Erro ao consultar o diretório:", err);
            feedback.textContent = "Não foi possível consultar o diretório agora. Tente novamente.";
          }
        }
      } else {
        filtered.forEach((u) => {
          const item = document.createElement("div");
          item.style.cssText = "padding:6px 10px;cursor:pointer;border-radius:4px;font-size:13px";
          const st = document.createElement("strong");
          st.textContent = u.nome;
          const sp = document.createElement("span");
          sp.className = "muted";
          sp.textContent = ` (${u.email})`;
          item.appendChild(st);
          item.appendChild(sp);
          item.onmouseover = () => { item.style.background = "var(--surface-2)"; };
          item.onmouseout = () => { item.style.background = "transparent"; };
          item.onclick = () => {
            selectedUserToAdd = u;
            searchInput.value = `${u.nome} (${u.email})`;
            resultsBox.classList.add("hidden");
          };
          resultsBox.appendChild(item);
        });
      }
      resultsBox.classList.remove("hidden");
    }, 250);
  };

  const addShareLocally = (user) => {
    localShares = prepareKaizenSharingSave([
      ...localShares.filter((share) => share?.uid !== user.uid),
      { uid: user.uid, email: user.email, nome: user.nome, role: roleSelect.value }
    ]).shares;
    searchInput.value = "";
    selectedUserToAdd = null;
    resultsBox.classList.add("hidden");
    if (feedback) feedback.textContent = "";
    renderShareList();
  };

  btnAdd.onclick = async () => {
    if (selectedUserToAdd?.uid && !String(selectedUserToAdd.uid).startsWith("ext-")) {
      addShareLocally(selectedUserToAdd);
      return;
    }

    const typed = (searchInput.value || "").trim().toLowerCase();
    if (!isBareEmail(typed)) {
      showToast("Escolha um usuário na lista ou digite o e-mail completo do colega.", "warn");
      return;
    }

    try {
      const lookup = await lookupDirectoryRecipient(typed);
      if (lookup.status !== "active" || !lookup.user) {
        const message = directoryLookupMessage(lookup.status, typed);
        if (feedback) { feedback.textContent = message; feedback.style.color = "var(--danger, #c0392b)"; }
        showToast(message, "danger");
        return;
      }
      addShareLocally(lookup.user);
    } catch (err) {
      console.error("Falha ao consultar o diretório:", err);
      showToast("Não foi possível consultar o diretório agora. Verifique sua conexão e tente novamente.", "danger");
    }
  };

  const close = () => {
    modal.classList.add("hidden");
  };

  btnClose.onclick = close;
  btnCancel.onclick = close;

  btnConfirm.onclick = async () => {
    const typed = (searchInput.value || "").trim().toLowerCase();
    const pendingInvite = isBareEmail(typed) ? typed : "";

    try {
      let sharesToSave = localShares;
      if (pendingInvite) {
        const lookup = await lookupDirectoryRecipient(pendingInvite);
        if (lookup.status !== "active" || !lookup.user) {
          const message = directoryLookupMessage(lookup.status, pendingInvite);
          if (feedback) { feedback.textContent = message; feedback.style.color = "var(--danger, #c0392b)"; }
          showToast(message, "danger");
          return;
        }
        sharesToSave = [
          ...localShares.filter((share) => share?.uid !== lookup.user.uid),
          { ...lookup.user, role: roleSelect.value }
        ];
      }

      const synced = prepareKaizenSharingSave(sharesToSave);
      localShares = synced.shares;
      if (typeof onSaveShares === "function") onSaveShares(synced);
      close();
      showToast("Permissões de compartilhamento atualizadas.", "ok");
    } catch (err) {
      console.error("Falha ao validar destinatário do compartilhamento:", err);
      showToast("Não foi possível validar esse usuário. Verifique sua conexão e tente novamente.", "danger");
    }
  };

  renderShareList();
  modal.classList.remove("hidden");
}