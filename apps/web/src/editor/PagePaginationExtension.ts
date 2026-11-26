import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

export const PAGE_GAP_PX = 28;
export const folioPaginationKey = new PluginKey<DecorationSet>('folioPagination');

export interface PaginationLayoutSettings {
  enabled: boolean;
  sheetHeightPx: number;
  printableHeightPx: number;
  pageGapPx: number;
  onPageCountChange?: (pageCount: number) => void;
  onResponsiveBreaksChange?: (breaks: Array<{ y: number; endedPage: number }>) => void;
}

interface SpacerSpec {
  pos: number;
  height: number;
  inList?: boolean;
}

interface MeasuredBlock {
  pos: number;
  mt: number;
  mb: number;
  height: number;
  isManualBreak: boolean;
  inList?: boolean;
}

function areSpacersEqual(a: SpacerSpec[], b: SpacerSpec[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].pos !== b[i].pos ||
      Boolean(a[i].inList) !== Boolean(b[i].inList) ||
      Math.abs(a[i].height - b[i].height) > 1
    ) {
      return false;
    }
  }
  return true;
}

function buildSpacerDecorations(spacers: SpacerSpec[]): Decoration[] {
  return spacers.map((s) =>
    Decoration.widget(
      s.pos,
      () => {
        const el = document.createElement(s.inList ? 'li' : 'div');
        el.setAttribute('data-folio-page-spacer', 'true');
        el.setAttribute('aria-hidden', 'true');
        el.contentEditable = 'false';
        el.style.height = `${s.height}px`;
        el.style.display = 'flow-root';
        el.style.pointerEvents = 'none';
        el.style.userSelect = 'none';
        if (s.inList) {
          el.style.listStyle = 'none';
          el.style.margin = '0';
          el.style.padding = '0';
        }
        return el;
      },
      {
        side: -1,
        ignoreSelection: true,
        key: `folio-spacer-${s.pos}-${s.height}-${s.inList ? 'li' : 'div'}`,
      },
    ),
  );
}

export const PagePaginationExtension = Extension.create<PaginationLayoutSettings>({
  name: 'folioPagination',

  addOptions() {
    return {
      enabled: true,
      sheetHeightPx: 1123,
      printableHeightPx: 971,
      pageGapPx: PAGE_GAP_PX,
      onPageCountChange: undefined,
      onResponsiveBreaksChange: undefined,
    };
  },

  addStorage() {
    return {
      settings: {
        enabled: true,
        sheetHeightPx: 1123,
        printableHeightPx: 971,
        pageGapPx: PAGE_GAP_PX,
      } as PaginationLayoutSettings,
      relayout: (() => {}) as () => void,
    };
  },

  onCreate() {
    this.storage.settings = { ...this.options };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: folioPaginationKey,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            const meta = tr.getMeta(folioPaginationKey) as
              | { decorations?: DecorationSet }
              | undefined;
            if (meta?.decorations) {
              return meta.decorations;
            }
            return oldSet.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state) {
            return folioPaginationKey.getState(state) ?? DecorationSet.empty;
          },
        },

        view(editorView: EditorView) {
          let rafId = 0;
          let lastSpacers: SpacerSpec[] = [];
          let lastPageCount = 1;
          let lastBreaksKey = '';
          let destroyed = false;

          const computeAndApply = () => {
            if (destroyed) return;
            const settings = extension.storage.settings;
            const { doc } = editorView.state;

            const blocks: MeasuredBlock[] = [];
            doc.forEach((node, offset) => {
              const dom = editorView.nodeDOM(offset) as HTMLElement | null;
              if (!dom || typeof dom.getBoundingClientRect !== 'function') return;

              if (
                (node.type.name === 'bulletList' || node.type.name === 'orderedList') &&
                node.childCount > 0
              ) {
                const listStyle = window.getComputedStyle(dom);
                const listMt = parseFloat(listStyle.marginTop) || 0;
                const listMb = parseFloat(listStyle.marginBottom) || 0;

                let childIdx = 0;
                node.forEach((child, childOffset) => {
                  const itemPos = offset + 1 + childOffset;
                  const itemDom = editorView.nodeDOM(itemPos) as HTMLElement | null;
                  if (!itemDom || typeof itemDom.getBoundingClientRect !== 'function') {
                    childIdx += 1;
                    return;
                  }
                  const itemStyle = window.getComputedStyle(itemDom);
                  const itemMt = parseFloat(itemStyle.marginTop) || 0;
                  const itemMb = parseFloat(itemStyle.marginBottom) || 0;
                  const isFirst = childIdx === 0;
                  const isLast = childIdx === node.childCount - 1;

                  blocks.push({
                    pos: itemPos,
                    mt: isFirst ? Math.max(listMt, itemMt) : itemMt,
                    mb: isLast ? Math.max(listMb, itemMb) : itemMb,
                    height: itemDom.offsetHeight,
                    isManualBreak: false,
                    inList: true,
                  });
                  childIdx += 1;
                });
                return;
              }

              const style = window.getComputedStyle(dom);
              const mt = parseFloat(style.marginTop) || 0;
              const mb = parseFloat(style.marginBottom) || 0;
              const isManualBreak =
                node.type.name === 'pageBreak' ||
                dom.hasAttribute('data-page-break') ||
                Boolean(dom.querySelector('[data-page-break="true"]'));

              blocks.push({
                pos: offset,
                mt,
                mb,
                height: dom.offsetHeight,
                isManualBreak,
              });
            });

            if (!settings.enabled) {
              // Responsive mode: no MS Word spacer widgets, compute logical breaks cleanly
              const printableH = Math.max(200, settings.printableHeightPx);
              let pageStartY = 0;
              let currentPage = 1;
              let cursorY = 0;
              let prevMb = 0;
              const responsiveBreaks: Array<{ y: number; endedPage: number }> = [];

              for (let i = 0; i < blocks.length; i += 1) {
                const b = blocks[i];
                const gap = i === 0 ? b.mt : Math.max(prevMb, b.mt);
                const top = cursorY + gap;
                const bottom = top + b.height;

                if (b.isManualBreak) {
                  currentPage += 1;
                  pageStartY = bottom;
                  cursorY = bottom;
                  prevMb = b.mb;
                  continue;
                }

                if (bottom - pageStartY > printableH && top - pageStartY > 20) {
                  const breakY = Math.max(pageStartY + 12, Math.round(top - gap / 2));
                  responsiveBreaks.push({ y: breakY, endedPage: currentPage });
                  currentPage += 1;
                  pageStartY = top;
                } else if (bottom - pageStartY > printableH) {
                  const breakY = pageStartY + printableH;
                  responsiveBreaks.push({ y: breakY, endedPage: currentPage });
                  currentPage += 1;
                  pageStartY = breakY;
                }

                cursorY = bottom;
                prevMb = b.mb;
              }

              if (lastSpacers.length > 0) {
                lastSpacers = [];
                const tr = editorView.state.tr
                  .setMeta('addToHistory', false)
                  .setMeta(folioPaginationKey, { decorations: DecorationSet.empty });
                editorView.dispatch(tr);
              }

              const breaksKey = JSON.stringify(responsiveBreaks);
              if (breaksKey !== lastBreaksKey) {
                lastBreaksKey = breaksKey;
                settings.onResponsiveBreaksChange?.(responsiveBreaks);
              }

              const nextCount = Math.max(1, currentPage);
              if (nextCount !== lastPageCount) {
                lastPageCount = nextCount;
                settings.onPageCountChange?.(nextCount);
              }
              return;
            }

            // Desktop MS Word Multi-Page Layout Mode
            if (lastBreaksKey !== '[]') {
              lastBreaksKey = '[]';
              settings.onResponsiveBreaksChange?.([]);
            }

            const stride = settings.sheetHeightPx + settings.pageGapPx;
            const printableH = Math.max(200, settings.printableHeightPx);

            let currentPage = 0; // 0-indexed
            let cursorY = 0; // bottom border-box of previous block in .ProseMirror coords
            let prevMb = 0;
            const nextSpacers: SpacerSpec[] = [];

            for (let i = 0; i < blocks.length; i += 1) {
              const b = blocks[i];

              if (b.isManualBreak) {
                const gap = i === 0 ? b.mt : Math.max(prevMb, b.mt);
                const breakTop = cursorY + gap;
                const breakBottom = breakTop + b.height;
                const pageBottom = currentPage * stride + printableH;

                let targetPage = currentPage + 1;
                if (breakBottom > pageBottom && breakTop > currentPage * stride + 16) {
                  // Break marker itself barely didn't fit — let it sit on next page
                  targetPage = currentPage + 2;
                }

                const nextPageTop = targetPage * stride;
                const nextBlock = blocks[i + 1];
                if (nextBlock) {
                  const spacerH = Math.max(
                    0,
                    Math.round(nextPageTop - (breakBottom + b.mb) - nextBlock.mt),
                  );
                  if (spacerH > 0) {
                    nextSpacers.push({ pos: nextBlock.pos, height: spacerH });
                  }
                }
                currentPage = targetPage;
                cursorY = nextPageTop;
                prevMb = 0;
                continue;
              }

              const gap = i === 0 || prevMb === 0 ? b.mt : Math.max(prevMb, b.mt);
              const blockTop = cursorY + gap;
              const blockBottom = blockTop + b.height;
              const pageTop = currentPage * stride;
              const pageBottom = pageTop + printableH;

              if (blockTop < pageTop) {
                const spacerH = Math.max(0, Math.round(pageTop - (cursorY + prevMb) - b.mt));
                if (spacerH > 0) {
                  nextSpacers.push({ pos: b.pos, height: spacerH, inList: b.inList });
                }
                cursorY = pageTop + b.height;
                prevMb = b.mb;
              } else if (blockBottom > pageBottom && blockTop > pageTop + 16) {
                const nextPageTop = (currentPage + 1) * stride;
                const spacerH = Math.max(0, Math.round(nextPageTop - (cursorY + prevMb) - b.mt));
                if (spacerH > 0) {
                  nextSpacers.push({ pos: b.pos, height: spacerH, inList: b.inList });
                }
                currentPage += 1;
                cursorY = nextPageTop + b.height;
                prevMb = b.mb;
              } else {
                cursorY = blockBottom;
                prevMb = b.mb;
              }

              // If a single tall block exceeded current page's printable height, advance currentPage
              while (cursorY > currentPage * stride + printableH + 8) {
                currentPage += 1;
              }
            }

            if (!areSpacersEqual(lastSpacers, nextSpacers)) {
              lastSpacers = nextSpacers;
              const decoSet =
                nextSpacers.length > 0
                  ? DecorationSet.create(doc, buildSpacerDecorations(nextSpacers))
                  : DecorationSet.empty;

              const tr = editorView.state.tr
                .setMeta('addToHistory', false)
                .setMeta(folioPaginationKey, { decorations: decoSet });
              editorView.dispatch(tr);
            }

            const nextCount = Math.max(1, currentPage + 1);
            if (nextCount !== lastPageCount) {
              lastPageCount = nextCount;
              settings.onPageCountChange?.(nextCount);
            }
          };

          const schedule = () => {
            if (destroyed) return;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(computeAndApply);
          };

          extension.storage.relayout = schedule;

          const ro = new ResizeObserver(schedule);
          ro.observe(editorView.dom);

          const isSpacerNode = (n: Node) =>
            n instanceof HTMLElement && n.hasAttribute('data-folio-page-spacer');

          const mo = new MutationObserver((mutations) => {
            const hasRelevantMutation = mutations.some((m) => {
              if (isSpacerNode(m.target)) return false;
              if (m.type === 'childList') {
                const added = Array.from(m.addedNodes);
                const removed = Array.from(m.removedNodes);
                if (
                  (added.length > 0 || removed.length > 0) &&
                  added.every(isSpacerNode) &&
                  removed.every(isSpacerNode)
                ) {
                  return false;
                }
              }
              return true;
            });
            if (hasRelevantMutation) {
              schedule();
            }
          });
          mo.observe(editorView.dom, { childList: true, subtree: true });

          // Initial measurement after fonts/charts mount
          schedule();

          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                schedule();
              }
            },
            destroy() {
              destroyed = true;
              cancelAnimationFrame(rafId);
              ro.disconnect();
              mo.disconnect();
            },
          };
        },
      }),
    ];
  },
});
