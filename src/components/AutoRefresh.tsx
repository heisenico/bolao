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
    // Respect reduced-motion: these users opt out of content shifting under
    // them (WCAG 2.2.2 / 2.3.x), so skip auto-refresh entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let id: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (id === undefined) {
        id = setInterval(() => {
          router.refresh();
        }, REFRESH_INTERVAL_MS);
      }
    };

    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };

    // Only refresh while the tab is visible; never in a backgrounded tab.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [router]);

  return null;
}
