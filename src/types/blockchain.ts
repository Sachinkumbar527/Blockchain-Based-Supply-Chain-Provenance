export type ParticipantRole =
  | 'Manufacturer'
  | 'Logistics'
  | 'Distributor'
  | 'Pharmacy'
  | 'Regulator';

export type AssetLifecycleStage =
  | 'Manufactured'
  | 'In Transit'
  | 'Distributed'
  | 'Dispensed';

export type TransactionType = 'GENESIS' | 'MINT' | 'TRANSFER';

export interface ConsortiumNode {
  id: string;
  name: string;
  shortName: string;
  role: ParticipantRole;
  location: string;
  authorityWeight: number;
  isOnline: boolean;
  publicKeyFingerprint: string;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

export interface CustodyTransaction {
  txId: string;
  type: TransactionType;
  tokenId: string;
  inputUtxoId: string | null;
  outputUtxoId: string;
  fromParticipantId: string;
  toParticipantId: string;
  timestamp: string;
  productName: string;
  lotNumber: string;
  gtin: string;
  dosageUnit: string;
  quantity: number;
  minTempC: number;
  maxTempC: number;
  recordedTempC: number;
  expiryDate: string;
  checkpointLocation: string;
  notes: string;
  stage: AssetLifecycleStage;
  imageUrl: string;
  signature: string;
}

export interface Block {
  index: number;
  timestamp: string;
  previousHash: string;
  transactions: CustodyTransaction[];
  validatorId: string;
  validatorSignature: string;
  consensusMode: 'PoA';
  sealLatencyMs: number;
  nonce: number;
  hash: string;
}

export interface UtxoRecord {
  utxoId: string;
  tokenId: string;
  productName: string;
  lotNumber: string;
  ownerId: string;
  status: 'UNSPENT' | 'SPENT';
  createdAtBlock: number;
  createdByTxId: string;
  spentAtBlock: number | null;
  spentByTxId: string | null;
  stage: AssetLifecycleStage;
}

export interface AssetBatch {
  tokenId: string;
  productName: string;
  lotNumber: string;
  gtin: string;
  dosageUnit: string;
  quantity: number;
  minTempC: number;
  maxTempC: number;
  latestTempC: number;
  hasThermalExcursion: boolean;
  expiryDate: string;
  imageUrl: string;
  manufacturerId: string;
  currentOwnerId: string;
  currentUtxoId: string;
  stage: AssetLifecycleStage;
  createdAt: string;
  updatedAt: string;
  history: Array<{
    blockIndex: number;
    blockHash: string;
    validatorId: string;
    tx: CustodyTransaction;
  }>;
}

export interface TransactionAudit {
  txId: string;
  isSignatureValid: boolean;
  signerId: string;
}

export interface BlockAuditResult {
  index: number;
  storedHash: string;
  recalculatedHash: string;
  storedPreviousHash: string;
  expectedPreviousHash: string;
  isHashValid: boolean;
  isLinkValid: boolean;
  isValidatorSigValid: boolean;
  txAudits: TransactionAudit[];
  allTxSignaturesValid: boolean;
  isLocallyTampered: boolean;
  isCascadeCompromised: boolean;
  status: 'VALID' | 'TAMPERED' | 'BROKEN_LINK';
}

export interface ChainAuditReport {
  isChainValid: boolean;
  totalBlocks: number;
  compromisedCount: number;
  firstCompromisedIndex: number | null;
  blocks: BlockAuditResult[];
}

export interface BenchmarkBlockSample {
  blockNumber: number;
  poaLatencyMs: number;
  powLatencyMs: number;
  powHashes: number;
  powNonce: number;
}

export interface DifficultyCurvePoint {
  difficulty: number;
  poaAvgMs: number;
  powAvgMs: number;
  powAvgHashes: number;
}

export interface BenchmarkRun {
  id: string;
  ranAt: string;
  isBaseline: boolean;
  batchSize: number;
  powDifficulty: number;
  poaAvgMs: number;
  powAvgMs: number;
  poaTps: number;
  powTps: number;
  speedupFactor: number;
  totalPowHashes: number;
  samples: BenchmarkBlockSample[];
  difficultyCurve: DifficultyCurvePoint[];
}

export interface VerificationResult {
  query: string;
  verdict: 'AUTHENTIC' | 'COUNTERFEIT' | 'TAMPERED' | 'NOT_FOUND';
  headline: string;
  explanation: string;
  batch: AssetBatch | null;
  checks: {
    ledgerIntegrity: { passed: boolean; detail: string };
    signatureChain: { passed: boolean; detail: string };
    utxoOwnership: { passed: boolean; detail: string };
    coldChainCompliance: { passed: boolean; detail: string };
  };
  simulatedCloneAlert?: {
    clonedUtxoId: string;
    spentByTxId: string;
    legitimateOwnerName: string;
  };
}

export interface LedgerSnapshot {
  version: number;
  nodes: ConsortiumNode[];
  blocks: Block[];
  authenticBlocks: Block[];
  nextRoundRobinSlot: number;
}
