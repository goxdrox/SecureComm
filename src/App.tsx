import React, {useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import EncryptedStorage from 'react-native-encrypted-storage';
import axios from 'axios';

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

// Navigation Types
export type RootParamList = {
  Login: undefined;
  RegisterScreen: undefined;
  VerifyScreen: {email: string; code?: string};
  MagicLink: {token: string};
  ShowSocialNumber: {uid: string};
  HomeTabs: undefined;
  Chat: {recipientUid: string};
  Profile: undefined;
  ContactProfile: undefined;
};

const Stack = createStackNavigator<RootParamList>();
const Tab = createBottomTabNavigator();

const linking = {
  prefixes: ['securecomm://'],
  config: {
    screens: {
      MagicLink: 'auth/:token',
    },
  },
};

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

export default function App() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'HomeTabs' | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = await EncryptedStorage.getItem('sessionToken');
        const uid = await EncryptedStorage.getItem('uid');

        if (!token || !uid) {
          setInitialRoute('Login');
          return;
        }

        const response = await axios.post('http://YOUR_SERVER_URL/auth/validate-token', {
          uid,
          token,
        });

        if (response.data.valid) {
          setInitialRoute('HomeTabs');
        } else {
          await EncryptedStorage.clear();
          setInitialRoute('Login');
        }
      } catch (err) {
        console.error('Session validation failed:', err);
        setInitialRoute('Login');
      }
    };

    checkSession();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{headerShown: false}}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
        <Stack.Screen name="VerifyScreen" component={VerifyScreen} />
        <Stack.Screen name="MagicLink" component={MagicLinkScreen} />
        <Stack.Screen name="ShowSocialNumber" component={ShowSocialNumber} />
        <Stack.Screen name="HomeTabs" component={HomeTabs} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ContactProfile" component={ContactProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
