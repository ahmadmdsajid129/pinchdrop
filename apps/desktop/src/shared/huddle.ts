// v2 · Huddle: the laptops at one table, connected in one click (see src-tauri/src/huddle.rs).

import { useEffect, useState } from 'react';
import { inTauri, onEvent } from './api';

export interface HuddleMember {
  id: string;
  name: string;
  color: string;
  online: boolean;
}

export interface HuddleView {
  active: boolean;
  hid: string | null;
  name: string | null;
  host: boolean;
  me: HuddleMember | null;
  members: HuddleMember[];
  maxFree: number;
}

export interface FoundHuddle {
  hid: string;
  name: string;
  hostName: string;
  count: number;
  ip: string;
  port: number;
}

export interface ShelfItem {
  id: string;
  from: string;
  fromName: string;
  toAll: boolean;
  kind: 'text' | 'files' | 'changes' | 'url';
  summary: string;
  text: string | null;
  path: string | null;
  url: string | null;
  at: number;
  mine: boolean;
}

export interface ChangeFile {
  path: string;
  status: 'M' | 'D';
  size: number;
}

export interface IncomingChanges {
  id: string;
  from: string;
  fromName: string;
  repo: string;
  files: ChangeFile[];
  ready: boolean;
  at: number;
  target: string | null;
}

export interface Clash {
  path: string;
  mine: string;
  theirs: string;
}

export interface AcceptResult {
  applied: number;
  clashes: Clash[];
  folder: string;
}

export interface JoinRequest {
  reqId: string;
  name: string;
  code: string;
}

const EMPTY: HuddleView = { active: false, hid: null, name: null, host: false, me: null, members: [], maxFree: 4 };

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) throw new Error('Huddle works in the PinchDrop app.');
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export const huddleApi = {
  state: () => (inTauri ? call<HuddleView>('huddle_state') : Promise.resolve(EMPTY)),
  start: (name?: string) => call<HuddleView>('huddle_start', { name: name ?? null }),
  find: () => (inTauri ? call<FoundHuddle[]>('huddle_find') : Promise.resolve([] as FoundHuddle[])),
  join: (ip: string, port: number) => call<HuddleView>('huddle_join', { ip, port }),
  answer: (reqId: string, ok: boolean) => call<void>('huddle_answer', { reqId, ok }),
  leave: () => call<void>('huddle_leave'),
  sendText: (to: string | null, text: string) => call<string>('huddle_send_text', { to, text }),
  sendClipboard: (to: string | null) => call<string>('huddle_send_clipboard', { to }),
  sendPaths: (to: string | null, paths: string[]) => call<string>('huddle_send_paths', { to, paths }),
  share: (to: string | null, address: string) => call<string>('huddle_share', { to, address }),
  pull: (member: string) => call<void>('huddle_pull', { member }),
  shelf: () => (inTauri ? call<ShelfItem[]>('huddle_shelf') : Promise.resolve([] as ShelfItem[])),
  inbox: () => (inTauri ? call<IncomingChanges[]>('huddle_inbox') : Promise.resolve([] as IncomingChanges[])),
  accept: (id: string, folder?: string | null, choices?: Record<string, 'mine' | 'theirs'>) =>
    call<AcceptResult>('huddle_accept', { id, folder: folder ?? null, choices: choices ?? null }),
  dismiss: (id: string) => call<void>('huddle_dismiss', { id }),
  open: (id: string) => call<void>('huddle_open', { id }),
};

/** Live huddle state. */
export function useHuddle(): HuddleView {
  const [v, setV] = useState<HuddleView>(EMPTY);
  useEffect(() => {
    void huddleApi.state().then(setV);
    const off = onEvent<HuddleView>('huddle-changed', setV);
    return () => void off.then((u) => u());
  }, []);
  return v;
}

export function useHuddleShelf(): ShelfItem[] {
  const [v, setV] = useState<ShelfItem[]>([]);
  useEffect(() => {
    void huddleApi.shelf().then(setV);
    const off = onEvent<ShelfItem[]>('huddle-shelf', setV);
    return () => void off.then((u) => u());
  }, []);
  return v;
}

export function useHuddleInbox(): IncomingChanges[] {
  const [v, setV] = useState<IncomingChanges[]>([]);
  useEffect(() => {
    void huddleApi.inbox().then(setV);
    const off = onEvent<IncomingChanges[]>('huddle-inbox', setV);
    return () => void off.then((u) => u());
  }, []);
  return v;
}

/** Looks like a secret (API key, token, password line): blurred on the shelf until clicked. */
export function looksSecret(text: string): boolean {
  return /(api[_-]?key|secret|token|password|passwd|bearer\s|sk-[a-z0-9]|ghp_[a-z0-9]|AKIA[0-9A-Z]{12}|-----BEGIN [A-Z ]*PRIVATE KEY)/i.test(text);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
