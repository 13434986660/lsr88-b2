export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  detail?: string;
}

type Listener = () => void;

let nextId = 1;
const MAX_LOGS = 500;
let logs: LogEntry[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(fn => fn());
}

export function addLog(level: LogLevel, module: string, message: string, detail?: string) {
  const entry: LogEntry = {
    id: nextId++,
    timestamp: new Date(),
    level,
    module,
    message,
    detail,
  };
  logs = [...logs.slice(-(MAX_LOGS - 1)), entry];
  emit();

  const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[consoleMethod](`[${module}] ${message}`, detail ?? '');
}

export function clearLogs() {
  logs = [];
  emit();
}

export function getLogs(): LogEntry[] {
  return logs;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
