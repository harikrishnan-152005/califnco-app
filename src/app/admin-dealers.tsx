
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
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
import { auth, db } from '../lib/firebase';

type DealerApplication = {
  id: string;
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  address?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: {
    toDate?: () => Date;
  };
};

export default function AdminDealersScreen() {
  const [applications, setApplications] = useState<DealerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let stopApplications: (() => void) | undefined;

    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopApplications?.();
      stopApplications = undefined;

      if (!user) {
        if (active) {
          setAuthorized(false);
          setLoading(false);
          router.replace('/auth');
        }
        return;
      }

      if (active) setLoading(true);

      try {
        const token = await user.getIdTokenResult(true);

        if (token.claims.admin !== true) {
          if (active) {
            setAuthorized(false);
            setLoading(false);
            Alert.alert('Access denied', 'Admin permission required.');
            router.replace('/');
          }
          return;
        }

        if (!active) return;

        setAuthorized(true);

        const pendingQuery = query(
          collection(db, 'dealerApplications'),
          where('status', '==', 'pending')
        );

        stopApplications = onSnapshot(
          pendingQuery,
          (snapshot) => {
            if (!active) return;

            const items = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })) as DealerApplication[];

            items.sort((a, b) => {
              const aTime = a.createdAt?.toDate?.().getTime() ?? 0;
              const bTime = b.createdAt?.toDate?.().getTime() ?? 0;
              return aTime - bTime;
            });

            setApplications(items);
            setLoading(false);
          },
          (error) => {
            console.error('Dealer applications error:', error);
            if (!active) return;

            setLoading(false);
            Alert.alert(
              'Unable to load applications',
              'Check your Firestore rules and internet connection.'
            );
          }
        );
      } catch (error) {
        console.error('Admin verification failed:', error);

        if (active) {
          setAuthorized(false);
          setLoading(false);
          Alert.alert(
            'Verification failed',
            'Unable to verify admin access. Please sign in again.'
          );
          router.replace('/');
        }
      }
    });

    return () => {
      active = false;
      stopAuth();
      stopApplications?.();
    };
  }, []);

  function reviewApplication(
    application: DealerApplication,
    status: 'approved' | 'rejected'
  ) {
    if (!authorized || processingId !== null) return;

    const action = status === 'approved' ? 'approve' : 'reject';
    const dealerName =
      application.businessName || application.name || 'this dealer';

    Alert.alert(
      `${action.charAt(0).toUpperCase()}${action.slice(1)} application`,
      `Are you sure you want to ${action} ${dealerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setProcessingId(application.id);

            try {
              const user = auth.currentUser;

              if (!user) {
                throw new Error('Your admin session has expired.');
              }

              // Re-verify the admin claim before making changes.
              const token = await user.getIdTokenResult(true);

              if (token.claims.admin !== true) {
                throw new Error('Admin permission is required.');
              }

              const applicationRef = doc(
                db,
                'dealerApplications',
                application.id
              );
              const userRef = doc(db, 'users', application.userId);

              const batch = writeBatch(db);

              // Update the application and access-control profile together.
              batch.update(applicationRef, {
                status,
                reviewedAt: serverTimestamp(),
                reviewedBy: user.uid,
              });

              batch.update(userRef, {
                role: status === 'approved' ? 'dealer' : 'customer',
                dealerApproved: status === 'approved',
                updatedAt: serverTimestamp(),
              });

              await batch.commit();

              Alert.alert(
                'Success',
                status === 'approved'
                  ? 'Dealer approved. Wholesale access is now enabled.'
                  : 'Dealer application rejected. Wholesale access is disabled.'
              );
            } catch (error) {
              console.error('Dealer review failed:', error);

              Alert.alert(
                'Update failed',
                error instanceof Error
                  ? error.message
                  : 'Could not update this application. Check Firestore rules.'
              );
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#087E8B" />
        <Text style={styles.muted}>Verifying admin and loading applications...</Text>
      </SafeAreaView>
    );
  }

  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/admin')}
          style={styles.backButton}
        >
          <Text style={styles.back}>‹ Admin</Text>
        </Pressable>

        <Text style={styles.heading}>Dealer Approvals</Text>

        <View style={styles.countBadge}>
          <Text style={styles.count}>{applications.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Review dealer applications. Only approved accounts can access
          wholesale ordering.
        </Text>

        {applications.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No pending applications</Text>
            <Text style={styles.muted}>
              New dealer applications will appear here automatically.
            </Text>
          </View>
        ) : (
          applications.map((application) => {
            const isProcessing = processingId === application.id;
            const isBusy = processingId !== null;

            return (
              <View key={application.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.initial}>
                    <Text style={styles.initialText}>
                      {(application.businessName || application.name || 'D')
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.titleBlock}>
                    <Text style={styles.businessName}>
                      {application.businessName || 'Business name not provided'}
                    </Text>
                    <Text style={styles.applicant}>
                      {application.name || 'Applicant name not provided'}
                    </Text>
                    <Text style={styles.pending}>PENDING REVIEW</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Detail label="Email" value={application.email} />
                <Detail label="Phone" value={application.phone} />
                <Detail label="Business address" value={application.address} />
                <Detail label="User ID" value={application.userId} />
                <Detail
                  label="Applied on"
                  value={
                    application.createdAt?.toDate
                      ? application.createdAt.toDate().toLocaleDateString('en-IN')
                      : 'Date unavailable'
                  }
                />

                <View style={styles.actions}>
                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.rejectButton,
                      isBusy && styles.disabled,
                    ]}
                    disabled={isBusy}
                    onPress={() => reviewApplication(application, 'rejected')}
                  >
                    <Text style={styles.rejectText}>
                      {isProcessing ? 'Saving...' : 'Reject'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.approveButton,
                      isBusy && styles.disabled,
                    ]}
                    disabled={isBusy}
                    onPress={() => reviewApplication(application, 'approved')}
                  >
                    <Text style={styles.approveText}>
                      {isProcessing ? 'Saving...' : 'Approve Dealer'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        <Pressable
          style={styles.refreshButton}
          onPress={() => router.replace('/admin-dealers')}
        >
          <Text style={styles.refreshText}>Refresh screen</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || 'Not provided'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FAFC',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 8,
  },
  back: {
    color: '#087E8B',
    fontWeight: '700',
  },
  heading: {
    color: '#102A43',
    fontWeight: '800',
    fontSize: 17,
  },
  countBadge: {
    minWidth: 30,
    alignItems: 'center',
    backgroundColor: '#087E8B',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  count: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  subtitle: {
    color: '#64748B',
    marginBottom: 18,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  initial: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DDF4F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  initialText: {
    color: '#087E8B',
    fontSize: 22,
    fontWeight: '800',
  },
  titleBlock: {
    flex: 1,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102A43',
  },
  applicant: {
    color: '#64748B',
    marginTop: 4,
    fontSize: 13,
  },
  pending: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  detailRow: {
    marginBottom: 11,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    backgroundColor: '#FEE2E2',
  },
  rejectText: {
    color: '#B91C1C',
    fontWeight: '800',
  },
  approveButton: {
    backgroundColor: '#087E8B',
  },
  approveText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.5,
  },
  empty: {
    padding: 28,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102A43',
    marginBottom: 8,
  },
  muted: {
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  refreshButton: {
    alignSelf: 'center',
    padding: 12,
    marginTop: 4,
  },
  refreshText: {
    color: '#087E8B',
    fontWeight: '700',
  },
});
