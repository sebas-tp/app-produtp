import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// REEMPLAZA ESTO CON TUS DATOS DE FIREBASE CONSOLE
// Si usas Vercel, es mejor usar variables de entorno (process.env), 
// pero para empezar rápido puedes pegar los datos aquí directos.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "TU_API_KEY_AQUI",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO_ID",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);