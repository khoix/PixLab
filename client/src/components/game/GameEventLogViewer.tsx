import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { eventLogger, GameEvent, EventType } from '@/lib/game/eventLogger';
import { RARITY_COLORS } from '@/lib/game/constants';
import { Plus, Minus } from 'lucide-react';

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
  
  // Font size state (default: 14px / text-sm)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('eventLogFontSize');
    return saved ? parseInt(saved, 10) : 14;
  });

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

  // Font size controls
  const increaseFontSize = useCallback(() => {
    setFontSize(prev => {
      const newSize = Math.min(prev + 2, 24); // Max 24px
      localStorage.setItem('eventLogFontSize', newSize.toString());
      return newSize;
    });
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => {
      const newSize = Math.max(prev - 2, 10); // Min 10px
      localStorage.setItem('eventLogFontSize', newSize.toString());
      return newSize;
    });
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

  // Helper function to format item names with initial caps (same as in GameCanvas)
  const formatItemName = useCallback((itemName: string): string => {
    if (!itemName) return itemName;
    return itemName
      .split(' ')
      .map((word) => {
        if (word.toLowerCase() === 'of' || word.toLowerCase() === 'the') {
          return word.toLowerCase();
        }
        if (word.match(/^Lv\d+$/i)) {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }, []);

  // Parse message and color-code item names based on rarity
  const parseMessageWithItemColors = useCallback((displayMessage: string, originalMessage: string, event: GameEvent): React.ReactNode => {
    // Check if event has item data with rarity
    if (!event.data?.item || !event.data.item.rarity) {
      return displayMessage;
    }

    const item = event.data.item;
    const rarity = item.rarity as keyof typeof RARITY_COLORS;
    const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS.common;
    
    // Format the item name to match what's in the message
    const formattedItemName = formatItemName(item.name);
    
    // Find the item name in the original message first to get the exact case
    const itemNameRegex = new RegExp(`(${formattedItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const originalMatch = itemNameRegex.exec(originalMessage);
    
    if (!originalMatch) {
      return displayMessage; // Item name not found in original message
    }
    
    // Use the exact item name from the original message (preserves case)
    const exactItemName = originalMatch[1];
    
    // Now find and replace in the display message
    const displayRegex = new RegExp(`(${exactItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g');
    
    // Split display message by item name and create React elements
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    
    // Reset regex for display message
    displayRegex.lastIndex = 0;
    while ((match = displayRegex.exec(displayMessage)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(displayMessage.substring(lastIndex, match.index));
      }
      
      // Add the colored item name
      parts.push(
        <span key={match.index} style={{ color: rarityColor }}>
          {match[1]}
        </span>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < displayMessage.length) {
      parts.push(displayMessage.substring(lastIndex));
    }
    
    return parts.length > 0 ? <>{parts}</> : displayMessage;
  }, [formatItemName]);

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
    
    return reversed.map((event) => {
      const truncated = truncateMessage(event.message);
      return {
        ...event,
        displayMessage: truncated,
        originalMessage: event.message, // Keep original for item name parsing
        isTruncated: event.message.length > 150
      };
    });
  }, [events, truncateMessage]);

  return (
    <div className="relative h-full w-full z-[201] pointer-events-auto">
      <Card className="h-full bg-black/95 border-t border-primary/50 max-md:bg-black/98">
        <CardContent className="p-2 h-full relative">
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <div className="flex items-center gap-1 border border-primary/30 rounded">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={decreaseFontSize} 
                className="h-6 w-6 p-0 hover:bg-primary/20"
                title="Decrease font size"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={increaseFontSize} 
                className="h-6 w-6 p-0 hover:bg-primary/20"
                title="Increase font size"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={clearLogs} className="h-7 px-3 text-base">
              Clear
            </Button>
          </div>
          <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
            <div className="space-y-0 font-pixel pr-4" style={{ fontSize: `${fontSize}px` }}>
              {events.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">
                  No events yet...
                </div>
              ) : (
                eventItems.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 ${getEventColor(event.type)} transition-opacity hover:opacity-90`}
                    title={event.isTruncated ? event.message : undefined}
                  >
                    <span className="text-muted-foreground flex-shrink-0" style={{ fontSize: `${fontSize * 0.85}px` }}>
                      [{formatTime(event.timestamp)}]
                    </span>
                    <span className="flex-shrink-0 min-w-[5rem] uppercase font-semibold" style={{ fontSize: `${fontSize * 0.85}px` }}>
                      {event.type}:
                    </span>
                    <span className="flex-1 break-words whitespace-pre-wrap leading-relaxed">
                      {parseMessageWithItemColors(event.displayMessage, event.originalMessage || event.message, event)}
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
