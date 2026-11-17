// ============================================================
// js/share.js — Compartilhamento de Kaizen e Diretório de Usuários
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { syncSharingLists } from "./kaizen-model.js";
import { showToast, escapeHtml } from "./ui.js";

/**
 * Busca usuários no diretório público (directory/) por e-mail ou nome
 */
export async function searchDirectoryUsers(term) {
  const cleanTerm = (term || "").trim().toLowerCase();
  if (!cleanTerm || cleanTerm.length < 2) return [];

  try {
    const dirRef = collection(db, "directory");
    const snap = await getDocs(query(dirRef, limit(50)));
    const results = [];

    for (const d of snap.docs) {
      const u = d.data();
      const email = (u.email || "").toLowerCase();
      const nome = (u.nome || "").toLowerCase();

      if (email.includes(cleanTerm) || nome.includes(cleanTerm)) {
        results.push({
          uid: d.id,
          email: u.email || "",
          nome: u.nome || u.email || ""
        });
      }
    }
    return results;
  } catch (err) {
    console.error("Erro ao buscar usuários no diretório:", err);
    return [];
  }
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
  let localShares = Array.isArray(kaizen.shares) ? [...kaizen.shares] : [];
  let selectedUserToAdd = null;

  const searchInput = modal.querySelector("#shareUserSearch");
  const roleSelect = modal.querySelector("#shareNewRole");
  const btnAdd = modal.querySelector("#btnAddShareUser");
  const resultsBox = modal.querySelector("#shareSearchResults");
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
    if (term.length < 2) {
      resultsBox.classList.add("hidden");
      resultsBox.innerHTML = "";
      return;
    }

    searchTimer = setTimeout(async () => {
      const found = await searchDirectoryUsers(term);
      const filtered = found.filter((u) => u.uid !== kaizen.ownerUid && !localShares.some((s) => s.uid === u.uid));
      resultsBox.innerHTML = "";

      if (filtered.length === 0) {
        resultsBox.innerHTML = '<div style="padding:6px;font-size:12px;color:var(--muted)">Nenhum usuário encontrado</div>';
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

  btnAdd.onclick = () => {
    if (!selectedUserToAdd && searchInput.value.includes("@")) {
      // Permite adicionar por e-mail manual se encontrar ou formato válido
      const email = searchInput.value.trim().toLowerCase();
      selectedUserToAdd = { uid: `ext-${Date.now()}`, email, nome: email.split("@")[0] };
    }

    if (!selectedUserToAdd) {
      showToast("Selecione um usuário da lista para adicionar.", "warn");
      return;
    }

    localShares.push({
      uid: selectedUserToAdd.uid,
      email: selectedUserToAdd.email,
      nome: selectedUserToAdd.nome,
      role: roleSelect.value
    });

    searchInput.value = "";
    selectedUserToAdd = null;
    resultsBox.classList.add("hidden");
    renderShareList();
  };

  const close = () => {
    modal.classList.add("hidden");
  };

  btnClose.onclick = close;
  btnCancel.onclick = close;

  btnConfirm.onclick = () => {
    const synced = syncSharingLists(localShares);
    close();
    if (typeof onSaveShares === "function") {
      onSaveShares(synced);
    }
    showToast("Permissões de compartilhamento atualizadas.", "ok");
  };

  renderShareList();
  modal.classList.remove("hidden");
}
