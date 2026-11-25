export const MAX_SAVE_ATTEMPTS = 6;
export const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000, 60000];

const PERMANENT_ERRORS = {
  "permission-denied": "Sem permissão para salvar. Verifique se sua conta está aprovada e o e-mail confirmado.",
  unauthenticated: "Sessão expirada. Entre novamente.",
  "invalid-argument": "Os dados do Kaizen têm formato inválido.",
  "failed-precondition": "Documento em formato antigo ou índice ausente no banco.",
  "not-found": "Documento não encontrado no banco."
};

const TRANSIENT_MESSAGE = "Sem conexão com o banco. Nada foi salvo ainda.";

export function classifySaveError(err) {
  const code = typeof err?.code === "string" && err.code ? err.code : "unknown";
  const permanentMessage = PERMANENT_ERRORS[code];

  if (permanentMessage) {
    return { permanent: true, code, message: permanentMessage };
  }

  return {
    permanent: false,
    code,
    message: typeof err?.message === "string" && err.message ? err.message : TRANSIENT_MESSAGE
  };
}

export function retryDelayMs(attempt) {
  const index = Math.min(Math.max(Number(attempt) - 1 || 0, 0), RETRY_DELAYS_MS.length - 1);
  const jitter = typeof Math.random === "function" ? Math.floor(Math.random() * 501) : 0;
  return RETRY_DELAYS_MS[index] + jitter;
}
