// src/hooks/useFirestore.js
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/** Firestore에서 값 불러오기. 실패 시 에러를 throw하여 호출부에서 처리 */
export const loadData = async (k) => {
  const docRef = doc(db, "kina_data", k);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().value : null;
};

/** Firestore에 값 저장. 실패 시 에러를 throw하여 호출부에서 처리 */
export const saveData = async (k, v) => {
  const docRef = doc(db, "kina_data", k);
  await setDoc(docRef, { value: v });
};
