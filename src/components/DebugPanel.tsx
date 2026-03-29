import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { Terminal, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { getLogs, subscribe, clearLogs, type LogEntry, type LogLevel } from '../services/logService';

const LEVEL_STYLES: Record<LogLevel, { bg: string; text: string; label: string }> = {
  info:    { bg: 'bg-blue-500/20',   text: 'text-blue-300',   label: 'INFO' },
  success: { bg: 'bg-green-500/20',  text: 'text-green-300',  label: '成功' },
  warn:    { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: '警告' },
  error:   { bg: 'bg-red-500/20',    text: 'text-red-300',    label: '错误' },
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function LogLine({ entry }: { entry: LogEntry }) {
  const style = LEVEL_STYLES[entry.level];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`px-3 py-1.5 border-b border-white/5 hover:bg-white/5 transition-colors text-[11px] leading-relaxed ${
        entry.level === 'error' ? 'bg-red-500/5' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-slate-500 font-mono shrink-0 select-none">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`${style.bg} ${style.text} px-1.5 py-0 rounded text-[9px] font-bold shrink-0 leading-normal`}>
          {style.label}
        </span>
        <span className="text-cyan-400 shrink-0">[{entry.module}]</span>
        <span className="text-slate-300 flex-1 break-all">{entry.message}</span>
        {entry.detail && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-500 hover:text-slate-300 shrink-0"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {expanded && entry.detail && (
        <div className="mt-1 ml-16 text-[10px] text-slate-500 font-mono bg-black/30 p-2 rounded break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
          {entry.detail}
        </div>
      )}
    </div>
  );
}

export default function DebugPanel() {
  const logs = useSyncExternalStore(subscribe, getLogs);
  const [open, setOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (autoScroll && open && logs.length > prevLenRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
    prevLenRef.current = logs.length;
  }, [logs.length, open, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[200] bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 transition-all border border-slate-600/50 group"
      >
        <Terminal size={16} className="text-green-400 group-hover:animate-pulse" />
        <span className="text-xs font-bold">调试日志</span>
        {logs.length > 0 && (
          <span className="text-[10px] bg-slate-600 px-1.5 py-0.5 rounded-full text-slate-300">
            {logs.length}
          </span>
        )}
        {errorCount > 0 && (
          <span className="text-[10px] bg-red-500/80 px-1.5 py-0.5 rounded-full text-white font-bold animate-pulse">
            {errorCount} 错误
          </span>
        )}
        {warnCount > 0 && errorCount === 0 && (
          <span className="text-[10px] bg-yellow-500/80 px-1.5 py-0.5 rounded-full text-white font-bold">
            {warnCount} 警告
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[560px] max-w-[calc(100vw-2rem)] bg-[#1a1b26] rounded-2xl shadow-2xl border border-slate-700/60 flex flex-col overflow-hidden"
      style={{ height: '380px' }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1f2035] border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-green-400" />
          <span className="text-xs font-bold text-slate-200">系统调试日志</span>
          <span className="text-[10px] text-slate-500">实时</span>
          {autoScroll && (
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" title="自动滚动中" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => clearLogs()}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
            title="清空日志"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
            title="收起"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs">
            暂无日志记录，操作后将实时显示...
          </div>
        ) : (
          logs.map(entry => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="px-4 py-1.5 bg-[#1f2035] border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
        <span>共 {logs.length} 条</span>
        <div className="flex items-center gap-3">
          {errorCount > 0 && <span className="text-red-400">{errorCount} 错误</span>}
          {warnCount > 0 && <span className="text-yellow-400">{warnCount} 警告</span>}
          <button
            onClick={() => {
              setAutoScroll(true);
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }}
            className={`hover:text-slate-300 transition-colors ${autoScroll ? 'text-green-400' : ''}`}
          >
            {autoScroll ? '⬇ 自动滚动' : '⬇ 跳到底部'}
          </button>
        </div>
      </div>
    </div>
  );
}
