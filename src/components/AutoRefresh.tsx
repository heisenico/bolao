"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 45_000;

/**
 * Client-side live-ish refresh (contract §11.7): re-fetches the current route's
 * server components every 45s via router.refresh(). Renders nothing.
 * Mounted on the dashboard (and ranking, in Plan C) so scores/status stay current.
 */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
