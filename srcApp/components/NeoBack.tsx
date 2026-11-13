import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

export default function NeoBack() {
  return (
    <TouchableOpacity style={styles.back} onPress={() => router.back()}>
      <Text style={styles.text}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  text: {
    color: '#49F2E4',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
});