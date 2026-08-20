/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, Copy, Sparkles, Loader2, Save, RefreshCw, 
  Search, Check, X, Plus, Trash2, Edit3, ChevronDown, 
  Zap, Package, Users, MapPin, Palette, Wand2,
  ExternalLink, Github, Download, Cloud, MousePointer2, Upload,
  History, Clock, FileText, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateTitles, extractKeywords } from './services/titleService';
import { addLog } from './services/logService';
import DebugPanel from './components/DebugPanel';

export default function App() {
  const configLoadedRef = React.useRef(false);
  const loadedConfigSnapshot = React.useRef('');
  const [configOpen, setConfigOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>(['gpt-3.5-turbo', 'gpt-4o', 'gpt-4-turbo']);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [rawTitles, setRawTitles] = useState('');
  const [keywords, setKeywords] = useState<Record<string, string[]>>({
    '风格': [],
    '产品功能': [],
    '材质': [],
    '品类': [],
    '人群': [],
    '场景': []
  });
  const [mustIncludeKeywords, setMustIncludeKeywords] = useState<Record<string, string[]>>({
    '风格': [],
    '产品功能': [],
    '材质': [],
    '品类': [],
    '人群': [],
    '场景': []
  });
  const [newKeyword, setNewKeyword] = useState<Record<string, string>>({});
  const [newMustInclude, setNewMustInclude] = useState<Record<string, string>>({});
  const [count, setCount] = useState(5);
  const [maxRequests, setMaxRequests] = useState(50);
  const [currentRequestCount, setCurrentRequestCount] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const stopRef = React.useRef(false);

  // Presets state: { [category]: { [presetName]: string[] } }
  const [presets, setPresets] = useState<Record<string, Record<string, string[]>>>({
    '风格': {},
    '产品功能': {},
    '材质': {},
    '品类': {},
    '人群': {},
    '场景': {}
  });
  const [selectedKeywords, setSelectedKeywords] = useState<Record<string, string[]>>({});
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [activePresetCategory, setActivePresetCategory] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetKeyword, setNewPresetKeyword] = useState('');
  const [editingPreset, setEditingPreset] = useState<string | null>(null);
  const [editingKeywordPos, setEditingKeywordPos] = useState<{ category: string, index: number } | null>(null);

  const [generatedTitles, setGeneratedTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedTitles, setSelectedTitles] = useState<Set<number>>(new Set());
  const [globalError, setGlobalError] = useState<{ title: string, message: string, details?: string } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // History
  interface HistoryEntry {
    id: string;
    name: string;
    date: string;
    count: number;
    model: string;
    titles: string[];
  }
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<HistoryEntry | null>(null);

  const STORAGE_KEY_CONFIG = 'app_config';
  const STORAGE_KEY_HISTORY = 'app_history';

  const buildConfigPayload = () => ({ baseUrl, apiKey, selectedModel, models, presets, keywords, mustIncludeKeywords });

  const persistConfig = (payload: ReturnType<typeof buildConfigPayload>) => {
    try { localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(payload)); } catch (_) {}
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const persistHistory = (list: HistoryEntry[]) => {
    try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list)); } catch (_) {}
  };

  // Load config on mount: localStorage first, then try server API to merge
  useEffect(() => {
    let cancelled = false;
    const applyConfig = (data: any) => {
      if (data.baseUrl) setBaseUrl(data.baseUrl);
      if (data.apiKey) setApiKey(data.apiKey);
      if (data.selectedModel) setSelectedModel(data.selectedModel);
      if (data.models) setModels(data.models);
      if (data.presets) setPresets(data.presets);
      if (data.keywords && Object.keys(data.keywords).length > 0) setKeywords(data.keywords);
      if (data.mustIncludeKeywords) setMustIncludeKeywords(data.mustIncludeKeywords);
    };

    const loadConfig = async () => {
      addLog('info', '系统', '应用启动，正在加载配置...');

      let localData: any = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (raw) localData = JSON.parse(raw);
      } catch (_) {}

      if (localData) {
        if (!cancelled) applyConfig(localData);
        addLog('success', '系统', '从浏览器缓存加载配置', `模型: ${localData.selectedModel || '未设置'}`);
      }

      try {
        const response = await fetch('/api/config');
        if (response.ok) {
          const text = await response.text();
          const serverData = text ? JSON.parse(text) : {};
          if (!cancelled && serverData && Object.keys(serverData).length > 0) {
            if (!localData) {
              applyConfig(serverData);
              addLog('success', '系统', '从服务端加载配置', `模型: ${serverData.selectedModel || '未设置'}`);
              try { localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(serverData)); } catch (_) {}
            }
          }
        }
      } catch (_) {}

      if (!cancelled) {
        loadedConfigSnapshot.current = JSON.stringify(buildConfigPayload());
        configLoadedRef.current = true;
      }

      let localHistory: any = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
        if (raw) localHistory = JSON.parse(raw);
      } catch (_) {}
      if (!cancelled && Array.isArray(localHistory) && localHistory.length > 0) {
        setHistoryList(localHistory);
      } else {
        try {
          const hRes = await fetch('/api/history');
          if (hRes.ok) {
            const hData = await hRes.json();
            if (!cancelled && Array.isArray(hData) && hData.length > 0) {
              setHistoryList(hData);
              try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(hData)); } catch (_) {}
            }
          }
        } catch (_) {}
      }
    };
    loadConfig();
    return () => { cancelled = true; };
  }, []);

  const saveConfig = async () => {
    setSavingConfig(true);
    addLog('info', '配置', '正在保存配置...');
    try {
      const payload = buildConfigPayload();
      persistConfig(payload);
      loadedConfigSnapshot.current = JSON.stringify(payload);
      addLog('success', '配置', '配置保存成功');
      setTimeout(() => {
        setSavingConfig(false);
        setConfigOpen(false);
      }, 500);
    } catch (error) {
      addLog('error', '配置', '配置保存失败', error instanceof Error ? error.message : String(error));
      setGlobalError({
        title: '保存失败',
        message: '保存配置时发生错误。'
      });
      setSavingConfig(false);
    }
  };

  useEffect(() => {
    if (!configLoadedRef.current) return;
    const payload = buildConfigPayload();
    const snapshot = JSON.stringify(payload);
    if (snapshot === loadedConfigSnapshot.current) return;
    const timer = setTimeout(() => {
      persistConfig(payload);
      loadedConfigSnapshot.current = snapshot;
    }, 1000);
    return () => clearTimeout(timer);
  }, [baseUrl, apiKey, selectedModel, models, keywords, mustIncludeKeywords, presets]);

  const fetchModels = async () => {
    if (!apiKey) return;
    setFetchingModels(true);
    try {
      const proxyUrl = '/api/proxy';
      const targetUrl = `${baseUrl}/models`;
      
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        })
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        console.error("Failed to parse response JSON. Raw text:", text);
        console.error("Parse error:", e);
        throw new Error("Invalid JSON response from server");
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP error! status: ${response.status}`);
      }

      if (data.data) {
        setModels(data.data.map((m: any) => m.id));
        setIsModelSelectorOpen(true);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setGlobalError({
        title: '获取模型失败',
        message: error instanceof Error ? error.message : '无法从服务器获取模型列表，请检查 Base URL 和 API Key 是否正确。'
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const filteredModels = models.filter(m => 
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleExtract = async () => {
    if (!apiKey || !selectedModel) {
      addLog('warn', '提取', '未配置 API Key 或模型，请先完成设置');
      setConfigOpen(true);
      return;
    }
    if (!rawTitles.trim()) return;
    
    setExtracting(true);
    addLog('info', '提取', '用户点击「提取核心关键词」');
    try {
      const result = await extractKeywords(
        { baseUrl, apiKey, model: selectedModel },
        rawTitles
      );
      setKeywords(result);
    } catch (error) {
      setGlobalError({
        title: '提取失败',
        message: error instanceof Error ? error.message : '提取关键词时发生未知错误，请检查 API 配置。',
        details: error instanceof Error ? error.stack || error.message : String(error)
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerate = async () => {
    if (!apiKey || !selectedModel) {
      addLog('warn', '生成', '未配置 API Key 或模型，请先完成设置');
      setGlobalError({
        title: '配置未完成',
        message: '请先在设置中配置 API Key 和选择模型。'
      });
      setConfigOpen(true);
      return;
    }

    const hasCategory = keywords['品类'] && keywords['品类'].length > 0;
    const hasMaterial = keywords['材质'] && keywords['材质'].length > 0;

    if (!hasCategory || !hasMaterial) {
      addLog('warn', '生成', '素材不足：缺少"品类"或"材质"');
      setGlobalError({
        title: '素材不足',
        message: '生成标题缺少产品“品类”或“材质”，请正确添加。这两类词汇是生成标题的必要素材。'
      });
      return;
    }

    const allWords = Object.values(keywords).flat();
    const totalLength = allWords.join('').length;
    
    if (totalLength < 10) {
      addLog('warn', '生成', `素材总字数不足: ${totalLength} < 10`);
      setGlobalError({
        title: '素材过少',
        message: '当前素材词库中的关键词总字数太少（不足10字），请增加更多关键词以生成高质量标题。'
      });
      return;
    }

    setLoading(true);
    setIsStopping(false);
    stopRef.current = false;
    setGeneratedTitles([]);
    setCurrentRequestCount(0);
    
    let allTitles: string[] = [];
    let requestIteration = 0;
    const genStartTime = Date.now();

    addLog('info', '生成', `开始生成标题，目标 ${count} 条，最多 ${maxRequests} 轮`, `模型: ${selectedModel} | 素材词: ${allWords.length} 个 (${totalLength} 字)`);

    try {
      while (allTitles.length < count && requestIteration < maxRequests) {
        if (stopRef.current) {
          addLog('warn', '生成', `用户手动停止，已完成 ${allTitles.length}/${count} 条`);
          break;
        }

        requestIteration++;
        setCurrentRequestCount(requestIteration);
        addLog('info', '生成', `第 ${requestIteration} 轮请求 (已有 ${allTitles.length}/${count} 条)`);
        
        const batchSize = 10;
        
        const batch = await generateTitles(
          { baseUrl, apiKey, model: selectedModel },
          keywords,
          batchSize,
          mustIncludeKeywords
        );
        
        if (stopRef.current) break;

        const newUniqueTitles = batch.filter(t => !allTitles.includes(t));
        const duplicateCount = batch.length - newUniqueTitles.length;
        
        if (newUniqueTitles.length > 0) {
          const remainingNeeded = count - allTitles.length;
          const titlesToAdd = newUniqueTitles.slice(0, remainingNeeded);
          
          allTitles = [...allTitles, ...titlesToAdd];
          setGeneratedTitles([...allTitles]);
          addLog('info', '生成', `第 ${requestIteration} 轮: +${titlesToAdd.length} 条新标题 (去重 ${duplicateCount})，累计 ${allTitles.length}/${count}`);
        } else {
          addLog('warn', '生成', `第 ${requestIteration} 轮: 0 条新标题（全部重复或不合格）`);
        }

        if (allTitles.length < count) {
          await new Promise(resolve => setTimeout(resolve, 800));
        } else {
          break;
        }
      }
      
      const elapsed = ((Date.now() - genStartTime) / 1000).toFixed(1);

      if (allTitles.length > 0) {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateName = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const entry: HistoryEntry = {
          id: `h_${Date.now()}`,
          name: `${dateName}（${allTitles.length}条）`,
          date: now.toISOString(),
          count: allTitles.length,
          model: selectedModel,
          titles: [...allTitles],
        };
        setHistoryList(prev => {
          const updated = [entry, ...prev];
          persistHistory(updated);
          return updated;
        });
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        }).catch(() => {});
        addLog('info', '历史', `已保存生成记录: ${entry.name}`);
      }

      if (allTitles.length === 0) {
        addLog('error', '生成', `结果为空，${requestIteration} 轮请求，耗时 ${elapsed}s`);
        setGlobalError({
          title: '生成结果为空',
          message: 'AI 已响应但未能生成符合字数要求（29-30字）的标题。请尝试增加关键词或更换模型。'
        });
      } else if (allTitles.length < count) {
        addLog('warn', '生成', `部分完成: ${allTitles.length}/${count} 条，达到上限 ${maxRequests} 轮，耗时 ${elapsed}s`);
      } else {
        addLog('success', '生成', `✓ 全部完成: ${allTitles.length} 条标题，${requestIteration} 轮请求，耗时 ${elapsed}s`);
      }
      
    } catch (error) {
      const elapsed = ((Date.now() - genStartTime) / 1000).toFixed(1);
      addLog('error', '生成', `生成中断 (${elapsed}s): ${error instanceof Error ? error.message : String(error)}`);
      setGlobalError({
        title: '生成失败',
        message: error instanceof Error ? error.message : '未知错误，请检查网络或 API 配置。',
        details: error instanceof Error ? error.stack || error.message : String(error)
      });
    } finally {
      setLoading(false);
      setIsStopping(false);
      stopRef.current = false;
    }
  };

  const handleStop = () => {
    addLog('warn', '生成', '用户点击「停止生成」');
    setIsStopping(true);
    stopRef.current = true;
  };

  const toggleSelectTitle = (index: number) => {
    const newSelected = new Set(selectedTitles);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTitles(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTitles.size === generatedTitles.length) {
      setSelectedTitles(new Set());
    } else {
      setSelectedTitles(new Set(generatedTitles.map((_, i) => i)));
    }
  };

  const copySelected = () => {
    const titlesToCopy = Array.from(selectedTitles)
      .sort((a: number, b: number) => a - b)
      .map(index => generatedTitles[index])
      .join('\n');
    
    if (titlesToCopy) {
      navigator.clipboard.writeText(titlesToCopy);
      alert(`已复制 ${selectedTitles.size} 条标题到剪贴板`);
    }
  };

  const addKeyword = (category: string) => {
    const val = newKeyword[category]?.trim();
    if (!val) return;
    setKeywords(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), val]
    }));
    setNewKeyword(prev => ({ ...prev, [category]: '' }));
  };

  const addMustInclude = (category: string) => {
    const val = newMustInclude[category]?.trim();
    if (!val) return;
    setMustIncludeKeywords(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), val]
    }));
    setNewMustInclude(prev => ({ ...prev, [category]: '' }));
  };

  const removeMustInclude = (category: string, index: number) => {
    setMustIncludeKeywords(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const removeKeyword = (category: string, index: number) => {
    const word = keywords[category][index];
    setKeywords(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
    
    // Also remove from selection if it was selected
    if (selectedKeywords[category]?.includes(word)) {
      setSelectedKeywords(prev => ({
        ...prev,
        [category]: prev[category].filter(w => w !== word)
      }));
    }
  };

  const toggleKeywordSelection = (category: string, word: string) => {
    setSelectedKeywords(prev => {
      const current = prev[category] || [];
      if (current.includes(word)) {
        return { ...prev, [category]: current.filter(w => w !== word) };
      } else {
        return { ...prev, [category]: [...current, word] };
      }
    });
  };

  const clearCategory = (category: string) => {
    setKeywords(prev => ({ ...prev, [category]: [] }));
    setMustIncludeKeywords(prev => ({ ...prev, [category]: [] }));
    setSelectedKeywords(prev => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  };

  const deleteSelectedKeywords = (category: string) => {
    const selected = selectedKeywords[category] || [];
    if (selected.length === 0) return;
    
    if (window.confirm(`确定要删除选中的 ${selected.length} 个关键词吗？`)) {
      setKeywords(prev => ({
        ...prev,
        [category]: prev[category].filter(w => !selected.includes(w))
      }));
      setSelectedKeywords(prev => ({ ...prev, [category]: [] }));
    }
  };

  const createPreset = (category: string) => {
    if (!newPresetName.trim()) return;
    if (presets[category]?.[newPresetName]) {
      setGlobalError({
        title: '名称冲突',
        message: `该分类下预设名称“${newPresetName}”已存在，请换一个名称。`
      });
      return;
    }
    setPresets(prev => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [newPresetName]: []
      }
    }));
    setNewPresetName('');
  };

  const deletePreset = (category: string, name: string) => {
    setPresets(prev => {
      const next = { ...prev };
      const categoryPresets = { ...next[category] };
      delete categoryPresets[name];
      next[category] = categoryPresets;
      return next;
    });
    if (editingPreset === name) setEditingPreset(null);
  };

  const saveToPreset = (category: string, presetName: string) => {
    const selected = selectedKeywords[category] || [];
    if (selected.length === 0) {
      setGlobalError({
        title: '未选中关键词',
        message: '请先在主界面勾选要保存到预设的关键词。'
      });
      return;
    }
    
    setPresets(prev => {
      const next = { ...prev };
      if (!next[category]) next[category] = {};
      if (!next[category][presetName]) next[category][presetName] = [];
      
      const existing = next[category][presetName];
      const toAdd = selected.filter(w => !existing.includes(w));
      next[category][presetName] = [...existing, ...toAdd];
      return next;
    });
    
    alert(`已将关键词保存到“${category}”的预设“${presetName}”中`);
    setSelectedKeywords(prev => ({ ...prev, [category]: [] }));
  };

  const loadFromPreset = (category: string, presetName: string) => {
    const presetWords = presets[category]?.[presetName] || [];
    if (presetWords.length === 0) {
      alert(`预设“${presetName}”中没有关键词`);
      return;
    }
    
    setKeywords(prev => {
      const existing = prev[category] || [];
      const toAdd = presetWords.filter(w => !existing.includes(w));
      return { ...prev, [category]: [...existing, ...toAdd] };
    });
    
    alert(`已从预设“${presetName}”加载关键词`);
  };

  const exportPresets = () => {
    const dataStr = JSON.stringify(presets, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'title_gen_presets.json');
    linkElement.click();
  };

  const importPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        setPresets(prev => ({ ...prev, ...imported }));
        alert('预设词库导入成功');
      } catch (error) {
        alert('导入失败，请检查文件格式');
      }
    };
    reader.readAsText(file);
  };

  const addKeywordToPreset = (category: string, presetName: string, keyword: string) => {
    if (!keyword.trim()) return;
    setPresets(prev => {
      const next = { ...prev };
      const categoryPresets = { ...next[category] };
      const presetWords = [...(categoryPresets[presetName] || [])];
      if (!presetWords.includes(keyword.trim())) {
        presetWords.push(keyword.trim());
        categoryPresets[presetName] = presetWords;
        next[category] = categoryPresets;
      }
      return next;
    });
    setNewPresetKeyword('');
  };
  const editKeyword = (category: string, index: number, newValue: string) => {
    setKeywords(prev => ({
      ...prev,
      [category]: prev[category].map((item, i) => i === index ? newValue : item)
    }));
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    '风格': <Palette size={18} className="text-purple-500" />,
    '产品功能': <Zap size={18} className="text-yellow-500" />,
    '材质': <Package size={18} className="text-amber-600" />,
    '品类': <Search size={18} className="text-blue-500" />,
    '人群': <Users size={18} className="text-green-600" />,
    '场景': <MapPin size={18} className="text-rose-500" />,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
              <Zap size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">电商黄金标题炼金专家</h1>
              <p className="text-xs text-slate-500 font-medium">AI-Powered Title Optimizer</p>
            </div>
          </div>
          <button 
            onClick={() => setConfigOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors relative group"
          >
            <Settings size={20} className="text-slate-600 group-hover:rotate-45 transition-transform duration-300" />
            {!apiKey && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input & Keywords */}
        <div className="lg:col-span-5 space-y-8">
          {/* Input Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Edit3 size={20} className="text-blue-600" />
                原始标题输入
              </h2>
              <span className="text-xs text-slate-400 font-mono">Input Raw Titles</span>
            </div>
            <textarea 
              value={rawTitles}
              onChange={(e) => setRawTitles(e.target.value)}
              placeholder="粘贴多个原始标题，每行一个..."
              className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-sm resize-none"
            />
            <div className="mt-4 flex gap-3">
              <button 
                onClick={handleExtract}
                disabled={extracting || !rawTitles.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
              >
                {extracting ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                提取核心关键词
              </button>
            </div>
          </section>

          {/* Keywords Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Sparkles size={20} className="text-purple-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-800">素材词库</h2>
                </div>
                
                <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={exportPresets}
                    className="text-[10px] text-slate-500 hover:text-purple-600 hover:bg-purple-50 px-2 py-1 rounded-md flex items-center gap-1 transition-all"
                    title="导出所有预设词库"
                  >
                    <Download size={12} /> 导出预设
                  </button>
                  <label className="text-[10px] text-slate-500 hover:text-purple-600 hover:bg-purple-50 px-2 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer" title="导入所有预设词库">
                    <Upload size={12} /> 导入预设
                    <input type="file" accept=".json" onChange={importPresets} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-bold shadow-md active:scale-95"
                >
                  {savingConfig ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
                  保存词库
                </button>
              </div>
            </div>

            <div className="flex justify-end mb-6">
              <button 
                onClick={() => {
                  if (window.confirm('确定要清空所有分类下的关键词和必含词吗？此操作不可撤销。')) {
                    setKeywords({
                      '风格': [],
                      '产品功能': [],
                      '材质': [],
                      '品类': [],
                      '人群': [],
                      '场景': []
                    });
                    setMustIncludeKeywords({
                      '风格': [],
                      '产品功能': [],
                      '材质': [],
                      '品类': [],
                      '人群': [],
                      '场景': []
                    });
                    setSelectedKeywords({});
                  }
                }}
                className="text-xs bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all font-medium border border-red-100 active:scale-95 shadow-sm"
              >
                <Trash2 size={14} /> 全部清空
              </button>
            </div>

            <div className="space-y-8">
              {['风格', '产品功能', '材质', '品类', '人群', '场景'].map((category) => {
                const items = keywords[category] || [];
                const categoryPresets = presets[category] || {};
                
                return (
                  <div key={category} className="group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {categoryIcons[category]}
                        <h3 className="text-sm font-bold text-slate-700">{category}</h3>
                        <span className="text-[10px] text-slate-400 font-normal">({items.length})</span>
                        <button 
                          onClick={() => {
                            setActivePresetCategory(category);
                            setPresetModalOpen(true);
                          }}
                          className="text-[10px] bg-purple-50 text-purple-600 hover:bg-purple-100 px-2 py-0.5 rounded flex items-center gap-1 transition-colors ml-2"
                        >
                          <Settings size={10} /> 管理预设
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setActivePresetCategory(category);
                            setPresetModalOpen(true);
                          }}
                          className="text-[10px] bg-purple-50 text-purple-600 hover:bg-purple-100 px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all font-bold shadow-sm border border-purple-100 active:scale-95"
                        >
                          <Settings size={12} /> 预设中心
                        </button>

                        <div className="flex items-center gap-2 border-l pl-3 border-slate-100">
                          <button 
                            onClick={() => deleteSelectedKeywords(category)}
                            disabled={!selectedKeywords[category]?.length}
                            className="text-[10px] text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors flex items-center gap-1"
                          >
                            <Trash2 size={12} /> 删除选中
                          </button>
                          <button 
                            onClick={() => clearCategory(category)}
                            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                          >
                            <X size={12} /> 清空分类
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 必含词/权重词区域 */}
                    <div 
                      className="mb-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl transition-all duration-200"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('bg-amber-100', 'border-amber-300', 'scale-[1.02]');
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('bg-amber-100', 'border-amber-300', 'scale-[1.02]');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('bg-amber-100', 'border-amber-300', 'scale-[1.02]');
                        const word = e.dataTransfer.getData('text/plain');
                        const sourceCategory = e.dataTransfer.getData('category');
                        
                        if (word && sourceCategory === category) {
                          if (!mustIncludeKeywords[category]?.includes(word)) {
                            setMustIncludeKeywords(prev => ({
                              ...prev,
                              [category]: [...(prev[category] || []), word]
                            }));
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-amber-700">
                          <Zap size={14} className="fill-amber-500 text-amber-500" />
                          <span className="text-xs font-bold">必含权重词 (每个标题必出)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            placeholder="输入必含词..."
                            value={newMustInclude[category] || ''}
                            onChange={(e) => setNewMustInclude(prev => ({ ...prev, [category]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addMustInclude(category)}
                            className="text-[10px] px-2 py-1 rounded border border-amber-200 bg-white outline-none focus:border-amber-400 w-24"
                          />
                          <button 
                            onClick={() => addMustInclude(category)}
                            className="p-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(mustIncludeKeywords[category] || []).length === 0 ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-amber-400 italic">未设置权重词，AI将随机组合</span>
                            <span className="text-[9px] text-amber-300 flex items-center gap-1">
                              <MousePointer2 size={10} /> 拖拽下方词汇至此区域可快速添加
                            </span>
                          </div>
                        ) : (
                          (mustIncludeKeywords[category] || []).map((word, idx) => (
                            <div key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-200 rounded text-[10px] text-amber-700 font-medium">
                              {word}
                              <button 
                                onClick={() => removeMustInclude(category, idx)}
                                className="text-amber-400 hover:text-amber-600"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {items.map((kw, i) => {
                        const isSelected = selectedKeywords[category]?.includes(kw);
                        const isEditing = editingKeywordPos?.category === category && editingKeywordPos?.index === i;
                        
                        return (
                          <motion.div 
                            layout
                            key={i} 
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', kw);
                              e.dataTransfer.setData('category', category);
                              e.currentTarget.style.opacity = '0.5';
                            }}
                            onDragEnd={(e) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                            onClick={() => toggleKeywordSelection(category, kw)}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingKeywordPos({ category, index: i });
                            }}
                            className={`group/item flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none ${
                              isSelected 
                                ? 'bg-purple-50 border-purple-200 text-purple-700' 
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                            }`}
                          >
                            {isEditing ? (
                              <input 
                                autoFocus
                                value={kw}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => editKeyword(category, i, e.target.value)}
                                onBlur={() => setEditingKeywordPos(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingKeywordPos(null)}
                                className="bg-white border border-blue-300 rounded px-1 w-24 outline-none text-xs text-slate-900"
                              />
                            ) : (
                              <span className="text-xs">{kw}</span>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeKeyword(category, i);
                              }} 
                              className="text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        );
                      })}
                      {items.length === 0 && (
                        <div className="text-[10px] text-slate-300 italic py-1">暂无关键词</div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input 
                        value={newKeyword[category] || ''}
                        onChange={(e) => setNewKeyword(prev => ({ ...prev, [category]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && addKeyword(category)}
                        placeholder={`添加${category}...`}
                        className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg flex-1 focus:ring-1 focus:ring-blue-400 outline-none"
                      />
                      <button 
                        onClick={() => addKeyword(category)} 
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column: Generation & Results */}
        <div className="lg:col-span-7 space-y-8">
          {/* Generation Control */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <Wand2 size={20} className="text-blue-600" />
              标题生成设置
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">生成数量</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="500" 
                    value={count} 
                    onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">最高请求次数</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="200" 
                    value={maxRequests} 
                    onChange={(e) => setMaxRequests(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">默认50次，若生成困难可调高</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleGenerate}
                  disabled={loading}
                  className={`flex-1 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] ${
                    loading ? 'bg-slate-300 cursor-not-allowed text-slate-500' : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>正在生成 ({generatedTitles.length}/{count}) - 第 {currentRequestCount} 次请求</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={20} />
                      <span>开始生成标题</span>
                    </>
                  )}
                </button>

                {loading && (
                  <button 
                    onClick={handleStop}
                    disabled={isStopping}
                    className="px-6 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl border border-red-200 transition-all flex items-center gap-2 active:scale-[0.95]"
                  >
                    {isStopping ? <Loader2 className="animate-spin" size={18} /> : <X size={18} />}
                    {isStopping ? '正在停止...' : '停止生成'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Results Section */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">生成结果</h2>
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all font-medium"
                >
                  <History size={14} />
                  历史记录
                  {historyList.length > 0 && (
                    <span className="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full">{historyList.length}</span>
                  )}
                </button>
                {generatedTitles.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
                    <input 
                      type="checkbox"
                      checked={selectedTitles.size === generatedTitles.length && generatedTitles.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-500 font-medium">全选</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                {selectedTitles.size > 0 && (
                  <button 
                    onClick={copySelected}
                    className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors flex items-center gap-1"
                  >
                    <Copy size={14} />
                    复制选中 ({selectedTitles.size})
                  </button>
                )}
                {generatedTitles.length > 0 && (
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedTitles.join('\n'));
                      alert('所有标题已复制到剪贴板！');
                    }}
                    className="text-xs text-slate-400 font-semibold hover:text-blue-600 transition-colors"
                  >
                    全部复制
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {generatedTitles.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <Package size={48} strokeWidth={1} />
                  <p className="mt-4 text-sm">暂无生成结果</p>
                </div>
              )}
              
              {generatedTitles.map((title, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={i} 
                  onClick={() => toggleSelectTitle(i)}
                  className={`group relative p-4 border rounded-xl transition-all cursor-pointer flex items-start gap-4 ${
                    selectedTitles.has(i) 
                      ? 'bg-blue-50/50 border-blue-200 shadow-sm' 
                      : 'bg-slate-50 hover:bg-white border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="mt-1 flex-shrink-0">
                    <input 
                      type="checkbox"
                      checked={selectedTitles.has(i)}
                      onChange={() => {}} // Handled by parent onClick
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-medium leading-relaxed pr-16">{title}</p>
                    <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                      <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        {title.length}字
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(title, i);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        {copiedIndex === i ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Config Modal */}
      <AnimatePresence>
        {configOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfigOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">API 配置</h3>
                <button onClick={() => setConfigOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Base URL</label>
                  <input 
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">API Key</label>
                  <div className="relative">
                    <input 
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                    <button 
                      onClick={fetchModels}
                      disabled={fetchingModels || !apiKey}
                      className="absolute right-2 top-2 p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
                      title="Fetch Models"
                    >
                      {fetchingModels ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Model</label>
                  <div className="relative">
                    <button 
                      onClick={() => setIsModelSelectorOpen(true)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-left flex items-center justify-between hover:border-blue-400 transition-all"
                    >
                      <span className="truncate">{selectedModel || '请选择模型'}</span>
                      <ChevronDown size={18} className="text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 flex gap-3">
                <button 
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingConfig ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : '保存配置'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Model Selector Modal */}
      <AnimatePresence>
        {isModelSelectorOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModelSelectorOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="font-bold text-slate-700">选择大模型</h3>
                <button 
                  onClick={() => setIsModelSelectorOpen(false)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                    autoFocus
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="搜索模型名称..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredModels.length > 0 ? (
                  filteredModels.map(m => (
                    <button
                      key={m}
                      onClick={() => {
                        setSelectedModel(m);
                        setIsModelSelectorOpen(false);
                      }}
                      className={`w-full p-3 rounded-xl flex items-center justify-between transition-all text-sm ${
                        selectedModel === m 
                          ? 'bg-blue-50 text-blue-700 font-semibold' 
                          : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="truncate">{m}</span>
                      {selectedModel === m && <Check size={16} className="text-blue-600 shrink-0" />}
                    </button>
                  ))
                ) : (
                  <div className="py-10 text-center text-slate-400 text-sm">
                    未找到匹配的模型
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-6 mt-12 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-400 text-sm">
        <div className="flex items-center gap-2">
          <Zap size={16} />
          <span>Title Alchemy Expert v1.0</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-slate-600 transition-colors">Documentation</a>
          <a href="#" className="hover:text-slate-600 transition-colors">Support</a>
          <div className="flex items-center gap-3">
            <Github size={18} className="hover:text-slate-600 cursor-pointer" />
            <ExternalLink size={18} className="hover:text-slate-600 cursor-pointer" />
          </div>
        </div>
      </footer>
      {/* Preset Management Modal */}
      <AnimatePresence>
        {presetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-purple-50">
                <h2 className="text-xl font-bold text-purple-900 flex items-center gap-2">
                  <Settings className="text-purple-600" />
                  {activePresetCategory} 预设中心
                </h2>
                <button 
                  onClick={() => {
                    setPresetModalOpen(false);
                    setEditingPreset(null);
                    setActivePresetCategory(null);
                  }}
                  className="p-2 hover:bg-white rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex gap-6">
                {/* Preset List */}
                <div className="w-1/3 border-r border-slate-100 pr-6 space-y-4">
                  <div className="flex gap-2">
                    <input 
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="新预设名称..."
                      className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg flex-1 outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <button 
                      onClick={() => activePresetCategory && createPreset(activePresetCategory)}
                      className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="space-y-1">
                    {activePresetCategory && Object.keys(presets[activePresetCategory] || {}).map(name => (
                      <div 
                        key={name}
                        onClick={() => setEditingPreset(name)}
                        className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                          editingPreset === name ? 'bg-purple-100 text-purple-700' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs font-medium truncate">{name}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePreset(activePresetCategory, name);
                          }}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preset Content Editor */}
                <div className="flex-1 space-y-6">
                  {editingPreset && activePresetCategory ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="font-bold text-slate-800 text-lg">预设: {editingPreset}</h3>
                          <p className="text-[10px] text-slate-400">管理、加载或保存关键词到此预设</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              loadFromPreset(activePresetCategory, editingPreset);
                              setPresetModalOpen(false);
                            }}
                            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-xl hover:bg-green-700 transition-all flex items-center gap-1.5 shadow-md shadow-green-100 font-bold"
                          >
                            <Download size={14} /> 加载到当前
                          </button>
                          <button 
                            onClick={() => {
                              saveToPreset(activePresetCategory, editingPreset);
                            }}
                            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-xl hover:bg-purple-700 transition-all flex items-center gap-1.5 shadow-md shadow-purple-100 font-bold"
                          >
                            <Save size={14} /> 存入选中词
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">预设内容详情</h4>
                            <button 
                              onClick={saveConfig}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Cloud size={12} /> 保存到云端
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 p-4 bg-slate-50 rounded-2xl border border-slate-100 min-h-[100px]">
                            {(presets[activePresetCategory][editingPreset] || []).map((word, idx) => (
                              <div key={idx} className="bg-slate-100 text-slate-600 text-[10px] px-2 py-1 rounded flex items-center gap-1 group/word">
                                <span>{word}</span>
                                <button 
                                  onClick={() => {
                                    const next = { ...presets };
                                    next[activePresetCategory][editingPreset] = next[activePresetCategory][editingPreset].filter((_, i) => i !== idx);
                                    setPresets(next);
                                  }}
                                  className="text-slate-300 hover:text-red-500 opacity-0 group-hover/word:opacity-100 transition-opacity"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-2">
                              <input 
                                value={newPresetKeyword}
                                onChange={(e) => setNewPresetKeyword(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    addKeywordToPreset(activePresetCategory, editingPreset, newPresetKeyword);
                                  }
                                }}
                                placeholder="输入关键词..."
                                className="text-[10px] p-1 bg-white border border-slate-200 rounded outline-none focus:border-purple-300 w-24"
                              />
                              <button 
                                onClick={() => addKeywordToPreset(activePresetCategory, editingPreset, newPresetKeyword)}
                                className="text-[10px] bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 transition-colors"
                              >
                                + 添加
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-2">
                      <Settings size={48} strokeWidth={1} />
                      <p className="text-sm">选择一个预设进行编辑</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Debug Panel */}
      <DebugPanel />

      {/* History Modal */}
      <AnimatePresence>
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setHistoryOpen(false); setViewingHistory(null); }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <History size={20} className="text-blue-600" />
                  <h3 className="text-xl font-bold">
                    {viewingHistory ? viewingHistory.name : '历史生成记录'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {viewingHistory && (
                    <button 
                      onClick={() => setViewingHistory(null)}
                      className="text-xs bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ← 返回列表
                    </button>
                  )}
                  <button onClick={() => { setHistoryOpen(false); setViewingHistory(null); }} className="p-2 hover:bg-white rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {viewingHistory ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={12} /> {new Date(viewingHistory.date).toLocaleString('zh-CN')}</span>
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{viewingHistory.model}</span>
                        <span>{viewingHistory.count} 条</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(viewingHistory.titles.join('\n'));
                          alert('已复制全部标题到剪贴板');
                        }}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors flex items-center gap-1"
                      >
                        <Copy size={14} /> 全部复制
                      </button>
                    </div>
                    {viewingHistory.titles.map((title, i) => (
                      <div key={i} className="group flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                        <span className="text-[10px] text-slate-400 font-mono mt-1 shrink-0 w-5 text-right">{i + 1}</span>
                        <p className="text-sm flex-1">{title}</p>
                        <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">{title.length}字</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(title); }}
                          className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <FileText size={48} strokeWidth={1} />
                    <p className="mt-4 text-sm">暂无生成记录</p>
                    <p className="text-xs mt-1">生成标题后会自动保存到这里</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyList.map((entry) => (
                      <div key={entry.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                        <div
                          className="flex-1 cursor-pointer flex items-center gap-4"
                          onClick={() => setViewingHistory(entry)}
                        >
                          <div className="bg-blue-100 p-2 rounded-lg shrink-0">
                            <FileText size={18} className="text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{entry.name}</p>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                              <span className="flex items-center gap-1"><Clock size={10} /> {new Date(entry.date).toLocaleString('zh-CN')}</span>
                              <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{entry.model}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setViewingHistory(entry)}
                            className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Eye size={12} /> 查看
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(entry.titles.join('\n'));
                              alert(`已复制 ${entry.count} 条标题`);
                            }}
                            className="text-xs text-slate-500 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Copy size={12} /> 复制
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`确定删除记录「${entry.name}」？`)) return;
                              setHistoryList(prev => {
                                const updated = prev.filter(h => h.id !== entry.id);
                                persistHistory(updated);
                                return updated;
                              });
                              fetch(`/api/history/${entry.id}`, { method: 'DELETE' }).catch(() => {});
                            }}
                            className="text-slate-300 hover:text-red-500 p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Modal */}
      <AnimatePresence>
        {globalError && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-red-100"
            >
              <div className="p-6 bg-red-50 border-b border-red-100 flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-full">
                  <X className="text-red-600" size={24} />
                </div>
                <h2 className="text-xl font-bold text-red-900">{globalError.title}</h2>
              </div>
              <div className="p-8">
                <p className="text-slate-600 leading-relaxed mb-6">{globalError.message}</p>
                
                {globalError.details && (
                  <div className="mb-6">
                    <button 
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-2"
                    >
                      {showErrorDetails ? '隐藏调试信息' : '查看调试信息'}
                      <ChevronDown size={12} className={`transition-transform ${showErrorDetails ? 'rotate-180' : ''}`} />
                    </button>
                    {showErrorDetails && (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 font-mono text-[10px] text-slate-500 overflow-x-auto max-h-40">
                        {globalError.details}
                      </div>
                    )}
                  </div>
                )}

                <button 
                  onClick={() => {
                    setGlobalError(null);
                    setShowErrorDetails(false);
                  }}
                  className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all active:scale-[0.98] shadow-lg shadow-slate-200"
                >
                  我知道了
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
