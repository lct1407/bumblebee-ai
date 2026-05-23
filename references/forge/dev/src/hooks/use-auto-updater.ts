import { useCallback, useEffect, useState } from "react";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function useAutoUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!isTauri) return;
    setChecking(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      setUpdateAvailable(!!update?.available);
    } catch {
      // Updater not configured or unavailable
    } finally {
      setChecking(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update?.available) {
        await update.downloadAndInstall();
      }
    } catch {
      // Update failed
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkForUpdate]);

  return { updateAvailable, checking, checkForUpdate, installUpdate };
}
