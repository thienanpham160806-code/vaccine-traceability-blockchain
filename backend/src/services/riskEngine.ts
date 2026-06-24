export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface RiskResult {
  riskLevel: RiskLevel;
  riskScore: number;
  triggeredRules: string[];
}

const MS_PER_DAY = 86_400_000;

export function assessRisk(product: any, batch?: any): RiskResult {
  const rules: string[] = [];
  let score = 0;

  const status = String(product?.status || '').toUpperCase();

  if (status === 'RECALLED') {
    return { riskLevel: 'CRITICAL', riskScore: 100, triggeredRules: ['RECALLED'] };
  }

  if (status === 'FLAGGED') {
    rules.push('FLAGGED');
    score = Math.max(score, 75);
  }

  const expiryRaw = product?.expiryDate ?? batch?.expiryDate;
  if (expiryRaw) {
    const expiryMs = typeof expiryRaw === 'number' ? expiryRaw : new Date(expiryRaw).getTime();
    const daysLeft = (expiryMs - Date.now()) / MS_PER_DAY;

    if (daysLeft <= 0) {
      rules.push('EXPIRED');
      score = Math.max(score, 90);
    } else if (daysLeft <= 30) {
      rules.push('EXPIRING_SOON_30D');
      score = Math.max(score, 70);
    } else if (daysLeft <= 90) {
      rules.push('EXPIRING_SOON_90D');
      score = Math.max(score, 50);
    }
  }

  if (batch?.recalledAt) {
    rules.push('BATCH_RECALLED_FIREBASE');
    score = Math.max(score, 95);
  }

  if (score === 0) {
    return { riskLevel: 'LOW', riskScore: 10, triggeredRules: [] };
  }

  let riskLevel: RiskLevel;
  if (score >= 90) riskLevel = 'CRITICAL';
  else if (score >= 70) riskLevel = 'HIGH';
  else riskLevel = 'MEDIUM';

  return { riskLevel, riskScore: score, triggeredRules: rules };
}
