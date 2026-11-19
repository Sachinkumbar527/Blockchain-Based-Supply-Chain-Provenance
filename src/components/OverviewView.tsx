import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Power,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type {
  AssetBatch,
  AssetLifecycleStage,
  Block,
  ChainAuditReport,
  ConsortiumNode,
} from '../types/blockchain';
import { selectNextRoundRobinValidator } from '../lib/ledgerEngine';
import { truncateHash } from '../lib/crypto';

interface OverviewViewProps {
  batches: AssetBatch[];
  blocks: Block[];
  nodes: ConsortiumNode[];
  audit: ChainAuditReport;
  nextRoundRobinSlot: number;
  onSelectBatch: (batch: AssetBatch) => void;
  onToggleNodeOnline: (nodeId: string) => void;
  onNavigateLedger: () => void;
  onNavigateCustody: (tokenId?: string) => void;
}

const STAGES: Array<'All' | AssetLifecycleStage> = [
  'All',
  'Manufactured',
  'In Transit',
  'Distributed',
  'Dispensed',
];

export function OverviewView({
  batches,
  blocks,
  nodes,
  audit,
  nextRoundRobinSlot,
  onSelectBatch,
  onToggleNodeOnline,
  onNavigateLedger,
  onNavigateCustody,
}: OverviewViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'All' | AssetLifecycleStage>('All');

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const { validator: nextValidator } = useMemo(
    () => selectNextRoundRobinValidator(nodes, nextRoundRobinSlot),
    [nodes, nextRoundRobinSlot]
  );

  const blocksPerNode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const block of blocks) {
      counts.set(block.validatorId, (counts.get(block.validatorId) ?? 0) + 1);
    }
    return counts;
  }, [blocks]);

  const avgSealMs = useMemo(() => {
    const postGenesis = blocks.filter((b) => b.index > 0);
    if (postGenesis.length === 0) return 0;
    const sum = postGenesis.reduce((acc, b) => acc + b.sealLatencyMs, 0);
    return sum / postGenesis.length;
  }, [blocks]);

  const totalTxCount = useMemo(
    () => blocks.reduce((acc, b) => acc + b.transactions.filter((t) => t.type !== 'GENESIS').length, 0),
    [blocks]
  );

  const onlineAuthorityCount = useMemo(
    () => nodes.filter((n) => n.isOnline).length,
    [nodes]
  );

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batches.filter((b) => {
      if (stageFilter !== 'All' && b.stage !== stageFilter) return false;
      if (!q) return true;
      const ownerName = nodeMap.get(b.currentOwnerId)?.name.toLowerCase() ?? '';
      return (
        b.tokenId.toLowerCase().includes(q) ||
        b.productName.toLowerCase().includes(q) ||
        b.lotNumber.toLowerCase().includes(q) ||
        b.gtin.toLowerCase().includes(q) ||
        ownerName.includes(q)
      );
    });
  }, [batches, searchQuery, stageFilter, nodeMap]);

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supply Chain Provenance Overview
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time custody state, tokenized cold-chain inventory, and Proof of Authority consensus status.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateLedger}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:text-[#115E59] whitespace-nowrap self-start sm:self-auto"
        >
          <span>Inspect Immutable Ledger</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 4-Column Flat Hairline KPI Strip */}
      <section
        aria-label="Key ledger metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden"
      >
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Tokenized Batches</p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {batches.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {batches.reduce((sum, b) => sum + b.quantity, 0).toLocaleString()} serialized units tracked
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Sealed Consortium Blocks</p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {blocks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {totalTxCount} signed custody transactions
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Ledger Hash Integrity</p>
          <div className="mt-2 flex items-center gap-2">
            {audit.isChainValid ? (
              <>
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xl font-bold text-emerald-700">Verified</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-xl font-bold text-red-700">Tampered</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {audit.isChainValid
              ? 'All SHA-256 links & ECDSA seals valid'
              : `${audit.compromisedCount} compromised blocks from #${audit.firstCompromisedIndex}`}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Mean PoA Block Finality</p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {avgSealMs.toFixed(2)} ms
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {onlineAuthorityCount} of {nodes.length} validators online
          </p>
        </div>
      </section>

      {/* Active Tokenized Pharmaceutical Registry */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Active Pharmaceutical Batch Registry
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any tokenized lot to inspect its complete ECDSA custody chain and unspent UTXO.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Token ID, lot, or product…"
                className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white transition-colors"
                aria-label="Search pharmaceutical batches"
              />
            </div>

            {/* Interactive Segmented Stage Filter */}
            <div
              className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg overflow-x-auto"
              role="tablist"
              aria-label="Filter batches by lifecycle stage"
            >
              {STAGES.map((stage) => {
                const active = stageFilter === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStageFilter(stage)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {stage}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-900">No matching batches found</p>
            <p className="text-xs text-slate-500 mt-1">
              Adjust your search term or lifecycle stage filter, or mint a new pharmaceutical batch.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStageFilter('All');
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Clear Filters
              </button>
              <button
                type="button"
                onClick={() => onNavigateCustody()}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#115E59] transition-colors"
              >
                Register Batch
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 pl-6 pr-4 whitespace-nowrap">Token &amp; Lot</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Pharmaceutical Product</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Current Custodian</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Stage</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Cold-Chain Temp</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Volume</th>
                  <th className="py-2.5 pl-4 pr-6 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredBatches.map((batch) => {
                  const owner = nodeMap.get(batch.currentOwnerId);
                  return (
                    <tr
                      key={batch.tokenId}
                      onClick={() => onSelectBatch(batch)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3 pl-6 pr-4 align-middle whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900 tabular-nums">
                          {batch.tokenId}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {batch.lotNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle">
                        <div className="font-medium text-slate-900">{batch.productName}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          UTXO {batch.currentUtxoId} · {batch.history.length} hops
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        <div className="text-slate-900 font-medium">
                          {owner?.shortName ?? batch.currentOwnerId}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {owner?.role ?? 'Participant'} · {owner?.location ?? ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            batch.stage === 'Dispensed'
                              ? 'text-emerald-700'
                              : batch.stage === 'Distributed'
                                ? 'text-teal-700'
                                : 'text-slate-700'
                          }`}
                        >
                          {batch.stage}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-middle text-right whitespace-nowrap font-mono tabular-nums">
                        <div
                          className={`font-semibold ${
                            batch.hasThermalExcursion ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {batch.latestTempC.toFixed(1)}°C
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {batch.minTempC.toFixed(0)}°C to {batch.maxTempC.toFixed(0)}°C
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle text-right whitespace-nowrap font-mono text-slate-900 tabular-nums">
                        {batch.quantity.toLocaleString()} {batch.dosageUnit}
                      </td>
                      <td
                        className="py-3 pl-4 pr-6 align-middle text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectBatch(batch)}
                          className="text-xs font-semibold text-[#0F766E] hover:text-[#115E59] whitespace-nowrap"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Proof of Authority Round-Robin Consortium Schedule */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Proof of Authority Validator Rotation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Authorized consortium entities seal blocks in deterministic round-robin order. Toggle any node offline to test automatic failover.
            </p>
          </div>
          <div className="text-xs text-slate-600 whitespace-nowrap">
            Next scheduled seal:{' '}
            <span className="font-semibold text-[#0F766E]">{nextValidator.shortName}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 pl-6 pr-4 whitespace-nowrap">Consortium Authority</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Role &amp; Facility</th>
                <th className="py-2.5 px-4 whitespace-nowrap">ECDSA Public Key</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Blocks Sealed</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Turn Schedule</th>
                <th className="py-2.5 pl-4 pr-6 text-right whitespace-nowrap">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {nodes.map((node) => {
                const isNext = node.id === nextValidator.id;
                const sealed = blocksPerNode.get(node.id) ?? 0;
                const disableToggle = node.isOnline && onlineAuthorityCount <= 1;

                return (
                  <tr key={node.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 pl-6 pr-4 font-medium text-slate-900 whitespace-nowrap">
                      {node.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {node.role} · {node.location}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
                      {node.publicKeyFingerprint}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 whitespace-nowrap tabular-nums">
                      {sealed}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {!node.isOnline ? (
                        <span className="text-slate-400">Skipped (Offline)</span>
                      ) : isNext ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F766E]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Next to Seal</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">Queued in Rotation</span>
                      )}
                    </td>
                    <td className="py-3 pl-4 pr-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={disableToggle}
                        onClick={() => onToggleNodeOnline(node.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                          node.isOnline
                            ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        <span>{node.isOnline ? 'Online' : 'Offline'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Latest sealed block summary footer row */}
        {blocks.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Latest tip: Block{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                #{blocks[blocks.length - 1].index}
              </span>{' '}
              sealed by{' '}
              <span className="font-medium text-slate-900">
                {nodeMap.get(blocks[blocks.length - 1].validatorId)?.shortName ??
                  blocks[blocks.length - 1].validatorId}
              </span>
            </span>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
              Hash {truncateHash(blocks[blocks.length - 1].hash, 12, 10)}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
