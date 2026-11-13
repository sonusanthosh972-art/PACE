import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

export interface AccessibilityState {
  screenReaderEnabled: boolean;
  boldTextEnabled: boolean;
  reduceTransparencyEnabled: boolean;
  reduceMotionEnabled: boolean;
}

export function useAccessibility(): AccessibilityState {
  const [state, setState] = useState<AccessibilityState>({
    screenReaderEnabled: false,
    boldTextEnabled: false,
    reduceTransparencyEnabled: false,
    reduceMotionEnabled: false,
  });

  useEffect(() => {
    let isMounted = true;

    const checkAccessibility = async () => {
      try {
        const screenReaderEnabled = await AccessibilityInfo.isScreenReaderEnabled();
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            screenReaderEnabled,
          }));
        }
      } catch (error) {
        console.warn('Could not check accessibility settings:', error);
      }
    };

    checkAccessibility();

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}

export function getAccessibleLabel(primary: string, secondary?: string): string {
  return secondary ? `${primary}, ${secondary}` : primary;
}
