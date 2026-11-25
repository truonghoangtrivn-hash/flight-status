import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD5xJ95pYWckUcnbGzrD6mPUcYEFrwuUj8",
  authDomain: "flight-status-b0895.firebaseapp.com",
  projectId: "flight-status-b0895",
  storageBucket: "flight-status-b0895.firebasestorage.app",
  messagingSenderId: "274057468561",
  appId: "1:274057468561:web:f8edcb85d692caebb9bd30"
};

// Khởi tạo Firebase kết nối duy nhất (tránh bị khởi tạo lặp lại)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };