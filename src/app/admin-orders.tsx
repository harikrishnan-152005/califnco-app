
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../lib/firebase';

type Order = {
  id: string;
  userId?: string;
  customerName?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  total?: number;
  status?: string;
  items?: any[];
  createdAt?: any;
};

const statuses = [
  'Pending',
  'Confirmed',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled',
];

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    let stopOrders: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopOrders?.();
      stopOrders = undefined;

      if (!user) {
        setAuthorized(false);
        setLoading(false);
        router.replace('/auth');
        return;
      }

      try {
        const token = await user.getIdTokenResult(true);

        if (token.claims.admin !== true) {
          setAuthorized(false);
          setLoading(false);
          Alert.alert('Access denied', 'Admin permission required.');
          router.replace('/');
          return;
        }

        setAuthorized(true);

        const ordersQuery = query(
          collection(db, 'orders'),
          orderBy('createdAt', 'desc')
        );

        stopOrders = onSnapshot(
          ordersQuery,
          (snapshot) => {
            setOrders(
              snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              })) as Order[]
            );
            setLoading(false);
          },
          (error) => {
            console.error('Orders loading error:', error);
            setLoading(false);
            Alert.alert(
              'Unable to load orders',
              'Check Firestore rules and the order data.'
            );
          }
        );
      } catch (error) {
        console.error('Admin verification failed:', error);
        setAuthorized(false);
        setLoading(false);
        Alert.alert('Verification failed', 'Please try again.');
        router.replace('/');
      }
    });

    return () => {
      stopAuth();
      stopOrders?.();
    };
  }, []);

  async function changeStatus(order: Order, status: string) {
    console.log('STATUS BUTTON CLICKED:', order.id, status);

    if (!authorized || updating) return;

    // Web-compatible confirmation
    if (Platform.OS === 'web') {
      if (!window.confirm(`Change order ${order.id} to ${status}?`)) {
        return;
      }
      await performStatusUpdate(order, status);
      return;
    }

    Alert.alert('Update order', `Change ${order.id} to ${status}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => performStatusUpdate(order, status),
      },
    ]);
  }

  async function performStatusUpdate(order: Order, status: string) {
    setUpdating(order.id);

    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status,
        updatedAt: serverTimestamp(),
      });

      if (Platform.OS === 'web') {
        window.alert(`Order status updated to ${status}.`);
      } else {
        Alert.alert('Success', `Order status updated to ${status}.`);
      }
    } catch (error: any) {
      console.error('Status update failed:', error);

      const message = `${error.code ?? 'unknown'}: ${
        error.message ?? 'Please try again.'
      }`;

      if (Platform.OS === 'web') {
        window.alert(`Update failed: ${message}`);
      } else {
        Alert.alert('Update failed', message);
      }
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#087E8B" />
        <Text style={styles.muted}>Loading orders...</Text>
      </SafeAreaView>
    );
  }

  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/admin')}>
          <Text style={styles.back}>‹ Admin</Text>
        </Pressable>
        <Text style={styles.heading}>Manage Orders</Text>
        <Text style={styles.count}>{orders.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Monitor customer orders and update delivery status.
        </Text>

        {orders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.muted}>
              Orders saved to Firestore will appear here.
            </Text>
          </View>
        ) : (
          orders.map((order) => {
            const currentStatus = order.status || 'Pending';

            return (
              <View key={order.id} style={styles.card}>
                <View style={styles.orderHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderId}>Order #{order.id}</Text>
                    <Text style={styles.customer}>
                      {order.customerName || order.name || 'Customer'}
                    </Text>
                  </View>

                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>
                      {currentStatus}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.detail}>
                  Email: {order.email || 'Not provided'}
                </Text>
                <Text style={styles.detail}>
                  Phone: {order.phone || 'Not provided'}
                </Text>
                <Text style={styles.detail}>
                  Address: {order.address || 'Not provided'}
                </Text>

                <Text style={styles.total}>
                  Total: ₹{Number(order.total || 0).toLocaleString('en-IN')}
                </Text>

                <Text style={styles.label}>Items</Text>

                {order.items?.length ? (
                  order.items.map((item, index) => (
                    <Text key={`${order.id}-${index}`} style={styles.detail}>
                      • {item.name || item.productName || 'Product'}
                      {' × '}
                      {item.quantity || 1}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.muted}>No item details available.</Text>
                )}

                <Text style={styles.label}>Update status</Text>

                <View style={styles.statusOptions}>
                  {statuses.map((status) => (
                    <Pressable 
                      key={status}
                      disabled={updating !== null || currentStatus === status}
                      onPress={() => {
                        window.alert(`Button clicked: ${status}`);
                        console.log('STATUS BUTTON CLICKED:', order.id, status);
                        changeStatus(order, status);
                      }}
                      style={[
                        styles.statusButton,
                        currentStatus === status && styles.selectedStatus,
                        updating === order.id && styles.disabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusButtonText,
                          currentStatus === status && styles.selectedStatusText,
                        ]}
                      >
                        {status}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {updating === order.id && (
                  <Text style={styles.muted}>Updating order...</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  back: { color: '#087E8B', fontWeight: '700', fontSize: 15 },
  heading: { color: '#102A43', fontWeight: '800', fontSize: 18 },
  count: {
    color: '#FFFFFF',
    backgroundColor: '#087E8B',
    overflow: 'hidden',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontWeight: '700',
  },
  content: { padding: 16, paddingBottom: 40 },
  subtitle: { color: '#64748B', marginBottom: 18, lineHeight: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontSize: 12, color: '#64748B', marginBottom: 5 },
  customer: { fontSize: 17, fontWeight: '800', color: '#102A43' },
  statusBadge: {
    backgroundColor: '#E0F2F1',
    padding: 8,
    borderRadius: 10,
  },
  statusText: { color: '#075E63', fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 },
  detail: { fontSize: 13, color: '#475569', marginBottom: 7, lineHeight: 19 },
  total: {
    fontSize: 17,
    fontWeight: '800',
    color: '#087E8B',
    marginTop: 10,
    marginBottom: 14,
  },
  label: {
    fontWeight: '800',
    color: '#102A43',
    marginTop: 12,
    marginBottom: 10,
  },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  selectedStatus: { backgroundColor: '#087E8B', borderColor: '#087E8B' },
  statusButtonText: { color: '#334155', fontSize: 11, fontWeight: '600' },
  selectedStatusText: { color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
  empty: {
    padding: 28,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102A43',
    marginBottom: 8,
  },
  muted: { color: '#64748B', marginTop: 8, fontSize: 12 },
});
