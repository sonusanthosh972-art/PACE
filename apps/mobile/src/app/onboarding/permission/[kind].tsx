import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { PERMISSION_COPY, requestPermission, type PermissionKind } from '@/lib/permissions';
import { SPACE } from '@/theme/tokens';

function isKind(v: string | undefined): v is PermissionKind {
  return v === 'sms' || v === 'notifications' || v === 'notification-access';
}

/** Explainer shown BEFORE the system permission prompt. */
export default function PermissionExplainer() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind: PermissionKind = isKind(params.kind) ? params.kind : 'sms';
  const copy = PERMISSION_COPY[kind];
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    try {
      await requestPermission(kind);
    } finally {
      setBusy(false);
      router.back();
    }
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.actions}>
          <Button label={copy.cta} onPress={allow} loading={busy} />
          <Button label="Not now" variant="ghost" onPress={() => router.back()} />
        </View>
      }
    >
      <View style={styles.hero}>
        <Icon name={copy.icon as IconName} size={44} color="accentText" />
        <AppText variant="title" accessibilityRole="header">
          {copy.title}
        </AppText>
        <AppText variant="bodyStrong">{copy.why}</AppText>
      </View>
      <View style={styles.points}>
        {copy.points.map((p) => (
          <View key={p} style={styles.point}>
            <Icon name="checkmark-circle-outline" color="accentText" />
            <AppText color="muted" style={styles.flex}>
              {p}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACE.lg, paddingTop: SPACE.xxl },
  points: { gap: SPACE.lg, marginTop: SPACE.lg },
  point: { flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  actions: { gap: SPACE.sm },
});
