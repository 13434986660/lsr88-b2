import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTitles } from '../src/services/titleService';

const config = { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'test-model' };
const keywords = {
  风格: ['风风风风'],
  材质: ['材材材材材'],
  品类: ['甲甲甲甲甲甲', '乙乙乙乙乙乙', '丙丙丙丙丙丙'],
  人群: [],
  场景: ['景景景景景景景景']
};
const validTitle = '风风风风材材材材材甲甲甲甲甲甲乙乙乙乙乙乙景景景景景景景景';

test('提示词保持原黄金标题积木组合和双品类强化规则', async () => {
  let requestBody: any;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: validTitle } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    await generateTitles(config, keywords, 1, {
      风格: [],
      材质: [],
      品类: [],
      人群: [],
      场景: []
    });

    const prompt = requestBody.body.messages[0].content as string;
    assert.match(prompt, /积木式构建/);
    assert.match(prompt, /每个标题必须尝试融入 2 个不同的品类词/);
    assert.match(prompt, /风格词、场景词依然是标题的必要组成/);
    assert.doesNotMatch(prompt, /只选择4-7个/);
    assert.doesNotMatch(prompt, /不做硬性必含/);
    assert.doesNotMatch(prompt, /必含词库（必须出现在每个标题中）/);
    assert.equal(requestBody.body.temperature, 0.8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('必含词总长度超过30字时，在请求前直接拒绝', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: validTitle } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      generateTitles(config, keywords, 1, { 品类: ['中'.repeat(31)] }),
      /必含词总长度超过30字/
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
