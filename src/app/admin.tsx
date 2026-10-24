import { router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../lib/firebase';

export default function AdminScreen() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState('Administrator');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setChecking(false);
        router.replace('/auth');
        return;
      }

      try {
        const token = await user.getIdTokenResult(true);
        const allowed = token.claims.admin === true;

        if (!allowed) {
          setIsAdmin(false);
          Alert.alert('Access denied', 'Admin permission is required.');
          router.replace('/');
          return;
        }

        setAdminName(user.displayName || user.email || 'Administrator');
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        Alert.alert('Verification failed', 'Please log in again.');
        router.replace('/');
      } finally {
        setChecking(false);
      }
    });

    return unsubscribe;
  }, []);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace('/auth');
    } catch {
      Alert.alert('Error', 'Unable to log out. Please try again.');
    }
  }

  if (checking) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#087E8B" />
        <Text style={styles.loadingText}>Verifying admin access...</Text>
      </SafeAreaView>
    );
  }

  if (!isAdmin) return null;

  const sections = [
    {
      icon: '📦',
      title: 'Manage Orders',
      description: 'View and update customer orders',
      route: '/admin-orders',
    },
    {
      icon: '🤝',
      title: 'Dealer Approvals',
      description: 'Review dealer applications',
      route: '/admin-dealers',
    },
    {
      icon: '🛠️',
      title: 'Service Desk',
      description: 'Manage service requests',
      route: '/admin-service',
    },
  ];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>califnco</Text>
            <Text style={styles.subtitle}>ADMIN CONSOLE</Text>
          </View>

          <Pressable style={styles.logout} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ADMINISTRATION</Text>
          <Text style={styles.heroTitle}>Welcome back!</Text>
          <Text style={styles.heroDescription}>{adminName}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>✓ Admin verified</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Dashboard</Text>
        <Text style={styles.sectionSubtitle}>
          Manage your Califnco operations.
        </Text>

        {sections.map((item) => (
          <Pressable
            key={item.title}
            style={styles.card}
            onPress={() => router.push(item.route as never)}
          >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDescription}>
                {item.description}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}

        <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
          <Text style={styles.backButtonText}>← Back to Shop</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  center: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 12, color: '#64748B' },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: { fontSize: 29, fontWeight: '800', color: '#087E8B' },
  subtitle: { fontSize: 10, letterSpacing: 2, color: '#64748B' },
  logout: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
  },
  logoutText: { color: '#B91C1C', fontWeight: '700' },
  hero: {
    backgroundColor: '#063B4C',
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
  },
  eyebrow: { color: '#9BE7E5', fontSize: 11, letterSpacing: 2 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 14,
  },
  heroDescription: { color: '#D7E9EF', marginTop: 8 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#075E63',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 18,
  },
  badgeText: { color: '#FFFFFF', fontWeight: '700' },
  sectionTitle: { fontSize: 23, fontWeight: '800', color: '#102A43' },
  sectionSubtitle: { color: '#64748B', marginTop: 6, marginBottom: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardIcon: { fontSize: 30, marginRight: 14 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#102A43' },
  cardDescription: { color: '#64748B', fontSize: 12, marginTop: 5 },
  arrow: { color: '#087E8B', fontSize: 28, marginLeft: 8 },
  backButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  backButtonText: { color: '#087E8B', fontWeight: '700' },
});