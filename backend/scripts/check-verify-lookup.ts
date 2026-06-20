import assert from 'node:assert/strict';
import {
  findBatchForPayload,
  findProductForLookup,
  parseVerifyLookup,
} from '../src/utils/verifyLookup';

const products = [
  {
    serialId: 'VCN-20260621001',
    serialHash: `0x${'1'.repeat(64)}`,
    batchId: 'BATCH-VCN-20260621',
    batchHash: `0x${'2'.repeat(64)}`,
    metadataHash: `0x${'3'.repeat(64)}`,
  },
];

const batchesWithoutMetadata = [
  {
    id: 'BATCH-VCN-20260621',
    batchHash: `0x${'2'.repeat(64)}`,
  },
];

const bankQr = '00020101021238570010A00000072701270006970422011312345678901234580208QRIBFTTA530370454061000005802VN6304ABCD';
const bankLookup = parseVerifyLookup(bankQr);
assert.ok(bankLookup);
assert.equal(findProductForLookup(products, bankLookup), null);
assert.equal(findBatchForPayload(batchesWithoutMetadata, bankLookup), null);

assert.equal(parseVerifyLookup('https://bank.example/transfer/123456'), null);

const serialLookup = parseVerifyLookup(
  'https://vaxitrust.example/consumer/verify/VCN-20260621001'
);
assert.deepEqual(serialLookup, {
  kind: 'identifier',
  value: 'VCN-20260621001',
});
assert.equal(findProductForLookup(products, serialLookup!), products[0]);

const batchPayload = `${products[0].batchHash}/${products[0].metadataHash}`;
const batchLookup = parseVerifyLookup(batchPayload);
assert.equal(batchLookup?.kind, 'batchPayload');
assert.equal(findProductForLookup(products, batchLookup!), products[0]);

console.log('Verify lookup checks passed.');
