import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
}

interface LogViewerProps {
  maxEntries?: number;
}

export const LogViewer: React.FC<LogViewerProps> = ({ maxEntries = 100 }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<boolean>(true);

  // Add initial log entry
  useEffect(() => {
    const initialLog: LogEntry = {
      id: `init-${Date.now()}`,
      timestamp: new Date(),
      level: 'info',
      message: 'Log viewer initialized',
      source: 'system',
    };
    setLogs([initialLog]);
  }, []);

  // Intercept console methods and fetch requests
  useEffect(() => {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    const addLog = (level: LogEntry['level'], args: any[], source?: string) => {
      const message = args
        .map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        level,
        message,
        source,
      };

      setLogs(prev => {
        const newLogs = [...prev, logEntry];
        // Keep only the last maxEntries
        return newLogs.slice(-maxEntries);
      });
    };

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      addLog('log', args);
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      addLog('info', args);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      addLog('warn', args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      addLog('error', args);
    };

    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [url, options] = args;
      const method = options?.method || 'GET';
      const startTime = Date.now();
      
      addLog('info', [`${method} ${url}`], 'fetch');
      
      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - startTime;
        const status = response.status;
        
        if (status >= 400) {
          addLog('error', [`${method} ${url} - ${status} (${duration}ms)`], 'fetch');
        } else {
          addLog('info', [`${method} ${url} - ${status} (${duration}ms)`], 'fetch');
        }
        
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        addLog('error', [`${method} ${url} - Failed: ${error} (${duration}ms)`], 'fetch');
        throw error;
      }
    };

    // Intercept unhandled errors
    const handleError = (event: ErrorEvent) => {
      addLog('error', [`Unhandled Error: ${event.message}`, event.filename, `Line ${event.lineno}`], 'error');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      addLog('error', [`Unhandled Promise Rejection: ${reason}`], 'error');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
      window.fetch = originalFetch;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [maxEntries]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollAreaRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
    }
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-gray-300';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Card className="fixed bottom-0 left-0 right-80 h-48 bg-black/95 border-t border-primary/50 z-40 max-md:right-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-pixel text-primary">Event Log</CardTitle>
          <Button variant="ghost" size="sm" onClick={clearLogs} className="h-6 px-2 text-xs">
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0 h-[calc(100%-3rem)]">
        <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
          <div className="space-y-1 font-mono text-xs pr-4">
            {logs.length === 0 ? (
              <div className="text-muted-foreground text-center py-4">
                No logs yet...
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 ${getLogColor(log.level)}`}
                >
                  <span className="text-muted-foreground flex-shrink-0">
                    [{formatTime(log.timestamp)}]
                  </span>
                  {log.source && (
                    <span className="text-muted-foreground flex-shrink-0 text-[10px]">
                      [{log.source}]
                    </span>
                  )}
                  <span className="flex-shrink-0 min-w-[3rem] uppercase text-[10px]">
                    {log.level}:
                  </span>
                  <span className="flex-1 break-words whitespace-pre-wrap">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

