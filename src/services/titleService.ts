export interface TitleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function extractKeywords(
  config: TitleConfig,
  rawTitles: string
): Promise<Record<string, string[]>> {
  const prompt = `
# Role: 电商素材提取专家
# Task: 从以下原始标题中提取核心素材词，并按指定类别分类。
# Rules:
1. 强制剔除：品牌名、价格营销词（如“特价”、“包邮”、“秒杀”）、违反广告法的词（如“第一”、“最”）。
2. 保留美感词与功能描述词：允许并鼓励提取描述外观、质感、美感的词汇（如“高颜值”、“精致”、“特别好看的”、“漂亮的”、“简约”、“高级感”等），以及功能性描述词（如“婴儿专用”、“孕妇可用”、“防滑”、“耐热”等）。
3. 注意：对于“特别好看的”、“漂亮的”这类词，结尾的“的”字必须保留，不要剔除。对于“婴儿专用”这类词，也要完整保留。
4. 品类词提取要求：严禁只提取大类词（如“碗”、“盘”、“杯”）。必须提取具体的细分品类词（如“拉面碗”、“泡面碗”、“米饭碗”、“大汤碗”、“斗笠碗”、“菜盘”、“甜品盘”、“意面盘”、“马克杯”、“咖啡杯”等）。如果标题中出现多个具体品类，请全部保留。
5. 语义去重：仅针对完全同义的词进行合并（如[水杯、杯子] -> [水杯]）。如果词义有细微差别（如“饭碗”和“汤碗”），必须分别保留。
6. 分类要求：将提取的词归类为：风格、材质、品类、人群、场景。美感描述词通常归类为“风格”。
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
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`
  };
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2
  };

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: targetUrl,
      method: 'POST',
      headers,
      body
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    console.error('API Error Response:', data);
    throw new Error(data.error?.message || 'No choices found in API response');
  }
  
  const content = data.choices[0].message.content;
  const jsonString = content.replace(/```json\n?|\n?```/g, '').trim();
  const keywords = JSON.parse(jsonString);
  
  return keywords;
}

export async function generateTitles(
  config: TitleConfig,
  keywords: Record<string, string[]>,
  targetCount: number = 10,
  mustIncludeKeywords?: Record<string, string[]>
): Promise<string[]> {
  const keywordsJson = JSON.stringify(keywords, null, 2);
  const mustIncludeJson = mustIncludeKeywords ? JSON.stringify(mustIncludeKeywords, null, 2) : '';
  
  const prompt = `
# Role: 电商黄金标题炼金专家
# Task: 基于提供的“素材词库”，编写 ${targetCount} 个字数严格控制在 29-30 字之间的黄金标题。

# 核心编写逻辑：
1. **精准组装与深度思考（积木式构建）**：
   - **积木式构建**：将素材词库中的词汇视为“积木”，通过精准的组装来构建标题。
   - **语感与逻辑**：虽然是组装，但绝非随意堆砌。AI 必须具备极强的“语感”，确保组装后的标题念起来顺口、流畅，逻辑连贯，像是在写一篇精炼的小短文。
   - **战略位置摆放**：AI 需深度思考每个“积木”的最佳位置。例如：功能词（食品级、耐高温等）通常放在材质前或品类后，但具体位置需根据整句的流畅度动态调整。
   - **素材限制**：必须严格从素材词库中挑选词汇，严禁自行添加素材外的内容。
   - **字数控制**：组装后的标题字数必须严格控制在 29-30 字。

2. **权重必含词（最高优先级）**：
   ${mustIncludeKeywords ? `- **强制要求**：以下“必含词库”中的词汇具有最高权重。**每个生成的标题中，必须包含对应分类下的所有必含词**。这些词汇是生成标题的核心，必须妥善安排在合适的位置。` : ''}

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
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`
  };
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8
  };

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: targetUrl,
      method: 'POST',
      headers,
      body
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    console.error('API Error Response:', data);
    throw new Error(data.error?.message || 'No choices found in API response');
  }
  
  const titles = data.choices[0].message.content
    .split('\n')
    .map((t: string) => t.trim())
    .filter((t: string) => t !== '' && t.length >= 28 && t.length <= 31);
  
  return titles.filter((t: string) => t.length >= 29 && t.length <= 30);
}
