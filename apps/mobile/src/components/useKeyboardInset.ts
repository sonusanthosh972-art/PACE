import { createContext, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, TextInput, type ScrollView, type View } from 'react-native';

import { SPACE } from '@/theme/tokens';

/** Space kept between the focused field and the top of the keyboard. */
const CLEARANCE = SPACE.xl;

/**
 * Lets a text field ask its screen to scroll it above the keyboard when it gains focus (moving
 * from one field to the next while the keyboard is already open fires no keyboard event).
 */
export const KeyboardRevealContext = createContext<(() => void) | null>(null);

/**
 * Keeps a scrolling screen usable while the keyboard is open. Android with edge-to-edge no longer
 * shrinks the app for the keyboard, it just covers the bottom; so this measures how much of the
 * screen the keyboard actually covers (zero where the system did shrink it), returns that as extra
 * scroll room, and scrolls the focused field into view. The person can then drag the whole page
 * up and down with the keyboard still open.
 */
export function useKeyboardInset(
  rootRef: RefObject<View | null>,
  scrollRef: RefObject<ScrollView | null>,
) {
  const [inset, setInset] = useState(0);
  const keyboardTop = useRef<number | null>(null);
  const scrollY = useRef(0);

  const reveal = useCallback(() => {
    const top = keyboardTop.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (top === null || !input) return;
    input.measureInWindow((_x, y, _w, h) => {
      const overlap = y + h - (top - CLEARANCE);
      if (overlap > 0) {
        scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
      }
    });
  }, [scrollRef]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      rootRef.current?.measureInWindow((_x, y, _w, h) => {
        // How far the screen reaches below the keyboard's top edge.
        setInset(Math.max(0, y + h - e.endCoordinates.screenY));
        // Let the extra room lay out before scrolling into it.
        requestAnimationFrame(reveal);
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [rootRef, reveal]);

  /** Pass to the ScrollView's onScroll so scrolling to a field starts from where the page is. */
  const onScroll = useCallback((y: number) => {
    scrollY.current = y;
  }, []);

  return { inset, reveal, onScroll };
}
