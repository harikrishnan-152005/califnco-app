
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
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../lib/firebase';

type ServiceRequest = {
  id: string;
  userId?: string;
  customerName?: string;
  email?: string;
  issue?: string;
  description?: string;
  status?: string;
  createdAt?: { toDate?: () => Date };
};

const STATUSES = ['Pending', 'In Progress', 'Resolved'];

export default function AdminService() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeRequests: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubscribeRequests?.();
      unsubscribeRequests = undefined;
      setAuthorized(false);

      if (!user) {
        setRequests([]);
        setLoading(false);
        router.replace('/auth');
        return;
      }

      try {
        const token = await user.getIdTokenResult(true);

        if (token.claims.admin !== true) {
          setRequests([]);
          setLoading(false);
          Alert.alert('Access denied', 'Admin access is required.');
          router.replace('/');
          return;
        }

        setAuthorized(true);

        const requestsQuery = query(
          collection(db, 'serviceRequests'),
          orderBy('createdAt', 'desc')
        );

        unsubscribeRequests = onSnapshot(
          requestsQuery,
          (snapshot) => {
            setRequests(
              snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              })) as ServiceRequest[]
            );
            setLoading(false);
          },
          (error) => {
            console.error('Service requests error:', error);
            setLoading(false);
            Alert.alert(
              'Error',
              'Could not load service requests. Check Firestore rules.'
            );
          }
        );
      } catch (error) {
        console.error('Admin verification failed:', error);
        setLoading(false);
        Alert.alert('Error', 'Could not verify admin access.');
        router.replace('/');
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeRequests?.();
    };
  }, []);

  const changeStatus = async (
    requestId: string,
    status: string
  ) => {
    if (!authorized || !STATUSES.includes(status)) return;

    setUpdatingId(requestId);

    try {
      await updateDoc(doc(db, 'serviceRequests', requestId), {
        status,
        updatedAt: serverTimestamp(),
      });

      Alert.alert('Success', `Request marked as ${status}.`);
    } catch (error) {
      console.error('Status update failed:', error);
      Alert.alert(
        'Update failed',
        'Could not update the request. Check Firestore rules.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading service requests...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Service Desk</Text>
        <Text style={styles.subtitle}>
          {requests.length} service request(s)
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {requests.length === 0 ? (
          <Text style={styles.empty}>No service requests found.</Text>
        ) : (
          requests.map((item) => {
            const date = item.createdAt?.toDate?.();

            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.customer}>
                  {item.customerName || 'Unknown customer'}
                </Text>

                <Text style={styles.detail}>
                  Email: {item.email || 'Not provided'}
                </Text>
                <Text style={styles.detail}>
                  Customer UID: {item.userId || 'Not provided'}
                </Text>

                <Text style={styles.issue}>
                  Issue: {item.issue || 'No issue title'}
                </Text>
                <Text style={styles.detail}>
                  {item.description || 'No description provided.'}
                </Text>

                {date && (
                  <Text style={styles.date}>
                    Submitted: {date.toLocaleString()}
                  </Text>
                )}

                <Text style={styles.status}>
                  Current status: {item.status || 'Pending'}
                </Text>

                <Text style={styles.actionLabel}>Update status</Text>

                <View style={styles.actions}>
                  {STATUSES.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.button,
                        item.status === status && styles.selectedButton,
                      ]}
                      disabled={updatingId !== null}
                      onPress={() => changeStatus(item.id, status)}
                    >
                      <Text style={styles.buttonText}>{status}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {updatingId === item.id && (
                  <ActivityIndicator
                    style={styles.updating}
                    color="#2563eb"
                  />
                )}
              </View>
            );
          })
        )}

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace('/admin')}
        >
          <Text style={styles.backButtonText}>Back to Admin Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { marginTop: 12, color: '#374151' },
  header: {
    padding: 20,
    backgroundColor: '#111827',
  },
  title: { fontSize: 25, fontWeight: 'bold', color: '#ffffff' },
  subtitle: { marginTop: 5, color: '#d1d5db' },
  list: { padding: 16, paddingBottom: 35 },
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
    elevation: 2,
  },
  customer: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  detail: { color: '#4b5563', marginTop: 7 },
  issue: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    color: '#111827',
  },
  date: { color: '#6b7280', fontSize: 12, marginTop: 10 },
  status: {
    marginTop: 12,
    marginBottom: 10,
    fontWeight: 'bold',
    color: '#1d4ed8',
  },
  actionLabel: { fontWeight: '600', marginBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  button: {
    backgroundColor: '#6b7280',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  selectedButton: { backgroundColor: '#2563eb' },
  buttonText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  updating: { marginTop: 10 },
  empty: {
    textAlign: 'center',
    padding: 25,
    color: '#6b7280',
  },
  backButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 8,
  },
  backButtonText: { color: '#ffffff', fontWeight: 'bold' },
});
