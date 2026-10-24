
import { router } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { auth, db } from '../lib/firebase';

export default function ServiceBooking() {
  const [issue, setIssue] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    const user = auth.currentUser;

    if (!user) {
      router.replace('/auth');
      return;
    }

    if (!issue.trim() || !description.trim()) {
      Alert.alert('Required fields', 'Enter the issue and its description.');
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, 'serviceRequests'), {
        userId: user.uid,
        customerName: user.displayName || 'Customer',
        email: user.email || '',
        issue: issue.trim(),
        description: description.trim(),
        status: 'Pending',
        createdAt: serverTimestamp(),
      });

      setIssue('');
      setDescription('');
      Alert.alert('Request submitted', 'Your service request was submitted successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Service booking failed:', error);
      Alert.alert(
        'Booking failed',
        'Please check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Book a Service</Text>
      <Text style={styles.subtitle}>
        Tell us what you need help with. Our team will review your request.
      </Text>

      <Text style={styles.label}>Issue type</Text>
      <TextInput
        style={styles.input}
        value={issue}
        onChangeText={setIssue}
        placeholder="e.g. Water purifier repair"
        maxLength={100}
      />

      <Text style={styles.label}>Describe the issue</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the problem and your service needs..."
        multiline
        textAlignVertical="top"
        maxLength={1000}
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.disabled]}
        onPress={submitRequest}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Submit Service Request</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 27, fontWeight: 'bold', color: '#111827' },
  subtitle: { color: '#6b7280', marginTop: 8, marginBottom: 25, lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#111827' },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 13,
    marginBottom: 20,
    fontSize: 15,
  },
  multiline: { minHeight: 130 },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  backButton: { padding: 14, alignItems: 'center', marginTop: 8 },
  backText: { color: '#374151', fontWeight: '600' },
});
