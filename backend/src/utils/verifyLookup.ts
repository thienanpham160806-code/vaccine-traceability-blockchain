const identifierPattern = /^[A-Za-z0-9._:-]{3,128}$/;
const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;

export type VerifyLookup =
  | {
      kind: 'identifier';
      value: string;
    }
  | {
      kind: 'batchPayload';
      value: string;
      batchHash: string;
      metadataHash: string;
    };

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return null;
  }
}

function extractVerifyPath(value: string): string | null {
  try {
    const parsedUrl = new URL(value);
    const match = parsedUrl.pathname.match(/^\/(?:consumer|dashboard)\/verify\/([^/]+)\/?$/);
    return match ? safeDecode(match[1]) : null;
  } catch {
    return null;
  }
}

export function parseVerifyLookup(rawValue: string): VerifyLookup | null {
  const decodedValue = safeDecode(rawValue);
  if (!decodedValue) return null;

  const value = extractVerifyPath(decodedValue) || decodedValue;
  const payloadParts = value.split('/').map((part) => part.trim());

  if (
    payloadParts.length === 2 &&
    payloadParts.every((part) => bytes32Pattern.test(part))
  ) {
    return {
      kind: 'batchPayload',
      value,
      batchHash: payloadParts[0],
      metadataHash: payloadParts[1],
    };
  }

  if (identifierPattern.test(value)) {
    return {
      kind: 'identifier',
      value,
    };
  }

  return null;
}

function equalsDefined(left: unknown, right: string): boolean {
  return typeof left === 'string' && left.length > 0 && left === right;
}

export function findProductForLookup(products: any[], lookup: VerifyLookup): any | null {
  if (lookup.kind === 'batchPayload') {
    return (
      products.find(
        (product) =>
          equalsDefined(product?.batchHash, lookup.batchHash) ||
          equalsDefined(product?.metadataHash, lookup.metadataHash)
      ) || null
    );
  }

  return (
    products.find(
      (product) =>
        equalsDefined(product?.serialId, lookup.value) ||
        equalsDefined(product?.serialHash, lookup.value) ||
        equalsDefined(product?.batchId, lookup.value) ||
        equalsDefined(product?.batchHash, lookup.value) ||
        equalsDefined(product?.metadataHash, lookup.value)
    ) || null
  );
}

export function findBatchForPayload(batches: any[], lookup: VerifyLookup): any | null {
  if (lookup.kind !== 'batchPayload') return null;

  return (
    batches.find(
      (batch) =>
        equalsDefined(batch?.batchHash, lookup.batchHash) ||
        equalsDefined(batch?.id, lookup.batchHash) ||
        equalsDefined(batch?.batchQR, lookup.batchHash) ||
        equalsDefined(batch?.metadataHash, lookup.metadataHash)
    ) || null
  );
}

export function productBelongsToBatch(product: any, batch: any): boolean {
  return (
    (typeof batch?.batchHash === 'string' &&
      batch.batchHash.length > 0 &&
      product?.batchHash === batch.batchHash) ||
    (typeof batch?.id === 'string' &&
      batch.id.length > 0 &&
      product?.batchId === batch.id)
  );
}
