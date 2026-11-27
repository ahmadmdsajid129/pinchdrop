// v2 Pro · Gesture Studio: the gestures the webcam knows, the PC actions they can do (the same
// names as Rust's gesture_actions.rs), and ready-made packs.

import { inTauri } from './api';

export const GESTURES = [
  { id: 'palm_hold', name: 'Open palm', emoji: '✋', how: 'Hold an open hand to the camera for a moment.' },
  { id: 'fist_hold', name: 'Fist', emoji: '✊', how: 'Make a fist and hold it.' },
  { id: 'swipe_right', name: 'Swipe right', emoji: '👉', how: 'Move your open hand quickly to the right.' },
  { id: 'swipe_left', name: 'Swipe left', emoji: '👈', how: 'Move your open hand quickly to the left.' },
  { id: 'peace_hold', name: 'Peace sign', emoji: '✌️', how: 'Hold up two fingers.' },
  { id: 'thumbs_up', name: 'Thumbs up', emoji: '👍', how: 'Hold a thumbs up.' },
] as const;

export const GESTURE_ACTIONS: { id: string; label: string }[] = [
  { id: 'next_slide', label: 'Next slide' },
  { id: 'prev_slide', label: 'Previous slide' },
  { id: 'black_screen', label: 'Black screen (slides)' },
  { id: 'play_pause', label: 'Play / pause (PC)' },
  { id: 'next_track', label: 'Next track (PC)' },
  { id: 'prev_track', label: 'Previous track (PC)' },
  { id: 'mute', label: 'Mute sound' },
  { id: 'volume_up', label: 'Volume up' },
  { id: 'volume_down', label: 'Volume down' },
  { id: 'mic_mute', label: 'Mute microphone in calls' },
  { id: 'show_desktop', label: 'Show desktop' },
  { id: 'task_view', label: 'Task view' },
  { id: 'snip', label: 'Screenshot (Snipping Tool)' },
  { id: 'page_down', label: 'Page down' },
  { id: 'page_up', label: 'Page up' },
];

type Pack = { id: string; name: string; icon: string; line: string; map: Record<string, string> };

export const GESTURE_PACKS: Pack[] = [
  {
    id: 'presenter',
    name: 'Presenter',
    icon: '🎤',
    line: 'Run your slides from across the room.',
    map: { swipe_right: 'next_slide', swipe_left: 'prev_slide', fist_hold: 'black_screen' },
  },
  {
    id: 'media',
    name: 'Media',
    icon: '🎬',
    line: "Control whatever's playing on the PC.",
    map: { palm_hold: 'play_pause', swipe_right: 'next_track', swipe_left: 'prev_track', fist_hold: 'mute', thumbs_up: 'volume_up' },
  },
  {
    id: 'meeting',
    name: 'Meeting',
    icon: '💬',
    line: 'Mute yourself without hunting for the button.',
    map: { fist_hold: 'mic_mute', palm_hold: 'show_desktop', peace_hold: 'snip' },
  },
  {
    id: 'reading',
    name: 'Reading',
    icon: '📖',
    line: 'Turn pages hands-free: recipes, scores, documents. Also helps if a mouse is hard to use.',
    map: { swipe_right: 'page_down', swipe_left: 'page_up', palm_hold: 'task_view' },
  },
];

/** Runs one of the listed actions (Rust refuses anything else, and checks Pro). */
export async function runGestureAction(action: string | undefined) {
  if (!inTauri || !action) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('gesture_action', { action }).catch(() => undefined);
}
