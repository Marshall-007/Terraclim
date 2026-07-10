import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAsync } from '../hooks/useApi';
import type { Briefing, Status } from '../types/api';
import { BlockMap, type MapBlockState } from '../components/map/BlockMap';
import { BlockDetailPanel } from './BlockDetail';
import { PageHeader } from '../components/common/primitives';
import { StatusPill, ScoreMeter, TrafficDot } from '../components/common/status';
import { LoadingPanel, ErrorState, Skeleton } from '../components/common/states';
import { Icon } from '../components/layout/icons';
import { color } from '../theme/tokens';

function countByStatus(b: Briefing): Record<Status, number> {
  const acc: Record<Status, number> = { on_track: 0, too_dry: 0, too_wet: 0 };
  for (const blk of b.blocks) acc[blk.status]++;
  return acc;
}

function SummaryChip({
  label,
  count,
  dot,
}: {
  label: string;
  count: number;
  dot: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-raised px-3 py-2">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden />
      <span className="nums text-lg font-semibold text-ink">{count}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}

function RankedList({
  briefing,
  selectedId,
  onSelect,
}: {
  briefing: Briefing;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {briefing.blocks.map((b) => {
        const active = b.block_id === selectedId;
        return (
          <li key={b.block_id}>
            <button
              onClick={() => onSelect(b.block_id)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                active ? 'bg-bordeaux-tint' : 'hover:bg-slate-tint/60'
              }`}
            >
              <TrafficDot traffic={b.traffic} size={11} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="nums text-[11px] font-bold text-slate">{b.block_id}</span>
                  <span className="truncate text-sm font-medium text-ink">{b.name}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{b.headline}</p>
                <div className="mt-2 flex items-center gap-3">
                  <StatusPill status={b.status} />
                  <div className="flex-1">
                    <ScoreMeter score={b.score} traffic={b.traffic} />
                  </div>
                </div>
              </div>
              <Icon name="chevron-right" size={16} className="mt-1 shrink-0 text-ink-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('block');

  const blocksQ = useAsync(() => api.getBlocks(), []);
  const briefingQ = useAsync(() => api.getBriefing(), []);

  const states = useMemo<Record<string, MapBlockState>>(() => {
    const map: Record<string, MapBlockState> = {};
    for (const b of briefingQ.data?.blocks ?? [])
      map[b.block_id] = { traffic: b.traffic, status: b.status };
    return map;
  }, [briefingQ.data]);

  const selectedBlock =
    blocksQ.data?.features.find((f) => f.properties.id === selectedId)?.properties ?? null;

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('block', id);
    setParams(next, { replace: false });
  };
  const clearSelect = () => {
    const next = new URLSearchParams(params);
    next.delete('block');
    setParams(next, { replace: false });
  };

  const counts = briefingQ.data ? countByStatus(briefingQ.data) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vino · Stellenbosch, Western Cape"
        title="Farm dashboard"
        subtitle={briefingQ.data?.farm_summary}
        actions={
          <button
            className="btn-ghost"
            onClick={() => {
              blocksQ.reload();
              briefingQ.reload();
            }}
          >
            <Icon name="refresh" size={16} /> Refresh
          </button>
        }
      />

      {counts && (
        <div className="flex flex-wrap gap-2.5">
          <SummaryChip label="too dry" count={counts.too_dry} dot={color.high} />
          <SummaryChip label="too wet" count={counts.too_wet} dot={color.wet} />
          <SummaryChip label="on track" count={counts.on_track} dot={color.stable} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="card overflow-hidden p-0">
          {blocksQ.loading || briefingQ.loading ? (
            <div className="h-[380px] lg:h-[560px]">
              <LoadingPanel label="Loading the vineyard" />
            </div>
          ) : blocksQ.error || !blocksQ.data ? (
            <div className="h-[380px] lg:h-[560px]">
              <ErrorState message="Could not load blocks." onRetry={blocksQ.reload} />
            </div>
          ) : (
            <BlockMap
              features={blocksQ.data.features}
              states={states}
              selectedId={selectedId}
              onSelect={select}
              allowTrace
              onBlocksChanged={() => {
                blocksQ.reload();
                briefingQ.reload();
              }}
              className="h-[380px] border-0 lg:h-[560px]"
            />
          )}
        </div>

        <div className="card flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-base text-ink">Ranked by pressure</h2>
            <span className="eyebrow">worst first</span>
          </div>
          <div className="scroll-thin max-h-[520px] flex-1 overflow-y-auto">
            {briefingQ.loading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : briefingQ.data ? (
              <RankedList
                briefing={briefingQ.data}
                selectedId={selectedId}
                onSelect={select}
              />
            ) : (
              <ErrorState message="Briefing unavailable." onRetry={briefingQ.reload} />
            )}
          </div>
        </div>
      </div>

      <BlockDetailPanel
        block={selectedBlock}
        onClose={clearSelect}
        onBlocksChanged={() => {
          blocksQ.reload();
          briefingQ.reload();
        }}
      />
    </div>
  );
}
