import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDH1YQNT8-faLflp8DWFksmtynfUmUmDTo",
    authDomain: "tech-event-showdown.firebaseapp.com",
    projectId: "tech-event-showdown",
    storageBucket: "tech-event-showdown.firebasestorage.app",
    messagingSenderId: "416383719852",
    appId: "1:416383719852:web:85adf305dd9822e4d90209"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
// export const auth = getAuth(app); // Disabled to prevent CONFIGURATION_NOT_FOUND error if Auth is not enabled in console
