import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { Logger } from '../utils/logger';

dotenv.config();

/**
 * Parse Firebase credentials from environment
 */
function getFirebaseCredentials() {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('FIREBASE_PRIVATE_KEY not set in environment');
  }

  // Handle escaped newlines in private key
  const parsedPrivateKey = privateKey.replace(/\\n/g, '\n');

  return {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: parsedPrivateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  };
}

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
  try {
    const credentials = getFirebaseCredentials();

    const app = initializeApp({
      credential: cert(credentials as any),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    Logger.success('Firebase Admin SDK initialized');
    return app;
  } catch (error) {
    Logger.error('Failed to initialize Firebase', error);
    throw error;
  }
}

const firebaseApp = initializeFirebase();
export const db = getDatabase(firebaseApp);
export const auth = getAuth(firebaseApp);

export default firebaseApp;
