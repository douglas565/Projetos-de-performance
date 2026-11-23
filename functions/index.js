"use strict";

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const { resolveDestinatarios } = require("./lib/recipients");
const {
  claimNotification,
  checkRateLimit,
  markSent,
  markNoRecipients,
  markFailed
} = require("./lib/ledger");
const {
  buildTransport,
  buildMessage,
  sendNotificationEmail
} = require("./lib/mailer");
const { DEFAULT_ADMIN_LINK } = require("./lib/template");

// Inicialização segura do Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Secret Manager: SMTP_PASS
const SMTP_PASS = defineSecret("SMTP_PASS");

const REGION = process.env.FUNCTION_REGION || "southamerica-east1";

/**
 * Orquestrador central de notificação para um novo usuário com status 'pending'.
 *
 * @param {object} firestoreDb Instância do Firestore
 * @param {string} uid UID do usuário
 * @param {object} userData Dados do documento users/{uid}
 * @param {object} [options] Opções de injeção (para testes e agendamento)
 * @returns {Promise<object>}
 */
async function handleNewUser(firestoreDb, uid, userData, options = {}) {
  // 1. Ignora se não for pendente
  if (!userData || userData.status !== "pending") {
    return { status: "skipped", reason: "not_pending" };
  }

  // 2. Ignora se não possuir e-mail
  if (!userData.email) {
    return { status: "skipped", reason: "no_email" };
  }

  const now = options.now || new Date();

  // 3. Claim atômico no ledger notificacoes/{uid}
  const claimed = await claimNotification(firestoreDb, uid, userData, now);
  if (!claimed) {
    return { status: "skipped", reason: "not_claimed" };
  }

  // 4. Checagem de Rate Limit (máx 20/h)
  const isLimited = await checkRateLimit(firestoreDb, uid, now);
  if (isLimited) {
    return { status: "rate_limited" };
  }

  // 5. Resolução de destinatários (config emailsTo > admins ativos)
  const destinatarios = await resolveDestinatarios({
    db: firestoreDb,
    config: options.config
  });

  if (!destinatarios || destinatarios.length === 0) {
    await markNoRecipients(firestoreDb, uid);
    return { status: "sem_destinatario" };
  }

  // 6. Envio de e-mail e atualização do ledger
  try {
    const env = options.env || process.env;
    const transport = options.transport || buildTransport(env);
    const link = options.link || DEFAULT_ADMIN_LINK;

    const message = buildMessage({
      usuario: userData,
      destinatarios,
      link,
      agora: now,
      env
    });

    const sendRes = await sendNotificationEmail(transport, message);

    await markSent(firestoreDb, uid, {
      messageId: sendRes.messageId,
      destinatarios,
      enviadoEm: now
    });

    return {
      status: "enviado",
      messageId: sendRes.messageId,
      destinatarios
    };
  } catch (err) {
    await markFailed(firestoreDb, uid, err);
    if (options.rethrow !== false) {
      throw err;
    }
    return {
      status: "falhou",
      error: err.message
    };
  }
}

/**
 * Função 1: Trigger em tempo real ao cadastrar documento em users/{uid}
 */
const notifyNewUserRequest = onDocumentCreated(
  {
    document: "users/{uid}",
    region: REGION,
    retry: true,
    secrets: [SMTP_PASS],
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 3
  },
  async (event) => {
    const uid = event.params.uid;
    const u = event.data?.data();
    await handleNewUser(db, uid, u);
  }
);

/**
 * Função 2: Digest agendado diário (08:00 America/Sao_Paulo) para cobrir eventuais pendentes
 */
const notifyPendingDigest = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "America/Sao_Paulo",
    region: REGION,
    secrets: [SMTP_PASS],
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 1
  },
  async () => {
    const pend = await db
      .collection("users")
      .where("status", "==", "pending")
      .limit(25)
      .get();

    for (const doc of pend.docs) {
      try {
        await handleNewUser(db, doc.id, doc.data(), { rethrow: false });
      } catch (err) {
        console.error(`[notifyPendingDigest] Falha ao processar pendente ${doc.id}:`, err);
      }
    }
  }
);

module.exports = {
  notifyNewUserRequest,
  notifyPendingDigest,
  handleNewUser
};
