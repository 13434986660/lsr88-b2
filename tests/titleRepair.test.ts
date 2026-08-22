import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTitles } from '../src/services/titleService';

test('过短、过长和词库外标题会按原黄金规则重新组合', async () => {
  const keywords = {
    风格: ['风风风风'],
    材质: ['材材材材材'],
    品类: ['甲甲甲甲甲甲', '乙乙乙乙乙乙', '丙丙丙丙丙丙'],
    场景: ['景景景景景景景景']
  };
  const shortTitle = '风风风风材材材材材甲甲甲甲甲甲景景景景景景景景';
  const longTitle = '风风风风材材材材材甲甲甲甲甲甲乙乙乙乙乙乙丙丙丙丙丙丙景景景景景景景景';
  const outsideTitle = `健康环保${'外'.repeat(25)}`;
  const repairedTitles = [
    '风风风风材材材材材甲甲甲甲甲甲乙乙乙乙乙乙景景景景景景景景',
    '风风风风材材材材材甲甲甲甲甲甲丙丙丙丙丙丙景景景景景景景景',
    '风风风风材材材材材乙乙乙乙乙乙丙丙丙丙丙丙景景景景景景景景'
  ];
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
      ? `${longTitle}\n${shortTitle}\n${outsideTitle}`
      : repairedTitles.join('\n');

    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const titles = await generateTitles(
      { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'test-model' },
      keywords,
      3,
      { 风格: [], 材质: [], 品类: [], 人群: [], 场景: [] }
    );

    assert.equal(requestCount, 2);
    assert.deepEqual(titles, repairedTitles);
    assert.match(repairPrompt, /黄金标题组合逻辑/);
    assert.match(repairPrompt, /过长/);
    assert.match(repairPrompt, /过短/);
    assert.match(repairPrompt, /词库外内容/);
    assert.match(repairPrompt, /风格词、场景词依然是标题的必要组成/);
    assert.doesNotMatch(repairPrompt, /优先删除.*风格词或场景词/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
