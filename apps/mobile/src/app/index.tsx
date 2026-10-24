import { Redirect } from 'expo-router';

import { useSettings } from '@/state/queries';

/** Entry: onboarding until a budget profile exists, then the Today tab. */
export default function Index() {
  const settings = useSettings();
  if (settings.isPending) return null;
  return <Redirect href={settings.data?.onboardingComplete ? '/(tabs)' : '/onboarding'} />;
}
