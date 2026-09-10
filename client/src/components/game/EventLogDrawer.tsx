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
      //
      // The `[&>button]` rules restyle the sheet's own close control, which is
      // its first child. Left alone it is `top-4` with a 40px box, so it spans
      // 16-56px while the log card starts at the 40px top padding — a measured
      // 16x16px overlap in both orientations, with the X sitting on the card's
      // corner. It is also a 16px-wide hit target, which is small for a thumb.
      // Moved up and grown to 36px, with the padding opened to 48px so the card
      // clears it by 8px.
      className={[
        'p-3 pt-12 bg-card/95 border-primary/30 flex flex-col z-[260]',
        '[&>button]:top-1 [&>button]:right-2 [&>button]:h-9 [&>button]:w-9',
        '[&>button]:grid [&>button]:place-items-center [&>button]:opacity-100',
        landscape ? 'w-[min(24rem,60vw)] sm:max-w-none' : 'h-[45vh]',
      ].join(' ')}
      data-testid="event-log-drawer"
    >
      <SheetHeader className="sr-only">
        <SheetTitle>Event log</SheetTitle>
      </SheetHeader>
      {/* min-h-0 so the viewer's own scroll area bounds itself against the
          drawer instead of growing past it — a flex child defaults to
          min-height:auto and would refuse to shrink. */}
      <div className="min-h-0 flex-1">
        {/* Compact: the viewer's default layout is built for the desktop split
            panel, and at drawer width its absolutely-positioned controls sit on
            top of the entries while the timestamp and type columns squeeze the
            message into a one-word column. */}
        <GameEventLogViewer compact />
      </div>
    </SheetContent>
  </Sheet>
);
