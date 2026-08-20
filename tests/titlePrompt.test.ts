import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTitles } from '../src/services/titleService';

const config = { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'test-model' };
const keywords = {
  风格: ['简约'],
  材质: ['陶瓷'],
  品类: ['拉面碗', '大汤碗', '泡面碗'],
  人群: [],
  场景: ['厨房']
};
const validTitle = '中'.repeat(29);

test('大词库提示词把普通素材作为候选，避免强制堆叠', async () => {
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
    assert.match(prompt, /普通素材词库仅作为候选/);
    assert.match(prompt, /品类词最多使用2个/);
    assert.match(prompt, /风格词和场景词.*不做硬性必含/);
    assert.doesNotMatch(prompt, /必含词库（必须出现在每个标题中）/);
    assert.equal(requestBody.body.temperature, 0.35);
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
