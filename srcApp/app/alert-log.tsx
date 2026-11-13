import { useContext } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import NeoBack from '../components/NeoBack';
import { AuthContext } from '../contexts/AuthContext';
import { neo } from '../constants/neolock';

export default function AlertLogScreen() {
  const { faceFailCount, qrFailCount, alerts } = useContext(AuthContext);
  const hasAlert = faceFailCount >= 3 || qrFailCount >= 3 || alerts.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <NeoBack />

        <Text style={styles.title}>Cảnh báo bảo mật</Text>
        <Text style={styles.sub}>Theo dõi lỗi nhận diện khuôn mặt và mã QR bất thường</Text>

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.label}>Lỗi khuôn mặt</Text>
            <Text style={styles.value}>{faceFailCount}/3</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Lỗi mã QR</Text>
            <Text style={styles.value}>{qrFailCount}/3</Text>
          </View>
        </View>

        <View style={[styles.statusCard, hasAlert && styles.dangerCard]}>
          <Text style={[styles.statusTitle, hasAlert && styles.dangerText]}>
            {hasAlert ? '⚠ Có cảnh báo bảo mật' : '✓ Không phát hiện bất thường'}
          </Text>
          <Text style={styles.statusDesc}>
            {hasAlert
              ? 'Hệ thống sẽ ghi log và từ chối mở cửa khi vượt ngưỡng lỗi.'
              : 'Hệ thống hoạt động bình thường.'}
          </Text>
        </View>

        {alerts.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.alertItem}>
            <Text style={styles.alertText}>{item}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: neo.bg },
  content: { paddingTop: 58, paddingHorizontal: 22, paddingBottom: 36 },
  title: { color: neo.text, fontSize: 34, fontWeight: '900' },
  sub: { color: neo.sub, marginTop: 8, marginBottom: 22 },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  card: {
    flex: 1,
    backgroundColor: neo.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: neo.border,
  },
  label: { color: neo.sub, fontWeight: '700' },
  value: { color: neo.cyan, fontSize: 34, fontWeight: '900', marginTop: 8 },
  statusCard: {
    backgroundColor: neo.card2,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: neo.border,
    marginBottom: 14,
  },
  dangerCard: { borderColor: 'rgba(248,113,113,0.45)' },
  statusTitle: { color: neo.cyan, fontSize: 20, fontWeight: '900' },
  dangerText: { color: neo.danger },
  statusDesc: { color: neo.sub, marginTop: 8, lineHeight: 21 },
  alertItem: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.32)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    marginBottom: 10,
  },
  alertText: { color: '#FCA5A5', fontWeight: '700' },
});