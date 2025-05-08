// src/App.tsx (Corrected Version)
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, View, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import axios from 'axios'; // Keep axios for the validation call

// Import screens (assuming paths are correct)
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import VerifyScreen from './screens/VerifyScreen';
import MagicLinkScreen from './screens/MagicLinkScreen';
import ShowSocialNumber from './screens/ShowSocialNumber';
import ChatScreen from './screens/ChatScreen';
import ContactsScreen from './screens/ContactsScreen';
import SettingsScreen from './screens/SettingsScreen';
import MessagesListScreen from './screens/MessagesListScreen';
import ProfileScreen from './screens/ProfileScreen';
import ContactProfileScreen from './screens/ContactProfileScreen';
import LoadingScreen from './screens/LoadingScreen'; // Assuming you have a simple loading screen

// Import storage and services
import { getSession, clearSession, clearPrivateKey, clearPublicKey } from './storage/secureStorage'; // Use secureStorage functions
import MessageService from './services/messageService'; // Import MessageService

// Navigation Types (keep as is)
export type RootParamList = {
  Login: undefined;
  RegisterScreen: undefined;
  VerifyScreen: {email: string; code?: string};
  MagicLink: {token: string};
  ShowSocialNumber: {uid: string};
  HomeTabs: undefined;
  Chat: {recipientUid: string, recipientName?: string};
  Profile: undefined;
  ContactProfile: undefined;
};

const Stack = createStackNavigator<RootParamList>();
const Tab = createBottomTabNavigator();

// Linking config (keep as is)
const linking = {
  prefixes: ['securecomm://'],
  config: {
    screens: {
      MagicLink: 'auth/:token',
    },
  },
};

// HomeTabs (keep as is)
function HomeTabs() {
  return (
    <Tab.Navigator initialRouteName="MessagesList">
      <Tab.Screen
        name="MessagesList"
        component={MessagesListScreen}
        options={{title: 'Messages'}}
      />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// --- Main App Component ---
export default function App() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'HomeTabs' | null>(null);

  useEffect(() => {
    const checkSessionAndInitialize = async () => {
      let navigateTo: 'Login' | 'HomeTabs' = 'Login'; // Default to Login
      try {
        // 1. Use getSession from secureStorage.ts
        const session = await getSession();
        console.log("App.tsx: checkSession - Retrieved session:", session ? `UID: ${session.uid}` : 'null');

        if (session?.token && session?.uid) {
          console.log("App.tsx: checkSession - Session token and UID found locally, validating with server...");
          // 2. Validate the token with the server
          const validationResponse = await axios.post(
            'http://10.0.2.2:8080/auth/validate-token', // Use correct URL
            {
              uid: session.uid,
              token: session.token,
            }
          );

          console.log("App.tsx: checkSession - Validation response status:", validationResponse.status);
          // console.log("App.tsx: checkSession - Validation response data:", validationResponse.data); // Log full data if needed

          // 3. Check for 'success' property in response data
          if (validationResponse.data.success === true) {
            console.log("App.tsx: checkSession - Session VALID on server. Initializing MessageService...");
            await MessageService.initialize(); // <<< --- CALL INITIALIZE --- <<<
            console.log("App.tsx: checkSession - MessageService initialization attempt finished.");
            navigateTo = 'HomeTabs'; // Set route to HomeTabs
          } else {
            // Session invalid according to server (e.g., token expired if server checked expiry, or other issue)
            console.log("App.tsx: checkSession - Session INVALID according to server. Clearing storage.");
            await clearSession();
            await clearPrivateKey();
            await clearPublicKey();
          }
        } else {
            // No session found locally
             console.log("App.tsx: checkSession - No session found locally.");
        }
      } catch (err: any) {
        console.error('App.tsx: Session validation/initialization failed:', err.response?.data || err.message || err);
        // Clear storage on error as session might be corrupt or server unreachable
         try {
            await clearSession();
            await clearPrivateKey();
            await clearPublicKey();
         } catch (clearErr) {
             console.error("App.tsx: Failed to clear storage after error:", clearErr);
         }
      } finally {
        // Set the initial route based on outcome
        console.log(`App.tsx: Setting initial route to: ${navigateTo}`);
        setInitialRoute(navigateTo);
      }
    };

    checkSessionAndInitialize();

     return () => {
       // Optional: Disconnect service if App unmounts while logged in?
       // MessageService.disconnect(); // Usually done on explicit logout instead
     };
  }, []); // Run only once on initial mount

  // Loading state while checking session
  if (initialRoute === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // Render navigator based on the determined initial route
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{headerShown: false}}>
        {/* Auth Screens */}
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
        <Stack.Screen name="VerifyScreen" component={VerifyScreen} />
        <Stack.Screen name="MagicLink" component={MagicLinkScreen} />

        {/* Main App Screens */}
        <Stack.Screen name="HomeTabs" component={HomeTabs} />
        <Stack.Screen name="ShowSocialNumber" component={ShowSocialNumber} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ContactProfile" component={ContactProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF' // Or your app's background color
    }
});

// index.js remains the same (it's just the entry point)