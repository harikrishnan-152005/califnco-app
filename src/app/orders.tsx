
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../lib/firebase';

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

type Order = {
  id: string;
  total: number;
  status: string;
  paymentStatus?: string;
  items: OrderItem[];
  createdAt?: { toDate: () => Date } | null;
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let unsubscribeOrders: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeOrders?.();

      if (!user) {
        setOrders([]);
        setLoading(false);
        router.replace('/auth');
        return;
      }

      setLoading(true);
      setError('');

      const ordersQuery = query(
        collection(db, 'orders'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      unsubscribeOrders = onSnapshot(
        ordersQuery,
        (snapshot) => {
          setOrders(
            snapshot.docs.map((document) => ({
              id: document.id,
              ...document.data(),
            })) as Order[]
          );
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeOrders?.();
    };
  }, []);

  function formatDate(timestamp?: Order['createdAt']) {
    if (!timestamp) return 'Date unavailable';

    try {
      return timestamp.toDate().toLocaleString('en-IN');
    } catch {
      return 'Date unavailable';
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')}>
          <Text style={styles.back}>‹ Shop</Text>
        </Pressable>
        <Text style={styles.title}>My Orders</Text>
        <View style={{ width: 55 }} />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#087E8B"
          style={styles.loader}
        />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>Unable to load orders</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.muted}>
            Your completed checkout orders will appear here.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.buttonText}>Start shopping</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.orderHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderId}>
                    Order #{item.id.slice(-8).toUpperCase()}
                  </Text>
                  <Text style={styles.date}>
                    {formatDate(item.createdAt)}
                  </Text>
                </View>
                <Text style={styles.status}>
                  {item.status || 'placed'}
                </Text>
              </View>

              {item.items?.map((product, index) => (
                <View
                  key={`${product.productId}-${index}`}
                  style={styles.productRow}
                >
                  <Text style={styles.productName}>
                    {product.name} × {product.quantity}
                  </Text>
                  <Text style={styles.productPrice}>
                    ₹{(product.price * product.quantity).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Order total</Text>
                <Text style={styles.total}>
                  ₹{item.total.toLocaleString('en-IN')}
                </Text>
              </View>

              <Text style={styles.payment}>
                Payment: {item.paymentStatus || 'unknown'}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    color: '#087E8B',
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102A43',
  },
  loader: {
    marginTop: 50,
  },
  list: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  orderId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#102A43',
  },
  date: {
    marginTop: 5,
    fontSize: 11,
    color: '#64748B',
  },
  status: {
    color: '#087E8B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
  },
  productName: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  totalRow: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  total: {
    color: '#087E8B',
    fontSize: 19,
    fontWeight: '800',
  },
  payment: {
    marginTop: 10,
    fontSize: 11,
    color: '#64748B',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '800',
    color: '#102A43',
  },
  muted: {
    marginTop: 8,
    color: '#64748B',
    textAlign: 'center',
    fontSize: 13,
  },
  error: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#087E8B',
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
