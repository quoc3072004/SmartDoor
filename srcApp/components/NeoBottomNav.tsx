import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Tab = 'home' | 'qr' | 'history' | 'alerts';

export default function NeoBottomNav({ active }: { active: Tab }) {
  const tabs = [
    { key: 'home', icon: '⌂', path: '/home' },
    { key: 'qr', icon: '▦', path: '/qr-management' },
    { key: 'history', icon: '◷', path: '/history' },
    { key: 'alerts', icon: '!', path: '/alert-log' },
  ] as const;

  return (
    <View style={styles.nav}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={active === tab.key ? styles.active : styles.item}
          onPress={() => router.push(tab.path as any)}
        >
          <Text style={active === tab.key ? styles.activeText : styles.text}>
            {tab.icon}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
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
  item: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#49F2E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#EAFDFC',
    fontSize: 25,
    opacity: 0.78,
  },
  activeText: {
    color: '#001B19',
    fontSize: 27,
    fontWeight: '900',
  },
});