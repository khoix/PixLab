/**
 * Game Event Logger
 * 
 * Singleton service for logging in-game events with subscription support.
 * Provides a centralized event logging system that can be subscribed to by
 * UI components for real-time event display.
 * 
 * Features:
 * - Automatic event history management (max 200 events)
 * - Subscriber pattern for real-time updates
 * - Type-safe event definitions
 * - Thread-safe event logging
 */

export type EventType = 'combat' | 'progression' | 'loot' | 'shop' | 'environment' | 'consumable' | 'event';

export interface GameEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  message: string;
  data?: Record<string, any>;
}

type EventCallback = (event: GameEvent) => void;

class EventLogger {
  private events: GameEvent[] = [];
  private subscribers: Set<EventCallback> = new Set();
  private readonly MAX_EVENTS = 200;

  /**
   * Log a new game event
   * @param type - The type of event
   * @param message - Human-readable message
   * @param data - Optional additional event data
   */
  logEvent(type: EventType, message: string, data?: Record<string, any>): void {
    const event: GameEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      message,
      data,
    };

    this.events.push(event);

    // Trim to max events (keep most recent)
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    // Notify all subscribers
    this.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event subscriber callback:', error);
      }
    });
  }

  /**
   * Get all logged events
   * @returns Array of all events (most recent last, in chronological order)
   * @remarks Returns a copy of the events array to prevent external mutation
   */
  getEvents(): GameEvent[] {
    return [...this.events];
  }

  /**
   * Clear all logged events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Subscribe to new events
   * @param callback - Function to call when a new event is logged
   * @returns Unsubscribe function
   */
  subscribe(callback: EventCallback): () => void {
    this.subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Unsubscribe from events
   * @param callback - The callback function to remove
   */
  unsubscribe(callback: EventCallback): void {
    this.subscribers.delete(callback);
  }
}

// Export singleton instance
export const eventLogger = new EventLogger();
