import { ArrowRightLeft, CheckCircle2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { AssetBatch, ChainAuditReport, ConsortiumNode } from '../types/blockchain';
import { truncateHash } from '../lib/crypto';
import { ProductImage } from './ProductImage';

interface ProvenanceDrawerProps {
  batch: AssetBatch | null;
  nodes: ConsortiumNode[];
  audit: ChainAuditReport;
  onClose: () => void;
  onStartHandoff: (tokenId: string) => void;
  onOpenVerify: (tokenId: string) => void;
}

export function ProvenanceDrawer({
  batch,
  nodes,
  audit,
  onClose,
  onStartHandoff,
  onOpenVerify,
}: ProvenanceDrawerProps) {
  if (!batch) return null;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const currentOwner = nodeMap.get(batch.currentOwnerId);
  const manufacturer = nodeMap.get(batch.manufacturerId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="relative z-10 w-full max-w-xl bg-white h-full border-l border-slate-200 flex flex-col overflow-hidden"
        aria-label="Batch provenance details"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-500 tabular-nums">{batch.tokenId}</p>
            <h2 className="text-base font-semibold text-slate-900 truncate mt-0.5">
              {batch.productName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Studio image & summary */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-stretch">
            <div className="sm:col-span-2 rounded-lg overflow-hidden border border-slate-200">
              <ProductImage
                src={batch.imageUrl}
                alt={batch.productName}
                title={batch.productName}
                className="w-full h-36 sm:h-full"
              />
            </div>
            <div className="sm:col-span-3 flex flex-col justify-between space-y-3 text-sm">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Current Stage</span>
                  <span className="font-semibold text-slate-900">{batch.stage}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Lot Number</span>
                  <span className="font-mono text-slate-900 tabular-nums">{batch.lotNumber}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>GTIN</span>
                  <span className="font-mono text-slate-900 tabular-nums">{batch.gtin}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Batch Volume</span>
                  <span className="font-mono text-slate-900 tabular-nums">
                    {batch.quantity.toLocaleString()} {batch.dosageUnit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Cold-Chain Target</span>
                  <span className="font-mono text-slate-900 tabular-nums">
                    {batch.minTempC.toFixed(1)}°C to {batch.maxTempC.toFixed(1)}°C
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Latest Reading</span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      batch.hasThermalExcursion ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {batch.latestTempC.toFixed(1)}°C{' '}
                    {batch.hasThermalExcursion ? '(Excursion)' : '(Nominal)'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Expiration Date</span>
                  <span className="font-mono text-slate-900 tabular-nums">{batch.expiryDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active UTXO State */}
          <div className="border-t border-slate-200 pt-5">
            <h3 className="text-xs font-semibold text-slate-500 tracking-wide">
              Active Custody Ownership (Unspent UTXO)
            </h3>
            <div className="mt-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Current Custodian</span>
                <span className="font-semibold text-slate-900 text-right">
                  {currentOwner?.name ?? batch.currentOwnerId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Origin Manufacturer</span>
                <span className="text-slate-800 text-right">
                  {manufacturer?.name ?? batch.manufacturerId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Unspent UTXO ID</span>
                <span className="font-mono text-teal-800 font-medium tabular-nums">
                  {batch.currentUtxoId}
                </span>
              </div>
            </div>
          </div>

          {/* Immutable Chain of Custody */}
          <div className="border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500 tracking-wide">
                Signed Custody Lineage ({batch.history.length} hops)
              </h3>
              <span className="text-xs text-slate-500">ECDSA P-256 + SHA-256</span>
            </div>

            <ol className="mt-4 space-y-4">
              {batch.history.map((hop, idx) => {
                const fromNode = nodeMap.get(hop.tx.fromParticipantId);
                const toNode = nodeMap.get(hop.tx.toParticipantId);
                const validatorNode = nodeMap.get(hop.validatorId);
                const blockAudit = audit.blocks.find((b) => b.index === hop.blockIndex);
                const txAudit = blockAudit?.txAudits.find((t) => t.txId === hop.tx.txId);
                const isValidHop =
                  blockAudit?.status === 'VALID' && (txAudit?.isSignatureValid ?? true);

                return (
                  <li
                    key={hop.tx.txId}
                    className="pb-4 border-b border-slate-100 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <span className="font-mono text-slate-400 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          <span>
                            {hop.tx.type === 'MINT'
                              ? `Token Minted at ${toNode?.shortName ?? hop.tx.toParticipantId}`
                              : `${fromNode?.shortName ?? hop.tx.fromParticipantId} → ${toNode?.shortName ?? hop.tx.toParticipantId}`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {hop.tx.checkpointLocation} ·{' '}
                          <span className="font-mono tabular-nums">
                            {hop.tx.recordedTempC.toFixed(1)}°C
                          </span>{' '}
                          · Block #{hop.blockIndex}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1 text-xs font-medium">
                        {isValidHop ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Tampered</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{hop.tx.notes}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-500 tabular-nums">
                      <span>TX: {hop.tx.txId}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        UTXO: {hop.tx.inputUtxoId ? `${hop.tx.inputUtxoId} → ` : ''}
                        {hop.tx.outputUtxoId}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Seal: {validatorNode?.shortName ?? hop.validatorId}</span>
                      <span aria-hidden="true">·</span>
                      <span>Sig: {truncateHash(hop.tx.signature, 8, 6)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenVerify(batch.tokenId);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Open Certificate</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onStartHandoff(batch.tokenId);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors whitespace-nowrap"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transfer Custody</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
