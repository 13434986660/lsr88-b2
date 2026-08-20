import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTitles } from '../src/services/titleService';

test('只保留实际字符数为29到30的标题，不使用UTF-16长度误判', async () => {
  const titleWith28Characters = '中'.repeat(26) + '𠀀𠀀';
  assert.equal(titleWith28Characters.length, 30);
  assert.equal(Array.from(titleWith28Characters).length, 28);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: titleWith28Characters } }]
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch;

  try {
    const titles = await generateTitles(
      { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'test-model' },
      { 品类: ['测试品类'], 材质: ['测试材质'] },
      1
    );

    assert.deepEqual(titles, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
