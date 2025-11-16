// src/auth/firebase.ts
import admin from "firebase-admin";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const servicePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH!;
if (!fs.existsSync(servicePath)) {
  throw new Error("Firebase service account file not found at " + servicePath);
}

const serviceAccount = JSON.parse(fs.readFileSync(servicePath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
  });
}

export const firebaseAuth = admin.auth();

export function verifyFirebaseIdToken(idToken: string) {
  return firebaseAuth.verifyIdToken(idToken);
}
