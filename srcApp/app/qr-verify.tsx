import { useContext, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AuthContext } from '../contexts/AuthContext';

export default function QRVerifyScreen() {
  const { qrTokens, verifyQR, qrFailCount } = useContext(AuthContext);
  const [inputToken, setInputToken] = useState('');

  const handleVerifyQR = async () => {
    const tokenValue = inputToken.trim();
    if (!tokenValue) {
      Alert.alert('Lỗi', 'Vui lòng nhập hoặc quét token QR');
      return;
    }

    const result = await verifyQR(tokenValue);
    Alert.alert(result.ok ? 'Mở cửa thành công' : 'Từ chối mở cửa', result.message);
    if (result.ok) setInputToken('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kiểm tra QR OTP</Text>
      <Text style={styles.desc}>Màn này mô phỏng ESP32-CAM gửi token QR về server /qr/verify.</Text>

      <TextInput
        style={styles.input}
        placeholder="Dán token QR vào đây"
        value={inputToken}
        onChangeText={setInputToken}
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={handleVerifyQR}>
        <Text style={styles.buttonText}>Kiểm tra và mở cửa</Text>
      </TouchableOpacity>

      <Text style={styles.failText}>Số lần sai QR: {qrFailCount}/3</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>QR đã tạo từ server</Text>
        {qrTokens.length === 0 ? (
          <Text style={styles.emptyText}>Chưa có QR nào được tạo.</Text>
        ) : (
          qrTokens.map(item => {
            const expired = Date.now() > item.expiredAt;
            return (
              <TouchableOpacity key={item.token} style={styles.qrItem} onPress={() => setInputToken(item.token)}>
                <Text style={styles.qrName}>{item.guestName}</Text>
                <Text style={styles.qrText}>Token: {item.token}</Text>
                <Text style={styles.qrText}>Trạng thái: {item.used ? 'Đã dùng' : expired ? 'Đã hết hạn' : 'Còn hiệu lực'}</Text>
                <Text style={styles.qrText}>Hết hạn: {new Date(item.expiredAt).toLocaleTimeString()}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F4F7FB' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  desc: { color: '#6B7280', marginVertical: 12, lineHeight: 22 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  button: { backgroundColor: '#F59E0B', padding: 15, borderRadius: 12 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  failText: { textAlign: 'center', marginTop: 16, color: '#6B7280' },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginTop: 20 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
  emptyText: { color: '#6B7280' },
  qrItem: { padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB', marginTop: 10 },
  qrName: { fontWeight: 'bold', color: '#111827' },
  qrText: { color: '#6B7280', marginTop: 4 },
});
