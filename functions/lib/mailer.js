"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const nodemailer = require("nodemailer");
const { buildTemplate, DEFAULT_ADMIN_LINK } = require("./template");

const DEFAULT_MAIL_FROM = "Kaizen Hub <ghgghgc60@gmail.com>";

/**
 * Cria ou obtém o diretório para armazenamento de e-mails de teste em arquivo.
 * @param {object} [env]
 * @returns {string}
 */
function getMailFileDir(env = process.env) {
  const baseDir = env.TMPDIR || os.tmpdir();
  const targetDir = path.join(baseDir, "kaizen-mail");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

/**
 * Constrói o transporte de e-mail de acordo com a variável MAIL_TRANSPORT ou SMTP padrão.
 * - 'file': grava arquivos .eml em $TMPDIR/kaizen-mail/
 * - 'fail': simula erro imediato de transporte
 * - default: nodemailer conectado ao Gmail SMTP
 *
 * @param {object} [env]
 * @returns {object} Transportador compatível com .sendMail(message)
 */
function buildTransport(env = process.env) {
  const transportMode = (env.MAIL_TRANSPORT || "").trim().toLowerCase();

  if (transportMode === "fail") {
    return {
      sendMail: async () => {
        throw new Error("Falha simulada de transporte (MAIL_TRANSPORT=fail)");
      }
    };
  }

  if (transportMode === "file") {
    return {
      sendMail: async (mailOptions) => {
        const mailDir = getMailFileDir(env);
        const timestamp = Date.now();
        const rand = Math.random().toString(36).substring(2, 8);
        const fileName = `email-${timestamp}-${rand}.eml`;
        const filePath = path.join(mailDir, fileName);

        const boundary = `====_kaizen_boundary_${timestamp}_====`;
        const dateHeader = new Date().toUTCString();

        const emlContent = [
          `From: ${mailOptions.from || DEFAULT_MAIL_FROM}`,
          `To: ${mailOptions.to || ""}`,
          `Reply-To: ${mailOptions.replyTo || ""}`,
          `Subject: ${mailOptions.subject || ""}`,
          `Date: ${dateHeader}`,
          "MIME-Version: 1.0",
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          mailOptions.text || "",
          "",
          `--${boundary}`,
          "Content-Type: text/html; charset=utf-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          mailOptions.html || "",
          "",
          `--${boundary}--`,
          ""
        ].join("\r\n");

        fs.writeFileSync(filePath, emlContent, "utf8");

        return {
          messageId: `<file:${fileName}>`,
          filePath,
          response: `Gravado com sucesso em ${filePath}`
        };
      }
    };
  }

  // Padrão: Nodemailer via SMTP do Gmail
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT) || 465;
  const user = env.SMTP_USER || "ghgghgc60@gmail.com";
  const pass = env.SMTP_PASS || "";

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });
}

/**
 * Constrói as opções de mensagem prontas para envio.
 *
 * @param {object} params
 * @param {object} params.usuario
 * @param {Array<string>} params.destinatarios
 * @param {string} [params.link]
 * @param {Date} [params.agora]
 * @param {object} [params.env]
 * @returns {object}
 */
function buildMessage({
  usuario = {},
  destinatarios = [],
  link = DEFAULT_ADMIN_LINK,
  agora = new Date(),
  env = process.env
} = {}) {
  const from = env.MAIL_FROM || DEFAULT_MAIL_FROM;
  const to = Array.isArray(destinatarios) ? destinatarios.join(", ") : String(destinatarios || "");
  const replyTo = (usuario.email || "").trim();

  const { subject, text, html } = buildTemplate({ usuario, link, agora });

  return {
    from,
    to,
    replyTo,
    subject,
    text,
    html
  };
}

/**
 * Envia uma mensagem usando o transportador especificado.
 *
 * @param {object} transport
 * @param {object} message
 * @returns {Promise<object>}
 */
async function sendNotificationEmail(transport, message) {
  if (!transport || typeof transport.sendMail !== "function") {
    throw new Error("Transporte de e-mail inválido ou sem método sendMail.");
  }
  return await transport.sendMail(message);
}

module.exports = {
  DEFAULT_MAIL_FROM,
  getMailFileDir,
  buildTransport,
  buildMessage,
  sendNotificationEmail
};
