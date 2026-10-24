
import { router } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../lib/firebase';

type RegistrationType = 'customer' | 'dealer';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [registrationType, setRegistrationType] =
    useState<RegistrationType>('customer');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const authInProgress = useRef(false);

  async function redirectUser(user: NonNullable<typeof auth.currentUser>) {
    const token = await user.getIdTokenResult(true);

    if (token.claims.admin === true) {
      router.replace('/admin');
      return;
    }

    const profile = await getDoc(doc(db, 'users', user.uid));

    if (!profile.exists()) {
      await signOut(auth);
      router.replace('/auth');
      Alert.alert('Account error', 'Your user profile was not found.');
      return;
    }

    const data = profile.data();

    if (data.role === 'dealer' && data.dealerApproved === true) {
      router.replace('/dealer');
      return;
    }

    if (data.role === 'dealer' || data.businessName) {
      await signOut(auth);
      router.replace('/auth');
      Alert.alert(
        'Approval pending',
        'Your dealer application has not been approved yet.'
      );
      return;
    }

    if (data.role === 'customer') {
      router.replace('/');
      return;
    }

    await signOut(auth);
    router.replace('/auth');
    Alert.alert('Access denied', 'Your account role is invalid.');
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || authInProgress.current) return;

      try {
        await redirectUser(user);
      } catch (error) {
        console.error('Session routing error:', error);
      }
    });

    return unsubscribe;
  }, []);

  async function handleAuth() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Invalid password', 'Use at least 6 characters.');
      return;
    }

    if (!isLogin) {
      if (!cleanName) {
        Alert.alert('Missing details', 'Enter your full name.');
        return;
      }

      if (registrationType === 'dealer') {
        if (
          !phone.trim() ||
          !businessName.trim() ||
          !address.trim()
        ) {
          Alert.alert(
            'Missing details',
            'Enter your phone, business name and business address.'
          );
          return;
        }

        if (!/^[6-9]\d{9}$/.test(phone.trim())) {
          Alert.alert(
            'Invalid phone',
            'Enter a valid 10-digit Indian mobile number.'
          );
          return;
        }
      }
    }

    setLoading(true);
    authInProgress.current = true;

    try {
      if (isLogin) {
        const credential = await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );

        await redirectUser(credential.user);
      } else {
        const credential = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );

        await updateProfile(credential.user, {
          displayName: cleanName,
        });

        await setDoc(doc(db, 'users', credential.user.uid), {
          uid: credential.user.uid,
          name: cleanName,
          email: credential.user.email,
          role: 'customer',
          dealerApproved: false,
          ...(registrationType === 'dealer'
            ? {
                phone: phone.trim(),
                businessName: businessName.trim(),
                address: address.trim(),
              }
            : {}),
          createdAt: serverTimestamp(),
        });

        if (registrationType === 'dealer') {
          await setDoc(
            doc(collection(db, 'dealerApplications')),
            {
              userId: credential.user.uid,
              name: cleanName,
              email: credential.user.email,
              phone: phone.trim(),
              businessName: businessName.trim(),
              address: address.trim(),
              status: 'pending',
              createdAt: serverTimestamp(),
            }
          );

          Alert.alert(
            'Application submitted',
            'Your dealer application is pending admin approval.'
          );
        } else {
          Alert.alert(
            'Account created',
            'Your Califnco account is ready.'
          );
        }

        router.replace('/');
      }
    } catch (error: any) {
      console.error('Authentication error:', error);

      Alert.alert(
        'Authentication failed',
        error.message ?? 'Please try again.'
      );
    } finally {
      authInProgress.current = false;
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>califnco</Text>
        <Text style={styles.tagline}>PURE WATER. BETTER LIVING.</Text>

        <Text style={styles.title}>
          {isLogin ? 'Welcome back' : 'Create account'}
        </Text>

        <Text style={styles.subtitle}>
          {isLogin
            ? 'Login to continue shopping.'
            : 'Join Califnco for a better home.'}
        </Text>

        {!isLogin && (
          <>
            <Text style={styles.label}>Account type</Text>

            <View style={styles.typeRow}>
              {(['customer', 'dealer'] as RegistrationType[]).map(
                (type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeButton,
                      registrationType === type &&
                        styles.typeButtonActive,
                    ]}
                    onPress={() => setRegistrationType(type)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        registrationType === type &&
                          styles.typeTextActive,
                      ]}
                    >
                      {type === 'customer' ? 'Customer' : 'Dealer'}
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor="#718096"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!loading}
            />

            {registrationType === 'dealer' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Business name"
                  placeholderTextColor="#718096"
                  value={businessName}
                  onChangeText={setBusinessName}
                  editable={!loading}
                />

                <TextInput
                  style={styles.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#718096"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!loading}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Business address"
                  placeholderTextColor="#718096"
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  editable={!loading}
                />
              </>
            )}
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#718096"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password (minimum 6 characters)"
          placeholderTextColor="#718096"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAuth}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading
              ? 'Please wait...'
              : isLogin
                ? 'Login'
                : registrationType === 'dealer'
                  ? 'Submit Dealer Application'
                  : 'Create Account'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.switchButton}
          disabled={loading}
          onPress={() => setIsLogin((current) => !current)}
        >
          <Text style={styles.switchText}>
            {isLogin
              ? "Don't have an account? Sign up"
              : 'Already have an account? Login'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
  },
  container: {
    padding: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    color: '#087E8B',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 30,
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    color: '#102A43',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
    marginBottom: 24,
  },
  label: {
    color: '#334155',
    fontWeight: '600',
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  typeButton: {
    flex: 1,
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE5EA',
    backgroundColor: '#FFFFFF',
  },
  typeButtonActive: {
    backgroundColor: '#087E8B',
    borderColor: '#087E8B',
  },
  typeText: {
    color: '#334155',
    fontWeight: '600',
  },
  typeTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5EA',
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: '#102A43',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#087E8B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  switchButton: {
    padding: 18,
    alignItems: 'center',
  },
  switchText: {
    color: '#087E8B',
    fontSize: 13,
    fontWeight: '600',
  },
});
