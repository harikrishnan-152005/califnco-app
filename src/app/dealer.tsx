
import { router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Product } from '../data/products';
import { products } from '../data/products';
import { auth, db } from '../lib/firebase';

type DealerProfile = {
  name?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  address?: string;
};

type OrderItem = {
  product: Product;
  quantity: number;
};

type DealerOrder = {
  id: string;
  total?: number;
  totalItems?: number;
  status?: string;
  paymentStatus?: string;
  createdAt?: {
    toDate?: () => Date;
    toMillis?: () => number;
  };
  items?: {
    productId?: string;
    name: string;
    quantity: number;
    price: number;
    lineTotal?: number;
  }[];
};

const DEALER_DISCOUNT = 0.15;

function getWholesalePrice(product: Product) {
  return Math.round(product.price * (1 - DEALER_DISCOUNT));
}

export default function DealerDashboard() {
  const [profile, setProfile] = useState<DealerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<DealerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Verify authentication and dealer approval.
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setLoading(true);
      setProfile(null);

      if (!user) {
        router.replace('/auth');
        setLoading(false);
        return;
      }

      try {
        const token = await user.getIdTokenResult(true);

        if (token.claims.admin === true) {
          router.replace('/admin');
          return;
        }

        const snapshot = await getDoc(doc(db, 'users', user.uid));

        if (!snapshot.exists()) {
          await signOut(auth);
          router.replace('/auth');
          return;
        }

        const data = snapshot.data();

        if (data.role !== 'dealer' || data.dealerApproved !== true) {
          Alert.alert(
            'Access denied',
            'Only approved dealers can access the dealer portal.',
          );
          router.replace('/');
          return;
        }

        if (!active) return;

        setProfile({
          name: data.name,
          email: data.email,
          phone: data.phone,
          businessName: data.businessName,
          address: data.address,
        });
      } catch (error) {
        console.error('Dealer verification failed:', error);

        if (active) {
          Alert.alert(
            'Verification failed',
            'Unable to verify your dealer account. Please try again.',
          );
          router.replace('/');
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Subscribe to this dealer's own bulk orders.
  useEffect(() => {
    const user = auth.currentUser;

    if (!user || !profile) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', user.uid),
      where('orderType', '==', 'dealer_bulk'),
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const results = snapshot.docs.map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as DealerOrder,
        );

        results.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });

        setOrders(results);
        setOrdersLoading(false);
      },
      (error) => {
        console.error('Dealer order history error:', error);
        setOrdersLoading(false);

        Alert.alert(
          'Order history unavailable',
          'Could not load your orders. Check your Firestore rules and indexes.',
        );
      },
    );

    return unsubscribe;
  }, [profile]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.type.toLowerCase().includes(term),
    );
  }, [search]);

  const cartCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const cartTotal = cart.reduce(
    (sum, item) =>
      sum + getWholesalePrice(item.product) * item.quantity,
    0,
  );

  function changeQuantity(productId: string, delta: number) {
    setQuantities((previous) => ({
      ...previous,
      [productId]: Math.max(
        0,
        (previous[productId] ?? 0) + delta,
      ),
    }));
  }

  function addToBulkOrder(product: Product) {
    const quantity = quantities[product.id] ?? 0;

    if (!Number.isInteger(quantity) || quantity < 1) {
      Alert.alert('Select quantity', 'Choose at least one unit.');
      return;
    }

    setCart((previous) => {
      const existing = previous.find(
        (item) => item.product.id === product.id,
      );

      if (existing) {
        return previous.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }

      return [...previous, { product, quantity }];
    });

    setQuantities((previous) => ({
      ...previous,
      [product.id]: 0,
    }));

    Alert.alert(
      'Added to order',
      `${quantity} × ${product.name} added.`,
    );
  }

  function updateCartQuantity(productId: string, delta: number) {
    setCart((previous) =>
      previous
        .map((item) =>
          item.product.id === productId
            ? {
                ...item,
                quantity: item.quantity + delta,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function placeBulkOrder() {
    const user = auth.currentUser;

    if (!user || !profile) {
      Alert.alert('Login required', 'Please log in again.');
      router.replace('/auth');
      return;
    }

    if (cart.length === 0) {
      Alert.alert('Empty order', 'Add products before submitting.');
      return;
    }

    if (submitting) return;

    Alert.alert(
      'Confirm bulk order',
      `${cartCount} units across ${cart.length} product types\nTotal: ₹${cartTotal.toLocaleString('en-IN')}\n\nDemo order only. No payment will be collected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit order',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);

            try {
              // Recheck current approval before submitting.
              const userSnapshot = await getDoc(
                doc(db, 'users', user.uid),
              );

              const userData = userSnapshot.data();

              if (
                !userSnapshot.exists() ||
                userData?.role !== 'dealer' ||
                userData?.dealerApproved !== true
              ) {
                setProfile(null);
                throw new Error(
                  'Your dealer account is not approved. Order blocked.',
                );
              }

              const items = cart.map(({ product, quantity }) => {
                const price = getWholesalePrice(product);

                return {
                  productId: product.id,
                  name: product.name,
                  price,
                  quantity,
                  lineTotal: price * quantity,
                };
              });

              const total = items.reduce(
                (sum, item) => sum + item.lineTotal,
                0,
              );

              const totalItems = items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              );

              const orderRef = await addDoc(collection(db, 'orders'), {
                userId: user.uid,
                customerName: profile.name ?? '',
                email: user.email,
                phone: profile.phone ?? '',
                address: profile.address ?? '',
                businessName: profile.businessName ?? '',
                orderType: 'dealer_bulk',
                items,
                total,
                totalItems,
                status: 'placed',
                paymentStatus: 'not_paid_demo',
                createdAt: serverTimestamp(),
              });

              setCart([]);

              Alert.alert(
                'Bulk order submitted',
                `Order ID: ${orderRef.id}\nTotal: ₹${total.toLocaleString('en-IN')}\nNo payment was collected.`,
              );
            } catch (error) {
              console.error('Bulk order failed:', error);

              Alert.alert(
                'Order failed',
                error instanceof Error
                  ? error.message
                  : 'Please check your connection and Firestore rules.',
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await signOut(auth);
      router.replace('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
      Alert.alert('Logout failed', 'Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#087E8B" />
        <Text style={styles.muted}>Verifying dealer account...</Text>
      </SafeAreaView>
    );
  }

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>califnco</Text>
            <Text style={styles.tagline}>DEALER PORTAL</Text>
          </View>

          <Pressable
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            <Text style={styles.logoutText}>
              {loggingOut ? 'Logging out...' : 'Logout'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.welcomeCard}>
          <Text style={styles.eyebrow}>APPROVED DEALER</Text>
          <Text style={styles.welcome}>
            Welcome, {profile.name || 'Dealer'}!
          </Text>
          <Text style={styles.description}>
            Select products, set quantities, and place bulk orders.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Business Profile</Text>
        <View style={styles.profileCard}>
          <InfoRow label="Business" value={profile.businessName} />
          <InfoRow label="Contact" value={profile.name} />
          <InfoRow label="Email" value={profile.email} />
          <InfoRow label="Phone" value={profile.phone} />
          <InfoRow label="Address" value={profile.address} />
        </View>

        <Text style={styles.sectionTitle}>Wholesale Catalog</Text>
        <Text style={styles.muted}>
          Demo wholesale prices are 15% below retail prices.
        </Text>

        <TextInput
          style={styles.search}
          placeholder="Search products..."
          placeholderTextColor="#718096"
          value={search}
          onChangeText={setSearch}
        />

        {filteredProducts.map((product) => {
          const wholesalePrice = getWholesalePrice(product);
          const quantity = quantities[product.id] ?? 0;

          return (
            <View key={product.id} style={styles.productCard}>
              <View
                style={[
                  styles.productImage,
                  { backgroundColor: product.color },
                ]}
              >
                <Text style={styles.productEmoji}>
                  {product.emoji}
                </Text>
              </View>

              <View style={styles.productInfo}>
                <Text style={styles.productName}>
                  {product.name}
                </Text>
                <Text style={styles.productType}>
                  {product.type}
                </Text>
                <Text style={styles.retailPrice}>
                  Retail: ₹{product.price.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.wholesalePrice}>
                  ₹{wholesalePrice.toLocaleString('en-IN')} each
                </Text>

                <View style={styles.quantityRow}>
                  <Pressable
                    style={styles.quantityButton}
                    onPress={() => changeQuantity(product.id, -1)}
                  >
                    <Text style={styles.quantityButtonText}>−</Text>
                  </Pressable>

                  <Text style={styles.quantityValue}>
                    {quantity}
                  </Text>

                  <Pressable
                    style={styles.quantityButton}
                    onPress={() => changeQuantity(product.id, 1)}
                  >
                    <Text style={styles.quantityButtonText}>+</Text>
                  </Pressable>

                  <Pressable
                    style={styles.addButton}
                    onPress={() => addToBulkOrder(product)}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>
          Bulk Order Cart ({cartCount})
        </Text>

        {cart.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.muted}>
              Your cart is empty. Select quantities above and tap Add.
            </Text>
          </View>
        ) : (
          <>
            {cart.map((item) => {
              const price = getWholesalePrice(item.product);

              return (
                <View key={item.product.id} style={styles.cartItem}>
                  <View style={styles.cartInfo}>
                    <Text style={styles.productName}>
                      {item.product.name}
                    </Text>
                    <Text style={styles.productType}>
                      ₹{price.toLocaleString('en-IN')} each
                    </Text>

                    <View style={styles.quantityRow}>
                      <Pressable
                        style={styles.quantityButton}
                        onPress={() =>
                          updateCartQuantity(item.product.id, -1)
                        }
                      >
                        <Text style={styles.quantityButtonText}>−</Text>
                      </Pressable>

                      <Text style={styles.quantityValue}>
                        {item.quantity}
                      </Text>

                      <Pressable
                        style={styles.quantityButton}
                        onPress={() =>
                          updateCartQuantity(item.product.id, 1)
                        }
                      >
                        <Text style={styles.quantityButtonText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  <Text style={styles.lineTotal}>
                    ₹{(price * item.quantity).toLocaleString('en-IN')}
                  </Text>
                </View>
              );
            })}

            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Order total</Text>
              <Text style={styles.totalValue}>
                ₹{cartTotal.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.muted}>
                {cartCount} units · {cart.length} product types
              </Text>

              <Pressable
                style={[
                  styles.submitButton,
                  submitting && styles.disabled,
                ]}
                onPress={placeBulkOrder}
                disabled={submitting}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? 'Submitting...' : 'Submit Bulk Order'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>My Bulk Orders</Text>

        {ordersLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#087E8B" />
            <Text style={styles.muted}>Loading order history...</Text>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.muted}>
              No bulk orders yet. Your submitted orders will appear here.
            </Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderTitle}>Bulk Order</Text>
                <Text style={styles.orderStatus}>
                  {order.status ?? 'placed'}
                </Text>
              </View>

              <Text style={styles.orderId}>ID: {order.id}</Text>

              <Text style={styles.orderDate}>
                Date:{' '}
                {order.createdAt?.toDate
                  ? order.createdAt.toDate().toLocaleString('en-IN')
                  : 'Processing'}
              </Text>

              <View style={styles.orderDivider} />

              {order.items?.map((item, index) => (
                <View
                  key={`${order.id}-${item.productId ?? index}`}
                  style={styles.orderItemRow}
                >
                  <Text style={styles.orderItemName}>
                    {item.name} × {item.quantity}
                  </Text>
                  <Text style={styles.orderItemPrice}>
                    ₹{(
                      item.lineTotal ?? item.price * item.quantity
                    ).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}

              <View style={styles.orderDivider} />

              <View style={styles.orderTotalRow}>
                <Text style={styles.orderTotalLabel}>
                  {order.totalItems ?? 0} units · Total
                </Text>
                <Text style={styles.orderTotalValue}>
                  ₹{(order.total ?? 0).toLocaleString('en-IN')}
                </Text>
              </View>

              <Text style={styles.paymentStatus}>
                Payment: {order.paymentStatus ?? 'not_paid_demo'}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.footer}>
          Califnco · Pure Water. Better Living.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || 'Not provided'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FAFC',
  },
  content: { padding: 18, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  brand: { fontSize: 28, fontWeight: '800', color: '#087E8B' },
  tagline: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#64748B',
    marginTop: 3,
  },
  logoutButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  logoutText: { color: '#B91C1C', fontWeight: '700' },
  welcomeCard: {
    backgroundColor: '#087E8B',
    padding: 22,
    borderRadius: 16,
    marginBottom: 25,
  },
  eyebrow: { color: '#CCFBF1', fontSize: 11, fontWeight: '800' },
  welcome: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 9,
  },
  description: { color: '#E0F2F1', lineHeight: 21, marginTop: 8 },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#102A43',
    marginTop: 20,
    marginBottom: 12,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoRow: {
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  infoLabel: { color: '#64748B', fontSize: 12, marginBottom: 4 },
  infoValue: { color: '#102A43', fontSize: 14, fontWeight: '600' },
  muted: { color: '#64748B', fontSize: 13, lineHeight: 19 },
  search: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5EA',
    borderRadius: 12,
    padding: 14,
    color: '#102A43',
    marginVertical: 14,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  productImage: {
    width: 90,
    minHeight: 100,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  productEmoji: { fontSize: 34 },
  productInfo: { flex: 1 },
  productName: { color: '#102A43', fontSize: 14, fontWeight: '800' },
  productType: { color: '#64748B', fontSize: 12, marginTop: 4 },
  retailPrice: {
    color: '#94A3B8',
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginTop: 8,
  },
  wholesalePrice: {
    color: '#087E8B',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 3,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#DDF4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    color: '#087E8B',
    fontSize: 20,
    fontWeight: '800',
  },
  quantityValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 15,
    color: '#102A43',
    fontWeight: '800',
  },
  addButton: {
    backgroundColor: '#087E8B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    alignItems: 'center',
    gap: 8,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cartInfo: { flex: 1 },
  lineTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#087E8B',
    marginLeft: 8,
  },
  totalCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE5EA',
    marginTop: 5,
  },
  totalLabel: { color: '#64748B', fontSize: 14 },
  totalValue: {
    color: '#102A43',
    fontSize: 27,
    fontWeight: '800',
    marginVertical: 5,
  },
  submitButton: {
    backgroundColor: '#087E8B',
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 16,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  disabled: { opacity: 0.6 },
  orderCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  orderTitle: {
    color: '#102A43',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  orderStatus: {
    color: '#087E8B',
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  orderId: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 8,
  },
  orderDate: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginVertical: 4,
  },
  orderItemName: {
    color: '#475569',
    fontSize: 13,
    flex: 1,
  },
  orderItemPrice: {
    color: '#102A43',
    fontSize: 13,
    fontWeight: '600',
  },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  orderTotalLabel: {
    color: '#475569',
    fontSize: 13,
    flex: 1,
  },
  orderTotalValue: {
    color: '#087E8B',
    fontSize: 18,
    fontWeight: '800',
  },
  paymentStatus: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 10,
  },
  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 25,
  },
});
