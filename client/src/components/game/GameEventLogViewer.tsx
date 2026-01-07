import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { eventLogger, GameEvent, EventType } from '@/lib/game/eventLogger';

/**
 * Props for GameEventLogViewer component
 */
interface GameEventLogViewerProps {
  /** Maximum number of events to display (default: 200) */
  maxEntries?: number;
}

/**
 * GameEventLogViewer - Displays color-coded in-game events in a resizable panel
 * 
 * Features:
 * - Real-time event subscription
 * - Color-coded by event type
 * - Auto-scroll to latest events
 * - Resizable panel integration
 * - Visible during game over for review
 */
export const GameEventLogViewer: React.FC<GameEventLogViewerProps> = React.memo(({ maxEntries = 200 }) => {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<boolean>(true);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Subscribe to events on mount
  useEffect(() => {
    // Load existing events
    setEvents(eventLogger.getEvents());

    // Subscribe to new events
    const unsubscribe = eventLogger.subscribe((event) => {
      setEvents(prev => {
        const newEvents = [...prev, event];
        // Keep only the last maxEntries
        return newEvents.slice(-maxEntries);
      });
    });

    // Cleanup: unsubscribe on unmount
    return () => {
      unsubscribe();
    };
  }, [maxEntries]);

  // Auto-scroll to bottom when new events arrive (debounced for performance)
  useEffect(() => {
    if (autoScrollRef.current && scrollAreaRef.current) {
      // Clear any pending scroll
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Debounce scroll to handle rapid event bursts (scroll to top for newest events)
      scrollTimeoutRef.current = window.setTimeout(() => {
        requestAnimationFrame(() => {
          const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
          if (scrollContainer) {
            scrollContainer.scrollTop = 0; // Scroll to top for newest events
          }
        });
      }, 50); // 50ms debounce
    }
    
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [events]);

  const clearLogs = useCallback(() => {
    eventLogger.clearEvents();
    setEvents([]);
  }, []);

  const getEventColor = useCallback((type: EventType): string => {
    switch (type) {
      case 'combat':
        return 'text-red-400';
      case 'progression':
        return 'text-cyan-400';
      case 'loot':
        return 'text-blue-400';
      case 'shop':
        return 'text-purple-400';
      case 'environment':
        return 'text-pink-400';
      case 'consumable':
        return 'text-amber-400';
      case 'event':
        return 'text-green-400';
      default:
        return 'text-gray-300';
    }
  }, []);

  const formatTime = useCallback((date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }, []);

  // Truncate very long messages to prevent layout issues
  const truncateMessage = useCallback((message: string, maxLength: number = 150): string => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  }, []);

  // Memoize event items for better performance (reverse order - newest first)
  // Only check the first two (oldest) events - if they're same category and both about starting a sector, drop the first
  const eventItems = useMemo(() => {
    let filtered = events;
    
    // Only check the first two (oldest) events, not every pair
    if (events.length >= 2) {
      const first = events[0];  // Oldest event
      const second = events[1]; // Second oldest event
      
      // Compare without timestamp: same type and both about starting a sector
      const sameCategory = first.type === second.type;
      const bothAboutSectorStart = 
        first.message.toLowerCase().includes('started') && 
        second.message.toLowerCase().includes('started');
      
      if (sameCategory && bothAboutSectorStart) {
        // Drop only the first (oldest) entry
        filtered = events.slice(1);
      }
    }
    
    // Reverse for newest first display
    const reversed = [...filtered].reverse();
    
    return reversed.map((event) => ({
      ...event,
      displayMessage: truncateMessage(event.message),
      isTruncated: event.message.length > 150
    }));
  }, [events, truncateMessage]);

  return (
    <div className="relative h-full w-full z-[201] pointer-events-auto">
      <Card className="h-full bg-black/95 border-t border-primary/50 max-md:bg-black/98">
        <CardContent className="p-2 h-full relative">
          <div className="absolute top-2 right-2 z-10">
            <Button variant="ghost" size="sm" onClick={clearLogs} className="h-7 px-3 text-base">
              Clear
            </Button>
          </div>
          <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
            <div className="space-y-0 font-pixel text-sm pr-4">
              {events.length === 0 ? (
                <div className="text-muted-foreground text-center py-4 text-base">
                  No events yet...
                </div>
              ) : (
                eventItems.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 ${getEventColor(event.type)} transition-opacity hover:opacity-90`}
                    title={event.isTruncated ? event.message : undefined}
                  >
                    <span className="text-muted-foreground flex-shrink-0 text-xs">
                      [{formatTime(event.timestamp)}]
                    </span>
                    <span className="flex-shrink-0 min-w-[5rem] uppercase text-xs font-semibold">
                      {event.type}:
                    </span>
                    <span className="flex-1 break-words whitespace-pre-wrap leading-relaxed text-sm">
                      {event.displayMessage}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
});

GameEventLogViewer.displayName = 'GameEventLogViewer';
