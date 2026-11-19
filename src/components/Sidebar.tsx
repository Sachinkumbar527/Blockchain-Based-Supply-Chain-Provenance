import { useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  Blocks,
  LayoutDashboard,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';

export type NavView = 'overview' | 'custody' | 'ledger' | 'benchmarks' | 'verify';

interface SidebarProps {
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  isChainValid: boolean;
  compromisedCount: number;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: NavView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'custody', label: 'Asset Custody', icon: ArrowRightLeft },
  { id: 'ledger', label: 'Ledger & Audit', icon: Blocks },
  { id: 'benchmarks', label: 'Benchmarks', icon: Activity },
  { id: 'verify', label: 'Verify Product', icon: ShieldCheck },
];

export function Sidebar({
  activeView,
  onSelectView,
  isChainValid,
  compromisedCount,
  onResetDemo,
  isResetting,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  const handleNavClick = (view: NavView) => {
    onSelectView(view);
    onCloseMobile();
  };

  const handleConfirmReset = async () => {
    await onResetDemo();
    setConfirmReset(false);
  };

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64 select-none">
      {/* Brand header — single clean wordmark without subtitle clutter */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => handleNavClick('overview')}
          className="flex items-center gap-2.5 text-left focus-visible:outline-none"
        >
          <span className="w-7 h-7 rounded-md bg-[#0F766E] flex items-center justify-center text-white shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3L4 7.5v9L12 21l8-4.5v-9L12 3z" strokeLinejoin="round" />
              <path d="M8.5 12.2l2.3 2.3 4.7-4.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Verichain
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Workspace Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-teal-50/80 text-[#0F766E]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#0F766E]' : 'text-slate-400'
                  }`}
                  strokeWidth={1.9}
                />
                <span>{item.label}</span>
              </span>
              {item.id === 'ledger' && !isChainValid && (
                <span className="text-xs font-mono font-semibold text-red-600 tabular-nums">
                  {compromisedCount} alert
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Active Tamper Notice (appears ONLY during an active tamper audit failure) */}
      {!isChainValid && (
        <div className="mx-3 mb-3 p-3 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-900">Integrity Breach Active</p>
              <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                {compromisedCount} {compromisedCount === 1 ? 'block fails' : 'blocks fail'} SHA-256 verification.
              </p>
              <button
                type="button"
                onClick={() => handleNavClick('ledger')}
                className="mt-2 text-xs font-semibold text-red-800 underline underline-offset-2 hover:text-red-950"
              >
                Inspect in Ledger Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Demo Controls */}
      <div className="p-4 border-t border-slate-200 shrink-0">
        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={isResetting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>{isResetting ? 'Resetting Ledger…' : 'Reset Demo Ledger'}</span>
          </button>
        ) : (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-xs text-slate-700 leading-snug">
              Restore default batches, keys, and clean blocks?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="flex-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">{content}</aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full">{content}</aside>
        </div>
      )}
    </>
  );
}
