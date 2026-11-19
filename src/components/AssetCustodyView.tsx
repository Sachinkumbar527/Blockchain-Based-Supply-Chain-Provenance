import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, KeyRound, PackagePlus, ShieldAlert } from 'lucide-react';
import type { AssetBatch, ConsortiumNode, UtxoRecord } from '../types/blockchain';
import { PRODUCT_IMAGES, selectNextRoundRobinValidator } from '../lib/ledgerEngine';
import { ProductImage } from './ProductImage';

interface AssetCustodyViewProps {
  batches: AssetBatch[];
  utxos: UtxoRecord[];
  nodes: ConsortiumNode[];
  nextRoundRobinSlot: number;
  initialMode?: 'handoff' | 'mint' | 'utxo';
  preselectedTokenId?: string | null;
  onMintBatch: (payload: {
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
  }) => Promise<void>;
  onTransferCustody: (payload: {
    tokenId: string;
    toParticipantId: string;
    recordedTempC: number;
    checkpointLocation: string;
    notes: string;
  }) => Promise<void>;
  onSelectBatch: (batch: AssetBatch) => void;
}

const IMAGE_PRESETS = [
  { label: 'Vaccine Vials Tray', url: PRODUCT_IMAGES.vaccine },
  { label: 'Biologic Auto-Injectors', url: PRODUCT_IMAGES.biologic },
  { label: 'Oncology Amber Vial', url: PRODUCT_IMAGES.oncology },
  { label: 'Cryogenic Thermal Shipper', url: PRODUCT_IMAGES.cryo },
];

export function AssetCustodyView({
  batches,
  utxos,
  nodes,
  nextRoundRobinSlot,
  initialMode = 'handoff',
  preselectedTokenId,
  onMintBatch,
  onTransferCustody,
  onSelectBatch,
}: AssetCustodyViewProps) {
  const [tab, setTab] = useState<'handoff' | 'mint' | 'utxo'>(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Handoff state
  const [selectedTokenId, setSelectedTokenId] = useState<string>(
    preselectedTokenId ?? batches[0]?.tokenId ?? ''
  );
  const [toParticipantId, setToParticipantId] = useState<string>('');
  const [handoffTemp, setHandoffTemp] = useState<string>('4.2');
  const [handoffLocation, setHandoffLocation] = useState<string>('');
  const [handoffNotes, setHandoffNotes] = useState<string>('');

  // Mint state
  const [productName, setProductName] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [gtin, setGtin] = useState('00368412008952');
  const [quantity, setQuantity] = useState('1000');
  const [dosageUnit, setDosageUnit] = useState('vials');
  const [minTempC, setMinTempC] = useState('2.0');
  const [maxTempC, setMaxTempC] = useState('8.0');
  const [initialTempC, setInitialTempC] = useState('4.0');
  const [expiryDate, setExpiryDate] = useState('2028-03-31');
  const [mintLocation, setMintLocation] = useState('Basel Sterile Plant 2, CH');
  const [mintNotes, setMintNotes] = useState('');
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(PRODUCT_IMAGES.vaccine);
  const [utxoFilter, setUtxoFilter] = useState<'ALL' | 'UNSPENT' | 'SPENT'>('ALL');

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { validator: nextValidator } = useMemo(
    () => selectNextRoundRobinValidator(nodes, nextRoundRobinSlot),
    [nodes, nextRoundRobinSlot]
  );

  useEffect(() => {
    setTab(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (preselectedTokenId) {
      setSelectedTokenId(preselectedTokenId);
    }
  }, [preselectedTokenId]);

  const activeBatch = useMemo(
    () => batches.find((b) => b.tokenId === selectedTokenId) ?? batches[0] ?? null,
    [batches, selectedTokenId]
  );

  const eligibleRecipients = useMemo(
    () => nodes.filter((n) => n.id !== activeBatch?.currentOwnerId),
    [nodes, activeBatch]
  );

  useEffect(() => {
    if (!activeBatch) return;
    setHandoffTemp(activeBatch.latestTempC.toFixed(1));
    const currentIsValid = eligibleRecipients.some((r) => r.id === toParticipantId);
    if (!currentIsValid && eligibleRecipients.length > 0) {
      const nextBest = eligibleRecipients[0];
      setToParticipantId(nextBest.id);
      setHandoffLocation(nextBest.location);
    }
  }, [activeBatch, eligibleRecipients, toParticipantId]);

  const handleRecipientChange = (nextId: string) => {
    setToParticipantId(nextId);
    const target = nodeMap.get(nextId);
    if (target) {
      setHandoffLocation(target.location);
    }
  };

  const parsedHandoffTemp = Number(handoffTemp);
  const isTempOutOfRange =
    activeBatch &&
    !Number.isNaN(parsedHandoffTemp) &&
    (parsedHandoffTemp < activeBatch.minTempC || parsedHandoffTemp > activeBatch.maxTempC);

  const handleHandoffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!activeBatch) {
      setFormError('Select a tokenized batch to transfer.');
      return;
    }
    if (!toParticipantId) {
      setFormError('Select a consortium recipient.');
      return;
    }
    if (Number.isNaN(parsedHandoffTemp)) {
      setFormError('Enter a valid cold-chain temperature reading in °C.');
      return;
    }

    try {
      setSubmitting(true);
      await onTransferCustody({
        tokenId: activeBatch.tokenId,
        toParticipantId,
        recordedTempC: parsedHandoffTemp,
        checkpointLocation: handoffLocation,
        notes: handoffNotes,
      });
      setHandoffNotes('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to execute custody handoff.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const qtyNum = Number(quantity);
    const minT = Number(minTempC);
    const maxT = Number(maxTempC);
    const recT = Number(initialTempC);

    if (!productName.trim() || !lotNumber.trim()) {
      setFormError('Product name and lot number are required.');
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive number.');
      return;
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT) || minT >= maxT) {
      setFormError('Minimum cold-chain temperature must be lower than maximum temperature.');
      return;
    }
    if (!Number.isFinite(recT)) {
      setFormError('Enter a valid initial temperature reading.');
      return;
    }

    try {
      setSubmitting(true);
      const manufacturer = nodes.find((n) => n.role === 'Manufacturer') ?? nodes[0];
      await onMintBatch({
        productName,
        lotNumber,
        gtin,
        dosageUnit,
        quantity: Math.round(qtyNum),
        minTempC: minT,
        maxTempC: maxT,
        recordedTempC: recT,
        expiryDate,
        checkpointLocation: mintLocation,
        notes: mintNotes,
        imageUrl: selectedImageUrl,
        manufacturerId: manufacturer.id,
      });
      setProductName('');
      setLotNumber('');
      setMintNotes('');
      setTab('handoff');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to mint batch token.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUtxos = useMemo(() => {
    if (utxoFilter === 'ALL') return utxos;
    return utxos.filter((u) => u.status === utxoFilter);
  }, [utxos, utxoFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Asset Tokenization &amp; Custody Handoffs
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Sign custody transfers with ECDSA private keys, spend prior UTXOs, and seal new blocks via Proof of Authority.
          </p>
        </div>

        <div
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start"
          role="tablist"
          aria-label="Custody workspace sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'handoff'}
            onClick={() => {
              setFormError(null);
              setTab('handoff');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'handoff'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Custody Handoff
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mint'}
            onClick={() => {
              setFormError(null);
              setTab('mint');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'mint'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register Batch Token
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'utxo'}
            onClick={() => {
              setFormError(null);
              setTab('utxo');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'utxo'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            UTXO State Ledger ({utxos.length})
          </button>
        </div>
      </div>

      {formError && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs text-red-800"
        >
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* TAB 1: CUSTODY HANDOFF */}
      {tab === 'handoff' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Signed Handoff Form */}
          <form
            onSubmit={handleHandoffSubmit}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Execute Signed Custody Transfer
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consumes the active unspent UTXO and issues a new cryptographically signed ownership output.
                </p>
              </div>
              <ArrowRightLeft className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="handoff-batch"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Select Tokenized Pharmaceutical Batch
                </label>
                <select
                  id="handoff-batch"
                  value={activeBatch?.tokenId ?? ''}
                  onChange={(e) => setSelectedTokenId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                >
                  {batches.map((b) => (
                    <option key={b.tokenId} value={b.tokenId}>
                      {b.tokenId} — {b.productName} ({b.stage})
                    </option>
                  ))}
                </select>
              </div>

              {activeBatch && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Current Custodian (Signer)</span>
                    <span className="font-semibold text-slate-900 mt-0.5 block">
                      {nodeMap.get(activeBatch.currentOwnerId)?.name ?? activeBatch.currentOwnerId}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      Key {nodeMap.get(activeBatch.currentOwnerId)?.publicKeyFingerprint}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Input UTXO to Spend</span>
                    <span className="font-mono font-semibold text-[#0F766E] mt-0.5 block tabular-nums">
                      {activeBatch.currentUtxoId}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Status: Unspent · Verified Owner
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="handoff-recipient"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Recipient Consortium Organization
                  </label>
                  <select
                    id="handoff-recipient"
                    value={toParticipantId}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                  >
                    {eligibleRecipients.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="handoff-temp"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Checkpoint Cold-Chain Temp (°C)
                  </label>
                  <input
                    id="handoff-temp"
                    type="number"
                    step="0.1"
                    value={handoffTemp}
                    onChange={(e) => setHandoffTemp(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                    required
                  />
                  {activeBatch && (
                    <p
                      className={`text-[11px] mt-1 font-mono tabular-nums ${
                        isTempOutOfRange ? 'text-amber-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      {isTempOutOfRange
                        ? `Excursion warning: outside ${activeBatch.minTempC.toFixed(1)}°C – ${activeBatch.maxTempC.toFixed(1)}°C`
                        : `Safe target band: ${activeBatch.minTempC.toFixed(1)}°C – ${activeBatch.maxTempC.toFixed(1)}°C`}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="handoff-location"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Checkpoint Facility / Hub Location
                </label>
                <input
                  id="handoff-location"
                  type="text"
                  value={handoffLocation}
                  onChange={(e) => setHandoffLocation(e.target.value)}
                  placeholder="e.g., Frankfurt Regional Vault 2, DE"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="handoff-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Inspection &amp; Seal Condition Notes
                </label>
                <textarea
                  id="handoff-notes"
                  rows={2}
                  value={handoffNotes}
                  onChange={(e) => setHandoffNotes(e.target.value)}
                  placeholder="Optional customs clearance, tamper-seal check, or cold-chain telemetry memo…"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 resize-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <KeyRound className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                <span>
                  Next PoA seal: <strong className="text-slate-900">{nextValidator.shortName}</strong>
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || !activeBatch}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>{submitting ? 'Signing & Sealing…' : 'Sign & Transfer Custody'}</span>
              </button>
            </div>
          </form>

          {/* Right: Active Asset Preview Card */}
          {activeBatch && (
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <ProductImage
                src={activeBatch.imageUrl}
                alt={activeBatch.productName}
                title={activeBatch.productName}
                className="w-full h-48 border-b border-slate-200"
              />
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs font-mono text-slate-500 tabular-nums">
                    {activeBatch.tokenId} · {activeBatch.lotNumber}
                  </p>
                  <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                    {activeBatch.productName}
                  </h3>
                </div>

                <dl className="divide-y divide-slate-100 text-xs">
                  <div className="py-2 flex justify-between gap-4">
                    <dt className="text-slate-500">Current Lifecycle Stage</dt>
                    <dd className="font-semibold text-slate-900">{activeBatch.stage}</dd>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <dt className="text-slate-500">Batch Quantity</dt>
                    <dd className="font-mono text-slate-900 tabular-nums">
                      {activeBatch.quantity.toLocaleString()} {activeBatch.dosageUnit}
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <dt className="text-slate-500">Completed Custody Hops</dt>
                    <dd className="font-mono text-slate-900 tabular-nums">
                      {activeBatch.history.length} signed blocks
                    </dd>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <dt className="text-slate-500">Active Unspent UTXO</dt>
                    <dd className="font-mono text-[#0F766E] tabular-nums">
                      {activeBatch.currentUtxoId}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => onSelectBatch(activeBatch)}
                  className="w-full py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  Open Full Custody Lineage
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REGISTER (MINT) NEW BATCH TOKEN */}
      {tab === 'mint' && (
        <form
          onSubmit={handleMintSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 max-w-4xl"
        >
          <div className="border-b border-slate-200 pb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Tokenize New Pharmaceutical Batch
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mints a unique non-fungible batch token with a genesis UTXO signed by Helios Biopharma AG.
              </p>
            </div>
            <PackagePlus className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor="mint-product"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Pharmaceutical Product Name
              </label>
              <input
                id="mint-product"
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g., ImmuShield Recombinant RSV Vaccine"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>

            <div>
              <label htmlFor="mint-lot" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Manufacturing Lot Number
              </label>
              <input
                id="mint-lot"
                type="text"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="e.g., LOT-HL-895E"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>

            <div>
              <label htmlFor="mint-gtin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                GS1 GTIN-14 Identifier
              </label>
              <input
                id="mint-gtin"
                type="text"
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>

            <div>
              <label htmlFor="mint-qty" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Serialized Unit Quantity
              </label>
              <input
                id="mint-qty"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>

            <div>
              <label htmlFor="mint-unit" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Packaging Unit
              </label>
              <select
                id="mint-unit"
                value={dosageUnit}
                onChange={(e) => setDosageUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
              >
                <option value="vials">vials</option>
                <option value="doses">doses</option>
                <option value="pens">pens</option>
                <option value="kits">kits</option>
                <option value="syringes">syringes</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <div>
                <label
                  htmlFor="mint-min-temp"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Min Temp (°C)
                </label>
                <input
                  id="mint-min-temp"
                  type="number"
                  step="0.1"
                  value={minTempC}
                  onChange={(e) => setMinTempC(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="mint-max-temp"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Max Temp (°C)
                </label>
                <input
                  id="mint-max-temp"
                  type="number"
                  step="0.1"
                  value={maxTempC}
                  onChange={(e) => setMaxTempC(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="mint-init-temp"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Release Temp (°C)
                </label>
                <input
                  id="mint-init-temp"
                  type="number"
                  step="0.1"
                  value={initialTempC}
                  onChange={(e) => setInitialTempC(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="mint-expiry"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Expiration Date
              </label>
              <input
                id="mint-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>

            <div>
              <label
                htmlFor="mint-location"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Manufacturing Facility
              </label>
              <input
                id="mint-location"
                type="text"
                value={mintLocation}
                onChange={(e) => setMintLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
                required
              />
            </div>

            {/* Packaging Visual Profile */}
            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Packaging Reference Profile
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {IMAGE_PRESETS.map((preset) => {
                  const selected = selectedImageUrl === preset.url;
                  return (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setSelectedImageUrl(preset.url)}
                      className={`text-left rounded-lg overflow-hidden border transition-colors ${
                        selected
                          ? 'border-[#0F766E] ring-1 ring-[#0F766E]'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <ProductImage
                        src={preset.url}
                        alt={preset.label}
                        className="w-full h-20"
                      />
                      <div className="px-2.5 py-1.5 text-[11px] font-medium text-slate-800 truncate bg-white">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="mint-notes" className="block text-xs font-semibold text-slate-700 mb-1.5">
                QA Release Certification Notes
              </label>
              <input
                id="mint-notes"
                type="text"
                value={mintNotes}
                onChange={(e) => setMintNotes(e.target.value)}
                placeholder="e.g., GMP sterile batch released after potency assay."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="text-xs text-slate-600">
              Sealed by next PoA validator:{' '}
              <strong className="text-slate-900">{nextValidator.name}</strong>
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>{submitting ? 'Minting Batch Token…' : 'Mint & Seal Batch Token'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: UTXO STATE LEDGER */}
      {tab === 'utxo' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Unspent &amp; Spent Custody Outputs (UTXO Set)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Each asset token can have exactly one unspent custody output at any point in time, preventing double-transfer clones.
              </p>
            </div>

            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg self-start">
              {(['ALL', 'UNSPENT', 'SPENT'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setUtxoFilter(status)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    utxoFilter === status
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status === 'ALL' ? 'All Outputs' : status === 'UNSPENT' ? 'Active Unspent' : 'Spent'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 pl-6 pr-4 whitespace-nowrap">UTXO Reference</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Token &amp; Product</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Custodian</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Minted Block</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Output State</th>
                  <th className="py-2.5 pl-4 pr-6 whitespace-nowrap">Consumed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUtxos.map((u) => {
                  const owner = nodeMap.get(u.ownerId);
                  return (
                    <tr key={u.utxoId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 pl-6 pr-4 font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                        {u.utxoId}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-900 tabular-nums">{u.tokenId}</div>
                        <div className="text-[11px] text-slate-500">{u.productName}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-800">
                        {owner?.shortName ?? u.ownerId} · {u.stage}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap tabular-nums">
                        #{u.createdAtBlock}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.status === 'UNSPENT' ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Unspent (Active)</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Spent</span>
                        )}
                      </td>
                      <td className="py-3 pl-4 pr-6 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                        {u.spentByTxId ? `${u.spentByTxId} (Block #${u.spentAtBlock})` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
