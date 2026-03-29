import { addLog } from './logService';

export interface TitleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const RETRYABLE_STATUS = [502, 503, 504, 429];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

async function fetchWithRetry(
  proxyUrl: string,
  payload: any,
  label: string
): Promise<{ data: any; status: number }> {
  let lastError: Error | null = null;
  const targetUrl = payload.url || '未知';
  const model = payload.body?.model || '未知';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      addLog('warn', label, `第 ${attempt}/${MAX_RETRIES} 次重试，等待 ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    const startTime = Date.now();
    addLog('info', label, `发起请求 → ${targetUrl}`, `模型: ${model} | 尝试: ${attempt + 1}/${MAX_RETRIES + 1}`);

    let response: Response;
    try {
      response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e: any) {
      const elapsed = Date.now() - startTime;
      addLog('error', label, `网络请求失败 (${elapsed}ms)`, e?.message || String(e));
      if (attempt < MAX_RETRIES) {
        lastError = new Error(e?.message || 'Network error');
        continue;
      }
      throw new Error(`网络请求失败: ${e?.message || String(e)}`);
    }

    const elapsed = Date.now() - startTime;
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      addLog('error', label, `响应 JSON 解析失败 (HTTP ${response.status}, ${elapsed}ms)`, text.slice(0, 500));
      throw new Error("服务端返回了无效的 JSON 响应");
    }

    if (response.ok) {
      const tokens = data.usage
        ? `消耗 tokens: ${data.usage.prompt_tokens}+${data.usage.completion_tokens}=${data.usage.total_tokens}`
        : '';
      addLog('success', label, `请求成功 ✓ (HTTP ${response.status}, ${elapsed}ms)`, tokens);
      return { data, status: response.status };
    }

    const errMsg = data.error?.message || data.error || data.message || `HTTP ${response.status}`;
    if (RETRYABLE_STATUS.includes(response.status) && attempt < MAX_RETRIES) {
      addLog('warn', label, `上游返回 HTTP ${response.status}，将重试 (${elapsed}ms)`, String(errMsg));
      lastError = new Error(String(errMsg));
      continue;
    }

    addLog('error', label, `请求失败 ✗ (HTTP ${response.status}, ${elapsed}ms)`, String(errMsg));
    throw new Error(String(errMsg));
  }

  addLog('error', label, `全部 ${MAX_RETRIES} 次重试均失败`);
  throw lastError || new Error('All retries exhausted');
}

export async function extractKeywords(
  config: TitleConfig,
  rawTitles: string
): Promise<Record<string, string[]>> {
  const label = '关键词提取';
  addLog('info', label, `开始提取关键词，模型: ${config.model}`, `原始标题长度: ${rawTitles.length} 字`);

  const prompt = `
# Role: 电商素材提取专家
# Task: 从以下原始标题中提取核心素材词，并按指定类别分类。
# Rules:
1. 强制剔除：品牌名、价格营销词（如"特价"、"包邮"、"秒杀"）、违反广告法的词（如"第一"、"最"）。
2. 保留美感词与功能描述词：允许并鼓励提取描述外观、质感、美感的词汇（如"高颜值"、"精致"、"特别好看的"、"漂亮的"、"简约"、"高级感"等），以及功能性描述词（如"婴儿专用"、"孕妇可用"、"防滑"、"耐热"等）。
3. 注意：对于"特别好看的"、"漂亮的"这类词，结尾的"的"字必须保留，不要剔除。对于"婴儿专用"这类词，也要完整保留。
4. 品类词提取要求：严禁只提取大类词（如"碗"、"盘"、"杯"）。必须提取具体的细分品类词（如"拉面碗"、"泡面碗"、"米饭碗"、"大汤碗"、"斗笠碗"、"菜盘"、"甜品盘"、"意面盘"、"马克杯"、"咖啡杯"等）。如果标题中出现多个具体品类，请全部保留。
5. 语义去重：仅针对完全同义的词进行合并（如[水杯、杯子] -> [水杯]）。如果词义有细微差别（如"饭碗"和"汤碗"），必须分别保留。
6. 分类要求：将提取的词归类为：风格、材质、品类、人群、场景。美感描述词通常归类为"风格"。
7. 输出格式：必须输出为 JSON 格式，结构如下：
{
  "风格": ["词1", "词2"],
  "材质": ["词1", "词2"],
  "品类": ["词1", "词2"],
  "人群": ["词1", "词2"],
  "场景": ["词1", "词2"]
}

原始标题：
${rawTitles}
`;

  const proxyUrl = '/api/proxy';
  const targetUrl = `${config.baseUrl}/chat/completions`;

  const { data } = await fetchWithRetry(proxyUrl, {
    url: targetUrl,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
    body: {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    }
  }, label);

  if (!data.choices || data.choices.length === 0) {
    addLog('error', label, 'API 返回数据无 choices 字段', JSON.stringify(data).slice(0, 300));
    throw new Error(data.error?.message || 'No choices found in API response');
  }
  
  const content = data.choices[0].message.content;
  const jsonString = content.replace(/```json\n?|\n?```/g, '').trim();

  let keywords;
  try {
    keywords = JSON.parse(jsonString);
  } catch (e) {
    addLog('error', label, 'AI 返回的 JSON 格式无法解析', jsonString.slice(0, 500));
    throw new Error('AI 返回的关键词格式无法解析');
  }

  const totalWords = Object.values(keywords as Record<string, string[]>).flat().length;
  addLog('success', label, `关键词提取完成，共 ${totalWords} 个词`, Object.entries(keywords as Record<string, string[]>).map(([k, v]) => `${k}: ${(v as string[]).length}个`).join(' | '));

  return keywords;
}

export async function generateTitles(
  config: TitleConfig,
  keywords: Record<string, string[]>,
  targetCount: number = 10,
  mustIncludeKeywords?: Record<string, string[]>
): Promise<string[]> {
  const label = '标题生成';
  const keywordsJson = JSON.stringify(keywords, null, 2);
  const mustIncludeJson = mustIncludeKeywords ? JSON.stringify(mustIncludeKeywords, null, 2) : '';
  
  const prompt = `
# Role: 电商黄金标题炼金专家
# Task: 基于提供的"素材词库"，编写 ${targetCount} 个字数严格控制在 29-30 字之间的黄金标题。

# 核心编写逻辑：
1. **精准组装与深度思考（积木式构建）**：
   - **积木式构建**：将素材词库中的词汇视为"积木"，通过精准的组装来构建标题。
   - **语感与逻辑**：虽然是组装，但绝非随意堆砌。AI 必须具备极强的"语感"，确保组装后的标题念起来顺口、流畅，逻辑连贯，像是在写一篇精炼的小短文。
   - **战略位置摆放**：AI 需深度思考每个"积木"的最佳位置。例如：功能词（食品级、耐高温等）通常放在材质前或品类后，但具体位置需根据整句的流畅度动态调整。
   - **素材限制**：必须严格从素材词库中挑选词汇，严禁自行添加素材外的内容。
   - **字数控制**：组装后的标题字数必须严格控制在 29-30 字。

2. **权重必含词（最高优先级）**：
   ${mustIncludeKeywords ? `- **强制要求**：以下"必含词库"中的词汇具有最高权重。**每个生成的标题中，必须包含对应分类下的所有必含词**。这些词汇是生成标题的核心，必须妥善安排在合适的位置。` : ''}

3. **严禁重复**：同一个标题内严禁出现意思重复或完全相同的词。

# 强制要求：
- **字数准则**：每个标题必须在 29-30 字。
- **去序号化**：每行一个标题，不要加数字序号。
- **品牌过滤**：严禁出现任何品牌名称。

素材词库：
${keywordsJson}

${mustIncludeKeywords ? `必含词库（必须出现在每个标题中）：\n${mustIncludeJson}` : ''}
`;

  const proxyUrl = '/api/proxy';
  const targetUrl = `${config.baseUrl}/chat/completions`;

  addLog('info', label, `请求生成 ${targetCount} 条标题，模型: ${config.model}`);

  const { data } = await fetchWithRetry(proxyUrl, {
    url: targetUrl,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
    body: {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8
    }
  }, label);

  if (!data.choices || data.choices.length === 0) {
    addLog('error', label, 'API 返回数据无 choices 字段', JSON.stringify(data).slice(0, 300));
    throw new Error(data.error?.message || 'No choices found in API response');
  }
  
  const rawContent = data.choices[0].message.content;
  const allLines = rawContent
    .split('\n')
    .map((t: string) => t.trim())
    .filter((t: string) => t !== '' && t.length >= 28 && t.length <= 31);
  
  const titles = allLines.filter((t: string) => t.length >= 29 && t.length <= 30);

  addLog(
    titles.length > 0 ? 'success' : 'warn',
    label,
    `本批获得 ${titles.length} 条合格标题（29-30字）`,
    `AI 原始输出 ${rawContent.split('\n').filter((l: string) => l.trim()).length} 行，粗筛 ${allLines.length} 条（28-31字），精筛 ${titles.length} 条（29-30字）`
  );

  return titles;
}
