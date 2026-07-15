/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from "react";

/**
 * Central bus for live data synchronization between admin/comm/employee views.
 *
 * A single event name (`ms-live-refresh`) travels via:
 *   - window events (same-tab)
 *   - a `localStorage` write (cross-tab, browsers dispatch a `storage` event)
 *
 * Callers use `notifyLiveRefresh()` right after a mutation (admin approves a
 * leave, comm editor publishes news, etc.). All pages using `useLiveData()`
 * refetch immediately on the target topic.
 *
 * Topics: "news" | "carousel" | "events" | "documents" | "schedule"
 *         | "requests" | "notifications" | "posts" | "me" | "*" (wildcard)
 */

const EVENT = "ms-live-refresh";
const STORAGE_KEY = "ms-live-refresh-ping";

/**
 * Trigger a refresh for one or more topics. Called from admin mutation handlers.
 * @param {string|string[]} topics
 */
export function notifyLiveRefresh(topics = "*") {
  const list = Array.isArray(topics) ? topics : [topics];
  const detail = { topics: list, ts: Date.now() };
  // Same-tab
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  // Cross-tab — write to localStorage so other tabs fire a `storage` event
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {
    /* localStorage disabled */
  }
}

/**
 * Refetch `fetchFn` on: mount, deps change, window focus, and any incoming
 * `ms-live-refresh` event that matches one of the given topics.
 *
 * @param {() => (void|Promise<void>)} fetchFn - loader
 * @param {string[]} topics - topics this component cares about
 * @param {any[]} deps - re-run when these change (like a normal useEffect dep list)
 */
export default function useLiveData(fetchFn, topics = ["*"], deps = []) {
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;
  const topicSet = topics.includes("*") ? null : new Set(topics);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      try {
        fnRef.current();
      } catch {
        /* ignore */
      }
    };

    // Initial + deps-triggered
    run();

    // Window focus (user returns to the tab)
    window.addEventListener("focus", run);

    // Same-tab custom event
    const onLive = (e) => {
      const list = e?.detail?.topics || ["*"];
      if (!topicSet || list.includes("*") || list.some((t) => topicSet.has(t))) {
        run();
      }
    };
    window.addEventListener(EVENT, onLive);

    // Cross-tab storage event
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        const list = parsed?.topics || ["*"];
        if (!topicSet || list.includes("*") || list.some((t) => topicSet.has(t))) {
          run();
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
      window.removeEventListener(EVENT, onLive);
      window.removeEventListener("storage", onStorage);
    };
  }, deps);
}
