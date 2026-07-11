import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Icon, type IconName } from './icons';
import { DemoBadge } from './DemoBadge';
import { ProviderBadge } from './ProviderBadge';
import { useAsync } from '../../hooks/useApi';
import { api } from '../../services/api';
import { fmtFullDate } from '../../lib/format';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
  end?: boolean;
}

// First four are the mobile tab bar; the rest fold into the "More" sheet.
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Blocks', icon: 'map', end: true },
  { to: '/field', label: 'Field Mode', short: 'Field', icon: 'crosshair' },
  { to: '/battle-plan', label: 'Battle Plan', short: 'Plan', icon: 'plan' },
  { to: '/validate', label: 'Validate', short: 'Validate', icon: 'validate' },
  { to: '/slips', label: 'Pour Slips', short: 'Slips', icon: 'slip' },
  { to: '/water-bank', label: 'Water Bank', short: 'Bank', icon: 'droplet' },
  { to: '/scenario', label: 'Scenario', short: 'What-if', icon: 'scenario' },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: 'gear' },
];

const MOBILE_PRIMARY = NAV.slice(0, 4);
const MOBILE_MORE = NAV.slice(4);

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bordeaux text-paper">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3.5c-3.4 4.1-5.4 6.9-5.4 9.4a5.4 5.4 0 0 0 10.8 0c0-2.5-2-5.3-5.4-9.4Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <div className="leading-none">
        <div className="font-display text-xl tracking-tight text-ink">Vino</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">
          Know when to pour
        </div>
      </div>
    </div>
  );
}

function MobileTab({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
          isActive ? 'text-bordeaux' : 'text-ink-muted'
        }`
      }
    >
      <Icon name={item.icon} size={20} />
      {item.short}
    </NavLink>
  );
}

export function AppShell() {
  const { data: health } = useAsync(() => api.getHealth(), []);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const moreActive = MOBILE_MORE.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 z-20 hidden h-screen w-[236px] shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="px-1.5">
          <Wordmark />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-bordeaux-tint text-bordeaux-dark'
                    : 'text-ink-soft hover:bg-slate-tint hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    size={18}
                    className={isActive ? 'text-bordeaux' : 'text-ink-muted'}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 space-y-2 border-t border-line px-1.5 pt-4">
          <div className="flex flex-wrap gap-1.5">
            <ProviderBadge />
            <DemoBadge />
          </div>
          {health && (
            <div className="text-[11px] leading-relaxed text-ink-muted">
              <div className="nums">As of {fmtFullDate(health.as_of)}</div>
              {health.terraclim_ready && <div>TerraClim ready</div>}
            </div>
          )}
          <div className="text-[11px] leading-relaxed text-ink-muted">
            Built on TerraClim ET-GEO science
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <ProviderBadge compact />
          <DemoBadge compact />
        </div>
      </header>

      {/* Main — boundary keeps the shell/nav alive if a screen crashes. */}
      <main className="min-w-0 flex-1 pb-24 lg:pb-0">
        <div className="mx-auto max-w-content px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="no-print fixed inset-0 z-20 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/25 animate-fade-in"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-[57px] left-0 right-0 rounded-t-xl border-t border-line bg-surface p-3 shadow-panel">
            <div className="grid grid-cols-4 gap-1">
              {MOBILE_MORE.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 rounded-md px-2 py-3 text-[10px] font-medium ${
                      isActive
                        ? 'bg-bordeaux-tint text-bordeaux-dark'
                        : 'text-ink-soft hover:bg-slate-tint'
                    }`
                  }
                >
                  <Icon name={item.icon} size={20} />
                  {item.short}
                </NavLink>
              ))}
            </div>
            <div className="mt-2 border-t border-line pt-2 text-center text-[10px] text-ink-muted">
              Built on TerraClim ET-GEO science
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom nav: 4 primaries + More */}
      <nav className="no-print fixed bottom-0 left-0 right-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        {MOBILE_PRIMARY.map((item) => (
          <MobileTab key={item.to} item={item} />
        ))}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            moreActive || moreOpen ? 'text-bordeaux' : 'text-ink-muted'
          }`}
        >
          <Icon name="more" size={20} />
          More
        </button>
      </nav>
    </div>
  );
}
