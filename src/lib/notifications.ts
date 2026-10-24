import { db } from '@/lib/firebase';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

export async function registerForPushNotifications(userId: string) {
  if (Platform.OS === 'web') return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) throw new Error('EAS project ID is missing');

    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;

    await setDoc(
      doc(db, 'users', userId, 'pushTokens', token),
      {
        token,
        platform: Platform.OS,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return token;
  } catch (error) {
    console.error('Push notification registration failed:', error);
    return null;
  }
}