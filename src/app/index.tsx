import { router } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Product, ProductCategory } from '../data/products';
import { categories, products } from '../data/products';
import { auth, db } from '../lib/firebase';

type CartItem = {
  product: Product;
  quantity: number;
};

export default function HomeScreen() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<ProductCategory>('All');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [cartLoadedForUid, setCartLoadedForUid] = useState<string | null>(null);

  // Load the signed-in user's own Firestore cart. Never reuse another user's cart.
  useEffect(() => {
    let active = true;
    let latestUid: string | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      const uid = user?.uid ?? null;
      latestUid = uid;
      setUserId(uid);
      setIsAdmin(false);
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          if (!active || latestUid !== user.uid) return;
          setIsAdmin(tokenResult.claims.admin === true);
        } catch (error) {
          console.warn('Failed to verify admin claim:', error);
        }
      }
      setCartLoadedForUid(null);
      // Clear the previous account's cart immediately while the new cart loads.
      setCartItems([]);

      if (!user) {
        router.replace('/auth');
        return;
      }

      try {
        const cartSnapshot = await getDoc(doc(db, 'carts', user.uid));
        if (!active || latestUid !== user.uid) return;

        const savedItems = cartSnapshot.exists() ? cartSnapshot.data().items : [];
        const restoredCart: CartItem[] = Array.isArray(savedItems)
          ? savedItems.flatMap((savedItem: { productId?: string; quantity?: number }) => {
              const product = products.find((item) => item.id === savedItem.productId);
              const quantity = Number(savedItem.quantity);

              if (!product || !Number.isInteger(quantity) || quantity < 1) {
                return [];
              }

              return [{ product, quantity }];
            })
          : [];

        setCartItems(restoredCart);
        setCartLoadedForUid(user.uid);
      } catch (error) {
        console.warn("Failed to load this user's Firestore cart:", error);
        // Do not enable saving on a failed read, to avoid overwriting a saved cart.
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Save only after the cart belonging to the current UID has loaded.
  useEffect(() => {
    if (!userId || cartLoadedForUid !== userId) return;

    const savedItems = cartItems.map(({ product, quantity }) => ({
      productId: product.id,
      quantity,
    }));

    setDoc(doc(db, 'carts', userId), {
      userId,
      items: savedItems,
      updatedAt: serverTimestamp(),
    }).catch((error) => {
      console.warn("Failed to save this user's Firestore cart:", error);
    });
  }, [cartItems, userId, cartLoadedForUid]);

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0
      ),
    [cartItems]
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch = `${product.name} ${product.type}`
          .toLowerCase()
          .includes(search.trim().toLowerCase());

        const matchesCategory =
          selectedCategory === 'All' ||
          product.category === selectedCategory;

        return matchesSearch && matchesCategory;
      }),
    [search, selectedCategory]
  );

  function addToCart(product: Product) {
    setCartItems((current) => {
      const existing = current.find(
        (item) => item.product.id === product.id
      );

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, change: number) {
    setCartItems((current) =>
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + change }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCartItems((current) =>
      current.filter((item) => item.product.id !== productId)
    );
  }

  function handleCheckout() {
    if (cartItems.length === 0) {
      Alert.alert('Empty cart', 'Please add a product first.');
      return;
    }

    setCartVisible(false);
    setCheckoutVisible(true);

    if (!customerName && auth.currentUser?.displayName) {
      setCustomerName(auth.currentUser.displayName);
    }
  }

  async function placeDemoOrder() {
    if (!customerName.trim() || !phone.trim() || !address.trim()) {
      Alert.alert('Missing details', 'Please fill in all fields.');
      return;
    }

    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      Alert.alert(
        'Invalid phone',
        'Enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Login required', 'Please log in before placing an order.');
      router.replace('/auth');
      return;
    }

    if (cartItems.length === 0) {
      Alert.alert('Empty cart', 'Please add a product first.');
      return;
    }

    setLoading(true);

    try {
      const orderItems = cartItems.map(({ product, quantity }) => ({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
      }));

      const orderRef = await addDoc(collection(db, 'orders'), {
        userId: user.uid,
        customerName: customerName.trim(),
        email: user.email,
        phone: phone.trim(),
        address: address.trim(),
        items: orderItems,
        total: cartTotal,
        status: 'placed',
        paymentStatus: 'not_paid_demo',
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        'Order saved successfully!',
        `Order ID: ${orderRef.id}\nTotal: ₹${cartTotal.toLocaleString(
          'en-IN'
        )}\n\nDemo order only. No payment was collected.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setCartItems([]);
              setCheckoutVisible(false);
              setCustomerName('');
              setPhone('');
              setAddress('');
            },
          },
        ]
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Order failed', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace('/auth');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Logout failed', message);
    }
  }

  if (!authReady) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#087E8B" />
        <Text style={styles.loadingText}>Loading Califnco...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brandContainer}>
          <Text style={styles.brand}>califnco</Text>
          <Text style={styles.tagline}>PURE WATER. BETTER LIVING.</Text>
        </View>

        <Pressable
          style={styles.menuButton}
          onPress={() => setMenuVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
        >
          <Text style={styles.menuButtonText}>⋮</Text>
        </Pressable>

        <Pressable
          style={styles.cart}
          onPress={() => setCartVisible(true)}
          accessibilityLabel={`Open cart, ${cartCount} items`}
        >
          <Text style={styles.cartText}>🛒 {cartCount}</Text>
        </Pressable>
      </View>

      {/* Compact navigation menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <Pressable style={styles.menuPanel} onPress={() => {}}>
            <View style={styles.menuPanelHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <Pressable onPress={() => setMenuVisible(false)}>
                <Text style={styles.menuClose}>✕</Text>
              </Pressable>
            </View>

            {isAdmin && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  router.push('/admin')
                }}
              >
                <Text style={styles.menuItemIcon}>⚙</Text>
                <Text style={styles.menuItemText}>Admin Dashboard</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/orders');
              }}
            >
              <Text style={styles.menuItemIcon}>📦</Text>
              <Text style={styles.menuItemText}>My Orders</Text>
            </Pressable>

            
            <Pressable
              style={styles.menuItem}
              onPress={() => {
              setMenuVisible(false);
              router.push('/profile');
              }}
            >
              <Text style={styles.menuItemIcon}>👤</Text>
              <Text style={styles.menuItemText}>My Profile</Text>
            </Pressable>


            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setCartVisible(true);
              }}
            >
              <Text style={styles.menuItemIcon}>🛒</Text>
              <Text style={styles.menuItemText}>My Cart ({cartCount})</Text>
            </Pressable>
            <Pressable style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push('/service-booking');
              }}
            >
              <Text style={styles.menuItemIcon}>🔧</Text>
              <Text style={styles.menuItemText}>Book a Service</Text>
              </Pressable>


            <Pressable
              style={[styles.menuItem, styles.logoutMenuItem]}
              onPress={() => {
                setMenuVisible(false);
                void handleLogout();
              }}
            >
              <Text style={styles.menuItemIcon}>↪</Text>
              <Text style={[styles.menuItemText, styles.logoutMenuText]}>Logout</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>A HEALTHIER HOME STARTS HERE</Text>
          <Text style={styles.heroTitle}>
            Pure water,{'\n'}pure peace of mind.
          </Text>
          <Text style={styles.heroDescription}>
            Discover water purifiers and essential spare parts for your home.
          </Text>
          <Text style={styles.heroIcon}>💧</Text>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search purifiers, filters..."
          placeholderTextColor="#718096"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category && styles.categoryTextActive,
                ]}
              >
                {category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Shop products</Text>
            <Text style={styles.sectionSubtitle}>
              Find the right solution for your home
            </Text>
          </View>
          <Text style={styles.count}>{filteredProducts.length} items</Text>
        </View>

        <View style={styles.productGrid}>
          {filteredProducts.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <View
                style={[
                  styles.productImage,
                  { backgroundColor: product.color },
                ]}
              >
                <Text style={styles.productEmoji}>{product.emoji}</Text>
              </View>

              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productType}>{product.type}</Text>
              <Text style={styles.price}>
                ₹{product.price.toLocaleString('en-IN')}
              </Text>

              <Pressable
                style={styles.addButton}
                onPress={() => addToCart(product)}
              >
                <Text style={styles.addButtonText}>+ Add to cart</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {filteredProducts.length === 0 && (
          <Text style={styles.empty}>No matching products found.</Text>
        )}

        <Text style={styles.footer}>
          Califnco · Clean water for every home
        </Text>
      </ScrollView>

      {/* Cart modal */}
      <Modal
        visible={cartVisible}
        animationType="slide"
        onRequestClose={() => setCartVisible(false)}
      >
        <SafeAreaView style={styles.screen}>
          <View style={styles.modalHeader}>
            <Text style={styles.sectionTitle}>Your Cart</Text>
            <Pressable onPress={() => setCartVisible(false)}>
              <Text style={styles.closeText}>Close ✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.cartList}>
            {cartItems.length === 0 ? (
              <Text style={styles.empty}>
                Your cart is empty. Add some products!
              </Text>
            ) : (
              cartItems.map((item) => (
                <View key={item.product.id} style={styles.cartItem}>
                  <View style={styles.cartProductInfo}>
                    <Text style={styles.productName}>{item.product.name}</Text>
                    <Text style={styles.productType}>
                      ₹{item.product.price.toLocaleString('en-IN')} each
                    </Text>

                    <View style={styles.quantityRow}>
                      <Pressable
                        style={styles.quantityButton}
                        onPress={() => changeQuantity(item.product.id, -1)}
                        accessibilityLabel="Decrease quantity"
                      >
                        <Text style={styles.quantityButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <Pressable
                        style={styles.quantityButton}
                        onPress={() => changeQuantity(item.product.id, 1)}
                        accessibilityLabel="Increase quantity"
                      >
                        <Text style={styles.quantityButtonText}>+</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => removeFromCart(item.product.id)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeText}>Remove item</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.price}>
                    ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.cartSummary}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total ({cartCount} items)</Text>
              <Text style={styles.totalText}>
                ₹{cartTotal.toLocaleString('en-IN')}
              </Text>
            </View>
            <Pressable
              style={styles.checkoutButton}
              onPress={handleCheckout}
            >
              <Text style={styles.addButtonText}>Proceed to Checkout</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Checkout modal */}
      <Modal
        visible={checkoutVisible}
        animationType="slide"
        onRequestClose={() => {
          if (!loading) setCheckoutVisible(false);
        }}
      >
        <SafeAreaView style={styles.screen}>
          <View style={styles.modalHeader}>
            <Text style={styles.sectionTitle}>Checkout</Text>
            <Pressable
              onPress={() => setCheckoutVisible(false)}
              disabled={loading}
            >
              <Text style={styles.closeText}>Cancel ✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.checkoutContent}>
            <Text style={styles.formTitle}>Delivery details</Text>

            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Enter your name"
              placeholderTextColor="#718096"
              value={customerName}
              onChangeText={setCustomerName}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Mobile number</Text>
            <TextInput
              style={styles.formInput}
              placeholder="10-digit mobile number"
              placeholderTextColor="#718096"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={10}
            />

            <Text style={styles.fieldLabel}>Delivery address</Text>
            <TextInput
              style={[styles.formInput, styles.addressInput]}
              placeholder="House number, street, city, PIN code"
              placeholderTextColor="#718096"
              value={address}
              onChangeText={setAddress}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.formTitle}>Order summary</Text>
            {cartItems.map((item) => (
              <View key={item.product.id} style={styles.summaryRow}>
                <Text style={styles.summaryName}>
                  {item.product.name} × {item.quantity}
                </Text>
                <Text style={styles.summaryPrice}>
                  ₹{(item.product.price * item.quantity).toLocaleString('en-IN')}
                </Text>
              </View>
            ))}

            <View style={styles.summaryRow}>
              <Text style={styles.totalText}>Total</Text>
              <Text style={styles.totalText}>
                ₹{cartTotal.toLocaleString('en-IN')}
              </Text>
            </View>

            <Text style={styles.demoNotice}>
              Demo checkout only. No payment will be collected.
            </Text>

            <Pressable
              style={[
                styles.checkoutButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={placeDemoOrder}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.addButtonText}>Place Demo Order</Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FAFC',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9F9',
    borderWidth: 1,
    borderColor: '#D8EEEE',
  },
  menuButtonText: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '800',
    color: '#087E8B',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'flex-end',
    paddingTop: 75,
    paddingHorizontal: 14,
  },
  menuPanel: {
    width: 250,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 12,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  menuPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 4,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102A43',
  },
  menuClose: {
    fontSize: 18,
    color: '#64748B',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRadius: 12,
  },
  menuItemIcon: {
    width: 24,
    fontSize: 18,
    textAlign: 'center',
    color: '#087E8B',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#102A43',
  },
  logoutMenuItem: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderRadius: 0,
  },
  logoutMenuText: {
    color: '#DC2626',
  },
  brandContainer: {
    flex: 1,
  },
  brand: {
    fontSize: 27,
    fontWeight: '800',
    color: '#087E8B',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: '#64748B',
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 7,
    paddingVertical: 8,
  },
  logoutText: {
    color: '#087E8B',
    fontWeight: '700',
  },
  cart: {
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  cartText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#075E63',
  },
  hero: {
    margin: 16,
    marginBottom: 12,
    backgroundColor: '#063B4C',
    padding: 22,
    borderRadius: 22,
    overflow: 'hidden',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#9BE7E5',
  },
  heroTitle: {
    marginTop: 12,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroDescription: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: '#D7E9EF',
    maxWidth: '85%',
  },
  heroIcon: {
    position: 'absolute',
    right: 15,
    bottom: 12,
    fontSize: 54,
    opacity: 0.8,
  },
  search: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    color: '#1E293B',
  },
  categoryList: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5EA',
  },
  categoryButtonActive: {
    backgroundColor: '#087E8B',
    borderColor: '#087E8B',
  },
  categoryText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  sectionHeader: {
    paddingHorizontal: 18,
    marginTop: 24,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102A43',
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748B',
  },
  count: {
    fontSize: 11,
    color: '#087E8B',
    fontWeight: '700',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  productCard: {
    width: '50%',
    padding: 7,
    marginBottom: 10,
  },
  productImage: {
    height: 125,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productEmoji: {
    fontSize: 52,
  },
  productName: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#102A43',
  },
  productType: {
    marginTop: 4,
    fontSize: 11,
    color: '#64748B',
  },
  price: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#087E8B',
  },
  addButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#087E8B',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    padding: 25,
    color: '#64748B',
  },
  footer: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    paddingVertical: 25,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  closeText: {
    color: '#087E8B',
    fontWeight: '700',
  },
  cartList: {
    padding: 16,
    paddingBottom: 24,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  cartProductInfo: {
    flex: 1,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    fontSize: 18,
    color: '#075E63',
    fontWeight: '700',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102A43',
  },
  removeButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  removeText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  cartSummary: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#475569',
  },
  totalText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102A43',
  },
  checkoutButton: {
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#087E8B',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  checkoutContent: {
    padding: 20,
    paddingBottom: 40,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102A43',
    marginTop: 12,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 7,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5EA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: '#102A43',
    marginBottom: 16,
  },
  addressInput: {
    minHeight: 100,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryName: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
  },
  summaryPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102A43',
  },
  demoNotice: {
    marginTop: 20,
    marginBottom: 14,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
  },
});
