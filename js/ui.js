// ============================================================
// js/ui.js — Componentes de UI, Notificações, Modais e Tema
// ============================================================

let toastTimer = null;
let hasUnsavedChanges = false;

/**
 * Exibe notificação toast (no máximo 1 por vez, auto-fecha em 2.8s)
 */
export function showToast(message, type = "info") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  if (toastTimer) clearTimeout(toastTimer);

  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove("hidden");

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

/**
 * Atualiza o indicador visual de salvamento no topo do editor (conforme §0.2)
 * Estados: saved | saving | dirty | unsynced | conflict
 */
export function setSaveStatus(state, extra = "") {
  const el = document.getElementById("saveStatus");
  if (!el) return;

  el.className = `save-status status-${state}`;
  el.title = "";

  switch (state) {
    case "saved": {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      el.textContent = `Salvo ✓ ${timeStr}`;
      hasUnsavedChanges = false;
      break;
    }
    case "saving":
      el.textContent = "Salvando…";
      hasUnsavedChanges = true;
      break;
    case "dirty":
      el.textContent = "Alterações pendentes";
      hasUnsavedChanges = true;
      break;
    case "unsynced": {
      const count = extra ? String(extra) : "1";
      el.textContent = `Tentando novamente (${count}/6)`;
      hasUnsavedChanges = true;
      break;
    }
    case "error": {
      const message = String(extra || "Erro ao salvar.");
      const reason = message.split(/[.!?]/, 1)[0].trim();
      const shortReason = reason.length > 60 ? `${reason.slice(0, 57)}…` : reason;
      el.textContent = `Não salvo — ${shortReason}`;
      el.title = message;
      hasUnsavedChanges = true;
      break;
    }
    case "conflict":
      el.textContent = "Alterado em outro dispositivo";
      hasUnsavedChanges = true;
      break;
    default:
      el.textContent = "";
      hasUnsavedChanges = false;
  }
}

/**
 * Define se há alterações não sincronizadas na memória
 */
export function setDirtyFlag(isDirty) {
  hasUnsavedChanges = Boolean(isDirty);
}

export function getDirtyFlag() {
  return hasUnsavedChanges;
}

/**
 * Inicializa proteção de fechamento acidental com alterações pendentes
 */
export function initBeforeUnloadProtection() {
  window.addEventListener("beforeunload", (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = "Há alterações não sincronizadas. Se sair agora, elas serão perdidas.";
      return e.returnValue;
    }
  });
}

/**
 * Inicializa monitor de conectividade e banner offline
 */
export function initConnectionMonitor(onRetrySave) {
  const banner = document.getElementById("offlineBanner");
  const btnRetry = document.getElementById("btnRetryOffline");

  function update() {
    const isOnline = navigator.onLine;
    if (banner) {
      if (!isOnline) {
        banner.classList.remove("hidden");
      } else {
        banner.classList.add("hidden");
      }
    }
  }

  window.addEventListener("online", () => {
    update();
    showToast("Conexão restabelecida. Sincronizando...", "ok");
    if (typeof onRetrySave === "function") onRetrySave();
  });

  window.addEventListener("offline", () => {
    update();
    showToast("Você está sem conexão com a internet.", "warn");
  });

  if (btnRetry && typeof onRetrySave === "function") {
    btnRetry.onclick = () => onRetrySave();
  }

  update();
}

/**
 * Exibe modal de conflito de concorrência com opções claras
 */
export function showConflictModal({ serverData, onReload, onOverwrite }) {
  let modal = document.getElementById("modalConflict");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalConflict";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-labelledby="conflictTitle">
        <div class="card-head">
          <h4 id="conflictTitle" style="color:var(--danger)">Conflito de edição</h4>
        </div>
        <p id="conflictDesc" style="margin:12px 0;line-height:1.5">
          Este kaizen foi alterado recentemente em outro dispositivo ou aba.
        </p>
        <div class="modal-actions" style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button type="button" id="btnConflictReload" class="btn primary">Recarregar versão do servidor</button>
          <button type="button" id="btnConflictOverwrite" class="btn danger">Manter minhas alterações e sobrescrever</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const desc = modal.querySelector("#conflictDesc");
  if (desc && serverData) {
    const user = serverData.atualizadoPorNome || serverData.ownerNome || "outro usuário";
    let dataStr = "";
    if (serverData.atualizadoEm) {
      const dt = serverData.atualizadoEm.toDate ? serverData.atualizadoEm.toDate() : new Date(serverData.atualizadoEm);
      dataStr = ` em ${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    desc.textContent = `Este kaizen foi alterado por ${user}${dataStr}. Deseja recarregar a versão mais recente do banco ou manter suas alterações locais?`;
  }

  const btnReload = modal.querySelector("#btnConflictReload");
  const btnOverwrite = modal.querySelector("#btnConflictOverwrite");

  modal.classList.remove("hidden");

  btnReload.onclick = () => {
    modal.classList.add("hidden");
    if (typeof onReload === "function") onReload();
  };

  btnOverwrite.onclick = () => {
    modal.classList.add("hidden");
    if (typeof onOverwrite === "function") onOverwrite();
  };
}

/**
 * Alternador de tema Light / Dark com persistência em localStorage
 */
export function initThemeToggle() {
  const savedTheme = localStorage.getItem("kaizen_theme") || "light";
  applyTheme(savedTheme);

  const btn = document.getElementById("btnToggleTheme");
  if (btn) {
    btn.onclick = () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("kaizen_theme", next);
    };
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("btnToggleTheme");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀️ Tema claro" : "🌙 Tema escuro";
    btn.setAttribute("aria-label", theme === "dark" ? "Alternar para tema claro" : "Alternar para tema escuro");
  }
}

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}
