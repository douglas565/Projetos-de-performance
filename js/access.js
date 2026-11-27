// ============================================================
// js/access.js — regra única de acesso ao Hub
// Usuário autenticado com perfil criado pode operar o Hub, exceto 'blocked'.
// 'pending' (recém-cadastrado) TEM acesso: pode criar/salvar seus kaizens.
// ============================================================

export function podeAcessarHub(profile) {
  if (!profile) return false;
  return profile.status !== "blocked";
}
