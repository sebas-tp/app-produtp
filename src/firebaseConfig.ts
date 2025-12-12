import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// REEMPLAZA ESTO CON TUS DATOS DE FIREBASE CONSOLE
// Si usas Vercel, es mejor usar variables de entorno (process.env), 
// pero para empezar rápido puedes pegar los datos aquí directos.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDYAX9gis2MKtEabUzZDPFUlhmeX38U_Bs",
  authDomain: "produccion-topsafe.firebaseapp.com",
  projectId: "produccion-topsafe",
  storageBucket: "produccion-topsafe.firebasestorage.app",
  messagingSenderId: "798185919710",
  appId: "1:798185919710:web:bf420d718d7bc2b3e9de4f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
