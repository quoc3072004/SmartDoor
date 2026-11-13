import { useContext } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import NeoBack from '../components/NeoBack';
import { AuthContext } from '../contexts/AuthContext';
import { neo } from '../constants/neolock';

export default function HistoryScreen() {
  const { accessLogs } = useContext(AuthContext);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <NeoBack />

        <Text style={styles.title}>Lịch sử truy cập</Text>
        <Text style={styles.sub}>Lịch sử mở cửa và hoạt động hệ thống</Text>

        {accessLogs.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>Chưa có lịch sử.</Text>
          </View>
        ) : (
          accessLogs.map(log => (
            <View key={log.id} style={styles.item}>
              <View style={styles.timeBox}>
                <Text style={styles.time}>{log.time}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{log.title}</Text>
                <Text style={styles.detail}>{log.detail.replace('admin đăng nhập thành công', 'Quản trị viên đăng nhập thành công')}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: neo.bg },
  content: { paddingTop: 58, paddingHorizontal: 22, paddingBottom: 36 },
  title: { color: neo.text, fontSize: 34, fontWeight: '900' },
  sub: { color: neo.sub, marginTop: 8, marginBottom: 22 },
  card: {
    backgroundColor: neo.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: neo.border,
  },
  empty: { color: neo.sub },
  item: {
    flexDirection: 'row',
    backgroundColor: neo.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: neo.border,
  },
  timeBox: { width: 66 },
  time: { color: neo.cyan, fontWeight: '900' },
  itemTitle: { color: neo.text, fontWeight: '900', fontSize: 16 },
  detail: { color: neo.sub, marginTop: 5, lineHeight: 20 },
});