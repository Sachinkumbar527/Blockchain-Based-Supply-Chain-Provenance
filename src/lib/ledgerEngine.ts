import type {
  AssetBatch,
  AssetLifecycleStage,
  BenchmarkRun,
  Block,
  BlockAuditResult,
  ChainAuditReport,
  ConsortiumNode,
  CustodyTransaction,
  LedgerSnapshot,
  UtxoRecord,
  VerificationResult,
} from '../types/blockchain';
import {
  computeBlockHash,
  generateAuthorityKeyPair,
  serializeTransactionPayload,
  signPayload,
  verifyPayload,
} from './crypto';

export const STORAGE_KEY = 'verichain_consortium_ledger_v1';
export const BENCHMARK_STORAGE_KEY = 'verichain_benchmark_last_v1';

export const PRODUCT_IMAGES = {
  vaccine: '/src/assets/images/pharma_vaccine_vials_1795091149546.jpg',
  biologic: '/src/assets/images/pharma_biologic_pens_1795091149259.jpg',
  oncology: '/src/assets/images/pharma_oncology_vial_1795091204269.jpg',
  cryo: '/src/assets/images/pharma_cryo_shipper_1795091156413.jpg',
} as const;

const NODE_PROFILES: Array<
  Pick<ConsortiumNode, 'id' | 'name' | 'shortName' | 'role' | 'location' | 'authorityWeight'>
> = [
  {
    id: 'node-helios',
    name: 'Helios Biopharma AG',
    shortName: 'Helios Biopharma',
    role: 'Manufacturer',
    location: 'Basel, CH',
    authorityWeight: 1,
  },
  {
    id: 'node-nordic',
    name: 'NordicCold Freight Logistics',
    shortName: 'NordicCold',
    role: 'Logistics',
    location: 'Rotterdam, NL',
    authorityWeight: 1,
  },
  {
    id: 'node-medcore',
    name: 'MedCore Regional Distribution',
    shortName: 'MedCore Dist.',
    role: 'Distributor',
    location: 'Frankfurt, DE',
    authorityWeight: 1,
  },
  {
    id: 'node-stjude',
    name: 'St. Jude Clinical Pharmacy',
    shortName: 'St. Jude Pharmacy',
    role: 'Pharmacy',
    location: 'Zurich, CH',
    authorityWeight: 1,
  },
  {
    id: 'node-euromed',
    name: 'EuroMed Quality Oversight',
    shortName: 'EuroMed Audit',
    role: 'Regulator',
    location: 'Amsterdam, NL',
    authorityWeight: 1,
  },
];

export function selectNextRoundRobinValidator(
  nodes: ConsortiumNode[],
  slot: number
): { validator: ConsortiumNode; nextSlot: number } {
  const onlineNodes = nodes.filter((n) => n.isOnline);
  const pool = onlineNodes.length > 0 ? onlineNodes : nodes;
  const validator = pool[slot % pool.length];
  return {
    validator,
    nextSlot: slot + 1,
  };
}

async function createSignedTransaction(
  sender: ConsortiumNode,
  txData: Omit<CustodyTransaction, 'signature'>
): Promise<CustodyTransaction> {
  const payload = serializeTransactionPayload(txData);
  const signature = await signPayload(sender.privateJwk, payload);
  return {
    ...txData,
    signature,
  };
}

export async function sealPoABlock(params: {
  index: number;
  previousHash: string;
  transactions: CustodyTransaction[];
  validator: ConsortiumNode;
  timestamp?: string;
}): Promise<Block> {
  const start = performance.now();
  const timestamp = params.timestamp ?? new Date().toISOString();
  const unsignedBlock: Omit<Block, 'hash' | 'validatorSignature'> = {
    index: params.index,
    timestamp,
    previousHash: params.previousHash,
    transactions: params.transactions,
    validatorId: params.validator.id,
    consensusMode: 'PoA',
    sealLatencyMs: 0,
    nonce: 0,
  };

  const hash = await computeBlockHash(unsignedBlock);
  const validatorSignature = await signPayload(params.validator.privateJwk, hash);
  const sealLatencyMs = Number(Math.max(0.35, performance.now() - start).toFixed(2));

  return {
    ...unsignedBlock,
    sealLatencyMs,
    hash,
    validatorSignature,
  };
}

export async function createSeedLedger(): Promise<LedgerSnapshot> {
  const nodes: ConsortiumNode[] = await Promise.all(
    NODE_PROFILES.map(async (profile) => {
      const keys = await generateAuthorityKeyPair();
      return {
        ...profile,
        isOnline: true,
        ...keys,
      };
    })
  );

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<string, ConsortiumNode>;
  const blocks: Block[] = [];
  let slot = 0;

  // Helper for realistic staggered timestamps across recent days
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

  // Block 0: Genesis block sealed by EuroMed Oversight
  const genesisValidator = byId['node-euromed'];
  const genesisTx = await createSignedTransaction(genesisValidator, {
    txId: 'TX-0000-GENESIS',
    type: 'GENESIS',
    tokenId: 'CONSORTIUM-ROOT',
    inputUtxoId: null,
    outputUtxoId: 'TX-0000-GENESIS:0',
    fromParticipantId: 'node-euromed',
    toParticipantId: 'node-euromed',
    timestamp: hoursAgo(96),
    productName: 'Verichain Pharmaceutical Consortium Charter',
    lotNumber: 'CHARTER-2026',
    gtin: '00000000000000',
    dosageUnit: 'Consortium',
    quantity: 5,
    minTempC: 0,
    maxTempC: 0,
    recordedTempC: 0,
    expiryDate: '2035-12-31',
    checkpointLocation: 'Amsterdam, NL',
    notes: 'Genesis authority configuration across five verified supply chain participants.',
    stage: 'Manufactured',
    imageUrl: PRODUCT_IMAGES.vaccine,
  });

  const block0 = await sealPoABlock({
    index: 0,
    previousHash: '0'.repeat(64),
    transactions: [genesisTx],
    validator: genesisValidator,
    timestamp: hoursAgo(96),
  });
  blocks.push(block0);

  // Block 1: Mint VaxCore mRNA-412
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const tx = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1001-MINT',
      type: 'MINT',
      tokenId: 'VCH-2026-0841',
      inputUtxoId: null,
      outputUtxoId: 'TX-1001-MINT:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-helios',
      timestamp: hoursAgo(72),
      productName: 'VaxCore mRNA-412 Seasonal Vaccine',
      lotNumber: 'LOT-HL-841A',
      gtin: '00368412008419',
      dosageUnit: 'doses',
      quantity: 2400,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 3.9,
      expiryDate: '2027-08-15',
      checkpointLocation: 'Basel Sterile Plant 2, CH',
      notes: 'Sterile fill-finish QA passed; batch serialized and sealed in tamper-evident tray.',
      stage: 'Manufactured',
      imageUrl: PRODUCT_IMAGES.vaccine,
    });
    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [tx],
        validator,
        timestamp: hoursAgo(72),
      })
    );
  }

  // Block 2: Mint GlucoPure Biologic & OncoMab-100
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const tx1 = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1002-MINT',
      type: 'MINT',
      tokenId: 'VCH-2026-0842',
      inputUtxoId: null,
      outputUtxoId: 'TX-1002-MINT:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-helios',
      timestamp: hoursAgo(61),
      productName: 'GlucoPure Biologic Auto-Injector',
      lotNumber: 'LOT-HL-842B',
      gtin: '00368412008426',
      dosageUnit: 'pens',
      quantity: 1200,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 4.5,
      expiryDate: '2027-11-30',
      checkpointLocation: 'Basel Biologics Suite 4, CH',
      notes: 'Primary packaging serialized; cold-chain data logger activated.',
      stage: 'Manufactured',
      imageUrl: PRODUCT_IMAGES.biologic,
    });

    const tx2 = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1003-MINT',
      type: 'MINT',
      tokenId: 'VCH-2026-0843',
      inputUtxoId: null,
      outputUtxoId: 'TX-1003-MINT:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-helios',
      timestamp: hoursAgo(60),
      productName: 'OncoMab-100 Infusion Solution',
      lotNumber: 'LOT-HL-843C',
      gtin: '00368412008433',
      dosageUnit: 'vials',
      quantity: 480,
      minTempC: 2.0,
      maxTempC: 6.0,
      recordedTempC: 3.2,
      expiryDate: '2027-06-20',
      checkpointLocation: 'Basel Oncology Line 1, CH',
      notes: 'Monoclonal antibody potency verified; amber glass vials boxed in protective sleeves.',
      stage: 'Manufactured',
      imageUrl: PRODUCT_IMAGES.oncology,
    });

    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [tx1, tx2],
        validator,
        timestamp: hoursAgo(60),
      })
    );
  }

  // Block 3: Custody Handoff VaxCore -> NordicCold Freight
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const tx = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1004-XFER',
      type: 'TRANSFER',
      tokenId: 'VCH-2026-0841',
      inputUtxoId: 'TX-1001-MINT:0',
      outputUtxoId: 'TX-1004-XFER:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-nordic',
      timestamp: hoursAgo(49),
      productName: 'VaxCore mRNA-412 Seasonal Vaccine',
      lotNumber: 'LOT-HL-841A',
      gtin: '00368412008419',
      dosageUnit: 'doses',
      quantity: 2400,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 4.1,
      expiryDate: '2027-08-15',
      checkpointLocation: 'Rotterdam Cold Port Hub, NL',
      notes: 'Loaded onto refrigerated air-ride trailer NC-44; seal intact.',
      stage: 'In Transit',
      imageUrl: PRODUCT_IMAGES.vaccine,
    });
    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [tx],
        validator,
        timestamp: hoursAgo(49),
      })
    );
  }

  // Block 4: Mint CryoStem Cellular Therapy + Transfer GlucoPure -> NordicCold
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const txMint = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1005-MINT',
      type: 'MINT',
      tokenId: 'VCH-2026-0844',
      inputUtxoId: null,
      outputUtxoId: 'TX-1005-MINT:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-helios',
      timestamp: hoursAgo(38),
      productName: 'CryoStem Cellular Therapy Kit',
      lotNumber: 'LOT-HL-844D',
      gtin: '00368412008440',
      dosageUnit: 'kits',
      quantity: 120,
      minTempC: -80.0,
      maxTempC: -60.0,
      recordedTempC: -72.4,
      expiryDate: '2027-04-10',
      checkpointLocation: 'Basel Cryo Vault B, CH',
      notes: 'Packed in vapor-phase cryogenic carrier; ready for specialist courier release.',
      stage: 'Manufactured',
      imageUrl: PRODUCT_IMAGES.cryo,
    });

    const txTransfer = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1006-XFER',
      type: 'TRANSFER',
      tokenId: 'VCH-2026-0842',
      inputUtxoId: 'TX-1002-MINT:0',
      outputUtxoId: 'TX-1006-XFER:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-nordic',
      timestamp: hoursAgo(37),
      productName: 'GlucoPure Biologic Auto-Injector',
      lotNumber: 'LOT-HL-842B',
      gtin: '00368412008426',
      dosageUnit: 'pens',
      quantity: 1200,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 5.2,
      expiryDate: '2027-11-30',
      checkpointLocation: 'Rotterdam Cold Port Hub, NL',
      notes: 'Temperature telemetry nominal throughout cross-border transfer.',
      stage: 'In Transit',
      imageUrl: PRODUCT_IMAGES.biologic,
    });

    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [txMint, txTransfer],
        validator,
        timestamp: hoursAgo(37),
      })
    );
  }

  // Block 5: VaxCore -> MedCore Dist + OncoMab -> NordicCold
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const tx1 = await createSignedTransaction(byId['node-nordic'], {
      txId: 'TX-1007-XFER',
      type: 'TRANSFER',
      tokenId: 'VCH-2026-0841',
      inputUtxoId: 'TX-1004-XFER:0',
      outputUtxoId: 'TX-1007-XFER:0',
      fromParticipantId: 'node-nordic',
      toParticipantId: 'node-medcore',
      timestamp: hoursAgo(24),
      productName: 'VaxCore mRNA-412 Seasonal Vaccine',
      lotNumber: 'LOT-HL-841A',
      gtin: '00368412008419',
      dosageUnit: 'doses',
      quantity: 2400,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 4.6,
      expiryDate: '2027-08-15',
      checkpointLocation: 'Frankfurt Regional Vault 3, DE',
      notes: 'Received into GDP-certified cold storage; carton barcodes reconciled.',
      stage: 'Distributed',
      imageUrl: PRODUCT_IMAGES.vaccine,
    });

    const tx2 = await createSignedTransaction(byId['node-helios'], {
      txId: 'TX-1008-XFER',
      type: 'TRANSFER',
      tokenId: 'VCH-2026-0843',
      inputUtxoId: 'TX-1003-MINT:0',
      outputUtxoId: 'TX-1008-XFER:0',
      fromParticipantId: 'node-helios',
      toParticipantId: 'node-nordic',
      timestamp: hoursAgo(23),
      productName: 'OncoMab-100 Infusion Solution',
      lotNumber: 'LOT-HL-843C',
      gtin: '00368412008433',
      dosageUnit: 'vials',
      quantity: 480,
      minTempC: 2.0,
      maxTempC: 6.0,
      recordedTempC: 3.4,
      expiryDate: '2027-06-20',
      checkpointLocation: 'Rotterdam Cold Port Hub, NL',
      notes: 'Priority oncology cold lane dispatch confirmed.',
      stage: 'In Transit',
      imageUrl: PRODUCT_IMAGES.oncology,
    });

    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [tx1, tx2],
        validator,
        timestamp: hoursAgo(23),
      })
    );
  }

  // Block 6: GlucoPure -> MedCore Distribution
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const tx = await createSignedTransaction(byId['node-nordic'], {
      txId: 'TX-1009-XFER',
      type: 'TRANSFER',
      tokenId: 'VCH-2026-0842',
      inputUtxoId: 'TX-1006-XFER:0',
      outputUtxoId: 'TX-1009-XFER:0',
      fromParticipantId: 'node-nordic',
      toParticipantId: 'node-medcore',
      timestamp: hoursAgo(12),
      productName: 'GlucoPure Biologic Auto-Injector',
      lotNumber: 'LOT-HL-842B',
      gtin: '00368412008426',
      dosageUnit: 'pens',
      quantity: 1200,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 5.0,
      expiryDate: '2027-11-30',
      checkpointLocation: 'Frankfurt Regional Vault 1, DE',
      notes: 'Cold-chain customs clearance completed without excursion.',
      stage: 'Distributed',
      imageUrl: PRODUCT_IMAGES.biologic,
    });

    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [tx],
        validator,
        timestamp: hoursAgo(12),
      })
    );
  }

  // Block 7: VaxCore -> St. Jude Clinical Pharmacy (Final Dispensing Custody)
  {
    const { validator, nextSlot } = selectNextRoundRobinValidator(nodes, slot);
    slot = nextSlot;
    const tx = await createSignedTransaction(byId['node-medcore'], {
      txId: 'TX-1010-XFER',
      type: 'TRANSFER',
      tokenId: 'VCH-2026-0841',
      inputUtxoId: 'TX-1007-XFER:0',
      outputUtxoId: 'TX-1010-XFER:0',
      fromParticipantId: 'node-medcore',
      toParticipantId: 'node-stjude',
      timestamp: hoursAgo(3),
      productName: 'VaxCore mRNA-412 Seasonal Vaccine',
      lotNumber: 'LOT-HL-841A',
      gtin: '00368412008419',
      dosageUnit: 'doses',
      quantity: 2400,
      minTempC: 2.0,
      maxTempC: 8.0,
      recordedTempC: 3.8,
      expiryDate: '2027-08-15',
      checkpointLocation: 'Zurich Clinical Pharmacy Vault, CH',
      notes: 'Final clinical pharmacy verification signed; ready for patient administration.',
      stage: 'Dispensed',
      imageUrl: PRODUCT_IMAGES.vaccine,
    });

    blocks.push(
      await sealPoABlock({
        index: blocks.length,
        previousHash: blocks[blocks.length - 1].hash,
        transactions: [tx],
        validator,
        timestamp: hoursAgo(3),
      })
    );
  }

  return {
    version: 1,
    nodes,
    blocks,
    authenticBlocks: structuredClone(blocks),
    nextRoundRobinSlot: slot,
  };
}

export function deriveLedgerState(blocks: Block[]): {
  batches: AssetBatch[];
  utxos: UtxoRecord[];
} {
  const batchMap = new Map<string, AssetBatch>();
  const utxoMap = new Map<string, UtxoRecord>();

  for (const block of blocks) {
    for (const tx of block.transactions) {
      if (tx.type === 'GENESIS') continue;

      if (tx.inputUtxoId && utxoMap.has(tx.inputUtxoId)) {
        const prev = utxoMap.get(tx.inputUtxoId)!;
        utxoMap.set(tx.inputUtxoId, {
          ...prev,
          status: 'SPENT',
          spentAtBlock: block.index,
          spentByTxId: tx.txId,
        });
      }

      utxoMap.set(tx.outputUtxoId, {
        utxoId: tx.outputUtxoId,
        tokenId: tx.tokenId,
        productName: tx.productName,
        lotNumber: tx.lotNumber,
        ownerId: tx.toParticipantId,
        status: 'UNSPENT',
        createdAtBlock: block.index,
        createdByTxId: tx.txId,
        spentAtBlock: null,
        spentByTxId: null,
        stage: tx.stage,
      });

      const excursion = tx.recordedTempC < tx.minTempC || tx.recordedTempC > tx.maxTempC;
      const existing = batchMap.get(tx.tokenId);

      if (!existing) {
        batchMap.set(tx.tokenId, {
          tokenId: tx.tokenId,
          productName: tx.productName,
          lotNumber: tx.lotNumber,
          gtin: tx.gtin,
          dosageUnit: tx.dosageUnit,
          quantity: tx.quantity,
          minTempC: tx.minTempC,
          maxTempC: tx.maxTempC,
          latestTempC: tx.recordedTempC,
          hasThermalExcursion: excursion,
          expiryDate: tx.expiryDate,
          imageUrl: tx.imageUrl,
          manufacturerId: tx.fromParticipantId,
          currentOwnerId: tx.toParticipantId,
          currentUtxoId: tx.outputUtxoId,
          stage: tx.stage,
          createdAt: tx.timestamp,
          updatedAt: tx.timestamp,
          history: [
            {
              blockIndex: block.index,
              blockHash: block.hash,
              validatorId: block.validatorId,
              tx,
            },
          ],
        });
      } else {
        batchMap.set(tx.tokenId, {
          ...existing,
          quantity: tx.quantity,
          latestTempC: tx.recordedTempC,
          hasThermalExcursion: existing.hasThermalExcursion || excursion,
          currentOwnerId: tx.toParticipantId,
          currentUtxoId: tx.outputUtxoId,
          stage: tx.stage,
          updatedAt: tx.timestamp,
          history: [
            ...existing.history,
            {
              blockIndex: block.index,
              blockHash: block.hash,
              validatorId: block.validatorId,
              tx,
            },
          ],
        });
      }
    }
  }

  return {
    batches: Array.from(batchMap.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    ),
    utxos: Array.from(utxoMap.values()).sort((a, b) => b.createdAtBlock - a.createdAtBlock),
  };
}

export async function auditBlockchain(
  blocks: Block[],
  nodes: ConsortiumNode[]
): Promise<ChainAuditReport> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const results: BlockAuditResult[] = [];
  let runningExpectedPrevHash = '0'.repeat(64);
  let upstreamBroken = false;
  let firstCompromisedIndex: number | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const recalculatedHash = await computeBlockHash({
      index: block.index,
      timestamp: block.timestamp,
      previousHash: block.previousHash,
      transactions: block.transactions,
      validatorId: block.validatorId,
      consensusMode: block.consensusMode,
      sealLatencyMs: block.sealLatencyMs,
      nonce: block.nonce,
    });

    const isHashValid = recalculatedHash === block.hash;
    const isLinkValid = block.previousHash === runningExpectedPrevHash;

    const validatorNode = nodeMap.get(block.validatorId);
    const isValidatorSigValid = validatorNode
      ? await verifyPayload(validatorNode.publicJwk, recalculatedHash, block.validatorSignature)
      : false;

    const txAudits = await Promise.all(
      block.transactions.map(async (tx) => {
        const signer = nodeMap.get(tx.fromParticipantId);
        const valid = signer
          ? await verifyPayload(
              signer.publicJwk,
              serializeTransactionPayload(tx),
              tx.signature
            )
          : false;
        return {
          txId: tx.txId,
          isSignatureValid: valid,
          signerId: tx.fromParticipantId,
        };
      })
    );

    const allTxSignaturesValid = txAudits.every((t) => t.isSignatureValid);
    const isLocallyTampered = !isHashValid || !isValidatorSigValid || !allTxSignaturesValid;
    const isCascadeCompromised = !isLinkValid || upstreamBroken;

    let status: BlockAuditResult['status'] = 'VALID';
    if (isLocallyTampered) {
      status = 'TAMPERED';
    } else if (isCascadeCompromised) {
      status = 'BROKEN_LINK';
    }

    if (status !== 'VALID') {
      if (firstCompromisedIndex === null) {
        firstCompromisedIndex = block.index;
      }
      upstreamBroken = true;
    }

    results.push({
      index: block.index,
      storedHash: block.hash,
      recalculatedHash,
      storedPreviousHash: block.previousHash,
      expectedPreviousHash: runningExpectedPrevHash,
      isHashValid,
      isLinkValid,
      isValidatorSigValid,
      txAudits,
      allTxSignaturesValid,
      isLocallyTampered,
      isCascadeCompromised,
      status,
    });

    // Critical hash-chaining rule: the next block MUST point to the true recalculated hash
    runningExpectedPrevHash = recalculatedHash;
  }

  const compromisedCount = results.filter((r) => r.status !== 'VALID').length;

  return {
    isChainValid: compromisedCount === 0,
    totalBlocks: blocks.length,
    compromisedCount,
    firstCompromisedIndex,
    blocks: results,
  };
}

export async function mintNewBatchBlock(params: {
  snapshot: LedgerSnapshot;
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
  imageUrl: string;
  manufacturerId: string;
}): Promise<{ snapshot: LedgerSnapshot; tokenId: string; block: Block }> {
  const { snapshot } = params;
  const manufacturer = snapshot.nodes.find((n) => n.id === params.manufacturerId) ?? snapshot.nodes[0];
  const { validator, nextSlot } = selectNextRoundRobinValidator(
    snapshot.nodes,
    snapshot.nextRoundRobinSlot
  );

  const { batches } = deriveLedgerState(snapshot.blocks);
  const nextSerial = 841 + batches.length;
  const tokenId = `VCH-2026-${String(nextSerial).padStart(4, '0')}`;
  const txId = `TX-${1001 + snapshot.blocks.reduce((acc, b) => acc + b.transactions.length, 0)}-MINT`;

  const tx = await createSignedTransaction(manufacturer, {
    txId,
    type: 'MINT',
    tokenId,
    inputUtxoId: null,
    outputUtxoId: `${txId}:0`,
    fromParticipantId: manufacturer.id,
    toParticipantId: manufacturer.id,
    timestamp: new Date().toISOString(),
    productName: params.productName.trim(),
    lotNumber: params.lotNumber.trim().toUpperCase(),
    gtin: params.gtin.trim(),
    dosageUnit: params.dosageUnit.trim() || 'doses',
    quantity: params.quantity,
    minTempC: params.minTempC,
    maxTempC: params.maxTempC,
    recordedTempC: params.recordedTempC,
    expiryDate: params.expiryDate,
    checkpointLocation: params.checkpointLocation.trim() || manufacturer.location,
    notes: params.notes.trim() || 'Batch minted and serialized onto consortium ledger.',
    stage: 'Manufactured',
    imageUrl: params.imageUrl,
  });

  const previousHash = snapshot.blocks[snapshot.blocks.length - 1].hash;
  const block = await sealPoABlock({
    index: snapshot.blocks.length,
    previousHash,
    transactions: [tx],
    validator,
  });

  const nextBlocks = [...snapshot.blocks, block];
  const isUntampered =
    JSON.stringify(snapshot.blocks) === JSON.stringify(snapshot.authenticBlocks);

  return {
    tokenId,
    block,
    snapshot: {
      ...snapshot,
      blocks: nextBlocks,
      authenticBlocks: isUntampered
        ? structuredClone(nextBlocks)
        : [...snapshot.authenticBlocks, structuredClone(block)],
      nextRoundRobinSlot: nextSlot,
    },
  };
}

export async function transferBatchCustodyBlock(params: {
  snapshot: LedgerSnapshot;
  tokenId: string;
  toParticipantId: string;
  recordedTempC: number;
  checkpointLocation: string;
  notes: string;
}): Promise<{ snapshot: LedgerSnapshot; block: Block }> {
  const { snapshot } = params;
  const { batches, utxos } = deriveLedgerState(snapshot.blocks);
  const batch = batches.find((b) => b.tokenId === params.tokenId);
  if (!batch) {
    throw new Error(`Asset token ${params.tokenId} was not found on the ledger.`);
  }

  const activeUtxo = utxos.find(
    (u) => u.utxoId === batch.currentUtxoId && u.status === 'UNSPENT'
  );
  if (!activeUtxo) {
    throw new Error(`No active unspent custody UTXO available for ${params.tokenId}.`);
  }

  const sender = snapshot.nodes.find((n) => n.id === batch.currentOwnerId);
  const recipient = snapshot.nodes.find((n) => n.id === params.toParticipantId);
  if (!sender || !recipient) {
    throw new Error('Invalid custodian participant selected.');
  }
  if (sender.id === recipient.id) {
    throw new Error('Recipient must be a different consortium organization.');
  }

  const stageByRole: Record<ConsortiumNode['role'], AssetLifecycleStage> = {
    Manufacturer: 'Manufactured',
    Logistics: 'In Transit',
    Distributor: 'Distributed',
    Pharmacy: 'Dispensed',
    Regulator: batch.stage,
  };

  const { validator, nextSlot } = selectNextRoundRobinValidator(
    snapshot.nodes,
    snapshot.nextRoundRobinSlot
  );

  const txId = `TX-${1001 + snapshot.blocks.reduce((acc, b) => acc + b.transactions.length, 0)}-XFER`;

  const tx = await createSignedTransaction(sender, {
    txId,
    type: 'TRANSFER',
    tokenId: batch.tokenId,
    inputUtxoId: activeUtxo.utxoId,
    outputUtxoId: `${txId}:0`,
    fromParticipantId: sender.id,
    toParticipantId: recipient.id,
    timestamp: new Date().toISOString(),
    productName: batch.productName,
    lotNumber: batch.lotNumber,
    gtin: batch.gtin,
    dosageUnit: batch.dosageUnit,
    quantity: batch.quantity,
    minTempC: batch.minTempC,
    maxTempC: batch.maxTempC,
    recordedTempC: params.recordedTempC,
    expiryDate: batch.expiryDate,
    checkpointLocation: params.checkpointLocation.trim() || recipient.location,
    notes: params.notes.trim() || `Custody transferred from ${sender.shortName} to ${recipient.shortName}.`,
    stage: stageByRole[recipient.role],
    imageUrl: batch.imageUrl,
  });

  const previousHash = snapshot.blocks[snapshot.blocks.length - 1].hash;
  const block = await sealPoABlock({
    index: snapshot.blocks.length,
    previousHash,
    transactions: [tx],
    validator,
  });

  const nextBlocks = [...snapshot.blocks, block];
  const isUntampered =
    JSON.stringify(snapshot.blocks) === JSON.stringify(snapshot.authenticBlocks);

  return {
    block,
    snapshot: {
      ...snapshot,
      blocks: nextBlocks,
      authenticBlocks: isUntampered
        ? structuredClone(nextBlocks)
        : [...snapshot.authenticBlocks, structuredClone(block)],
      nextRoundRobinSlot: nextSlot,
    },
  };
}

export function verifyProductAuthenticity(params: {
  query: string;
  blocks: Block[];
  audit: ChainAuditReport;
  nodes: ConsortiumNode[];
  simulateClone?: boolean;
}): VerificationResult {
  const { query, blocks, audit, nodes, simulateClone } = params;
  const cleanQuery = query.trim().toUpperCase();
  const { batches, utxos } = deriveLedgerState(blocks);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  if (simulateClone) {
    const targetBatch = batches[0] ?? null;
    const spentUtxo =
      utxos.find((u) => u.tokenId === targetBatch?.tokenId && u.status === 'SPENT') ??
      utxos.find((u) => u.status === 'SPENT');
    const legitOwner = targetBatch
      ? nodeMap.get(targetBatch.currentOwnerId)?.name ?? 'Authorized Pharmacy'
      : 'Authorized Custodian';

    return {
      query: cleanQuery || `${targetBatch?.tokenId ?? 'VCH-2026-0841'}-CLONE`,
      verdict: 'COUNTERFEIT',
      headline: 'Counterfeit Clone Detected — Double-Spent UTXO',
      explanation:
        'The scanned packaging references a previously spent custody output (UTXO). The genuine batch has already moved downstream under a newly signed ownership record, confirming this label is a duplicated counterfeit.',
      batch: targetBatch,
      checks: {
        ledgerIntegrity: {
          passed: audit.isChainValid,
          detail: audit.isChainValid
            ? `All ${audit.totalBlocks} ledger blocks pass SHA-256 hash chaining.`
            : `${audit.compromisedCount} ledger blocks show hash tampering.`,
        },
        signatureChain: {
          passed: false,
          detail: 'Presented carrier signature does not match current authorized custodian key.',
        },
        utxoOwnership: {
          passed: false,
          detail: spentUtxo
            ? `UTXO ${spentUtxo.utxoId} was already spent by ${spentUtxo.spentByTxId}.`
            : 'Presented serial does not reference an active unspent UTXO.',
        },
        coldChainCompliance: {
          passed: false,
          detail: 'Unverified custody gap outside authorized consortium telemetry.',
        },
      },
      simulatedCloneAlert: {
        clonedUtxoId: spentUtxo?.utxoId ?? 'TX-1001-MINT:0',
        spentByTxId: spentUtxo?.spentByTxId ?? 'TX-1004-XFER',
        legitimateOwnerName: legitOwner,
      },
    };
  }

  const batch = batches.find(
    (b) =>
      b.tokenId.toUpperCase() === cleanQuery ||
      b.lotNumber.toUpperCase() === cleanQuery ||
      b.gtin.toUpperCase() === cleanQuery
  );

  if (!batch) {
    return {
      query: cleanQuery,
      verdict: 'NOT_FOUND',
      headline: 'Unregistered Batch Identifier',
      explanation:
        'No tokenized pharmaceutical batch matches this Token ID, Lot Number, or GTIN on the Verichain consortium ledger. Do not dispense until origin is verified.',
      batch: null,
      checks: {
        ledgerIntegrity: {
          passed: audit.isChainValid,
          detail: audit.isChainValid
            ? 'Consortium ledger hashes are intact.'
            : 'Consortium ledger integrity alert active.',
        },
        signatureChain: {
          passed: false,
          detail: 'No manufacturer mint signature exists for this serial.',
        },
        utxoOwnership: {
          passed: false,
          detail: 'Zero matching unspent custody outputs found.',
        },
        coldChainCompliance: {
          passed: false,
          detail: 'No certified temperature log recorded.',
        },
      },
    };
  }

  const batchBlockIndices = new Set(batch.history.map((h) => h.blockIndex));
  const batchBlockAudits = audit.blocks.filter((b) => batchBlockIndices.has(b.index));
  const allBatchSigsValid = batchBlockAudits.every(
    (b) => b.isValidatorSigValid && b.allTxSignaturesValid
  );
  const allBatchBlocksValid = batchBlockAudits.every((b) => b.status === 'VALID');
  const activeUtxo = utxos.find(
    (u) => u.utxoId === batch.currentUtxoId && u.status === 'UNSPENT'
  );
  const thermalOk = !batch.hasThermalExcursion;
  const currentOwner = nodeMap.get(batch.currentOwnerId)?.name ?? batch.currentOwnerId;

  if (!audit.isChainValid || !allBatchBlocksValid || !allBatchSigsValid) {
    return {
      query: batch.tokenId,
      verdict: 'TAMPERED',
      headline: 'Ledger Integrity Violation Detected',
      explanation:
        'Cryptographic hash chaining or ECDSA signature verification failed for one or more blocks linked to this batch. Quarantine this inventory immediately until audited.',
      batch,
      checks: {
        ledgerIntegrity: {
          passed: false,
          detail: `Hash chain broken starting at Block #${audit.firstCompromisedIndex ?? 0}.`,
        },
        signatureChain: {
          passed: allBatchSigsValid,
          detail: allBatchSigsValid
            ? `All ${batch.history.length} ECDSA custody signatures remain intact.`
            : 'ECDSA payload signature mismatch detected on modified transaction.',
        },
        utxoOwnership: {
          passed: Boolean(activeUtxo),
          detail: activeUtxo
            ? `Current UTXO ${activeUtxo.utxoId} held by ${currentOwner}.`
            : 'UTXO lineage could not be validated.',
        },
        coldChainCompliance: {
          passed: thermalOk,
          detail: thermalOk
            ? `All checkpoints within ${batch.minTempC.toFixed(1)}°C to ${batch.maxTempC.toFixed(1)}°C.`
            : `Thermal excursion recorded (${batch.latestTempC.toFixed(1)}°C outside target band).`,
        },
      },
    };
  }

  return {
    query: batch.tokenId,
    verdict: 'AUTHENTIC',
    headline: 'Verified Authentic Pharmaceutical Batch',
    explanation: `All ${batch.history.length} custody handoffs from manufacturer to ${currentOwner} are cryptographically signed, hash-chained, and anchored by an active unspent UTXO.`,
    batch,
    checks: {
      ledgerIntegrity: {
        passed: true,
        detail: `Verified across ${audit.totalBlocks} SHA-256 hash-chained blocks.`,
      },
      signatureChain: {
        passed: true,
        detail: `${batch.history.length}/${batch.history.length} ECDSA P-256 signatures & PoA seals valid.`,
      },
      utxoOwnership: {
        passed: Boolean(activeUtxo),
        detail: `Single active UTXO ${batch.currentUtxoId} assigned to ${currentOwner}.`,
      },
      coldChainCompliance: {
        passed: thermalOk,
        detail: thermalOk
          ? `Latest checkpoint ${batch.latestTempC.toFixed(1)}°C (target ${batch.minTempC.toFixed(1)}°C – ${batch.maxTempC.toFixed(1)}°C).`
          : `Excursion alert: ${batch.latestTempC.toFixed(1)}°C outside ${batch.minTempC.toFixed(1)}°C – ${batch.maxTempC.toFixed(1)}°C.`,
      },
    },
  };
}

export function createBaselineBenchmark(): BenchmarkRun {
  const samples = [
    { blockNumber: 1, poaLatencyMs: 0.84, powLatencyMs: 38.4, powHashes: 241, powNonce: 240 },
    { blockNumber: 2, poaLatencyMs: 0.72, powLatencyMs: 64.9, powHashes: 418, powNonce: 417 },
    { blockNumber: 3, poaLatencyMs: 0.79, powLatencyMs: 29.1, powHashes: 185, powNonce: 184 },
    { blockNumber: 4, poaLatencyMs: 0.68, powLatencyMs: 81.6, powHashes: 512, powNonce: 511 },
    { blockNumber: 5, poaLatencyMs: 0.75, powLatencyMs: 53.2, powHashes: 339, powNonce: 338 },
  ];
  const poaAvgMs = 0.76;
  const powAvgMs = 53.44;
  return {
    id: 'baseline-poa-pow',
    ranAt: new Date().toISOString(),
    isBaseline: true,
    batchSize: 5,
    powDifficulty: 2,
    poaAvgMs,
    powAvgMs,
    poaTps: Math.round(1000 / poaAvgMs),
    powTps: Number((1000 / powAvgMs).toFixed(1)),
    speedupFactor: Number((powAvgMs / poaAvgMs).toFixed(1)),
    totalPowHashes: samples.reduce((sum, s) => sum + s.powHashes, 0),
    samples,
    difficultyCurve: [
      { difficulty: 1, poaAvgMs: 0.74, powAvgMs: 4.8, powAvgHashes: 18 },
      { difficulty: 2, poaAvgMs: 0.76, powAvgMs: 53.4, powAvgHashes: 339 },
      { difficulty: 3, poaAvgMs: 0.75, powAvgMs: 618.2, powAvgHashes: 4096 },
    ],
  };
}

export function loadSnapshotFromStorage(): LedgerSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LedgerSnapshot;
    if (!parsed || !Array.isArray(parsed.blocks) || !Array.isArray(parsed.nodes)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSnapshotToStorage(snapshot: LedgerSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota issues in private browsing
  }
}

export function loadBenchmarkFromStorage(): BenchmarkRun | null {
  try {
    const raw = localStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BenchmarkRun;
  } catch {
    return null;
  }
}

export function saveBenchmarkToStorage(run: BenchmarkRun): void {
  try {
    localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(run));
  } catch {
    // Ignore storage quota issues
  }
}
