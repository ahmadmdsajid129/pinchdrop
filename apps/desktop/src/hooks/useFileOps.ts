import { useState } from 'react';

export interface FileOpResult {
  success: boolean;
  undoId?: string;
  error?: string;
}

export function useFileOps() {
  const [loading, setLoading] = useState(false);

  const moveFile = async (from: string, to: string): Promise<FileOpResult> => {
    setLoading(true);
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const undoId = await invoke<string>('safe_move_file', { from, to });
        return { success: true, undoId };
      } else {
        // Browser dev fallback
        return { success: true, undoId: `mock_undo_${Date.now()}` };
      }
    } catch (err: any) {
      return { success: false, error: err.toString() };
    } finally {
      setLoading(false);
    }
  };

  const recycleFile = async (path: string): Promise<FileOpResult> => {
    setLoading(true);
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const undoId = await invoke<string>('safe_recycle_file', { path });
        return { success: true, undoId };
      } else {
        // Browser dev fallback
        return { success: true, undoId: `mock_recycle_${Date.now()}` };
      }
    } catch (err: any) {
      return { success: false, error: err.toString() };
    } finally {
      setLoading(false);
    }
  };

  return {
    moveFile,
    recycleFile,
    loading,
  };
}
