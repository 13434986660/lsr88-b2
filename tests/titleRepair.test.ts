import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTitles } from '../src/services/titleService';

test('过短和过长标题会进入二次长度校正', async () => {
  const shortTitle = '短'.repeat(28);
  const longTitle = '长'.repeat(35);
  const repairedShortTitle = '补'.repeat(29);
  const repairedLongTitle = '修'.repeat(30);
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  let repairPrompt = '';

  globalThis.fetch = (async (_input, init) => {
    requestCount++;
    const body = JSON.parse(String(init?.body));
    if (requestCount === 2) {
      repairPrompt = body.body.messages[0].content;
    }

    const content = requestCount === 1
      ? `${longTitle}\n${shortTitle}`
      : `${repairedLongTitle}\n${repairedShortTitle}`;

    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const titles = await generateTitles(
      { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'test-model' },
      { 材质: ['陶瓷'], 品类: ['拉面碗'], 风格: ['简约'], 场景: ['厨房'] },
      2,
      { 风格: [], 材质: [], 品类: [], 人群: [], 场景: [] }
    );

    assert.equal(requestCount, 2);
    assert.deepEqual(titles, [repairedLongTitle, repairedShortTitle]);
    assert.match(repairPrompt, /二次长度校正/);
    assert.match(repairPrompt, /过长/);
    assert.match(repairPrompt, /过短/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
