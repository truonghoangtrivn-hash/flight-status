import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3hUDc9DjuIfDLL70z_uN4x7N3_Rkeczo",
  authDomain: "flight-status-2.firebaseapp.com",
  projectId: "flight-status-2",
  storageBucket: "flight-status-2.firebasestorage.app",
  messagingSenderId: "359685908297",
  appId: "1:359685908297:web:4bd32434e10323ee6bdc98",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, firebaseConfig };