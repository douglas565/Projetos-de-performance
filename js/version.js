// ============================================================
// js/version.js — Identidade de Versão, Comparadores e Probe
// ============================================================

const BUILD_REGEX = /^\d{8}-\d{2}$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

let registeredModuleUrl = "";
let inMemoryDismissed = "";

/**
 * Extrai a tag de build da query string de uma URL (?v=... ou &v=...)
 * @param {string} url
 * @returns {string} Tag de build ou string vazia
 */
export function parseBuildTag(url) {
  if (!url || typeof url !== "string") return "";
  const match = url.match(/[?&]v=([0-9A-Za-z._-]+)/);
  return match ? match[1] : "";
}

/**
 * Compara dois identificadores de build no formato YYYYMMDD-NN
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1 | null}
 */
export function compareBuilds(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return null;
  if (!BUILD_REGEX.test(a) || !BUILD_REGEX.test(b)) return null;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Compara duas versões semânticas (determinístico, suporta prefixo v e pré-releases)
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(a, b) {
  const normA = String(a || "").trim().replace(/^v/i, "");
  const normB = String(b || "").trim().replace(/^v/i, "");
  const partsA = normA ? normA.split(/[-+.]/) : [];
  const partsB = normB ? normB.split(/[-+.]/) : [];

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const rawA = partsA[i];
    const rawB = partsB[i];

    const isAbsentA = rawA === undefined;
    const isAbsentB = rawB === undefined;

    const isNumA = isAbsentA || /^\d+$/.test(rawA);
    const isNumB = isAbsentB || /^\d+$/.test(rawB);

    if (isNumA && !isNumB) {
      // Numérica (release ou 0 default) é maior que textual (pré-release)
      return 1;
    }
    if (!isNumA && isNumB) {
      // Textual é menor que numérica
      return -1;
    }

    if (isNumA && isNumB) {
      const valA = isAbsentA ? 0 : parseInt(rawA, 10);
      const valB = isAbsentB ? 0 : parseInt(rawB, 10);
      if (valA < valB) return -1;
      if (valA > valB) return 1;
    } else {
      if (rawA < rawB) return -1;
      if (rawA > rawB) return 1;
    }
  }
  return 0;
}

/**
 * Avalia se o cliente deve alertar o usuário sobre atualização
 * @param {{ version?: string, build?: string }} local
 * @param {{ version?: string, build?: string }} remote
 * @returns {boolean}
 */
export function shouldPromptUpdate(local = {}, remote = {}) {
  const loc = local || {};
  const rem = remote || {};

  // 1. Sem remote.build e sem remote.version -> false (payload inválido)
  if (!rem.build && !rem.version) return false;

  // 5. Nunca alerta quando local.build === remote.build (mesmo deploy)
  if (loc.build && rem.build && loc.build === rem.build) {
    if (loc.version && rem.version && loc.version !== rem.version) {
      console.warn("[version] Versão diverge com mesmo build:", loc.version, rem.version);
    }
    return false;
  }

  // 2. local.build e remote.build comparáveis por compareBuilds -> retorna c > 0
  const cb = compareBuilds(rem.build, loc.build);
  if (cb !== null) {
    return cb > 0;
  }

  // 3. Senão, se local.version e remote.version existem -> c = compareVersions(remote, local)
  if (loc.version && rem.version) {
    const cv = compareVersions(rem.version, loc.version);
    if (cv !== 0) {
      return cv > 0;
    }
    return false;
  }

  // 4. Senão (local desconhecido): alerta se houver qualquer diferença
  const diffBuild = Boolean(rem.build && rem.build !== loc.build);
  const diffVersion = Boolean(rem.version && rem.version !== loc.version);
  return diffBuild || diffVersion;
}

/**
 * Lê a identidade local da aplicação a partir das meta tags e do moduleUrl
 * @param {string} [moduleUrl]
 * @returns {{ version: string, build: string, scriptBuild: string, mismatch: boolean }}
 */
export function getLocalIdentity(moduleUrl) {
  const url = moduleUrl || registeredModuleUrl;
  let metaVersion = "";
  let metaBuild = "";

  if (typeof document !== "undefined") {
    const vMeta = document.querySelector('meta[name="app-version"]');
    const bMeta = document.querySelector('meta[name="app-build"]');
    if (vMeta) metaVersion = vMeta.getAttribute("content") || "";
    if (bMeta) metaBuild = bMeta.getAttribute("content") || "";
  }

  const scriptBuild = parseBuildTag(url);
  const build = metaBuild || scriptBuild || "";
  const version = metaVersion || "";
  const mismatch = Boolean(metaBuild && scriptBuild && metaBuild !== scriptBuild);

  return { version, build, scriptBuild, mismatch };
}

/**
 * Formata a identidade da versão para exibição amigável
 * @param {{ version?: string, build?: string }} id
 * @returns {string} Ex: "v3.0.0 (build 20261201-01)"
 */
export function formatIdentity(id) {
  if (!id) return "—";
  const { version, build } = id;
  const cleanVersion = version ? String(version).trim().replace(/^v/i, "") : "";
  if (cleanVersion && build) {
    return `v${cleanVersion} (build ${build})`;
  }
  if (cleanVersion) {
    return `v${cleanVersion}`;
  }
  if (build) {
    return `build ${build}`;
  }
  return "—";
}

/**
 * Inicializa o monitoramento periódico de novas versões
 * @param {object} opts
 */
export function initVersionProbe(opts = {}) {
  const {
    moduleUrl = "",
    intervalMs = 300000,
    minIntervalMs = 60000,
    fetchImpl = (typeof fetch !== "undefined" ? fetch : null),
    isDirty = () => false,
    clearDirty = () => {},
    storage = (typeof window !== "undefined" ? window.localStorage : null),
    now = () => Date.now()
  } = opts;

  if (moduleUrl) {
    registeredModuleUrl = moduleUrl;
  }

  if (typeof window === "undefined" || !fetchImpl) return;

  let lastCheckTime = 0;
  let checking = false;

  async function checkOnce() {
    if (checking) return;
    checking = true;
    try {
      const id = getLocalIdentity(moduleUrl);
      if (id.mismatch) {
        console.warn("[version] meta app-build != ?v= do módulo:", id.build, id.scriptBuild);
      }

      const res = await fetchImpl(`version.json?t=${now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data.version !== "string" || typeof data.build !== "string") return;

      const needsUpdate = id.mismatch || shouldPromptUpdate(id, data);
      if (!needsUpdate) return;

      const dismissKey = `${data.version}#${data.build}`;
      let dismissedValue = inMemoryDismissed;
      try {
        if (storage) dismissedValue = storage.getItem("kaizen:version-dismissed");
      } catch (e) {}

      if (dismissedValue === dismissKey) {
        return;
      }

      showBanner(data);
    } catch (e) {
      // Silêncio absoluto em caso de erro de rede ou parse
    } finally {
      checking = false;
    }
  }

  function checkThrottled() {
    const currentTime = now();
    if (currentTime - lastCheckTime < minIntervalMs) return;
    lastCheckTime = currentTime;
    checkOnce();
  }

  function showBanner(remote) {
    let banner = document.getElementById("versionBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "versionBanner";
      banner.className = "banner-version";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");

      const textSpan = document.createElement("span");
      textSpan.className = "banner-version-text";
      banner.appendChild(textSpan);

      const actionsSpan = document.createElement("span");
      actionsSpan.className = "banner-version-actions";

      const btnReload = document.createElement("button");
      btnReload.type = "button";
      btnReload.className = "btn small primary";
      btnReload.id = "btnReloadVersion";
      btnReload.textContent = "Atualizar agora";
      actionsSpan.appendChild(btnReload);

      const btnDismiss = document.createElement("button");
      btnDismiss.type = "button";
      btnDismiss.className = "btn small ghost banner-dismiss";
      btnDismiss.id = "btnDismissVersion";
      btnDismiss.setAttribute("aria-label", "Dispensar aviso até a próxima versão");
      btnDismiss.setAttribute("title", "Dispensar");
      btnDismiss.textContent = "✕";
      actionsSpan.appendChild(btnDismiss);

      banner.appendChild(actionsSpan);

      btnReload.addEventListener("click", () => {
        if (isDirty()) {
          if (!window.confirm("Você tem alterações não salvas. Atualizar agora vai descartá-las. Continuar?")) {
            return;
          }
          clearDirty();
        }
        const url = new URL(window.location.href);
        url.searchParams.set("r", now().toString(36));
        window.location.replace(url.toString());
      });

      btnDismiss.addEventListener("click", () => {
        const dismissKey = `${remote.version}#${remote.build}`;
        inMemoryDismissed = dismissKey;
        try {
          if (storage) storage.setItem("kaizen:version-dismissed", dismissKey);
        } catch (e) {}
        banner.remove();
      });

      document.body.prepend(banner);
    }

    const textSpan = banner.querySelector(".banner-version-text");
    if (textSpan) {
      const cleanVer = String(remote.version).trim().replace(/^v/i, "");
      textSpan.textContent = `Nova versão do Kaizen Hub disponível (v${cleanVer} · build ${remote.build}).`;
    }
    banner.classList.remove("hidden");
  }

  // Gatilhos
  checkThrottled();
  window.addEventListener("focus", checkThrottled);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkThrottled();
  });
  window.addEventListener("online", checkThrottled);
  setInterval(checkThrottled, intervalMs);
}
