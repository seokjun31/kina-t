// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCfUXjDDbDhUfZp3Uv9c4c1nJfzL_2llu4",
  authDomain: "kina-dd3a8.firebaseapp.com",
  projectId: "kina-dd3a8",
  storageBucket: "kina-dd3a8.firebasestorage.app",
  messagingSenderId: "1022612249206",
  appId: "1:1022612249206:web:c85149421e3c86a2ae9d57",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);