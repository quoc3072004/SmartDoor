import { useContext, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { AuthContext } from '../contexts/AuthContext';

export default function GuestQRScreen() {
  const { createGuestQR, qrTokens } = useContext(AuthContext);

  const qrRef = useRef<any>(null);

  const [guestName, setGuestName] = useState('Khách');
  const [minutes, setMinutes] = useState('5');
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [expiredAt, setExpiredAt] = useState<number | null>(null);

  const handleCreateQR = async () => {
    const time = Number(minutes);

    if (!guestName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên khách');
      return;
    }

    if (time < 1 || time > 5) {
      Alert.alert('Lỗi', 'Thời hạn QR chỉ từ 1 đến 5 phút');
      return;
    }

    try {
      const qr = await createGuestQR(guestName, time);
      setCurrentToken(qr.token);
      setExpiredAt(qr.expiredAt);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message);
    }
  };

  const handleShare = async () => {
    if (!currentToken || !expiredAt) return;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Lỗi', 'Thiết bị này không hỗ trợ chia sẻ file.');
      return;
    }

    if (!qrRef.current) {
      Alert.alert('Lỗi', 'QR chưa sẵn sàng, vui lòng thử lại.');
      return;
    }

    qrRef.current.toDataURL(async (base64: string) => {
      try {
        const fileName = `qr-${currentToken}.png`;
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Gửi ảnh QR qua Zalo/Facebook',
          UTI: 'public.png',
        });
      } catch (err: any) {
        Alert.alert('Lỗi', err.message || 'Không thể gửi ảnh QR.');
      }
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tạo QR OTP cho khách</Text>
      <Text style={styles.desc}>
        QR có hạn 1–5 phút, dùng một lần. Khách không cần cài app.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Tên khách"
        value={guestName}
        onChangeText={setGuestName}
      />

      <TextInput
        style={styles.input}
        placeholder="Thời hạn phút, ví dụ 5"
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
      />

      <TouchableOpacity style={styles.button} onPress={handleCreateQR}>
        <Text style={styles.buttonText}>Tạo QR</Text>
      </TouchableOpacity>

      {currentToken && expiredAt && (
        <View style={styles.qrBox}>
          <QRCode
            value={currentToken}
            size={220}
            getRef={(ref) => {
              qrRef.current = ref;
            }}
          />

          <Text style={styles.tokenText}>{currentToken}</Text>

          <Text style={styles.expireText}>
            Hạn dùng: {new Date(expiredAt).toLocaleTimeString()}
          </Text>

          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.buttonText}>Gửi ảnh QR qua Zalo/Facebook</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.historyTitle}>QR đã tạo</Text>

      {qrTokens.map(item => (
        <View key={item.token} style={styles.historyItem}>
          <Text style={styles.historyName}>{item.guestName}</Text>
          <Text style={styles.historyText}>Token: {item.token}</Text>
          <Text style={styles.historyText}>
            Trạng thái: {item.used ? 'Đã dùng' : 'Chưa dùng'}
          </Text>
          <Text style={styles.historyText}>
            Hết hạn: {new Date(item.expiredAt).toLocaleTimeString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F4F7FB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  desc: {
    color: '#6B7280',
    marginVertical: 12,
    lineHeight: 22,
  },
  input: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  button: {
    backgroundColor: '#16A34A',
    padding: 15,
    borderRadius: 12,
  },
  shareButton: {
    backgroundColor: '#2563EB',
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  qrBox: {
    marginTop: 24,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 18,
    alignItems: 'center',
  },
  tokenText: {
    marginTop: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111827',
  },
  expireText: {
    marginTop: 8,
    color: '#DC2626',
  },
  historyTitle: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyItem: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  historyName: {
    fontWeight: 'bold',
    color: '#111827',
  },
  historyText: {
    color: '#6B7280',
    marginTop: 4,
  },
});