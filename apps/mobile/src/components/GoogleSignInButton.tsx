import { useState } from 'react';

import { Button } from '@/components/Button';
import { signInWithGoogle } from '@/services/google-auth';

interface GoogleSignInButtonProps {
  mode: 'login' | 'register';
  onSuccess: (idToken: string, accessToken: string, email: string, name: string) => Promise<void>;
  onError: (error: string) => void;
  loading?: boolean;
}

export function GoogleSignInButton({
  mode,
  onSuccess,
  onError,
  loading = false,
}: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      const result = await signInWithGoogle();

      if (!result) {
        onError('Google sign-in was cancelled');
        return;
      }

      await onSuccess(result.idToken, result.accessToken, result.email, result.name);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Google sign-in failed. Please try again.';
      onError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const label = mode === 'register' ? 'Continue with Google' : 'Sign in with Google';

  return (
    <Button
      label={label}
      onPress={handleGoogleSignIn}
      loading={isLoading || loading}
      variant="secondary"
      icon="logo-google"
    />
  );
}
