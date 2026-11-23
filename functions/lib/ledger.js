"use strict";

let adminInstance = null;
try {
  adminInstance = require("firebase-admin");
} catch (_) {
  // Em ambientes de teste mock sem firebase-admin
}

function getServerTimestamp(customDate) {
  if (customDate instanceof Date) {
    return customDate;
  }
  if (adminInstance && adminInstance.firestore && adminInstance.firestore.FieldValue) {
    return adminInstance.firestore.FieldValue.serverTimestamp();
  }
  return new Date();
}

/**
 * Verifica se uma data/timestamp ocorreu dentro dos últimos N minutos.
 * @param {Date|object|string|number} dateOrTimestamp
 * @param {number} minutes
 * @param {Date} [now]
 * @returns {boolean}
 */
function withinMinutes(dateOrTimestamp, minutes, now = new Date()) {
  if (!dateOrTimestamp) return false;

  let millis = 0;
  if (typeof dateOrTimestamp.toMillis === "function") {
    millis = dateOrTimestamp.toMillis();
  } else if (dateOrTimestamp instanceof Date) {
    millis = dateOrTimestamp.getTime();
  } else if (typeof dateOrTimestamp === "number") {
    millis = dateOrTimestamp;
  } else if (typeof dateOrTimestamp === "string") {
    millis = Date.parse(dateOrTimestamp);
  } else if (dateOrTimestamp && typeof dateOrTimestamp === "object") {
    if (typeof dateOrTimestamp._seconds === "number") {
      millis = dateOrTimestamp._seconds * 1000;
    } else if (typeof dateOrTimestamp.seconds === "number") {
      millis = dateOrTimestamp.seconds * 1000;
    }
  }

  const nowMillis = now instanceof Date ? now.getTime() : Number(now);

  if (!millis || isNaN(millis)) {
    // Se for o objeto sentinela serverTimestamp em memória antes do commit real,
    // considera que foi gerado "agora" (em voo)
    return true;
  }

  const diffMs = nowMillis - millis;
  return diffMs >= 0 && diffMs < minutes * 60 * 1000;
}

/**
 * Realiza o claim transacional da notificação para um usuário.
 * Retorna true se o claim foi obtido com sucesso, ou false caso já tenha sido enviado,
 * esteja em voo recente (< 5 min) ou tenha esgotado o limite de 5 tentativas.
 *
 * @param {object} db Instância do Firestore
 * @param {string} uid UID do usuário solicitante
 * @param {object} usuario Dados do usuário (email, nome, areaNegocio)
 * @param {Date} [now] Timestamp de referência
 * @returns {Promise<boolean>}
 */
async function claimNotification(db, uid, usuario, now = new Date()) {
  if (!db || !uid) return false;
  const ref = db.doc(`notificacoes/${uid}`);

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data() || {};
      if (d.status === "enviado") return false; // já enviado com sucesso
      if (d.status === "enviando" && withinMinutes(d.atualizadoEm, 5, now)) return false; // em voo recente
      if ((d.tentativas || 0) >= 5) return false; // desistiu após 5 tentativas

      const nextTentativas = (d.tentativas || 0) + 1;
      tx.set(
        ref,
        {
          status: "enviando",
          tentativas: nextTentativas,
          atualizadoEm: getServerTimestamp(now)
        },
        { merge: true }
      );
      return true;
    }

    tx.create(ref, {
      uid,
      email: usuario.email,
      nome: usuario.nome || "",
      areaNegocio: usuario.areaNegocio || "Operação",
      status: "enviando",
      tentativas: 1,
      criadoEm: getServerTimestamp(now),
      atualizadoEm: getServerTimestamp(now)
    });
    return true;
  });

  return claimed;
}

/**
 * Checa o rate limit de 20 envios por hora na coleção notificacoes.
 * Se ultrapassado, marca o ledger como 'rate_limited' e retorna true.
 *
 * @param {object} db Instância do Firestore
 * @param {string} uid UID do usuário
 * @param {Date} [now] Data de referência
 * @returns {Promise<boolean>} Retorna true se atingiu o rate limit
 */
async function checkRateLimit(db, uid, now = new Date()) {
  if (!db || !uid) return false;

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const coll = db.collection("notificacoes").where("criadoEm", ">=", oneHourAgo);

  let count = 0;
  try {
    if (typeof coll.count === "function") {
      const countSnap = await coll.count().get();
      count = countSnap.data().count;
    } else {
      const snap = await coll.get();
      count = snap.size != null ? snap.size : (snap.docs ? snap.docs.length : 0);
    }
  } catch (err) {
    console.warn("[ledger] Erro ao checar rate limit:", err.message);
    return false;
  }

  // Se houver mais de 20 registros na última hora (contando com o documento atual recém-reivindicado),
  // significa que excedeu o teto permitido de 20 envios por hora.
  if (count > 20) {
    const ref = db.doc(`notificacoes/${uid}`);
    await ref.set(
      {
        status: "rate_limited",
        atualizadoEm: getServerTimestamp(now)
      },
      { merge: true }
    );
    return true;
  }

  return false;
}

/**
 * Marca a notificação como enviada com sucesso no ledger.
 */
async function markSent(db, uid, { messageId, destinatarios, enviadoEm } = {}, now = new Date()) {
  if (!db || !uid) return;
  const ref = db.doc(`notificacoes/${uid}`);
  await ref.set(
    {
      status: "enviado",
      messageId: messageId || null,
      destinatarios: destinatarios || [],
      enviadoEm: enviadoEm || getServerTimestamp(now),
      atualizadoEm: getServerTimestamp(now)
    },
    { merge: true }
  );
}

/**
 * Marca a notificação como sem destinatário elegível.
 */
async function markNoRecipients(db, uid, now = new Date()) {
  if (!db || !uid) return;
  const ref = db.doc(`notificacoes/${uid}`);
  await ref.set(
    {
      status: "sem_destinatario",
      atualizadoEm: getServerTimestamp(now)
    },
    { merge: true }
  );
}

/**
 * Marca a notificação como falhou no ledger.
 */
async function markFailed(db, uid, error, now = new Date()) {
  if (!db || !uid) return;
  const ref = db.doc(`notificacoes/${uid}`);
  const erroMsg = String(error?.message || error || "Erro desconhecido").slice(0, 500);
  await ref.set(
    {
      status: "falhou",
      erro: erroMsg,
      atualizadoEm: getServerTimestamp(now)
    },
    { merge: true }
  );
}

module.exports = {
  withinMinutes,
  claimNotification,
  checkRateLimit,
  markSent,
  markNoRecipients,
  markFailed
};
