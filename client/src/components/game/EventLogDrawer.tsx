import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { GameEventLogViewer } from './GameEventLogViewer';

interface EventLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A rotated phone has no vertical room to give, so the log comes in from the side. */
  landscape: boolean;
}

/**
 * The event log, for phones.
 *
 * On desktop this lives in a `ResizablePanel` below the canvas, and that panel
 * was gated on `!isMobile` — so a phone never had the log at all, and the only
 * way to reach it was to rotate, which used to flip the app into its desktop
 * layout as a side effect (and took the touch controls away with it). M5.9
 * closes that hole, which means the log needs a home of its own here.
 *
 * A drawer rather than a permanent split: M5.8 just recovered the safe-area
 * strips for the canvas, and a fixed panel would hand a bigger share straight
 * back. The playfield keeps its full height and the log is one tap away.
 *
 * It opens over the lower half of the screen in portrait — the region the
 * camera anchor deliberately leaves as fog and thumb room — and over the right
 * edge in landscape, where height is the scarce dimension.
 */
export const EventLogDrawer: React.FC<EventLogDrawerProps> = ({
  open,
  onOpenChange,
  landscape,
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side={landscape ? 'right' : 'bottom'}
      // `p-6` from the sheet's own variant would spend a quarter of the height
      // on padding in landscape; the log brings its own chrome.
      className={
        landscape
          ? 'w-[min(24rem,60vw)] sm:max-w-none p-3 pt-10 bg-card/95 border-primary/30 flex flex-col z-[260]'
          : 'h-[45vh] p-3 pt-10 bg-card/95 border-primary/30 flex flex-col z-[260]'
      }
      data-testid="event-log-drawer"
    >
      <SheetHeader className="sr-only">
        <SheetTitle>Event log</SheetTitle>
      </SheetHeader>
      {/* min-h-0 so the viewer's own scroll area bounds itself against the
          drawer instead of growing past it — a flex child defaults to
          min-height:auto and would refuse to shrink. */}
      <div className="min-h-0 flex-1">
        <GameEventLogViewer />
      </div>
    </SheetContent>
  </Sheet>
);
