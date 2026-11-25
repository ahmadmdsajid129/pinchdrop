import { inTauri } from '../shared/api';

/** Windows "Open" dialog for one or more files. Returns [] if cancelled. */
export async function pickFiles(): Promise<string[]> {
  if (!inTauri) return [];
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({ multiple: true, directory: false, title: 'Choose files to send' });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** Windows folder picker. Returns [] if cancelled. */
export async function pickFolder(): Promise<string[]> {
  if (!inTauri) return [];
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({ multiple: true, directory: true, title: 'Choose a folder to send' });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export async function confirm(message: string, title: string, okLabel: string): Promise<boolean> {
  if (!inTauri) return window.confirm(message);
  const { ask } = await import('@tauri-apps/plugin-dialog');
  return ask(message, { title, kind: 'warning', okLabel, cancelLabel: 'Cancel' });
}
