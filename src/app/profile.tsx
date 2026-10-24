
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../lib/firebase';

export default function ProfileScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        router.replace('/auth');
        return;
      }

      setUserId(user.uid);
      setEmail(user.email || '');

      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));

        if (snapshot.exists()) {
          const data = snapshot.data();
          setName(data.name || data.displayName || user.displayName || '');
          setPhone(data.phone || '');
          setEmail(data.email || user.email || '');
        } else {
          setName(user.displayName || '');
        }
      } catch (error) {
        console.error('Profile loading failed:', error);
        Alert.alert('Error', 'Could not load your profile.');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const saveProfile = async () => {
    if (!userId) {
      Alert.alert('Login required', 'Please sign in again.');
      router.replace('/auth');
      return;
    }

    if (!name.trim() || !phone.trim()) {
      Alert.alert('Missing details', 'Enter your name and phone number.');
      return;
    }

    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      Alert.alert('Invalid phone', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSaving(true);

    try {
      await updateDoc(doc(db, 'users', userId), {
        name: name.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert('Success', 'Your profile has been updated.');
    } catch (error) {
      console.error('Profile update failed:', error);
      Alert.alert(
        'Update failed',
        'Could not save your profile. Check your Firestore rules and user document.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#087E8B" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My Profile</Text>
      <Text style={styles.subtitle}>Manage your Califnco account details.</Text>

      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {name.trim() ? name.trim().charAt(0).toUpperCase() : 'C'}
        </Text>
      </View>

      <Text style={styles.label}>Full name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter your full name"
        autoCapitalize="words"
        maxLength={100}
      />

      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={[styles.input, styles.readOnly]}
        value={email}
        editable={false}
      />
      <Text style={styles.hint}>Email is managed by your sign-in account.</Text>

      <Text style={styles.label}>Mobile number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="10-digit mobile number"
        keyboardType="phone-pad"
        maxLength={10}
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={saveProfile}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText}>Save Changes</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>Back to Shop</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { padding: 22, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#64748B' },
  title: { fontSize: 28, fontWeight: '800', color: '#102A43' },
  subtitle: { marginTop: 6, marginBottom: 22, color: '#64748B' },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#DDF4F1',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 25,
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: '#087E8B' },
  label: { fontWeight: '600', color: '#334155', marginBottom: 7 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5EA',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#102A43',
    marginBottom: 18,
  },
  readOnly: { backgroundColor: '#EAEFF3', color: '#64748B' },
  hint: { fontSize: 12, color: '#64748B', marginTop: -12, marginBottom: 18 },
  saveButton: {
    backgroundColor: '#087E8B',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  disabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  backButton: { padding: 15, alignItems: 'center' },
  backText: { color: '#087E8B', fontWeight: '600' },
});
