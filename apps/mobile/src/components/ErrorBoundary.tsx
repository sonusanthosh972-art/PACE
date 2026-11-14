import { Component, ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';

import { COLORS } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error) {
    console.error('Error boundary caught:', error);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
          <View style={styles.content}>
            <Icon name="alert-circle-outline" size={48} color="coralText" />
            <AppText variant="title" center style={styles.title}>
              Something went wrong
            </AppText>
            <AppText color="muted" center style={styles.message}>
              We encountered an unexpected error. Your data is safe on your phone.
            </AppText>
            {__DEV__ && this.state.error && (
              <AppText color="muted" center style={styles.devError}>
                {this.state.error.message}
              </AppText>
            )}
          </View>
          <Button label="Try again" onPress={this.reset} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    marginTop: 16,
  },
  message: {
    marginHorizontal: 8,
  },
  devError: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    fontSize: 12,
  },
});
