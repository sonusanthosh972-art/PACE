import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: 'wifi' | 'cellular' | 'unknown' | 'none';
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
    type: 'unknown',
  });

  useEffect(() => {
    const subscription = NetInfo.addEventListener((state) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: (state.type as 'wifi' | 'cellular' | 'unknown' | 'none') || 'unknown',
      });
    });

    // Check initial status
    NetInfo.fetch().then((state) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: (state.type as 'wifi' | 'cellular' | 'unknown' | 'none') || 'unknown',
      });
    });

    return () => {
      subscription();
    };
  }, []);

  return status;
}
