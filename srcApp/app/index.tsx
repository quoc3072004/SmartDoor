import { router } from 'expo-router';
import { useContext, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { neo } from '../constants/neolock';
import { AuthContext } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useContext(AuthContext);
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('123456');

  const handleLogin = async () => {
    const result = await login(
      account,
      password
    );

    if (!result.ok) {
      Alert.alert(
        'Đăng nhập thất bại',
        result.message
      );
      return;
    }

    router.replace('/home');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.glow} />

      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Text style={styles.homeIcon}>⌂</Text>
          <Text style={styles.brand}>Smart Door</Text>
        </View>

        <Image
          source={require('../../assets/images/iuh-logo.png')}
          style={styles.iuhLogo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.main}>
        <View style={styles.hero}>
          <Text style={styles.small}>Smart</Text>
          <Text style={styles.big}>Door Lock</Text>
          <Text style={styles.small}>Management</Text>

          <Text style={styles.tagline}>
            Face Recognition • One-time QR Access
          </Text>
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Email hoặc Username"
            placeholderTextColor="#6F8582"
            value={account}
            onChangeText={setAccount}
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Mật khẩu"
            placeholderTextColor="#6F8582"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Đăng nhập</Text>
          </TouchableOpacity>

          <Text style={styles.note}>Tài khoản thử nghiệm: admin / 123456</Text>
        </View>
      </View>

      <View style={styles.authorBox}>
        <Text style={styles.authorText}>Industrial University of Ho Chi Minh City</Text>
        <Text style={styles.authorSub}>Nguyen Anh Quoc - Trinh Phu Vinh</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: neo.bg,
    paddingHorizontal: 26,
  },
  glow: {
    position: 'absolute',
    top: -120,
    left: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(73,242,228,0.16)',
  },
  topBar: {
    position: 'absolute',
    top: 58,
    left: 26,
    right: 26,
    zIndex: 10,
    elevation: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeIcon: {
    color: neo.cyan,
    fontSize: 23,
    marginRight: 7,
  },
  brand: {
    color: neo.text,
    fontSize: 15,
    fontWeight: '900',
  },
  iuhLogo: {
    width: 88,
    height: 64,
    marginRight: 8,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 76,
  },
  hero: {
    marginBottom: 34,
  },
  small: {
    color: neo.text,
    fontSize: 32,
    fontWeight: '300',
  },
  big: {
    color: neo.cyan,
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 62,
  },
  tagline: {
    color: neo.sub,
    marginTop: 22,
    fontSize: 13,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: neo.card,
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: neo.border,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: neo.text,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  button: {
    backgroundColor: neo.cyan,
    padding: 17,
    borderRadius: 20,
    marginTop: 6,
  },
  buttonText: {
    color: '#001B19',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
  },
  note: {
    color: neo.sub,
    textAlign: 'center',
    marginTop: 14,
    fontSize: 12,
  },
  authorBox: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 32,
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  authorText: {
    color: neo.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  authorSub: {
    color: neo.sub,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
});