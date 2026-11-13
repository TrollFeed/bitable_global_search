import { describe, it, expect, beforeEach } from 'vitest';
import { searchIndex } from './SearchIndex';

const SENTENCE =
  '神奇的水晶球映照出璀璨的星空，并非寂静的荒原，而是一座繁花盛开的花园，记录下每一处珍贵的风景。';

beforeEach(() => {
  searchIndex.clear();
  localStorage.clear();
});

describe('mid-sentence CJK phrase search', () => {
  it.each(['星空', '水晶球', '花园', '荒原', '珍贵的', '每一处', '星'])('finds %s mid-sentence', async (q) => {
    await searchIndex.addTable('t1', '笔记', [{ id: 'f1', name: '内容', type: 1 }], [
      { recordId: 'r1', fields: { f1: [{ type: 'text', text: SENTENCE }] } },
    ]);
    const hits = searchIndex.search(q);
    expect(hits.map((h) => h.recordId)).toEqual(['r1']);
    const at = hits[0].matches[0].start;
    expect(SENTENCE.slice(at, at + q.length)).toBe(q);
  });
});

describe('phrases spanning rich-text segment boundaries', () => {
  it('finds a phrase split across two text segments', async () => {
    await searchIndex.addTable('t2', '笔记', [{ id: 'f1', name: '内容', type: 1 }], [
      { recordId: 's1', fields: { f1: [
        { type: 'text', text: '神奇的水晶球映照出璀璨的星' },
        { type: 'text', text: '空，并非寂静的荒原' },
      ] } },
    ]);
    expect(searchIndex.search('星空').map((h) => h.recordId)).toEqual(['s1']);
  });

  it('finds a phrase interrupted by an @mention segment', async () => {
    await searchIndex.addTable('t3', '笔记', [{ id: 'f1', name: '内容', type: 1 }], [
      { recordId: 's2', fields: { f1: [
        { type: 'text', text: '请' },
        { type: 'mention', text: '@张三', id: 'u1' },
        { type: 'text', text: '查看星空报告' },
      ] } },
    ]);
    expect(searchIndex.search('星空').map((h) => h.recordId)).toEqual(['s2']);
    expect(searchIndex.search('张三').map((h) => h.recordId)).toEqual(['s2']);
  });

  it('keeps a url segment searchable without splitting the sentence', async () => {
    await searchIndex.addTable('t4', '笔记', [{ id: 'f1', name: '内容', type: 1 }], [
      { recordId: 's3', fields: { f1: [
        { type: 'text', text: '你的星' },
        { type: 'url', text: '空报告', link: 'https://example.com/report' },
        { type: 'text', text: '已生成' },
      ] } },
    ]);
    expect(searchIndex.search('星空').map((h) => h.recordId)).toEqual(['s3']);
    expect(searchIndex.search('报告已生成').map((h) => h.recordId)).toEqual(['s3']);
    expect(searchIndex.search('example.com').map((h) => h.recordId)).toEqual(['s3']);
  });

  it('still separates genuinely distinct values like multi-select options', async () => {
    await searchIndex.addTable('t5', '标签', [{ id: 'f1', name: '标签', type: 4 }], [
      { recordId: 's4', fields: { f1: [{ id: 'o1', text: '红色' }, { id: 'o2', text: '紧急' }] } },
    ]);
    // Options must not fuse into one phrase.
    expect(searchIndex.search('红色').map((h) => h.recordId)).toEqual(['s4']);
    expect(searchIndex.search('紧急').map((h) => h.recordId)).toEqual(['s4']);
    expect(searchIndex.search('色紧')).toHaveLength(0);
  });
});
