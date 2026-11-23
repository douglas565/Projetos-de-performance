"use strict";

const DEFAULT_ADMIN_LINK = "https://douglas565.github.io/Projetos-de-performance/admin.html?tab=users&status=pending";

/**
 * Escapa caracteres especiais para prevenir injeção em HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formata data no fuso de Brasília (America/Sao_Paulo) no padrão dd/mm/aaaa hh:mm
 * @param {Date|string|number|object} d
 * @returns {string}
 */
function formatDate(d = new Date()) {
  let dateObj;
  if (d && typeof d.toDate === "function") {
    dateObj = d.toDate();
  } else if (d instanceof Date) {
    dateObj = d;
  } else if (typeof d === "number" || typeof d === "string") {
    dateObj = new Date(d);
  } else {
    dateObj = new Date();
  }

  if (isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(dateObj);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}`;
}

/**
 * Monta o template do e-mail com assunto, texto puro e HTML.
 * @param {object} params
 * @param {object} params.usuario Dados do usuário (nome, email, areaNegocio, criadoEm)
 * @param {string} [params.link] Link direto de aprovação
 * @param {Date|number} [params.agora] Data de referência para formatação
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildTemplate({ usuario = {}, link = DEFAULT_ADMIN_LINK, agora = new Date() } = {}) {
  const rawNome = (usuario.nome || "").trim() || (usuario.email ? usuario.email.split("@")[0] : "Usuário");
  const rawEmail = (usuario.email || "").trim();
  const rawArea = (usuario.areaNegocio || "").trim() || "Operação";
  const dateStr = formatDate(usuario.criadoEm || agora);

  const subject = `[Kaizen Hub] Novo pedido de acesso — ${rawNome}`;

  const text = [
    "Novo pedido de acesso ao Kaizen Hub",
    "",
    `Nome:   ${rawNome}`,
    `E-mail: ${rawEmail}`,
    `Área:   ${rawArea}`,
    `Data:   ${dateStr} (horário de Brasília)`,
    "",
    "Aprovar ou recusar:",
    link,
    "",
    "—",
    "Aviso automático do Kaizen Hub. Enviado uma única vez por cadastro.",
    "Se você não reconhece este pedido, basta ignorar ou bloquear a conta no painel."
  ].join("\n");

  const safeNome = escapeHtml(rawNome);
  const safeEmail = escapeHtml(rawEmail);
  const safeArea = escapeHtml(rawArea);
  const safeLink = escapeHtml(link);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Novo pedido de acesso ao Kaizen Hub</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1f2937; margin: 0; padding: 24px; background-color: #f3f4f6;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <h2 style="margin-top: 0; color: #111827; font-size: 1.25rem;">Novo pedido de acesso ao Kaizen Hub</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 0.95rem;">
      <tr>
        <td style="padding: 6px 0; color: #6b7280; width: 80px; font-weight: 600;">Nome:</td>
        <td style="padding: 6px 0; color: #111827; font-weight: 600;">${safeNome}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-weight: 600;">E-mail:</td>
        <td style="padding: 6px 0; color: #111827;">${safeEmail}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-weight: 600;">Área:</td>
        <td style="padding: 6px 0; color: #111827;">${safeArea}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #6b7280; font-weight: 600;">Data:</td>
        <td style="padding: 6px 0; color: #111827;">${dateStr} (horário de Brasília)</td>
      </tr>
    </table>
    <div style="margin: 24px 0 16px;">
      <p style="margin: 0 0 10px; font-weight: 600; color: #374151;">Aprovar ou recusar:</p>
      <a href="${safeLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 0.95rem;">Abrir Painel de Aprovação</a>
      <p style="margin-top: 12px; font-size: 0.85rem; color: #6b7280; word-break: break-all;">
        Ou acesse o link: <a href="${safeLink}" style="color: #2563eb;">${safeLink}</a>
      </p>
    </div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="font-size: 0.8rem; color: #9ca3af; margin: 0;">
      Aviso automático do Kaizen Hub. Enviado uma única vez por cadastro.<br>
      Se você não reconhece este pedido, basta ignorar ou bloquear a conta no painel.
    </p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

module.exports = {
  DEFAULT_ADMIN_LINK,
  escapeHtml,
  formatDate,
  buildTemplate
};
