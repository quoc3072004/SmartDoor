import { router } from 'expo-router';
import { useContext, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';

export default function HomeScreen() {
  const {
    user,
    isAdmin,
    doorStatus,
    alerts,
    faceFailCount,
    qrFailCount,
    closeDoor,
    refreshDoorStatus,
  } = useContext(AuthContext);

  useEffect(() => {
    refreshDoorStatus();
  }, []);

  const isOpen = doorStatus === 'OPEN';

  return (
    <View style={styles.screen}>
      <View style={styles.glow} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>⌂ Smart Door</Text>
            <Text style={styles.hello}>Xin chào,</Text>
            <Text style={styles.name}>{user?.fullName || 'User'}</Text>
            <Text style={styles.role}>
              {isAdmin ? 'Admin' : 'User'} · Smart Door Lock
            </Text>
          </View>

          <TouchableOpacity
            style={styles.roundButton}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.roundIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        {alerts.length > 0 && (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>⚠ Security Alert</Text>
            <Text style={styles.alertText}>{alerts[0]}</Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <View style={styles.statusRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>✓ Wi-Fi Connected</Text>
            </View>

            <View style={styles.pill}>
              <Text style={styles.pillText}>▮ 80%</Text>
            </View>
          </View>

          <View style={styles.heroBody}>
            <View style={styles.lockCircle}>
              <Text style={styles.lockIcon}>{isOpen ? '🔓' : '🔒'}</Text>
            </View>

            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle}>Main Door Lock</Text>

              <View style={styles.lockStateRow}>
                <Text style={styles.smallLock}>{isOpen ? '🔓' : '🔒'}</Text>
                <Text style={[styles.lockState, isOpen && styles.openText]}>
                  {isOpen ? 'Unlocked' : 'Locked'}
                </Text>
              </View>
            </View>
          </View>

          {isOpen && (
            <TouchableOpacity style={styles.closeButton} onPress={closeDoor}>
              <Text style={styles.closeText}>Demo đóng cửa</Text>
            </TouchableOpacity>
          )}

          <View style={styles.sliderDots}>
            <View style={styles.dotActive} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/face-unlock')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>◉</Text>
            </View>
            <Text style={styles.actionTitle}>Face Unlock</Text>
            <Text style={styles.actionDesc}>Mở cửa bằng khuôn mặt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/history')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>◷</Text>
            </View>
            <Text style={styles.actionTitle}>History</Text>
            <Text style={styles.actionDesc}>Xem lịch sử truy cập</Text>
          </TouchableOpacity>
        </View>

        {isAdmin && (
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/qr-management')}
            >
              <View style={styles.actionIcon}>
                <Text style={styles.actionIconText}>▦</Text>
              </View>
              <Text style={styles.actionTitle}>Send Key</Text>
              <Text style={styles.actionDesc}>Tạo QR gửi cho khách</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/alert-log')}
            >
              <View style={styles.actionIcon}>
                <Text style={styles.actionIconText}>!</Text>
              </View>
              <Text style={styles.actionTitle}>Alerts</Text>
              <Text style={styles.actionDesc}>Xem cảnh báo bảo mật</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.counterCard}>
          <Text style={styles.counterText}>
            Sai Face: {faceFailCount}/3 · Sai QR: {qrFailCount}/3
          </Text>
        </View>
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
    paddingBottom: 125,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  logo: {
    color: '#49F2E4',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 26,
  },
  hello: {
    color: '#EAFDFC',
    fontSize: 20,
    fontWeight: '500',
  },
  name: {
    color: '#49F2E4',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 2,
  },
  role: {
    color: '#A8BDBC',
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundIcon: {
    color: '#fff',
    fontSize: 20,
  },
  alertCard: {
    backgroundColor: 'rgba(220,38,38,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
  },
  alertTitle: {
    color: '#FCA5A5',
    fontWeight: '900',
    fontSize: 16,
  },
  alertText: {
    color: '#FEE2E2',
    marginTop: 6,
    lineHeight: 20,
  },
  heroCard: {
    backgroundColor: 'rgba(14,38,36,0.84)',
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(102,255,239,0.16)',
    shadowColor: '#37FFF0',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
    marginBottom: 18,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 26,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
  },
  pillText: {
    color: '#EAFDFC',
    fontSize: 12,
    fontWeight: '700',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(67,242,228,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(67,242,228,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
  },
  lockIcon: {
    fontSize: 42,
  },
  heroInfo: {
    flex: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  heroSub: {
    color: '#A8BDBC',
    marginTop: 4,
    fontSize: 14,
  },
  lockStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  smallLock: {
    fontSize: 15,
    marginRight: 8,
  },
  lockState: {
    color: '#49F2E4',
    fontSize: 16,
    fontWeight: '900',
  },
  openText: {
    color: '#22C55E',
  },
  closeButton: {
    backgroundColor: 'rgba(248,113,113,0.13)',
    borderColor: 'rgba(248,113,113,0.35)',
    borderWidth: 1,
    padding: 14,
    borderRadius: 18,
    marginTop: 22,
  },
  closeText: {
    color: '#FCA5A5',
    textAlign: 'center',
    fontWeight: '900',
  },
  sliderDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  dotActive: {
    width: 24,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#49F2E4',
  },
  dot: {
    width: 16,
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    minHeight: 142,
    backgroundColor: 'rgba(19,45,42,0.88)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(72,239,228,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  actionIconText: {
    color: '#49F2E4',
    fontSize: 22,
    fontWeight: '900',
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  actionDesc: {
    color: '#9CA3AF',
    marginTop: 6,
    lineHeight: 18,
    fontSize: 12,
  },
  counterCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 14,
    marginTop: 2,
    marginBottom: 24,
  },
  counterText: {
    color: '#A8BDBC',
    textAlign: 'center',
    fontWeight: '700',
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