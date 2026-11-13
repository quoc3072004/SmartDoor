import { router } from 'expo-router';
import { useContext, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { AuthContext, QRToken } from '../contexts/AuthContext';

function getQRStatus(item: QRToken) {
  if (item.used) return 'Đã dùng';
  if (Date.now() > item.expiredAt) return 'Hết hạn';
  return 'Chưa dùng';
}

export default function QRManagementScreen() {
  const { isAdmin, qrTokens, createGuestQR } = useContext(AuthContext);

  const qrRef = useRef<any>(null);

  const [guestName, setGuestName] = useState('Khách');
  const [minutes, setMinutes] = useState('5');
  const [latestQR, setLatestQR] = useState<QRToken | null>(null);

  const handleCreate = async () => {
    const time = Number(minutes);

    if (!guestName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên khách');
      return;
    }

    if (!time || time < 1 || time > 5) {
      Alert.alert('Lỗi', 'Thời hạn mã QR chỉ từ 1 đến 5 phút');
      return;
    }

    try {
      const qr = await createGuestQR(guestName, time);
      setLatestQR(qr);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message);
    }
  };

  const handleShare = async () => {
    if (!latestQR) return;

    const canShare = await Sharing.isAvailableAsync();

    if (!canShare) {
      Alert.alert('Lỗi', 'Thiết bị không hỗ trợ chia sẻ ảnh.');
      return;
    }

    if (!qrRef.current) {
      Alert.alert('Lỗi', 'Mã QR chưa sẵn sàng, vui lòng thử lại.');
      return;
    }

    qrRef.current.toDataURL(async (base64: string) => {
      try {
        const fileUri = `${FileSystem.cacheDirectory}qr-${latestQR.token}.png`;

        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Gửi ảnh mã QR qua Zalo/Facebook',
          UTI: 'public.png',
        });
      } catch (err: any) {
        Alert.alert('Lỗi', err.message || 'Không thể gửi ảnh QR.');
      }
    });
  };

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.denied}>Bạn không có quyền quản trị.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.glow} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>⌂ Smart Door</Text>
            <Text style={styles.title}>Mã QR khách</Text>
            <Text style={styles.subTitle}>
              Tạo mã QR dùng một lần cho khách. ESP32-CAM sẽ đảm nhiệm phần quét mã.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tạo mã QR dùng một lần</Text>

          <TextInput
            style={styles.input}
            placeholder="Tên khách"
            placeholderTextColor="#6F8582"
            value={guestName}
            onChangeText={setGuestName}
          />

          <TextInput
            style={styles.input}
            placeholder="Thời hạn phút, ví dụ 5"
            placeholderTextColor="#6F8582"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
          />

          <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
            <Text style={styles.createButtonText}>Tạo mã QR</Text>
          </TouchableOpacity>
        </View>

        {latestQR && (
          <View style={styles.qrPreview}>
            <View style={styles.qrHeader}>
              <View>
                <Text style={styles.qrTitle}>Quyền truy cập khách</Text>
                <Text style={styles.qrGuest}>{latestQR.guestName}</Text>
              </View>

              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Dùng một lần</Text>
              </View>
            </View>

            <View style={styles.qrRealBox}>
              <QRCode
                value={latestQR.token}
                size={205}
                getRef={(ref) => {
                  qrRef.current = ref;
                }}
              />
            </View>

            <Text style={styles.qrToken}>{latestQR.token}</Text>

            <Text style={styles.qrHint}>
              Hạn dùng: {new Date(latestQR.expiredAt).toLocaleString('vi-VN')}
            </Text>

            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Text style={styles.shareButtonText}>Gửi ảnh mã QR qua Zalo/Facebook</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Danh sách mã QR</Text>

        {qrTokens.length === 0 ? (
          <Text style={styles.empty}>Chưa có mã QR nào.</Text>
        ) : (
          qrTokens.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={styles.qrItem}
              onPress={() => setLatestQR(item)}
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.qrName}>
                    QR{String(index + 1).padStart(3, '0')} · {item.guestName}
                  </Text>
                  <Text style={styles.qrText}>
                    Hết hạn: {new Date(item.expiredAt).toLocaleString('vi-VN')}
                  </Text>
                </View>

                <Text style={styles.status}>{getQRStatus(item)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020707',
  },
  glow: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(73,242,228,0.16)',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 58,
    paddingHorizontal: 22,
    paddingBottom: 36,
  },
  center: {
    flex: 1,
    backgroundColor: '#020707',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  denied: {
    color: '#F87171',
    fontWeight: '900',
    fontSize: 18,
    textAlign: 'center',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  backText: {
    color: '#49F2E4',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  header: {
    marginBottom: 22,
  },
  logo: {
    color: '#49F2E4',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
  },
  subTitle: {
    color: '#A8BDBC',
    marginTop: 8,
    lineHeight: 21,
    fontSize: 14,
  },
  card: {
    backgroundColor: 'rgba(14,38,36,0.84)',
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(102,255,239,0.16)',
    marginBottom: 18,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 16,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  createButton: {
    backgroundColor: '#49F2E4',
    padding: 17,
    borderRadius: 20,
    marginTop: 4,
  },
  createButtonText: {
    color: '#001B19',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
  },
  qrPreview: {
    backgroundColor: 'rgba(14,38,36,0.9)',
    borderRadius: 30,
    padding: 20,
    alignItems: 'center',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(102,255,239,0.16)',
    shadowColor: '#37FFF0',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
  qrHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  qrTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  qrGuest: {
    color: '#A8BDBC',
    marginTop: 4,
    fontWeight: '700',
  },
  statusPill: {
    backgroundColor: 'rgba(73,242,228,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(73,242,228,0.28)',
  },
  statusPillText: {
    color: '#49F2E4',
    fontWeight: '900',
    fontSize: 12,
  },
  qrRealBox: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 20,
  },
  qrToken: {
    marginTop: 16,
    color: '#49F2E4',
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 20,
  },
  qrHint: {
    color: '#A8BDBC',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  shareButton: {
    backgroundColor: 'rgba(73,242,228,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(73,242,228,0.35)',
    padding: 16,
    borderRadius: 20,
    marginTop: 16,
    width: '100%',
  },
  shareButtonText: {
    color: '#49F2E4',
    textAlign: 'center',
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  empty: {
    color: '#A8BDBC',
  },
  qrItem: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  qrName: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  qrText: {
    color: '#A8BDBC',
    marginTop: 5,
  },
  status: {
    color: '#49F2E4',
    fontWeight: '900',
    fontSize: 12,
  },
  bottomNav: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 24,
    height: 74,
    borderRadius: 38,
    backgroundColor: 'rgba(10,31,29,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navActive: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#49F2E4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#49F2E4',
    shadowOpacity: 0.8,
    shadowRadius: 18,
    elevation: 10,
  },
  navActiveText: {
    color: '#001B19',
    fontSize: 25,
    fontWeight: '900',
  },
  navText: {
    color: '#EAFDFC',
    fontSize: 25,
    opacity: 0.82,
  },
});