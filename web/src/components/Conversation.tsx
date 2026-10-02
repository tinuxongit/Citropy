import { UsageLimitLine } from "./UsageLimitNotice.tsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { MessageBlock } from "./MessageBlock.tsx";
import { MessageNavigator } from "./MessageNavigator.tsx";
import { scaled, useApp } from "../lib/store.ts";
import { loadOlderThread, loadThread, readThreadNotifications, refreshGit } from "../lib/actions.ts";
import { reportError } from "../lib/api.ts";
import { useStickToBottom } from "../lib/use-stick.ts";
import { usePanelMotion } from "../lib/use-panel-motion.ts";
import { useMessageHeaderMotion } from "../lib/use-message-header-motion.ts";
import {
  timelineRows,
  createTimelineSelector,
} from "../lib/timeline.ts";
import { useI18n } from "../lib/i18n.ts";
import { LatestButton } from "./LatestButton.tsx";
import { onPanelSettled, panelMoving } from "../lib/panel-motion.ts";

export function Conversation() {
  const t = useI18n();
  const searchMessageId = useApp((state) => state.searchMessageId);
  const searchShellId = useApp((state) => state.searchShellId);
  const threadId = useApp((state) => state.activeThreadId);
  const ids = useApp((state) => (threadId ? state.order[threadId] : undefined));
  const selectRows = useMemo(() => createTimelineSelector(threadId), [threadId]);
  const rows = useApp(selectRows);
  const status = useApp((state) =>
    threadId ? state.threads[threadId]?.status : undefined,
  );
  const running = useApp((state) =>
    threadId ? state.threads[threadId]?.running : false,
  );
  const error = useApp((state) =>
    threadId ? state.threads[threadId]?.error : undefined,
  );
  const usageLimited = useApp((state) => Boolean(threadId && state.threads[threadId]?.usageLimit));
  const connected = useApp((state) => state.connected);
  const loaded = useApp((state) => Boolean(threadId && state.loaded[threadId]));
  const olderCursor = useApp((state) => threadId ? state.historyPages[threadId]?.next : undefined);
  const followRequest = useApp((state) => state.followRequest);
  const uiScale = useApp((state) => state.uiScale);
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const [loadingOlderThread, setLoadingOlderThread] = useState<string>();
  const loadingOlder = loadingOlderThread === threadId;
  const olderRequests = useRef(new Set<string>());
  const failedOlder = useRef<{ threadId: string; cursor: string }>(undefined);
  const olderAnchor = useRef<{ threadId: string; cursor: string; key: string; offset: number }>(undefined);
  const {
    viewport,
    content,
    atBottom,
    nearBottom,
    scrollToBottom,
    stopFollowing,
    following,
  } = useStickToBottom<HTMLDivElement, HTMLDivElement>();
  useMessageHeaderMotion(viewport, threadId);
  usePanelMotion(content, threadId);
  const virtualized = rows.length > 40;
  const pinnedActivity = useRef<{ id: string }>(undefined);
  const getItemKey = useCallback((index: number) => rows[index]!.key, [rows]);
  const rowHeights = useRef(new WeakMap<Element, number>());
  const timeline = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => viewport.current,
    getItemKey,
    anchorTo: "end",
    estimateSize: () => scaled(180),
    initialOffset: () => viewport.current?.scrollTop ?? rows.length * scaled(180),
    paddingStart: scaled(olderCursor ? 76 : 30),
    overscan: virtualized ? 4 : 40,
    measureElement: (element, entry) => {
      const cached = rowHeights.current.get(element);
      if (cached !== undefined && panelMoving()) return cached;
      const box = entry?.borderBoxSize[0];
      const height = box ? Math.round(box.blockSize) : element.offsetHeight;
      rowHeights.current.set(element, height);
      return height;
    },
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (!pinnedActivity.current) return indexes;
      const pinned = rows.findIndex(row => row.row?.kind === "activity" && row.row.id === pinnedActivity.current!.id);
      if (pinned < 0 || indexes.includes(pinned)) return indexes;
      return defaultRangeExtractor({ ...range, startIndex: Math.min(range.startIndex, pinned), endIndex: Math.max(range.endIndex, pinned) });
    },
  });
  useEffect(() => onPanelSettled(() => {
    for (const row of viewport.current?.querySelectorAll(".timeline-row") ?? []) timeline.measureElement(row as HTMLDivElement);
  }), [timeline]);
  timeline.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    if (following()) return false;
    const offset = (instance.scrollOffset ?? 0) + instance.scrollAdjustments;
    return (instance.itemSizeCache.has(item.key) ? item.end : item.start) <= offset;
  };
  const virtualItems = timeline.getVirtualItems();
  const loadOlder = useCallback(async () => {
    if (!threadId || !connected || olderRequests.current.has(threadId)) return;
    const cursor = useApp.getState().historyPages[threadId]?.next;
    if (!cursor) return;
    olderRequests.current.add(threadId);
    failedOlder.current = undefined;
    setLoadingOlderThread(threadId);
    stopFollowing();
    const canvas = viewport.current;
    const item = timeline.getVirtualItems().find(item => item.end > (canvas?.scrollTop ?? 0));
    const element = item && timeline.elementsCache.get(item.key);
    if (canvas && item && element) olderAnchor.current = { threadId, cursor, key: String(item.key), offset: element.getBoundingClientRect().top - canvas.getBoundingClientRect().top };
    try {
      await loadOlderThread(threadId);
    } catch (error) {
      failedOlder.current = { threadId, cursor };
      olderAnchor.current = undefined;
      reportError(error);
    } finally {
      olderRequests.current.delete(threadId);
      setLoadingOlderThread(current => current === threadId ? undefined : current);
    }
  }, [threadId, connected, stopFollowing, viewport, timeline]);
  useLayoutEffect(() => {
    const anchor = olderAnchor.current;
    if (!anchor || anchor.threadId !== threadId || anchor.cursor === olderCursor) return;
    let frame = 0;
    const restore = (frames: number) => {
      if (olderAnchor.current !== anchor) return;
      const canvas = viewport.current;
      const element = timeline.elementsCache.get(anchor.key);
      if (canvas && element?.isConnected) canvas.scrollTop += element.getBoundingClientRect().top - canvas.getBoundingClientRect().top - anchor.offset;
      if (frames) frame = requestAnimationFrame(() => restore(frames - 1));
      else olderAnchor.current = undefined;
    };
    restore(3);
    return () => cancelAnimationFrame(frame);
  }, [threadId, olderCursor, rows, timeline, viewport]);
  const transitionActivity = useCallback((id: string, update: () => void) => {
    const canvas = viewport.current!;
    const summary = () => document.getElementById(`activity-count-${id}`)?.closest("button");
    const offset = summary()!.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
    const pin = { id };
    pinnedActivity.current = pin;
    flushSync(update);
    const keepSummaryInPlace = (frames: number, expectedTop: number) => {
      if (pinnedActivity.current !== pin) return;
      const button = summary();
      if (!button || frames === 0 || Math.abs(canvas.scrollTop - expectedTop) > 1) {
        pinnedActivity.current = undefined;
        return;
      }
      const drift = button.getBoundingClientRect().top - canvas.getBoundingClientRect().top - offset;
      if (Math.abs(drift) >= 1) canvas.scrollTop += drift;
      const top = canvas.scrollTop;
      requestAnimationFrame(() => keepSummaryInPlace(frames - 1, top));
    };
    keepSummaryInPlace(12, canvas.scrollTop);
  }, [viewport]);

  useEffect(() => {
    if (threadId && connected) {
      loadThread(threadId);
      const thread = useApp.getState().threads[threadId];
      if (thread) refreshGit(thread.projectId);
    }
  }, [threadId, connected]);

  useLayoutEffect(() => {
    setSelectedMessageId(undefined);
    scrollToBottom("auto");
  }, [threadId, followRequest, scrollToBottom]);

  useLayoutEffect(() => {
    if (following()) scrollToBottom("instant");
  }, [uiScale, following, scrollToBottom]);

  const readSince = useRef(Date.now());
  useLayoutEffect(() => {
    readSince.current = Date.now();
  }, [threadId]);

  useLayoutEffect(() => {
    const update = () => {
      const readingThreadId =
        nearBottom &&
        document.visibilityState === "visible" &&
        document.hasFocus()
          ? threadId
          : null;
      if (useApp.getState().readingThreadId !== readingThreadId) {
        useApp.setState({ readingThreadId });
        if (readingThreadId) readThreadNotifications(readingThreadId, readSince.current);
      }
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
      if (useApp.getState().readingThreadId === threadId)
        useApp.setState({ readingThreadId: null });
    };
  }, [threadId, nearBottom]);

  useEffect(() => {
    if (!searchMessageId && !searchShellId) return;
    const state = useApp.getState();
    let messageId = searchMessageId;
    let partId: string | undefined;
    if (searchShellId) {
      if (state.shells[searchShellId]?.threadId !== threadId) return;
      for (const id of ids ?? []) {
        partId = state.messages[id]?.partIds.find(id => {
          const part = state.parts.get(id);
          return part?.kind === "tool" && `${threadId}:${part.callId}` === searchShellId;
        });
        if (partId) { messageId = id; break; }
      }
    }
    if (!threadId || !loaded) return;
    if (!messageId || !ids?.includes(messageId) || searchShellId && !partId) {
      if (olderCursor) {
        if (!loadingOlder && !(failedOlder.current?.threadId === threadId && failedOlder.current.cursor === olderCursor)) void loadOlder();
        return;
      }
      if (searchShellId) useApp.setState(state => {
          if (state.searchShellId !== searchShellId) return state;
          return { searchShellId: null, toasts: [...state.toasts, {
            id: `shell-${searchShellId}`, level: "info", text: t("This command is no longer in the conversation history. Its recent output is available in Running shells."),
          }] };
        });
      else if (searchMessageId) useApp.setState(state => state.searchMessageId === searchMessageId ? { searchMessageId: null } : state);
      return;
    }
    stopFollowing();
    const activity = rows.find(row => row.row?.kind === "activity" && row.row.messageIds.includes(messageId))?.row;
    const expanding = activity?.kind === "activity" && !activity.open;
    let disclosures = expanding ? {
      ...state.disclosures,
      [activity.id]: { ...state.disclosures[activity.id], activity: true },
    } : state.disclosures;
    const expandedRows = expanding ? timelineRows({ ...state, disclosures }, threadId) : rows;
    const index = expandedRows.findIndex(({ row, messageId: owner }) => partId
      ? row?.kind === "group" && row.ids.includes(partId) || row?.kind === "part" && row.id === partId
      : owner === messageId);
    const group = expandedRows[index]?.row;
    if (partId && (!disclosures[partId]?.tool || group?.kind === "group" && !disclosures[group.ids[0]!]?.group)) {
      disclosures = { ...disclosures };
      if (group?.kind === "group") {
        const id = group.ids[0]!;
        disclosures[id] = { ...disclosures[id], group: true };
      }
      disclosures[partId] = { ...disclosures[partId], tool: true };
    }
    if (disclosures !== state.disclosures) useApp.setState({ disclosures });
    if (expanding) return;
    let frame = requestAnimationFrame(() => {
      if (index !== -1) {
        setSelectedMessageId(messageId!);
        timeline.scrollToIndex(index, { align: "start" });
      }
      if (!partId) {
        useApp.setState({ searchMessageId: null });
        return;
      }
      frame = requestAnimationFrame(() => {
        const element = document.getElementById(`tool-${partId}`);
        const row = element?.closest<HTMLElement>(".timeline-row");
        const item = timeline.getVirtualItems().find(item => item.index === index);
        if (!element || !row || !item) return;
        const offset = item.start + element.getBoundingClientRect().top - row.getBoundingClientRect().top - scaled(16);
        timeline.scrollToOffset(offset, { align: "start" });
        element.querySelector<HTMLButtonElement>(".tool-head")?.focus({ preventScroll: true });
        useApp.setState({ searchShellId: null });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchMessageId, searchShellId, threadId, loaded, olderCursor, loadingOlder, loadOlder, ids, rows, timeline, stopFollowing, t]);

  const visibleItem = virtualItems.find((item) => item.end > (timeline.scrollOffset ?? 0) + 30);
  const jumpToMessage = useCallback((messageId: string) => {
    useApp.setState({ searchMessageId: messageId });
  }, []);

  return (
    <div className="conversation-viewport">
      <div
        className="canvas scroll"
        ref={viewport}
        onWheel={() => { olderAnchor.current = undefined; setSelectedMessageId(undefined); }}
        onPointerDown={() => { olderAnchor.current = undefined; setSelectedMessageId(undefined); }}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
            olderAnchor.current = undefined;
            setSelectedMessageId(undefined);
          }
        }}
      >
        <div
          className="canvas-inner"
          ref={content}
        >
          {olderCursor && <button className="btn conversation-history" type="button" disabled={!connected || loadingOlder} aria-busy={loadingOlder} onClick={() => void loadOlder()}>{t(loadingOlder ? "Loading older messages…" : "Load older messages")}</button>}
          <div
            className="timeline-rows"
            style={{
              paddingTop: virtualItems[0]?.start ?? 0,
              paddingBottom: timeline.getTotalSize() - (virtualItems.at(-1)?.end ?? 0),
            }}
          >
            {virtualItems.map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={item.key}
                  className="timeline-row"
                  data-index={item.index}
                  data-message-id={row.messageId}
                  ref={timeline.measureElement}
                >
                  <MessageBlock
                    messageId={row.messageId}
                    row={row.row}
                    first={row.first}
                    separator={row.separator}
                    transitionActivity={transitionActivity}
                    last={row.last}
                    streaming={
                      Boolean(running) && row.messageId === ids?.at(-1)
                    }
                  />
                </div>
              );
            })}
          </div>
          {status === "error" && error && threadId && (usageLimited
            ? <UsageLimitLine threadId={threadId} />
            : <div className="thread-error" role="alert">{error}</div>)}
          <div className="canvas-tail" />
        </div>
      </div>

      <MessageNavigator
        rows={rows}
        activeMessageId={selectedMessageId ?? (atBottom ? rows.at(-1)?.messageId : visibleItem && rows[visibleItem.index]?.messageId)}
        onSelect={jumpToMessage}
      />

      <LatestButton
        viewport={viewport}
        onJump={() => {
          setSelectedMessageId(undefined);
          scrollToBottom(virtualized ? "auto" : "smooth");
        }}
      />
    </div>
  );
}
