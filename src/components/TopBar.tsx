import { Menu, Plus, ShieldCheck } from 'lucide-react';
import type { NavView } from './Sidebar';

interface TopBarProps {
  activeView: NavView;
  onOpenMobileMenu: () => void;
  onPrimaryAction: () => void;
}

const VIEW_LABELS: Record<NavView, string> = {
  overview: 'Overview',
  custody: 'Asset Custody',
  ledger: 'Ledger & Audit',
  benchmarks: 'Benchmarks',
  verify: 'Verify Product',
};

export function TopBar({ activeView, onOpenMobileMenu, onPrimaryAction }: TopBarProps) {
  const isVerify = activeView === 'verify';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8 sticky top-0 z-30">
      {/* Left zone: Contextual breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 whitespace-nowrap">Verichain</span>
          <span className="text-slate-300" aria-hidden="true">
            /
          </span>
          <span className="font-semibold text-slate-900 truncate">
            {VIEW_LABELS[activeView]}
          </span>
        </nav>
      </div>

      {/* Right zone: Single primary action button */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onPrimaryAction}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
        >
          {isVerify ? (
            <>
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Register Batch</span>
            </>
          ) : activeView === 'custody' ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Verify Serial</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Register Batch</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
