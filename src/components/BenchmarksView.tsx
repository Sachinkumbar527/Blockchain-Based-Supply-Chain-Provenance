import { useMemo, useRef, useState } from 'react';
import { Download, Play, Square } from 'lucide-react';
import type {
  BenchmarkBlockSample,
  BenchmarkRun,
  ConsortiumNode,
  DifficultyCurvePoint,
} from '../types/blockchain';
import { minePoWBenchmarkBlock, sealPoABenchmarkBlock } from '../lib/crypto';

interface BenchmarksViewProps {
  nodes: ConsortiumNode[];
  lastRun: BenchmarkRun;
  onSaveRun: (run: BenchmarkRun) => void;
}

export function BenchmarksView({ nodes, lastRun, onSaveRun }: BenchmarksViewProps) {
  const [batchSize, setBatchSize] = useState<number>(lastRun.batchSize || 5);
  const [difficulty, setDifficulty] = useState<number>(lastRun.powDifficulty || 2);
  const [scaleMode, setScaleMode] = useState<'log' | 'linear'>('log');
  const [isRunning, setIsRunning] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [hoveredSample, setHoveredSample] = useState<BenchmarkBlockSample | null>(null);
  const cancelRef = useRef(false);

  const runLiveBenchmark = async () => {
    if (isRunning) return;
    cancelRef.current = false;
    setIsRunning(true);
    setProgressPct(0);

    const onlineNodes = nodes.filter((n) => n.isOnline);
    const validatorPool = onlineNodes.length > 0 ? onlineNodes : nodes;
    const samples: BenchmarkBlockSample[] = [];

    // Step 1: Run batchSize blocks comparing PoA round-robin vs PoW at selected difficulty
    for (let i = 0; i < batchSize; i++) {
      if (cancelRef.current) break;
      const validator = validatorPool[i % validatorPool.length];
      const payload = `verichain-bench:${Date.now()}:block-${i + 1}:validator-${validator.id}`;

      setProgressText(`Sealing block ${i + 1} of ${batchSize} (PoA vs. PoW difficulty ${difficulty})…`);
      const poaRes = await sealPoABenchmarkBlock(payload, validator.privateJwk);
      const powRes = await minePoWBenchmarkBlock(payload, difficulty, () => cancelRef.current);
      if (powRes.cancelled) break;

      samples.push({
        blockNumber: i + 1,
        poaLatencyMs: Number(poaRes.latencyMs.toFixed(2)),
        powLatencyMs: Number(powRes.latencyMs.toFixed(2)),
        powHashes: powRes.hashesComputed,
        powNonce: powRes.nonce,
      });

      setProgressPct(Math.round(((i + 1) / (batchSize + difficulty)) * 100));
    }

    if (cancelRef.current || samples.length === 0) {
      setIsRunning(false);
      setProgressText('');
      return;
    }

    // Step 2: Measure empirical difficulty scaling curve across 1..max(3, difficulty)
    const curveMax = Math.max(3, difficulty);
    const difficultyCurve: DifficultyCurvePoint[] = [];

    for (let d = 1; d <= curveMax; d++) {
      if (cancelRef.current) break;
      if (d === difficulty) {
        const avgPoa =
          samples.reduce((sum, s) => sum + s.poaLatencyMs, 0) / samples.length;
        const avgPow =
          samples.reduce((sum, s) => sum + s.powLatencyMs, 0) / samples.length;
        const avgHashes = Math.round(
          samples.reduce((sum, s) => sum + s.powHashes, 0) / samples.length
        );
        difficultyCurve.push({
          difficulty: d,
          poaAvgMs: Number(avgPoa.toFixed(2)),
          powAvgMs: Number(avgPow.toFixed(2)),
          powAvgHashes: avgHashes,
        });
      } else {
        setProgressText(`Profiling difficulty ${d} scaling curve…`);
        const trials = d >= 3 ? 2 : 3;
        let poaSum = 0;
        let powSum = 0;
        let hashSum = 0;

        for (let t = 0; t < trials; t++) {
          const validator = validatorPool[t % validatorPool.length];
          const p = `verichain-curve:d${d}:t${t}:${Date.now()}`;
          const poa = await sealPoABenchmarkBlock(p, validator.privateJwk);
          const pow = await minePoWBenchmarkBlock(p, d, () => cancelRef.current);
          if (pow.cancelled) break;
          poaSum += poa.latencyMs;
          powSum += pow.latencyMs;
          hashSum += pow.hashesComputed;
        }
        if (cancelRef.current) break;
        difficultyCurve.push({
          difficulty: d,
          poaAvgMs: Number((poaSum / trials).toFixed(2)),
          powAvgMs: Number((powSum / trials).toFixed(2)),
          powAvgHashes: Math.round(hashSum / trials),
        });
      }
      setProgressPct(
        Math.min(100, Math.round(((batchSize + d) / (batchSize + curveMax)) * 100))
      );
    }

    if (!cancelRef.current) {
      const poaAvgMs = Number(
        (samples.reduce((sum, s) => sum + s.poaLatencyMs, 0) / samples.length).toFixed(2)
      );
      const powAvgMs = Number(
        (samples.reduce((sum, s) => sum + s.powLatencyMs, 0) / samples.length).toFixed(2)
      );
      const totalPowHashes = samples.reduce((sum, s) => sum + s.powHashes, 0);

      onSaveRun({
        id: `bench-${Date.now()}`,
        ranAt: new Date().toISOString(),
        isBaseline: false,
        batchSize: samples.length,
        powDifficulty: difficulty,
        poaAvgMs,
        powAvgMs,
        poaTps: Math.round(1000 / Math.max(0.05, poaAvgMs)),
        powTps: Number((1000 / Math.max(0.1, powAvgMs)).toFixed(1)),
        speedupFactor: Number((powAvgMs / Math.max(0.05, poaAvgMs)).toFixed(1)),
        totalPowHashes,
        samples,
        difficultyCurve,
      });
    }

    setIsRunning(false);
    setProgressText('');
    setProgressPct(100);
  };

  const handleStop = () => {
    cancelRef.current = true;
  };

  const handleExportCsv = () => {
    const headers = [
      'BlockNumber',
      'PoALatencyMs',
      'PoWLatencyMs',
      'PoWDifficultyZeros',
      'PoWHashesComputed',
      'PoWNonce',
      'SpeedupMultiplier',
    ];
    const rows = lastRun.samples.map((s) => [
      s.blockNumber,
      s.poaLatencyMs.toFixed(2),
      s.powLatencyMs.toFixed(2),
      lastRun.powDifficulty,
      s.powHashes,
      s.powNonce,
      (s.powLatencyMs / Math.max(0.05, s.poaLatencyMs)).toFixed(1),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verichain-poa-vs-pow-d${lastRun.powDifficulty}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Chart math for Per-Block Latency Bar Chart
  const maxBarMs = useMemo(() => {
    const maxVal = Math.max(
      ...lastRun.samples.map((s) => Math.max(s.poaLatencyMs, s.powLatencyMs)),
      10
    );
    return maxVal * 1.15;
  }, [lastRun.samples]);

  const toBarHeightPct = (ms: number) => {
    if (scaleMode === 'linear') {
      return Math.max(2, (ms / maxBarMs) * 100);
    }
    // Log10 scale spanning 0.1ms .. maxBarMs
    const minLog = Math.log10(0.1);
    const maxLog = Math.log10(Math.max(10, maxBarMs));
    const valLog = Math.log10(Math.max(0.1, ms));
    return Math.max(3, ((valLog - minLog) / (maxLog - minLog)) * 100);
  };

  // Chart math for Difficulty Scaling SVG Curve
  const curveMaxMs = useMemo(() => {
    return Math.max(...lastRun.difficultyCurve.map((p) => p.powAvgMs), 50) * 1.15;
  }, [lastRun.difficultyCurve]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Consensus Performance Benchmarks
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Empirical in-browser Web Crypto measurement comparing Proof of Authority round-robin finality against SHA-256 Proof of Work mining.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors whitespace-nowrap self-start md:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Benchmark Configuration Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
          <div>
            <label
              htmlFor="bench-batch-size"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Transaction Batch Size
            </label>
            <select
              id="bench-batch-size"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isRunning}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50"
            >
              <option value={5}>5 blocks per trial</option>
              <option value={8}>8 blocks per trial</option>
              <option value={12}>12 blocks per trial</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="bench-difficulty"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              PoW Leading-Zero Difficulty
            </label>
            <select
              id="bench-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
              disabled={isRunning}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50"
            >
              <option value={1}>Difficulty 1 (0… · ~16 hashes)</option>
              <option value={2}>Difficulty 2 (00… · ~256 hashes)</option>
              <option value={3}>Difficulty 3 (000… · ~4,096 hashes)</option>
              <option value={4}>Difficulty 4 (0000… · ~65,536 hashes)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isRunning ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Benchmark</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={runLiveBenchmark}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Live Benchmark</span>
            </button>
          )}
        </div>
      </section>

      {isRunning && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">{progressText}</span>
            <span className="font-mono text-slate-600 tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0F766E] transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* 4-Column Benchmark Summary KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">PoA Mean Finality Latency</p>
          <p className="mt-2 text-2xl font-bold font-mono text-[#0F766E] tabular-nums">
            {lastRun.poaAvgMs.toFixed(2)} ms
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            ~{lastRun.poaTps.toLocaleString()} blocks/sec ceiling
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">
            PoW Mean Mining Latency (D={lastRun.powDifficulty})
          </p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {lastRun.powAvgMs.toFixed(2)} ms
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            ~{lastRun.powTps.toLocaleString()} blocks/sec ceiling
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Measured PoA Speedup</p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {lastRun.speedupFactor.toFixed(1)}× faster
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Deterministic single-pass validator seal
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">PoW SHA-256 Hashes Computed</p>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {lastRun.totalPowHashes.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            vs. {lastRun.batchSize} SHA-256 hashes under PoA
          </p>
        </div>
      </section>

      {/* Two-Column Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Chart 1: Per-Block PoA vs PoW Latency Grouped Bars */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Per-Block Finality Latency (PoA vs. PoW)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {lastRun.isBaseline
                  ? 'Baseline reference trial · Click Run Live Benchmark to measure on this device'
                  : `Measured live on ${new Date(lastRun.ranAt).toLocaleTimeString()} · Difficulty ${lastRun.powDifficulty}`}
              </p>
            </div>

            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setScaleMode('log')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  scaleMode === 'log'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Log Scale
              </button>
              <button
                type="button"
                onClick={() => setScaleMode('linear')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  scaleMode === 'linear'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Linear Scale
              </button>
            </div>
          </div>

          {/* Chart Legend & Hover Readout */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0F766E] inline-block" />
                <span>PoA (ms)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 inline-block" />
                <span>PoW (ms)</span>
              </span>
            </div>

            <div className="font-mono text-[11px] text-slate-600 tabular-nums">
              {hoveredSample
                ? `Block #${hoveredSample.blockNumber}: PoA ${hoveredSample.poaLatencyMs.toFixed(2)} ms · PoW ${hoveredSample.powLatencyMs.toFixed(2)} ms (${hoveredSample.powHashes.toLocaleString()} hashes)`
                : 'Hover any block column for exact telemetry'}
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="h-56 flex items-end gap-3 pt-4 pb-1 px-2 border-b border-slate-200">
            {lastRun.samples.map((sample) => {
              const poaPct = toBarHeightPct(sample.poaLatencyMs);
              const powPct = toBarHeightPct(sample.powLatencyMs);
              const isHovered = hoveredSample?.blockNumber === sample.blockNumber;

              return (
                <div
                  key={sample.blockNumber}
                  onMouseEnter={() => setHoveredSample(sample)}
                  onMouseLeave={() => setHoveredSample(null)}
                  className={`flex-1 h-full flex flex-col justify-end items-center rounded-t-md px-1 transition-colors ${
                    isHovered ? 'bg-slate-50' : ''
                  }`}
                >
                  <div className="w-full h-full flex items-end justify-center gap-1.5">
                    <div
                      className="w-1/2 max-w-[22px] bg-[#0F766E] rounded-t-xs transition-all duration-200"
                      style={{ height: `${poaPct}%` }}
                      title={`Block #${sample.blockNumber} PoA: ${sample.poaLatencyMs} ms`}
                    />
                    <div
                      className="w-1/2 max-w-[22px] bg-slate-400 rounded-t-xs transition-all duration-200"
                      style={{ height: `${powPct}%` }}
                      title={`Block #${sample.blockNumber} PoW: ${sample.powLatencyMs} ms`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 px-2 pt-2">
            {lastRun.samples.map((sample) => (
              <div
                key={sample.blockNumber}
                className="flex-1 text-center font-mono text-[11px] text-slate-500 tabular-nums"
              >
                B{sample.blockNumber}
              </div>
            ))}
          </div>
        </section>

        {/* Chart 2: Difficulty Scaling Curve SVG */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Latency Scaling by PoW Difficulty
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              PoW latency grows exponentially (~16× per hex zero), whereas PoA remains flat and deterministic.
            </p>
          </div>

          <div className="my-5">
            <svg
              viewBox="0 0 360 210"
              className="w-full h-52 overflow-visible"
              role="img"
              aria-label="Difficulty scaling comparison chart showing PoW exponential latency growth versus flat PoA latency"
            >
              {/* Horizontal gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const y = 175 - frac * 145;
                const val = Math.round(curveMaxMs * frac);
                return (
                  <g key={frac}>
                    <line
                      x1="46"
                      y1={y}
                      x2="345"
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                    />
                    <text
                      x="40"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Y-axis label */}
              <text
                x="46"
                y="16"
                className="fill-slate-500 text-[10px] font-mono"
              >
                Mean Latency (ms)
              </text>

              {/* PoW Curve */}
              {lastRun.difficultyCurve.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="2.2"
                  points={lastRun.difficultyCurve
                    .map((pt, idx) => {
                      const x =
                        66 +
                        (idx / Math.max(1, lastRun.difficultyCurve.length - 1)) * 255;
                      const y = 175 - (pt.powAvgMs / curveMaxMs) * 145;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              )}

              {/* PoA Flat Curve */}
              {lastRun.difficultyCurve.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#0F766E"
                  strokeWidth="2.4"
                  points={lastRun.difficultyCurve
                    .map((pt, idx) => {
                      const x =
                        66 +
                        (idx / Math.max(1, lastRun.difficultyCurve.length - 1)) * 255;
                      const y = 175 - (pt.poaAvgMs / curveMaxMs) * 145;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              )}

              {/* Data points & X labels */}
              {lastRun.difficultyCurve.map((pt, idx) => {
                const x =
                  66 +
                  (idx / Math.max(1, lastRun.difficultyCurve.length - 1)) * 255;
                const yPow = 175 - (pt.powAvgMs / curveMaxMs) * 145;
                const yPoa = 175 - (pt.poaAvgMs / curveMaxMs) * 145;

                return (
                  <g key={pt.difficulty}>
                    <circle cx={x} cy={yPow} r="4" fill="#475569" />
                    <text
                      x={x}
                      y={Math.max(28, yPow - 9)}
                      textAnchor="middle"
                      className="fill-slate-700 text-[10px] font-mono font-semibold"
                    >
                      {pt.powAvgMs.toFixed(0)}ms
                    </text>

                    <circle cx={x} cy={yPoa} r="4" fill="#0F766E" />
                    <text
                      x={x}
                      y="196"
                      textAnchor="middle"
                      className="fill-slate-600 text-[11px] font-mono"
                    >
                      D={pt.difficulty}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>PoA Flat Mean</span>
            <span className="font-mono font-semibold text-[#0F766E] tabular-nums">
              {lastRun.poaAvgMs.toFixed(2)} ms across all difficulties
            </span>
          </div>
        </section>
      </div>

      {/* Trial Data Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Block-Level Latency Trial Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Exact cryptographic sealing times and SHA-256 hash iterations recorded for each benchmark block.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 pl-6 pr-4 whitespace-nowrap">Trial Block</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">PoA Latency</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">PoW Latency</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">PoW Hashes</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Winning Nonce</th>
                <th className="py-2.5 pl-4 pr-6 text-right whitespace-nowrap">PoA Advantage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {lastRun.samples.map((s) => {
                const factor = s.powLatencyMs / Math.max(0.05, s.poaLatencyMs);
                return (
                  <tr key={s.blockNumber} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 pl-6 pr-4 font-semibold text-slate-900">
                      Block #{s.blockNumber}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[#0F766E] font-semibold">
                      {s.poaLatencyMs.toFixed(2)} ms
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-900">
                      {s.powLatencyMs.toFixed(2)} ms
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">
                      {s.powHashes.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500">
                      {s.powNonce.toLocaleString()}
                    </td>
                    <td className="py-2.5 pl-4 pr-6 text-right text-slate-900 font-semibold">
                      {factor.toFixed(1)}× faster
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
