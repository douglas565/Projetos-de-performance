// ============================================================
//  firebase-config.js  —  SUBSTITUA pelos dados do SEU projeto
//  Firebase Console > Configurações do projeto > Seus apps > Web
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, memoryLocalCache } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqBT_XjRAZ9wRwCs--hnFmX6YP3owIT14",
  authDomain: "projeto-de-performance-bb964.firebaseapp.com",
  projectId: "projeto-de-performance-bb964",
  storageBucket: "projeto-de-performance-bb964.firebasestorage.app",
  messagingSenderId: "949989813044",
  appId: "1:949989813044:web:428d42d75ac55018c0d361",
  measurementId: "G-LNT0W9GT4J"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
