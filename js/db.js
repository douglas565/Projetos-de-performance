// ============================================================
// js/db.js — Camada de Dados Firestore v2 (Transações, Concorrência e Conexão)
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  generateSearchKeywords,
  migrateLegacyProject,
  normalizeKaizenSharing
} from "./kaizen-model.js";
import { aplicarPercentualAutomatico } from "./percentual.js";
import {
  classifySaveError,
  retryDelayMs,
  MAX_SAVE_ATTEMPTS
} from "./save-errors.js";

// Fila de gravação em memória por Kaizen
const saveQueue = new Map();
let retryTimers = new Map();

/**
 * Escuta os Kaizens visíveis para o usuário logado:
 * 1. Kaizens onde o usuário é dono (ownerUid == uid)
 * 2. Kaizens compartilhados com o usuário (sharedWithUids array-contains uid)
 * Se admin, consulta todos os kaizens ordenados por atualizadoEm.
 * Mescla em memória, remove soft-deleted (arquivado == true) e ordena.
 */
export function subscribeToHubKaizens(user, userProfile, onUpdate, onError) {
  if (!user) return () => {};

  const isAdmin = userProfile && userProfile.role === "admin";
  const isActiveUser = userProfile?.status === "active";
  const kaizensRef = collection(db, "kaizens");

  if (isAdmin) {
    const qAdmin = query(kaizensRef, orderBy("atualizadoEm", "desc"));
    return onSnapshot(
      qAdmin,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((k) => !k.arquivado);
        onUpdate(list);
      },
      (err) => {
        console.error("Erro no listener admin:", err);
        if (onError) onError(err);
      }
    );
  }

  if (!isActiveUser) {
    queueMicrotask(() => onError?.({ code: "permission-denied", message: "Seu cadastro ainda não está ativo; você não tem acesso aos projetos." }));
    return () => {};
  }

  // Dois listeners mesclados no cliente
  const mineMap = new Map();
  const sharedMap = new Map();


  function handleListenerError(key, err) {
    console.error(`Erro no listener ${key}:`, err);
    if (listenerErrors.has(key)) return;
    listenerErrors.add(key);
    if (onError) onError(err);
  }

  function notifyCombined() {
    const combined = new Map();
    mineMap.forEach((v, k) => combined.set(k, v));
    sharedMap.forEach((v, k) => combined.set(k, v));

    const list = Array.from(combined.values())
      .filter((k) => !k.arquivado)
      .sort((a, b) => {
        const timeA = a.atualizadoEm?.toMillis ? a.atualizadoEm.toMillis() : (new Date(a.atualizadoEm || 0)).getTime();
        const timeB = b.atualizadoEm?.toMillis ? b.atualizadoEm.toMillis() : (new Date(b.atualizadoEm || 0)).getTime();
        return timeB - timeA;
      });

    onUpdate(list);
  }

  const qMine = query(kaizensRef, where("ownerUid", "==", user.uid));
  const qShared = query(kaizensRef, where("sharedWithUids", "array-contains", user.uid));

  const unsubMine = onSnapshot(
    qMine,
    (snapshot) => {
      mineMap.clear();
      snapshot.docs.forEach((d) => mineMap.set(d.id, { id: d.id, ...d.data() }));
      notifyCombined();
    },
    (err) => handleListenerError("meus kaizens", err)
  );

  const unsubShared = onSnapshot(
    qShared,
    (snapshot) => {
      sharedMap.clear();
      snapshot.docs.forEach((d) => sharedMap.set(d.id, { id: d.id, ...d.data() }));
      notifyCombined();
    },
    (err) => handleListenerError("kaizens compartilhados", err)
  );

  return () => {
    unsubMine();
    unsubShared();
  };
}

/**
 * Obtém um Kaizen específico do Firestore
 */
export async function getKaizenById(kaizenId) {
  if (!kaizenId) return null;
  const docRef = doc(db, "kaizens", kaizenId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Grava ou atualiza um Kaizen usando runTransaction para controle de concorrência otimista (rev)
 */
export async function saveKaizenWithTransaction(kaizenId, kaizenData, user) {
  if (!user || !user.uid) throw new Error("Usuário não autenticado.");
  const docRef = doc(db, "kaizens", kaizenId);

  // F2 — ponto ÚNICO de gravação: o percentual nunca vem do chamador.
  // Sempre recalculado a partir dos campos, de modo que nenhum caminho
  // (editor, wizard, retry, migração, script) consiga gravar valor divergente.
  aplicarPercentualAutomatico(kaizenData);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    const keywords = generateSearchKeywords(kaizenData);

    if (snap.exists()) {
      const server = snap.data();
      const serverRev = Number(server.rev) || 1;
      const localRev = Number(kaizenData.rev) || 1;

      // Se a revisão divergir, lança erro de conflito
      if (localRev !== serverRev) {
        const conflictErr = new Error("CONFLITO_CONCORRENCIA");
        conflictErr.code = "conflict";
        conflictErr.serverData = server;
        throw conflictErr;
      }

      const nextRev = serverRev + 1;
      const updatePayload = {
        ...kaizenData,
        rev: nextRev,
        schemaVersion: Number(server.schemaVersion) || 2,
        searchKeywords: keywords,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: user.uid,
        atualizadoPorNome: user.displayName || user.email || ""
      };
      delete updatePayload.id;

      transaction.set(docRef, updatePayload, { merge: true });
      return { success: true, rev: nextRev };
    } else {
      // Criação de novo Kaizen
      const newPayload = {
        ...kaizenData,
        rev: 1,
        schemaVersion: 2,
        searchKeywords: keywords,
        ownerUid: user.uid,
        ownerEmail: user.email || "",
        ownerNome: user.displayName || (user.email ? user.email.split("@")[0] : ""),
        arquivado: false,
        criadoEm: serverTimestamp(),
        criadoPor: user.uid,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: user.uid,
        atualizadoPorNome: user.displayName || user.email || ""
      };
      delete newPayload.id;

      transaction.set(docRef, newPayload);
      return { success: true, rev: 1 };
    }
  });
}

/**
 * Fila de salvamento com debounce e tentativas em memória (coalescência por kaizenId)
 */
function clearSaveTimers(kaizenId) {
  for (const timers of [saveQueue, retryTimers]) {
    if (timers.has(kaizenId)) {
      clearTimeout(timers.get(kaizenId));
      timers.delete(kaizenId);
    }
  }
}

function clearTimerIfCurrent(timers, kaizenId, timer) {
  if (timers.get(kaizenId) === timer) timers.delete(kaizenId);
}

export function enqueueSave({ kaizenId, getData, user, onStatusChange, onConflict, onSaved }) {
  clearSaveTimers(kaizenId);
  onStatusChange("dirty");

  const timer = setTimeout(async () => {
    clearTimerIfCurrent(saveQueue, kaizenId, timer);
    onStatusChange("saving");
    const data = getData();
    try {
      const res = await saveKaizenWithTransaction(kaizenId, data, user);
      data.rev = res.rev;
      onStatusChange("saved");
      if (onSaved) onSaved(res.rev);
    } catch (err) {
      if (err.code === "conflict") {
        onStatusChange("conflict");
        if (onConflict) onConflict(err.serverData);
      } else {
        console.error("Falha ao salvar no Firestore:", err);
        const classified = classifySaveError(err);
        if (classified.permanent) {
          onStatusChange("error", classified.message);
          return;
        }
        onStatusChange("unsynced", "1");
        scheduleRetry({ kaizenId, getData, user, onStatusChange, onConflict, onSaved, attempt: 1 });
      }
    }
  }, 900);

  saveQueue.set(kaizenId, timer);
}

function scheduleRetry({ kaizenId, getData, user, onStatusChange, onConflict, onSaved, attempt }) {
  clearSaveTimers(kaizenId);
  const delay = retryDelayMs(attempt);

  const t = setTimeout(async () => {
    clearTimerIfCurrent(retryTimers, kaizenId, t);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // Mantém o estado pendente e aguarda a reconexão sem consumir tentativa.
      onStatusChange("unsynced", String(attempt));
      scheduleRetry({ kaizenId, getData, user, onStatusChange, onConflict, onSaved, attempt });
      return;
    }

    onStatusChange("saving");
    const data = getData();
    try {
      const res = await saveKaizenWithTransaction(kaizenId, data, user);
      data.rev = res.rev;
      onStatusChange("saved");
      if (onSaved) onSaved(res.rev);
    } catch (err) {
      if (err.code === "conflict") {
        onStatusChange("conflict");
        if (onConflict) onConflict(err.serverData);
      } else {
        console.error("Falha ao repetir salvamento no Firestore:", err);
        const classified = classifySaveError(err);
        if (classified.permanent) {
          onStatusChange("error", classified.message);
          return;
        }

        const failedAttempts = attempt + 1;
        if (failedAttempts >= MAX_SAVE_ATTEMPTS) {
          onStatusChange("error", "Não foi possível salvar após 6 tentativas. Verifique sua conexão e tente novamente.");
          return;
        }

        onStatusChange("unsynced", String(failedAttempts));
        scheduleRetry({ kaizenId, getData, user, onStatusChange, onConflict, onSaved, attempt: failedAttempts });
      }
    }
  }, delay);

  retryTimers.set(kaizenId, t);
}

/**
 * Soft delete: oculta o kaizen do hub mantendo no banco (arquivado = true)
 */
export async function softDeleteKaizen(kaizenId, user) {
  if (!user || !user.uid) throw new Error("Usuário não autenticado.");
  const docRef = doc(db, "kaizens", kaizenId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists()) throw new Error("Kaizen não encontrado.");
    transaction.update(docRef, {
      arquivado: true,
      rev: (Number(snap.data().rev) || 1) + 1,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: user.uid
    });
  });
}

/**
 * Restaura kaizen arquivado (admin ou dono)
 */
export async function restoreKaizen(kaizenId, user) {
  if (!user || !user.uid) throw new Error("Usuário não autenticado.");
  const docRef = doc(db, "kaizens", kaizenId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists()) throw new Error("Kaizen não encontrado.");
    transaction.update(docRef, {
      arquivado: false,
      rev: (Number(snap.data().rev) || 1) + 1,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: user.uid
    });
  });
}

/**
 * Exclusão definitiva (apenas administrador)
 */
export async function hardDeleteKaizen(kaizenId) {
  const docRef = doc(db, "kaizens", kaizenId);
  await deleteDoc(docRef);
}

/**
 * Migra projetos legados da subcoleção users/{uid}/projetos para a coleção central kaizens/{id}
 * Idempotente: preserva IDs existentes e não sobrescreve se já migrado.
 */
export async function migrateUserLegacyProjects(user) {
  if (!user || !user.uid) throw new Error("Usuário não autenticado.");
  const legacyColRef = collection(db, "users", user.uid, "projetos");
  const snap = await getDocs(legacyColRef);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const legacyDoc of snap.docs) {
    const targetRef = doc(db, "kaizens", legacyDoc.id);
    const existingSnap = await getDoc(targetRef);

    if (existingSnap.exists()) {
      skippedCount++;
      continue;
    }

    const transformed = migrateLegacyProject(legacyDoc.data(), user);
    transformed.atualizadoEm = serverTimestamp();
    if (!transformed.criadoEm) transformed.criadoEm = serverTimestamp();

    await setDoc(targetRef, transformed);
    migratedCount++;
  }

  return { total: snap.docs.length, migrated: migratedCount, skipped: skippedCount };
}
