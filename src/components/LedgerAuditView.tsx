import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Edit3,
  Link2Off,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { Block, ChainAuditReport, ConsortiumNode } from '../types/blockchain';
import { truncateHash } from '../lib/crypto';

interface LedgerAuditViewProps {
  blocks: Block[];
  nodes: ConsortiumNode[];
  audit: ChainAuditReport;
  onTamperTransaction: (params: {
    blockIndex: number;
    txIndex: number;
    updates: {
      quantity: number;
      recordedTempC: number;
      lotNumber: string;
      notes: string;
    };
  }) => Promise<void>;
  onRestoreAuthenticChain: () => Promise<void>;
}

export function LedgerAuditView({
  blocks,
  nodes,
  audit,
  onTamperTransaction,
  onRestoreAuthenticChain,
}: LedgerAuditViewProps) {
  const [editingTarget, setEditingTarget] = useState<{
    blockIndex: number;
    txIndex: number;
  } | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editTemp, setEditTemp] = useState('');
  const [editLot, setEditLot] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [focusedBlock, setFocusedBlock] = useState<number | null>(null);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const auditByIndex = useMemo(
    () => new Map(audit.blocks.map((b) => [b.index, b])),
    [audit.blocks]
  );

  const openEditor = (block: Block, txIndex: number) => {
    const tx = block.transactions[txIndex];
    if (!tx) return;
    setEditingTarget({ blockIndex: block.index, txIndex });
    setEditQty(String(tx.quantity));
    setEditTemp(String(tx.recordedTempC));
    setEditLot(tx.lotNumber);
    setEditNotes(tx.notes);
  };

  const handleApplyTamper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;
    await onTamperTransaction({
      blockIndex: editingTarget.blockIndex,
      txIndex: editingTarget.txIndex,
      updates: {
        quantity: Number(editQty) || 0,
        recordedTempC: Number(editTemp) || 0,
        lotNumber: editLot,
        notes: editNotes,
      },
    });
    setEditingTarget(null);
  };

  const handleQuickTamperDemo = async () => {
    const targetBlock = blocks.find((b) => b.index === 2) ?? blocks[1];
    if (!targetBlock || !targetBlock.transactions[0]) return;
    const tx = targetBlock.transactions[0];
    await onTamperTransaction({
      blockIndex: targetBlock.index,
      txIndex: 0,
      updates: {
        quantity: tx.quantity + 500,
        recordedTempC: Number((tx.recordedTempC + 14.5).toFixed(1)),
        lotNumber: `${tx.lotNumber}-ALT`,
        notes: 'Unauthorized post-seal record alteration test.',
      },
    });
    setFocusedBlock(targetBlock.index);
  };

  const scrollToBlock = (index: number) => {
    setFocusedBlock(index);
    const el = document.getElementById(`ledger-block-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Immutable Ledger &amp; Tamper Audit
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspect SHA-256 hash links and ECDSA validator seals. Altering any historical block payload immediately breaks every downstream hash link.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          {audit.isChainValid ? (
            <button
              type="button"
              onClick={handleQuickTamperDemo}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Run Tamper Simulation (Block #2)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestoreAuthenticChain}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Authentic Chain</span>
            </button>
          )}
        </div>
      </div>

      {/* Integrity Status Strip */}
      <section
        role="status"
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          audit.isChainValid
            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
            : 'bg-red-50 border-red-200 text-red-950'
        }`}
      >
        <div className="flex items-start gap-3">
          {audit.isChainValid ? (
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {audit.isChainValid
                ? `Chain Verified — All ${audit.totalBlocks} Blocks Cryptographically Intact`
                : `Tampering Detected at Block #${audit.firstCompromisedIndex} — ${audit.compromisedCount} Blocks Invalidated`}
            </p>
            <p className="text-xs mt-0.5 opacity-85">
              {audit.isChainValid
                ? 'Every block SHA-256 digest, previous-hash pointer, transaction ECDSA signature, and PoA validator seal matches the live ledger.'
                : 'Modifying data inside an earlier block altered its recalculated SHA-256 digest, invalidating its signature and severing all downstream previousHash links.'}
            </p>
          </div>
        </div>

        {!audit.isChainValid && (
          <button
            type="button"
            onClick={onRestoreAuthenticChain}
            className="px-3.5 py-2 text-xs font-semibold text-red-900 bg-white hover:bg-red-100/60 border border-red-300 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            Revert Tampered State
          </button>
        )}
      </section>

      {/* Visual Hash-Chain Topology Map */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 tracking-wide">
            Hash-Chained Block Sequence (Click to Jump)
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            Height 0 → {blocks.length - 1}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {blocks.map((block, idx) => {
            const bAudit = auditByIndex.get(block.index);
            const status = bAudit?.status ?? 'VALID';
            const validator = nodeMap.get(block.validatorId);
            const isSelected = focusedBlock === block.index;

            return (
              <div key={block.index} className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => scrollToBlock(block.index)}
                  className={`px-3.5 py-2.5 rounded-lg border text-left transition-colors min-w-[136px] ${
                    status === 'TAMPERED'
                      ? 'bg-red-50 border-red-300 text-red-950'
                      : status === 'BROKEN_LINK'
                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                        : isSelected
                          ? 'bg-teal-50/70 border-[#0F766E] text-slate-900'
                          : 'bg-slate-50/70 border-slate-200 text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold tabular-nums">
                      Block #{block.index}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        status === 'TAMPERED'
                          ? 'text-red-700'
                          : status === 'BROKEN_LINK'
                            ? 'text-amber-800'
                            : 'text-emerald-700'
                      }`}
                    >
                      {status === 'TAMPERED'
                        ? 'Tampered'
                        : status === 'BROKEN_LINK'
                          ? 'Link Broken'
                          : 'Valid'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-1">
                    {validator?.shortName ?? block.validatorId}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 mt-0.5 tabular-nums">
                    {truncateHash(bAudit?.recalculatedHash ?? block.hash, 8, 4)}
                  </div>
                </button>

                {idx < blocks.length - 1 && (
                  <div className="shrink-0 flex items-center" aria-hidden="true">
                    {auditByIndex.get(blocks[idx + 1].index)?.isLinkValid ? (
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Link2Off className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Block Inspector Cards */}
      <div className="space-y-4">
        {blocks.map((block) => {
          const bAudit = auditByIndex.get(block.index);
          const validator = nodeMap.get(block.validatorId);
          const status = bAudit?.status ?? 'VALID';

          return (
            <article
              key={block.index}
              id={`ledger-block-${block.index}`}
              className={`bg-white border rounded-xl overflow-hidden transition-colors ${
                status === 'TAMPERED'
                  ? 'border-red-300'
                  : status === 'BROKEN_LINK'
                    ? 'border-amber-300'
                    : focusedBlock === block.index
                      ? 'border-[#0F766E]'
                      : 'border-slate-200'
              }`}
            >
              {/* Block Header */}
              <div
                className={`px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
                  status === 'TAMPERED'
                    ? 'bg-red-50/70 border-red-200'
                    : status === 'BROKEN_LINK'
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    Block #{block.index}
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-slate-700">
                    PoA Seal: <strong className="text-slate-900">{validator?.name ?? block.validatorId}</strong>
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {block.sealLatencyMs.toFixed(2)} ms
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {new Date(block.timestamp).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {status === 'VALID' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Hash &amp; Signatures Valid</span>
                    </span>
                  ) : status === 'TAMPERED' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Payload Tampered — Digest Mismatch</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                      <Link2Off className="w-3.5 h-3.5" />
                      <span>Downstream Link Severed</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Cryptographic Header Fields */}
              <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4 border-b border-slate-100 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Previous Block Hash</span>
                    <span
                      className={`font-semibold ${
                        bAudit?.isLinkValid ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {bAudit?.isLinkValid ? 'Link Intact' : 'Broken Chain Link'}
                    </span>
                  </div>
                  <div
                    className={`font-mono text-[11px] break-all p-2 rounded border tabular-nums ${
                      bAudit?.isLinkValid
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {block.previousHash}
                  </div>
                  {bAudit && !bAudit.isLinkValid && (
                    <div className="text-[11px] font-mono text-amber-800 break-all pt-1 tabular-nums">
                      Expected from Block #{block.index - 1}: {bAudit.expectedPreviousHash}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Recorded Block SHA-256 Hash</span>
                    <span
                      className={`font-semibold ${
                        bAudit?.isHashValid ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {bAudit?.isHashValid ? 'Digest Matches' : 'Digest Mismatch'}
                    </span>
                  </div>
                  <div
                    className={`font-mono text-[11px] break-all p-2 rounded border tabular-nums ${
                      bAudit?.isHashValid
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {block.hash}
                  </div>
                  {bAudit && !bAudit.isHashValid && (
                    <div className="text-[11px] font-mono text-red-700 break-all pt-1 tabular-nums">
                      Recalculated SHA-256: {bAudit.recalculatedHash}
                    </div>
                  )}
                </div>
              </div>

              {/* Embedded Transactions */}
              <div className="divide-y divide-slate-100">
                {block.transactions.map((tx, txIndex) => {
                  const txAudit = bAudit?.txAudits.find((t) => t.txId === tx.txId);
                  const fromNode = nodeMap.get(tx.fromParticipantId);
                  const toNode = nodeMap.get(tx.toParticipantId);
                  const isEditingThis =
                    editingTarget?.blockIndex === block.index &&
                    editingTarget?.txIndex === txIndex;

                  return (
                    <div key={tx.txId} className="px-6 py-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {tx.txId}
                          </span>
                          <span className="mx-2 text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-medium text-slate-800">{tx.productName}</span>
                          {tx.type !== 'GENESIS' && (
                            <>
                              <span className="mx-2 text-slate-300" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono text-slate-600 tabular-nums">
                                {tx.tokenId}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-xs font-medium ${
                              txAudit?.isSignatureValid ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {txAudit?.isSignatureValid
                              ? 'ECDSA Signature Valid'
                              : 'ECDSA Signature Invalid'}
                          </span>

                          {block.index > 0 && !isEditingThis && (
                            <button
                              type="button"
                              onClick={() => openEditor(block, txIndex)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-md transition-colors whitespace-nowrap"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Alter Payload</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {!isEditingThis ? (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-slate-600">
                          <div>
                            <span className="block text-[11px] text-slate-400">Custody Flow</span>
                            <span className="text-slate-900 font-medium">
                              {tx.type === 'MINT'
                                ? `Mint @ ${toNode?.shortName ?? tx.toParticipantId}`
                                : tx.type === 'GENESIS'
                                  ? 'Consortium Root'
                                  : `${fromNode?.shortName ?? tx.fromParticipantId} → ${toNode?.shortName ?? tx.toParticipantId}`}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-400">Lot Number</span>
                            <span className="font-mono text-slate-900 tabular-nums">
                              {tx.lotNumber}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-400">Volume</span>
                            <span className="font-mono text-slate-900 tabular-nums">
                              {tx.quantity.toLocaleString()} {tx.dosageUnit}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-400">Checkpoint Temp</span>
                            <span className="font-mono text-slate-900 tabular-nums">
                              {tx.type === 'GENESIS' ? '—' : `${tx.recordedTempC.toFixed(1)}°C`}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-slate-400">ECDSA Signature</span>
                            <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                              {truncateHash(tx.signature, 8, 6)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <form
                          onSubmit={handleApplyTamper}
                          className="p-4 bg-red-50/50 border border-red-200 rounded-lg space-y-3"
                        >
                          <p className="text-xs font-semibold text-red-900">
                            Simulate Unauthorized Database Modification on Block #{block.index}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                Lot Number
                              </label>
                              <input
                                type="text"
                                value={editLot}
                                onChange={(e) => setEditLot(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                Batch Quantity ({tx.dosageUnit})
                              </label>
                              <input
                                type="number"
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                Recorded Temp (°C)
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                value={editTemp}
                                onChange={(e) => setEditTemp(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Audit Memo / Notes
                            </label>
                            <input
                              type="text"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingTarget(null)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md"
                            >
                              Apply Altered Payload
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
