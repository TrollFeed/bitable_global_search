import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BitableDataService } from './BitableDataService';
import { searchIndex } from '../search/SearchIndex';

function createMockBitable() {
  const table = {
    getFieldList: vi
      .fn()
      .mockResolvedValue([{ id: 'fTitle', name: 'Title', type: 1, isPrimary: true }]),
    getRecords: vi.fn().mockResolvedValue({
      records: [{ recordId: 'r1', fields: { fTitle: [{ type: 'text', text: 'Quick brown fox' }] } }],
      hasMore: false,
      pageToken: undefined,
      total: 1,
    }),
    // type 1 === ViewType.Grid
    getViewMetaList: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Grid view', type: 1 }]),
  };

  return {
    base: {
      getBaseInfo: vi.fn().mockResolvedValue({ id: 'base123' }),
      getTableMetaList: vi.fn().mockResolvedValue([{ id: 'tA', name: 'Sheet1' }]),
      getTable: vi.fn().mockResolvedValue(table),
    },
    ui: {
      switchToView: vi.fn().mockResolvedValue(true),
      showFieldValueEditor: vi.fn().mockResolvedValue(true),
    },
    _table: table,
  };
}

beforeEach(() => {
  searchIndex.clear();
  localStorage.clear();
});

describe('indexAllTables (end-to-end through the SDK pipeline)', () => {
  it('pulls records via the SDK and makes rich cell values searchable', async () => {
    const bitable = createMockBitable();
    const svc = new BitableDataService(bitable);

    await svc.indexAllTables();

    // Proves the whole chain: getRecords() rich value -> extractText -> index -> search.
    expect(searchIndex.search('brown').map((r) => r.recordId)).toContain('r1');
    expect(bitable.base.getTableMetaList).toHaveBeenCalled();
  });

  it('resolves the base id', async () => {
    const bitable = createMockBitable();
    const svc = new BitableDataService(bitable);
    expect(await svc.getBaseId()).toBe('base123');
  });
});

describe('navigateToCell (spec: result clicks land on the matched cell, not a row popup)', () => {
  it('switches to the grid view and focuses the exact field cell', async () => {
    const bitable = createMockBitable();
    const svc = new BitableDataService(bitable);

    const nav = await svc.navigateToCell('tA', 'r1', 'fTitle');

    expect(nav).toEqual({ ok: true, mode: 'cell-editor' });
    expect(bitable.ui.switchToView).toHaveBeenCalledWith('tA', 'v1');
    expect(bitable.ui.showFieldValueEditor).toHaveBeenCalledWith({
      tableId: 'tA',
      viewId: 'v1',
      recordId: 'r1',
      fieldId: 'fTitle',
    });
  });

  it('does not fall back to the row dialog when the cell editor worked', async () => {
    const bitable = createMockBitable();
    (bitable.ui as Record<string, unknown>).showRecordDetailDialog = vi
      .fn()
      .mockResolvedValue(true);
    const svc = new BitableDataService(bitable);

    await svc.navigateToCell('tA', 'r1', 'fTitle');
    // Editors keep the precise cell landing; the row card is a viewer fallback.
    expect((bitable.ui as Record<string, unknown>).showRecordDetailDialog).not.toHaveBeenCalled();
  });

  it('prefers a grid view even when it is not the first view', async () => {
    const bitable = createMockBitable();
    bitable._table.getViewMetaList.mockResolvedValueOnce([
      { id: 'vForm', name: 'Form', type: 3 },
      { id: 'vGrid', name: 'Grid', type: 1 },
    ]);
    const svc = new BitableDataService(bitable);

    await svc.navigateToCell('tA', 'r1', 'fTitle');
    expect(bitable.ui.switchToView).toHaveBeenCalledWith('tA', 'vGrid');
  });

  it('still succeeds when the cell is read-only (editor cannot open)', async () => {
    const bitable = createMockBitable();
    bitable.ui.showFieldValueEditor.mockRejectedValueOnce(new Error('field is read-only'));
    const svc = new BitableDataService(bitable);

    // Navigation to the view succeeded, so the click was not a dead end.
    const nav = await svc.navigateToCell('tA', 'r1', 'fFormula');
    expect(nav.ok).toBe(true);
    expect(bitable.ui.switchToView).toHaveBeenCalled();
  });

  it('assumes editable on hosts that do not expose getPermission', async () => {
    const bitable = createMockBitable();
    expect((bitable.base as Record<string, unknown>).getPermission).toBeUndefined();

    const nav = await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');
    expect(nav.mode).toBe('cell-editor');
  });

  it('reports failure instead of throwing when nothing can be opened', async () => {
    const bitable = createMockBitable();
    bitable.ui.switchToView.mockRejectedValueOnce(new Error('nope'));
    bitable.ui.showFieldValueEditor.mockRejectedValueOnce(new Error('nope'));
    const svc = new BitableDataService(bitable);

    await expect(svc.navigateToCell('tA', 'r1', 'fTitle')).resolves.toEqual({
      ok: false,
      mode: 'failed',
    });
  });
});

// ---------------------------------------------------------------------------
// Read-only viewers. showFieldValueEditor is a write affordance: for someone
// without edit access it does nothing, so clicking a result looked broken.
// ---------------------------------------------------------------------------
function createReadOnlyMockBitable() {
  const bitable = createMockBitable() as any;
  bitable.base.getPermission = vi.fn().mockResolvedValue(false);
  bitable.ui.showRecordDetailDialog = vi.fn().mockResolvedValue(true);
  bitable.ui.showToast = vi.fn().mockResolvedValue(true);
  bitable.bridge = {
    getBitableUrl: vi
      .fn()
      .mockResolvedValue('https://example.feishu.cn/base/B1?table=tA&record=r1'),
  };

  // fHidden is hidden in the grid; the meta list is in column order.
  bitable._view = {
    getVisibleFieldIdList: vi.fn().mockResolvedValue(['fOwner', 'fTitle', 'fStatus']),
    getFieldMetaList: vi.fn().mockResolvedValue([
      { id: 'fTitle', name: 'Title', type: 1 },
      { id: 'fStatus', name: 'Status', type: 3 },
      { id: 'fHidden', name: 'Hidden', type: 1 },
      { id: 'fOwner', name: 'Owner', type: 11 },
    ]),
  };
  bitable._table.getViewById = vi.fn().mockResolvedValue(bitable._view);
  return bitable;
}

describe('navigateToCell for read-only viewers', () => {
  it('detects that the viewer cannot edit', async () => {
    const bitable = createReadOnlyMockBitable();
    const svc = new BitableDataService(bitable);

    await expect(svc.canEdit()).resolves.toBe(false);
    expect(bitable.base.getPermission).toHaveBeenCalledWith({
      entity: 'Base',
      type: 'editable',
    });
  });

  it('resolves the permission once and reuses it', async () => {
    const bitable = createReadOnlyMockBitable();
    const svc = new BitableDataService(bitable);

    await svc.canEdit();
    await svc.canEdit();
    await svc.navigateToCell('tA', 'r1', 'fTitle');

    expect(bitable.base.getPermission).toHaveBeenCalledTimes(1);
  });

  it('never opens the editor, and shows the whole row in the record card', async () => {
    const bitable = createReadOnlyMockBitable();
    const svc = new BitableDataService(bitable);

    const nav = await svc.navigateToCell('tA', 'r1', 'fTitle');

    expect(nav).toEqual({ ok: true, mode: 'record-dialog' });
    expect(bitable.ui.showFieldValueEditor).not.toHaveBeenCalled();
    // Every visible field, in grid column order — not just the matched one.
    expect(bitable.ui.showRecordDetailDialog).toHaveBeenCalledWith({
      tableId: 'tA',
      recordId: 'r1',
      fieldIdList: ['fTitle', 'fStatus', 'fOwner'],
    });
  });

  it('omits fields hidden in the grid view', async () => {
    const bitable = createReadOnlyMockBitable();
    await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');

    const { fieldIdList } = bitable.ui.showRecordDetailDialog.mock.calls[0][0];
    expect(fieldIdList).not.toContain('fHidden');
  });

  it('still includes the matched field when it is hidden in the grid view', async () => {
    const bitable = createReadOnlyMockBitable();
    await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fHidden');

    expect(bitable.ui.showRecordDetailDialog).toHaveBeenCalledWith({
      tableId: 'tA',
      recordId: 'r1',
      fieldIdList: ['fTitle', 'fStatus', 'fOwner', 'fHidden'],
    });
  });

  it('reads the view layout once per table, not once per click', async () => {
    const bitable = createReadOnlyMockBitable();
    const svc = new BitableDataService(bitable);

    await svc.navigateToCell('tA', 'r1', 'fTitle');
    await svc.navigateToCell('tA', 'r2', 'fStatus');

    expect(bitable._view.getVisibleFieldIdList).toHaveBeenCalledTimes(1);
  });

  it('lets the host show its default row when the view layout is unreadable', async () => {
    const bitable = createReadOnlyMockBitable();
    bitable._table.getViewById.mockRejectedValue(new Error('no access'));

    await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');

    // No fieldIdList at all beats falling back to a single-field card.
    expect(bitable.ui.showRecordDetailDialog).toHaveBeenCalledWith({
      tableId: 'tA',
      recordId: 'r1',
    });
  });

  it('still switches to the table view so the row is on screen', async () => {
    const bitable = createReadOnlyMockBitable();
    await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');
    expect(bitable.ui.switchToView).toHaveBeenCalledWith('tA', 'v1');
  });

  it('falls back to a deep link when the record card is unavailable', async () => {
    const bitable = createReadOnlyMockBitable();
    bitable.ui.showRecordDetailDialog.mockRejectedValue(new Error('not permitted'));

    const nav = await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');

    expect(nav.mode).toBe('link');
    expect(nav.url).toContain('record=r1');
    expect(bitable.bridge.getBitableUrl).toHaveBeenCalledWith({
      tableId: 'tA',
      viewId: 'v1',
      recordId: 'r1',
    });
  });

  it('falls back to a share link when the host has no getBitableUrl', async () => {
    const bitable = createReadOnlyMockBitable();
    bitable.ui.showRecordDetailDialog.mockRejectedValue(new Error('not permitted'));
    delete bitable.bridge;
    bitable._table.getRecordShareLink = vi
      .fn()
      .mockResolvedValue('https://example.feishu.cn/share/r1');

    const nav = await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');
    expect(nav).toEqual({ ok: true, mode: 'link', url: 'https://example.feishu.cn/share/r1' });
  });

  it('reports view-only when no record route is available at all', async () => {
    const bitable = createReadOnlyMockBitable();
    bitable.ui.showRecordDetailDialog.mockRejectedValue(new Error('not permitted'));
    delete bitable.bridge;

    const nav = await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');
    expect(nav).toEqual({ ok: true, mode: 'view' });
  });

  it('treats an editor that silently resolves false as not opened', async () => {
    const bitable = createMockBitable() as any;
    bitable.base.getPermission = vi.fn().mockResolvedValue(true);
    bitable.ui.showFieldValueEditor.mockResolvedValue(false);
    bitable.ui.showRecordDetailDialog = vi.fn().mockResolvedValue(true);

    const nav = await new BitableDataService(bitable).navigateToCell('tA', 'r1', 'fTitle');
    expect(nav.mode).toBe('record-dialog');
  });
});

// ---------------------------------------------------------------------------
// Paged reads. getRecordsByPage addresses pages by numeric offset and reports
// the table total, so pages after the first can all be in flight at once. The
// deprecated getRecords hands back an opaque record-id token instead, which
// forced one blocking round trip per 200 rows.
// ---------------------------------------------------------------------------
function createPagedMockBitable(tableCount: number, rows: number, latencyMs = 5) {
  const stats = {
    getTable: 0,
    getRecordsByPage: 0,
    offsetsByTable: new Map<string, number[]>(),
    maxConcurrentPageReads: 0,
  };
  let inFlight = 0;

  const makeTable = (tableId: string) => ({
    getFieldList: vi
      .fn()
      .mockResolvedValue([{ id: 'f1', name: '名称', type: 1, isPrimary: true }]),
    getRecordsByPage: async ({ pageSize, pageToken }: any) => {
      stats.getRecordsByPage++;
      const offset: number = pageToken ?? 0;
      const seen = stats.offsetsByTable.get(tableId) ?? [];
      seen.push(offset);
      stats.offsetsByTable.set(tableId, seen);

      inFlight++;
      stats.maxConcurrentPageReads = Math.max(stats.maxConcurrentPageReads, inFlight);
      await new Promise((r) => setTimeout(r, latencyMs));
      inFlight--;

      const n = Math.max(0, Math.min(pageSize, rows - offset));
      return {
        total: rows,
        hasMore: offset + n < rows,
        pageToken: offset + n,
        records: Array.from({ length: n }, (_, i) => ({
          recordId: `${tableId}-r${offset + i}`,
          fields: { f1: [{ type: 'text', text: `神奇的水晶球编号${offset + i}` }] },
        })),
      };
    },
    getViewMetaList: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Grid view', type: 1 }]),
  });

  return {
    stats,
    bitable: {
      base: {
        getBaseInfo: vi.fn().mockResolvedValue({ id: 'basePaged' }),
        getTableMetaList: vi
          .fn()
          .mockResolvedValue(
            Array.from({ length: tableCount }, (_, i) => ({ id: `t${i}`, name: `Sheet${i}` }))
          ),
        getTable: vi.fn(async (tableId: string) => {
          stats.getTable++;
          return makeTable(tableId);
        }),
      },
      ui: {},
    },
  };
}

describe('paged record reads', () => {
  it('requests every page by offset and keeps several in flight', async () => {
    const { bitable, stats } = createPagedMockBitable(1, 1000);
    await new BitableDataService(bitable).indexAllTables();

    // 1000 rows / 200 per page = 5 pages, addressed by offset.
    expect([...(stats.offsetsByTable.get('t0') ?? [])].sort((a, b) => a - b)).toEqual([
      0, 200, 400, 600, 800,
    ]);
    expect(stats.maxConcurrentPageReads).toBeGreaterThan(1);
    expect(searchIndex.getTableData().get('t0')!.recordCount).toBe(1000);
  });

  it('reads only one getTable per table', async () => {
    const { bitable, stats } = createPagedMockBitable(4, 200);
    await new BitableDataService(bitable).indexAllTables();
    expect(stats.getTable).toBe(4);
  });

  it('indexes rows so a mid-phrase Chinese keyword is found across sheets', async () => {
    const { bitable } = createPagedMockBitable(3, 400);
    await new BitableDataService(bitable).indexAllTables();

    const hits = searchIndex.search('水晶球', 5000);
    expect(hits).toHaveLength(1200);
    expect(new Set(hits.map((h) => h.tableId)).size).toBe(3);
  });

  it('reports progress that ends at 100%', async () => {
    const { bitable } = createPagedMockBitable(3, 400);
    const seen: number[] = [];
    await new BitableDataService(bitable).indexAllTables((p) => seen.push(p.overall));

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
  });

  it('falls back to token-following getRecords when getRecordsByPage is absent', async () => {
    const bitable = createMockBitable();
    await new BitableDataService(bitable).indexAllTables();

    expect(bitable._table.getRecords).toHaveBeenCalled();
    expect(searchIndex.search('brown').map((r) => r.recordId)).toContain('r1');
  });
});
