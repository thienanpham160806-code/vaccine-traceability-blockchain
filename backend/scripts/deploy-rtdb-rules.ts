import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

dotenv.config();

/**
 * Deploys database.rules.json (repo root) directly via the RTDB REST API
 * using the backend's own service-account credentials, bypassing
 * `firebase deploy` — useful when the logged-in Firebase CLI user isn't a
 * member of the target project but the service account (used by the
 * backend itself) already has access, as was the case switching to the
 * vaccine-refactor project.
 *
 * Usage: npm run deploy:rules
 */
async function main() {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const credential = cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  } as any);

  const appName = 'rules-deploy';
  const app = getApps().find((a) => a.name === appName) || initializeApp({ credential }, appName);
  const { access_token: accessToken } = await (app.options.credential as any).getAccessToken();

  const rulesPath = path.join(__dirname, '..', '..', 'database.rules.json');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) throw new Error('FIREBASE_DATABASE_URL not set');

  const url = `${dbUrl.replace(/\/$/, '')}/.settings/rules.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: rules,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to deploy rules: ${res.status} ${text}`);
  }
  console.log(`Rules deployed successfully to ${dbUrl}`);
  console.log(text || '(empty response = success)');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
