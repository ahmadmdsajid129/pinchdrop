import { useState } from 'react';
import { Clock } from 'lucide-react';
import { useApp } from '../context';
import { Button, Card, EmptyState, PageTitle } from '../ui';

const FILTERS = ['All', 'In progress', 'Delivered', 'Failed / not caught'] as const;

export function Transfers() {
  const { go } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  return (
    <>
      <PageTitle
        actions={
          <>
            <label htmlFor="tsearch" className="sr-only">Search transfers</label>
            <input
              id="tsearch"
              placeholder="Search by name"
              disabled
              className="h-10 w-56 px-3 rounded-xl bg-surface border border-line text-[14px] text-text placeholder:text-muted disabled:opacity-60"
            />
            <Button disabled>Clear history</Button>
          </>
        }
      >
        Transfers
      </PageTitle>

      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Filter transfers">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`h-[34px] px-3.5 rounded-full text-[13px] font-semibold ${filter === f ? 'bg-primary text-white' : 'border border-line text-soft hover:text-text'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card>
        <EmptyState
          icon={<Clock size={26} aria-hidden="true" />}
          title="No transfers yet"
          action={<Button variant="primary" onClick={() => go('send')}>Send something</Button>}
        >
          Everything you send — by gesture or manually — is listed here with its status. Interrupted sends can be resumed from here. History stays on this PC only.
        </EmptyState>
      </Card>
    </>
  );
}
