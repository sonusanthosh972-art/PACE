import { Button } from '@/components/Button';

interface GoogleSignInButtonProps {
  onPress: () => void;
  loading?: boolean;
}

export function GoogleSignInButton({ onPress, loading = false }: GoogleSignInButtonProps) {
  return (
    <Button
      label="Continue with Google"
      onPress={onPress}
      loading={loading}
      variant="secondary"
      icon="logo-google"
    />
  );
}
