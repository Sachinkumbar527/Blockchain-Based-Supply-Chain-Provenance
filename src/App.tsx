import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert, X } from 'lucide-react';
import type {
  AssetBatch,
  BenchmarkRun,
  ChainAuditReport,
  LedgerSnapshot,
} from './types/blockchain';
import {
  auditBlockchain,
  createBaselineBenchmark,
  createSeedLedger,
  deriveLedgerState,
  loadBenchmarkFromStorage,
  loadSnapshotFromStorage,
  mintNewBatchBlock,
  saveBenchmarkToStorage,
  saveSnapshotToStorage,
  transferBatchCustodyBlock,
} from './lib/ledgerEngine';
import { Sidebar, type NavView } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OverviewView } from './components/OverviewView';
import { AssetCustodyView } from './components/AssetCustodyView';
import { LedgerAuditView } from './components/LedgerAuditView';
import { BenchmarksView } from './components/BenchmarksView';
import { VerifyProductView } from './components/VerifyProductView';
import { ProvenanceDrawer } from './components/ProvenanceDrawer';

interface ToastMessage {
  id: number;
  tone: 'success' | 'alert';
  text: string;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [audit, setAudit] = useState<ChainAuditReport | null>(null);
  const [benchmarkRun, setBenchmarkRun] = useState<BenchmarkRun>(
    () => loadBenchmarkFromStorage() ?? createBaselineBenchmark()
  );

  const [activeView, setActiveView] = useState<NavView>('overview');
  const [custodyMode, setCustodyMode] = useState<'handoff' | 'mint' | 'utxo'>('handoff');
  const [custodyPreselectToken, setCustodyPreselectToken] = useState<string | null>(null);
  const [verifyQueryToken, setVerifyQueryToken] = useState<string | null>(null);
  const [drawerTokenId, setDrawerTokenId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const pushToast = useCallback((text: string, tone: 'success' | 'alert' = 'success') => {
    const id = Date.now();
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4200);
  }, []);

  // Boot consortium ledger from browser storage or generate cryptographically signed seed
  useEffect(() => {
    let active = true;
    const init = async () => {
      const saved = loadSnapshotFromStorage();
      if (saved) {
        const report = await auditBlockchain(saved.blocks, saved.nodes);
        if (!active) return;
        setSnapshot(saved);
        setAudit(report);
        return;
      }

      const fresh = await createSeedLedger();
      saveSnapshotToStorage(fresh);
      const report = await auditBlockchain(fresh.blocks, fresh.nodes);
      if (!active) return;
      setSnapshot(fresh);
      setAudit(report);
    };

    init();
    return () => {
      active = false;
    };
  }, []);

  const commitSnapshot = useCallback(async (next: LedgerSnapshot) => {
    saveSnapshotToStorage(next);
    const report = await auditBlockchain(next.blocks, next.nodes);
    setSnapshot(next);
    setAudit(report);
    return report;
  }, []);

  const derived = useMemo(() => {
    if (!snapshot) return { batches: [], utxos: [] };
    return deriveLedgerState(snapshot.blocks);
  }, [snapshot]);

  const drawerBatch: AssetBatch | null = useMemo(() => {
    if (!drawerTokenId) return null;
    return derived.batches.find((b) => b.tokenId === drawerTokenId) ?? null;
  }, [derived.batches, drawerTokenId]);

  const handleResetDemo = useCallback(async () => {
    setIsResetting(true);
    try {
      const fresh = await createSeedLedger();
      await commitSnapshot(fresh);
      const baseline = createBaselineBenchmark();
      saveBenchmarkToStorage(baseline);
      setBenchmarkRun(baseline);
      setDrawerTokenId(null);
      pushToast('Demo ledger and cryptographic keys restored to initial state.');
    } finally {
      setIsResetting(false);
    }
  }, [commitSnapshot, pushToast]);

  const handleToggleNodeOnline = useCallback(
    async (nodeId: string) => {
      if (!snapshot) return;
      const onlineCount = snapshot.nodes.filter((n) => n.isOnline).length;
      const target = snapshot.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      if (target.isOnline && onlineCount <= 1) return;

      const updatedNodes = snapshot.nodes.map((n) =>
        n.id === nodeId ? { ...n, isOnline: !n.isOnline } : n
      );
      await commitSnapshot({ ...snapshot, nodes: updatedNodes });
      pushToast(
        `${target.shortName} validator is now ${target.isOnline ? 'offline (skipped in PoA rotation)' : 'online'}.`
      );
    },
    [snapshot, commitSnapshot, pushToast]
  );

  const handleMintBatch = useCallback(
    async (payload: Parameters<typeof mintNewBatchBlock>[0] extends infer P ? Omit<P, 'snapshot'> : never) => {
      if (!snapshot) return;
      const res = await mintNewBatchBlock({ ...payload, snapshot });
      await commitSnapshot(res.snapshot);
      setCustodyPreselectToken(res.tokenId);
      pushToast(
        `Minted ${res.tokenId} and sealed Block #${res.block.index} in ${res.block.sealLatencyMs.toFixed(2)} ms.`
      );
    },
    [snapshot, commitSnapshot, pushToast]
  );

  const handleTransferCustody = useCallback(
    async (payload: {
      tokenId: string;
      toParticipantId: string;
      recordedTempC: number;
      checkpointLocation: string;
      notes: string;
    }) => {
      if (!snapshot) return;
      const res = await transferBatchCustodyBlock({ ...payload, snapshot });
      await commitSnapshot(res.snapshot);
      pushToast(
        `Custody transferred for ${payload.tokenId} — Block #${res.block.index} sealed in ${res.block.sealLatencyMs.toFixed(2)} ms.`
      );
    },
    [snapshot, commitSnapshot, pushToast]
  );

  const handleTamperTransaction = useCallback(
    async (params: {
      blockIndex: number;
      txIndex: number;
      updates: {
        quantity: number;
        recordedTempC: number;
        lotNumber: string;
        notes: string;
      };
    }) => {
      if (!snapshot) return;
      const tamperedBlocks = structuredClone(snapshot.blocks);
      const targetBlock = tamperedBlocks.find((b) => b.index === params.blockIndex);
      if (!targetBlock || !targetBlock.transactions[params.txIndex]) return;

      const tx = targetBlock.transactions[params.txIndex];
      tx.quantity = params.updates.quantity;
      tx.recordedTempC = params.updates.recordedTempC;
      tx.lotNumber = params.updates.lotNumber;
      tx.notes = params.updates.notes;

      const report = await commitSnapshot({
        ...snapshot,
        blocks: tamperedBlocks,
      });

      pushToast(
        `Tamper detected: Block #${params.blockIndex} hash mismatch invalidated ${report.compromisedCount} blocks.`,
        'alert'
      );
    },
    [snapshot, commitSnapshot, pushToast]
  );

  const handleRestoreAuthenticChain = useCallback(async () => {
    if (!snapshot) return;
    await commitSnapshot({
      ...snapshot,
      blocks: structuredClone(snapshot.authenticBlocks),
    });
    pushToast('Authentic cryptographically verified blockchain restored.');
  }, [snapshot, commitSnapshot, pushToast]);

  const handleSaveBenchmark = useCallback(
    (run: BenchmarkRun) => {
      saveBenchmarkToStorage(run);
      setBenchmarkRun(run);
      pushToast(
        `Benchmark complete: PoA averaged ${run.poaAvgMs.toFixed(2)} ms vs. PoW ${run.powAvgMs.toFixed(2)} ms (${run.speedupFactor.toFixed(1)}× faster).`
      );
    },
    [pushToast]
  );

  const handleTopBarPrimaryAction = () => {
    if (activeView === 'custody') {
      setActiveView('verify');
    } else {
      setCustodyMode('mint');
      setActiveView('custody');
    }
  };

  if (!snapshot || !audit) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-8 py-6 text-center space-y-2 max-w-sm w-full">
          <div className="w-8 h-8 rounded-md bg-[#0F766E] text-white flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3L4 7.5v9L12 21l8-4.5v-9L12 3z" strokeLinejoin="round" />
              <path d="M8.5 12.2l2.3 2.3 4.7-4.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-900">Initializing Verichain Ledger</p>
          <p className="text-xs text-slate-500">
            Generating ECDSA P-256 authority keys and verifying SHA-256 block seals…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        isChainValid={audit.isChainValid}
        compromisedCount={audit.compromisedCount}
        onResetDemo={handleResetDemo}
        isResetting={isResetting}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeView={activeView}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onPrimaryAction={handleTopBarPrimaryAction}
        />

        <main className="flex-1 px-4 sm:px-8 py-7 max-w-[1320px] w-full mx-auto">
          {activeView === 'overview' && (
            <OverviewView
              batches={derived.batches}
              blocks={snapshot.blocks}
              nodes={snapshot.nodes}
              audit={audit}
              nextRoundRobinSlot={snapshot.nextRoundRobinSlot}
              onSelectBatch={(batch) => setDrawerTokenId(batch.tokenId)}
              onToggleNodeOnline={handleToggleNodeOnline}
              onNavigateLedger={() => setActiveView('ledger')}
              onNavigateCustody={(tokenId) => {
                setCustodyMode(tokenId ? 'handoff' : 'mint');
                setCustodyPreselectToken(tokenId ?? null);
                setActiveView('custody');
              }}
            />
          )}

          {activeView === 'custody' && (
            <AssetCustodyView
              batches={derived.batches}
              utxos={derived.utxos}
              nodes={snapshot.nodes}
              nextRoundRobinSlot={snapshot.nextRoundRobinSlot}
              initialMode={custodyMode}
              preselectedTokenId={custodyPreselectToken}
              onMintBatch={handleMintBatch}
              onTransferCustody={handleTransferCustody}
              onSelectBatch={(batch) => setDrawerTokenId(batch.tokenId)}
            />
          )}

          {activeView === 'ledger' && (
            <LedgerAuditView
              blocks={snapshot.blocks}
              nodes={snapshot.nodes}
              audit={audit}
              onTamperTransaction={handleTamperTransaction}
              onRestoreAuthenticChain={handleRestoreAuthenticChain}
            />
          )}

          {activeView === 'benchmarks' && (
            <BenchmarksView
              nodes={snapshot.nodes}
              lastRun={benchmarkRun}
              onSaveRun={handleSaveBenchmark}
            />
          )}

          {activeView === 'verify' && (
            <VerifyProductView
              batches={derived.batches}
              blocks={snapshot.blocks}
              nodes={snapshot.nodes}
              audit={audit}
              initialQuery={verifyQueryToken}
            />
          )}
        </main>
      </div>

      {/* Batch Provenance Slide-Over Drawer */}
      <ProvenanceDrawer
        batch={drawerBatch}
        nodes={snapshot.nodes}
        audit={audit}
        onClose={() => setDrawerTokenId(null)}
        onStartHandoff={(tokenId) => {
          setCustodyMode('handoff');
          setCustodyPreselectToken(tokenId);
          setActiveView('custody');
        }}
        onOpenVerify={(tokenId) => {
          setVerifyQueryToken(tokenId);
          setActiveView('verify');
        }}
      />

      {/* Action Confirmation Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl border bg-white shadow-sm flex items-center gap-3 text-xs ${
            toast.tone === 'alert'
              ? 'border-red-200 text-red-900'
              : 'border-slate-200 text-slate-900'
          }`}
        >
          {toast.tone === 'alert' ? (
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#0F766E] shrink-0" />
          )}
          <span className="leading-snug font-medium">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
