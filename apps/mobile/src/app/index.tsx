import { StyleSheet, Text, View } from 'react-native';

// Placeholder home screen; replaced by the Today screen in Phase 5.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Paisa Pulse</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16171A',
  },
  title: {
    color: '#E9E7E2',
    fontSize: 17,
  },
});
