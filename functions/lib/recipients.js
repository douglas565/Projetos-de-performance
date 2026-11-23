"use strict";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normaliza e deduplica uma lista de e-mails, limitando a 10 itens.
 * @param {Array<string>} list
 * @returns {Array<string>}
 */
function sanitizeAndDedupeEmails(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];

  for (const item of list) {
    if (typeof item !== "string") continue;
    const clean = item.trim().toLowerCase();
    if (!EMAIL_REGEX.test(clean)) continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
      if (result.length >= 10) break;
    }
  }

  return result;
}

/**
 * Resolve a lista de administradores destinatários da notificação.
 * Ordem:
 * 1. config/app.notificacoes.emailsTo (se existir e não vazio)
 * 2. Senão: users com role == "admin" e status == "active"
 * 3. Dedup por e-mail (case-insensitive), cap de 10 destinatários.
 * 4. Se config/app.notificacoes.enabled === false -> retorna [] (kill switch).
 *
 * @param {object} options
 * @param {object} [options.db] Instância do Firestore
 * @param {object} [options.config] Documento de configuração opcional pré-carregado
 * @returns {Promise<Array<string>>}
 */
async function resolveDestinatarios({ db, config } = {}) {
  let appConfig = config;

  if (!appConfig && db) {
    try {
      const snap = await db.doc("config/app").get();
      if (snap.exists) {
        appConfig = snap.data();
      }
    } catch (err) {
      console.warn("[recipients] Não foi possível ler config/app:", err.message);
    }
  }

  // Kill switch operacional
  if (appConfig?.notificacoes?.enabled === false) {
    return [];
  }

  // 1. Lista explícita configurada
  const emailsTo = appConfig?.notificacoes?.emailsTo;
  if (Array.isArray(emailsTo) && emailsTo.length > 0) {
    const sanitized = sanitizeAndDedupeEmails(emailsTo);
    if (sanitized.length > 0) {
      return sanitized;
    }
  }

  // 2. Busca administradores ativos no banco
  if (!db) {
    return [];
  }

  try {
    const snap = await db.collection("users").where("role", "==", "admin").get();
    const candidateEmails = [];

    snap.forEach((doc) => {
      const data = doc.data() || {};
      if (data.status === "active" && data.email) {
        candidateEmails.push(data.email);
      }
    });

    return sanitizeAndDedupeEmails(candidateEmails);
  } catch (err) {
    console.error("[recipients] Falha ao buscar administradores ativos:", err);
    return [];
  }
}

module.exports = {
  EMAIL_REGEX,
  sanitizeAndDedupeEmails,
  resolveDestinatarios
};
