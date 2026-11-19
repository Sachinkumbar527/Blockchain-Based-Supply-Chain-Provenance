import type { Block, CustodyTransaction } from '../types/blockchain';

const encoder = new TextEncoder();

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBuffer(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

export async function generateAuthorityKeyPair(): Promise<{
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  publicKeyFingerprint: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
  ]);

  const hash = await sha256Hex(`${publicJwk.x ?? ''}:${publicJwk.y ?? ''}`);
  const publicKeyFingerprint = `EC256-${hash.slice(0, 6).toUpperCase()}-${hash.slice(6, 10).toUpperCase()}`;

  return { publicJwk, privateJwk, publicKeyFingerprint };
}

export async function signPayload(privateJwk: JsonWebKey, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    encoder.encode(payload)
  );
  return bufferToHex(signature);
}

export async function verifyPayload(
  publicJwk: JsonWebKey,
  payload: string,
  signatureHex: string
): Promise<boolean> {
  try {
    if (!signatureHex || signatureHex.length < 16) return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const sigBytes = hexToBuffer(signatureHex);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      sigBytes.buffer as ArrayBuffer,
      encoder.encode(payload)
    );
  } catch {
    return false;
  }
}

export function serializeTransactionPayload(
  tx: Omit<CustodyTransaction, 'signature'>
): string {
  return JSON.stringify({
    txId: tx.txId,
    type: tx.type,
    tokenId: tx.tokenId,
    inputUtxoId: tx.inputUtxoId,
    outputUtxoId: tx.outputUtxoId,
    fromParticipantId: tx.fromParticipantId,
    toParticipantId: tx.toParticipantId,
    timestamp: tx.timestamp,
    productName: tx.productName,
    lotNumber: tx.lotNumber,
    gtin: tx.gtin,
    dosageUnit: tx.dosageUnit,
    quantity: tx.quantity,
    minTempC: tx.minTempC,
    maxTempC: tx.maxTempC,
    recordedTempC: tx.recordedTempC,
    expiryDate: tx.expiryDate,
    checkpointLocation: tx.checkpointLocation,
    notes: tx.notes,
    stage: tx.stage,
  });
}

export function serializeBlockHeaderAndBody(
  block: Omit<Block, 'hash' | 'validatorSignature'>
): string {
  return JSON.stringify({
    index: block.index,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    validatorId: block.validatorId,
    consensusMode: block.consensusMode,
    nonce: block.nonce,
    transactions: block.transactions.map((tx) => ({
      payload: serializeTransactionPayload(tx),
      signature: tx.signature,
    })),
  });
}

export async function computeBlockHash(
  block: Omit<Block, 'hash' | 'validatorSignature'>
): Promise<string> {
  const canonical = serializeBlockHeaderAndBody(block);
  return sha256Hex(canonical);
}

export async function sealPoABenchmarkBlock(
  payload: string,
  validatorPrivateJwk: JsonWebKey
): Promise<{ hash: string; signature: string; latencyMs: number }> {
  const start = performance.now();
  const hash = await sha256Hex(payload);
  const signature = await signPayload(validatorPrivateJwk, hash);
  const latencyMs = Math.max(0.05, performance.now() - start);
  return { hash, signature, latencyMs };
}

export async function minePoWBenchmarkBlock(
  payload: string,
  difficulty: number,
  isCancelled?: () => boolean
): Promise<{
  hash: string;
  nonce: number;
  hashesComputed: number;
  latencyMs: number;
  cancelled: boolean;
}> {
  const targetPrefix = '0'.repeat(Math.max(1, Math.min(4, difficulty)));
  const start = performance.now();
  let nonce = 0;

  while (true) {
    if (isCancelled?.()) {
      return {
        hash: '',
        nonce,
        hashesComputed: nonce,
        latencyMs: performance.now() - start,
        cancelled: true,
      };
    }

    const digest = await sha256Hex(`${payload}:${nonce}`);
    nonce += 1;

    if (digest.startsWith(targetPrefix)) {
      return {
        hash: digest,
        nonce: nonce - 1,
        hashesComputed: nonce,
        latencyMs: Math.max(0.1, performance.now() - start),
        cancelled: false,
      };
    }

    if (nonce % 120 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

export function truncateHash(hash: string, start = 10, end = 8): string {
  if (!hash) return '—';
  if (hash.length <= start + end + 3) return hash;
  return `${hash.slice(0, start)}…${hash.slice(-end)}`;
}
