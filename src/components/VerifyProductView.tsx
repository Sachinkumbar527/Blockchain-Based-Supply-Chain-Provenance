import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  AssetBatch,
  Block,
  ChainAuditReport,
  ConsortiumNode,
  VerificationResult,
} from '../types/blockchain';
import { verifyProductAuthenticity } from '../lib/ledgerEngine';
import { truncateHash } from '../lib/crypto';
import { ProductImage } from './ProductImage';

interface VerifyProductViewProps {
  batches: AssetBatch[];
  blocks: Block[];
  nodes: ConsortiumNode[];
  audit: ChainAuditReport;
  initialQuery?: string | null;
}

export function VerifyProductView({
  batches,
  blocks,
  nodes,
  audit,
  initialQuery,
}: VerifyProductViewProps) {
  const [queryInput, setQueryInput] = useState(
    initialQuery ?? batches[0]?.tokenId ?? 'VCH-2026-0841'
  );
  const [activeQuery, setActiveQuery] = useState(
    initialQuery ?? batches[0]?.tokenId ?? 'VCH-2026-0841'
  );
  const [simulateClone, setSimulateClone] = useState(false);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  useEffect(() => {
    if (initialQuery) {
      setQueryInput(initialQuery);
      setActiveQuery(initialQuery);
      setSimulateClone(false);
    }
  }, [initialQuery]);

  const result: VerificationResult = useMemo(
    () =>
      verifyProductAuthenticity({
        query: activeQuery,
        blocks,
        audit,
        nodes,
        simulateClone,
      }),
    [activeQuery, blocks, audit, nodes, simulateClone]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSimulateClone(false);
    setActiveQuery(queryInput);
  };

  const handleSelectSample = (tokenId: string) => {
    setSimulateClone(false);
    setQueryInput(tokenId);
    setActiveQuery(tokenId);
  };

  const handleSimulateCounterfeit = () => {
    const baseToken = batches[0]?.tokenId ?? 'VCH-2026-0841';
    const clonedSerial = `${baseToken}-DUP`;
    setQueryInput(clonedSerial);
    setActiveQuery(clonedSerial);
    setSimulateClone(true);
  };

  const isAuthentic = result.verdict === 'AUTHENTIC';
  const isDanger = result.verdict === 'COUNTERFEIT' || result.verdict === 'TAMPERED';

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Product Authenticity Verification
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Verify any pharmaceutical Token ID, manufacturing lot number, or GTIN against live consortium signatures and unspent UTXO ownership.
        </p>
      </div>

      {/* Scanner / Search Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Enter Token ID (VCH-2026-0841), Lot Number, or GTIN…"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white transition-colors"
              aria-label="Enter Token ID, Lot Number, or GTIN"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Verify Serial
          </button>
          <button
            type="button"
            onClick={handleSimulateCounterfeit}
            className="px-4 py-2.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Test Counterfeit Clone
          </button>
        </form>

        {/* Quick lookup buttons for live batches */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 pt-1">
          <span className="font-medium text-slate-600">Registered batches:</span>
          {batches.map((b) => (
            <button
              key={b.tokenId}
              type="button"
              onClick={() => handleSelectSample(b.tokenId)}
              className={`font-mono transition-colors underline-offset-4 hover:underline ${
                !simulateClone && activeQuery.toUpperCase() === b.tokenId.toUpperCase()
                  ? 'text-[#0F766E] font-semibold underline'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {b.tokenId}
            </button>
          ))}
        </div>
      </section>

      {/* Verification Certificate Card */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Verdict Banner */}
        <div
          className={`px-6 py-5 border-b flex items-start gap-3.5 ${
            isAuthentic
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : isDanger
                ? 'bg-red-50 border-red-200 text-red-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
          }`}
        >
          {isAuthentic ? (
            <ShieldCheck className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
          ) : isDanger ? (
            <AlertOctagon className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-base font-bold">{result.headline}</h2>
              <span className="font-mono text-xs opacity-75 tabular-nums">
                Query: {result.query}
              </span>
            </div>
            <p className="text-xs mt-1 leading-relaxed opacity-90 max-w-3xl">
              {result.explanation}
            </p>
          </div>
        </div>

        {/* 4 Cryptographic Proof Checks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
          {[
            { label: 'SHA-256 Hash Chain', check: result.checks.ledgerIntegrity },
            { label: 'ECDSA Signatures', check: result.checks.signatureChain },
            { label: 'UTXO Ownership', check: result.checks.utxoOwnership },
            { label: 'Cold-Chain Telemetry', check: result.checks.coldChainCompliance },
          ].map((item) => (
            <div key={item.label} className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">{item.label}</span>
                {item.check.passed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Pass</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Fail</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{item.check.detail}</p>
            </div>
          ))}
        </div>

        {/* Counterfeit Double-Spend Clone Forensics */}
        {result.simulatedCloneAlert && (
          <div className="px-6 py-4 bg-red-50/40 border-b border-red-200 text-xs text-red-900 space-y-1">
            <p className="font-semibold">UTXO Double-Spend Forensic Trace</p>
            <p className="leading-relaxed">
              Scanned label attempted to claim custody output{' '}
              <span className="font-mono font-semibold">{result.simulatedCloneAlert.clonedUtxoId}</span>,
              which was already consumed in transaction{' '}
              <span className="font-mono font-semibold">{result.simulatedCloneAlert.spentByTxId}</span>.
              Authentic batch inventory is currently held exclusively by{' '}
              <strong>{result.simulatedCloneAlert.legitimateOwnerName}</strong>.
            </p>
          </div>
        )}

        {/* Batch Details + Provenance History */}
        {result.batch ? (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Studio Product Photography & Specs */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-lg overflow-hidden border border-slate-200">
                <ProductImage
                  src={result.batch.imageUrl}
                  alt={result.batch.productName}
                  title={result.batch.productName}
                  className="w-full h-56"
                />
              </div>

              <div>
                <p className="text-xs font-mono text-slate-500 tabular-nums">
                  {result.batch.tokenId} · {result.batch.lotNumber}
                </p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {result.batch.productName}
                </h3>
              </div>

              <dl className="divide-y divide-slate-100 text-xs border-t border-slate-200">
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Origin Manufacturer</dt>
                  <dd className="font-medium text-slate-900 text-right">
                    {nodeMap.get(result.batch.manufacturerId)?.name ?? result.batch.manufacturerId}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Current Verified Custodian</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {nodeMap.get(result.batch.currentOwnerId)?.name ?? result.batch.currentOwnerId}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">GS1 GTIN-14</dt>
                  <dd className="font-mono text-slate-900 tabular-nums">{result.batch.gtin}</dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Batch Size</dt>
                  <dd className="font-mono text-slate-900 tabular-nums">
                    {result.batch.quantity.toLocaleString()} {result.batch.dosageUnit}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Expiration Date</dt>
                  <dd className="font-mono text-slate-900 tabular-nums">
                    {result.batch.expiryDate}
                  </dd>
                </div>
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-slate-500">Active Unspent UTXO</dt>
                  <dd className="font-mono text-[#0F766E] font-medium tabular-nums">
                    {result.batch.currentUtxoId}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Right: Verified Chain of Custody Timeline */}
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">
                  End-to-End Cryptographic Custody Record
                </h3>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {result.batch.history.length} sealed checkpoints
                </span>
              </div>

              <ol className="divide-y divide-slate-100">
                {result.batch.history.map((hop, idx) => {
                  const fromNode = nodeMap.get(hop.tx.fromParticipantId);
                  const toNode = nodeMap.get(hop.tx.toParticipantId);
                  const validator = nodeMap.get(hop.validatorId);
                  const tempOk =
                    hop.tx.recordedTempC >= hop.tx.minTempC &&
                    hop.tx.recordedTempC <= hop.tx.maxTempC;

                  return (
                    <li key={hop.tx.txId} className="py-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-900">
                          <span className="font-mono text-slate-400 mr-2 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          {hop.tx.type === 'MINT'
                            ? `Manufactured & Tokenized by ${toNode?.name ?? hop.tx.toParticipantId}`
                            : `Transferred from ${fromNode?.shortName ?? hop.tx.fromParticipantId} to ${toNode?.name ?? hop.tx.toParticipantId}`}
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {new Date(hop.tx.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span>{hop.tx.checkpointLocation}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-mono font-medium tabular-nums ${
                            tempOk ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {hop.tx.recordedTempC.toFixed(1)}°C ({tempOk ? 'In Range' : 'Excursion'})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Stage: {hop.tx.stage}</span>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed">{hop.tx.notes}</p>

                      <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400 tabular-nums">
                        <span>Block #{hop.blockIndex}</span>
                        <span aria-hidden="true">·</span>
                        <span>PoA Seal: {validator?.shortName ?? hop.validatorId}</span>
                        <span aria-hidden="true">·</span>
                        <span>Sig: {truncateHash(hop.tx.signature, 8, 6)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-900">
              No matching provenance certificate found
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Select one of the registered batch tokens above to inspect a genuine certificate, or test a cloned serial detection scenario.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
