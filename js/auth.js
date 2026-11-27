// ============================================================
// js/auth.js — Autenticação, Perfis de Usuário e Ciclo de Vida
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Tradução de erros do Firebase para pt-BR (conforme §3.3 da spec)
 */
export function translateAuthError(code) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Informe a senha.",
    "auth/weak-password": "Senha fraca: use ao menos 8 caracteres, com letras e números.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado. Use 'Entrar' ou 'Esqueci minha senha'.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/user-disabled": "Esta conta foi desativada. Fale com o administrador.",
    "auth/network-request-failed": "Sem conexão com o servidor. Verifique sua internet.",
    "auth/requires-recent-login": "Por segurança, entre novamente para concluir esta ação.",
    "auth/unauthorized-domain": "Domínio não autorizado no Firebase (erro de configuração no console).",
    "auth/operation-not-allowed": "Login por e-mail/senha não está habilitado no Firebase.",
    "permission-denied": "Você não tem permissão para esta ação. Se acabou de se cadastrar, saia e entre novamente; se persistir, fale com o administrador.",
    "unavailable": "Sem conexão com o banco. Nada foi salvo.",
    "failed-precondition": "Índice do banco não configurado (erro de administração)."
  };
  return map[code] || `Ocorreu um erro (${code || "desconhecido"}).`;
}

/**
 * Valida complexidade de senha no cliente (mínimo 8 caracteres, com letra e número)
 */
export function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: "A senha deve conter no mínimo 8 caracteres." };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return { valid: false, message: "A senha deve conter pelo menos uma letra e um número." };
  }
  return { valid: true };
}

/**
 * Carrega ou inicializa o perfil de usuário em `users/{uid}` e atualiza `directory/{uid}`
 */
export async function getOrCreateUserProfile(firebaseUser) {
  if (!firebaseUser) return null;
  const userRef = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(userRef);

  let profile = null;
  const email = (firebaseUser.email || "").toLowerCase();
  const nome = firebaseUser.displayName || email.split("@")[0] || "Usuário";

  if (snap.exists()) {
    profile = snap.data();
  } else {
    // Primeiro registro no Firestore caso ainda não exista documento
    profile = {
      uid: firebaseUser.uid,
      email,
      nome,
      areaNegocio: "Operação",
      role: "user",
      status: "pending",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    };
    try {
      await setDoc(userRef, profile);
    } catch (e) {
      console.warn("Aviso ao criar documento users/{uid}:", e);
    }
  }

  // Atualiza diretório público para compartilhamento de colegas
  try {
    const dirRef = doc(db, "directory", firebaseUser.uid);
    await setDoc(dirRef, {
      uid: firebaseUser.uid,
      email,
      nome,
      status: profile.status || "pending",
      atualizadoEm: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    // Não bloqueia caso ainda não tenha permissão de escrita
  }

  return profile;
}

/**
 * Inicializa observador do Firebase Auth
 */
export function initAuth(onStateChanged) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      onStateChanged(null, null);
      return;
    }
    try {
      const profile = await getOrCreateUserProfile(firebaseUser);
      onStateChanged(firebaseUser, profile);
    } catch (err) {
      console.error("Erro ao obter perfil de usuário:", err);
      onStateChanged(firebaseUser, { status: "pending", role: "user" });
    }
  });
}

/**
 * Fluxo de cadastro
 */
export async function registerUser(email, password, nome, area = "Operação") {
  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    throw new Error(strength.message);
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanNome = (nome || "").trim();

  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  if (cleanNome) {
    await updateProfile(cred.user, { displayName: cleanNome });
  }

  const initialProfile = {
    uid: cred.user.uid,
    email: cleanEmail,
    nome: cleanNome || cleanEmail.split("@")[0],
    areaNegocio: (area || "").trim() || "Operação",
    role: "user",
    status: "pending",
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp()
  };

  try {
    await setDoc(doc(db, "users", cred.user.uid), initialProfile);
  } catch (e) {
    console.warn("Documento users/{uid} criado via getOrCreateUserProfile:", e);
  }

  try {
    await setDoc(doc(db, "directory", cred.user.uid), {
      uid: cred.user.uid,
      email: cleanEmail,
      nome: cleanNome || cleanEmail.split("@")[0],
      status: initialProfile.status,
      atualizadoEm: serverTimestamp()
    });
  } catch (e) {}

  try {
    await sendEmailVerification(cred.user);
  } catch (e) {
    console.warn("Aviso ao enviar e-mail de verificação:", e);
  }

  return { user: cred.user, profile: initialProfile };
}

/**
 * Fluxo de login
 */
export async function loginUser(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return cred.user;
}

/**
 * Logout
 */
export async function logoutUser() {
  await signOut(auth);
}

/**
 * Envia e-mail de recuperação de senha
 */
export async function requestPasswordReset(email) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Informe o seu e-mail para recuperar a senha.");
  }
  await sendPasswordResetEmail(auth, cleanEmail);
}

/**
 * Recarrega status do perfil (botão 'Verificar de novo')
 */
export async function reloadProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return snap.data();
  }
  return null;
}