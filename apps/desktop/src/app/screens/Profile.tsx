import { useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { useApp } from '../context';
import { initials } from '../Sidebar';
import { Button, Card, PageTitle, Row } from '../ui';
import { confirm } from '../pickers';

const COLORS = [
  ['#22D3EE', 'Cyan'],
  ['#7C5CFF', 'Violet'],
  ['#34D399', 'Green'],
  ['#FBBF24', 'Amber'],
  ['#FB7185', 'Pink'],
] as const;

export function Profile() {
  const { settings, update, go } = useApp();
  const [name, setName] = useState(settings.profile.pcName);
  useEffect(() => setName(settings.profile.pcName), [settings.profile.pcName]);

  const saveName = () => {
    const clean = name.trim().slice(0, 40);
    if (clean && clean !== settings.profile.pcName) void update({ profile: { pcName: clean } });
    else setName(settings.profile.pcName);
  };

  async function reset() {
    const ok = await confirm(
      'This clears all PinchDrop settings and shows the first-run setup again. Your files are not touched.',
      'Reset PinchDrop?',
      'Reset',
    );
    if (!ok) return;
    await api.resetApp();
    go('onboarding');
  }

  return (
    <>
      <PageTitle>Profile</PageTitle>

      <Card className="p-6 flex gap-6 flex-wrap items-start">
        <div className="flex flex-col items-center gap-3">
          <span
            className="w-24 h-24 rounded-full flex items-center justify-center font-display font-bold text-[34px] text-[#0B1020]"
            style={{ background: settings.profile.avatarColor }}
          >
            {initials(settings.profile.pcName)}
          </span>
          <div className="flex gap-2" role="radiogroup" aria-label="Avatar colour">
            {COLORS.map(([hex, label]) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={settings.profile.avatarColor === hex}
                aria-label={label}
                onClick={() => void update({ profile: { avatarColor: hex } })}
                className={`w-6 h-6 rounded-full ${settings.profile.avatarColor === hex ? 'ring-2 ring-text ring-offset-2 ring-offset-surface' : ''}`}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
        <div className="flex-[1_1_320px] flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pcname" className="text-[13px] text-muted">PC name shown on your phone</label>
            <input
              id="pcname"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="h-11 px-3.5 rounded-xl bg-bg2 border border-line text-text text-[15px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">Security key of this PC</span>
            <span className="text-[14px] px-3.5 py-2.5 rounded-xl bg-bg2 border border-line text-muted">Created when you pair your first phone</span>
          </div>
          <div className="p-3.5 rounded-xl bg-bg2 text-[13px] text-soft">No account, no email, no password. Your profile lives only on this PC.</div>
        </div>
      </Card>

      <Card className="px-5 py-1.5">
        <Row title="Reset PinchDrop" description="Clears settings and shows the first-run setup again. Your files are not touched." last>
          <Button size="sm" variant="danger" onClick={() => void reset()}>Reset…</Button>
        </Row>
      </Card>
    </>
  );
}
