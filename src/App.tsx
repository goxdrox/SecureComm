import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LoginScreen from './screens/LoginScreen';
import MagicLinkScreen from './screens/MagicLinkScreen';
import ShowSocialNumber from './screens/ShowSocialNumber';
import ChatScreen from './screens/ChatScreen';
import ContactsScreen from './screens/ContactsScreen';
import SettingsScreen from './screens/SettingsScreen';
import MessagesListScreen from './screens/MessagesListScreen';

// Navigation Types
export type RootParamList = {
  Login: undefined;
  MagicLink: { token: string };
  ShowSocialNumber: { uid: string };
  HomeTabs: undefined;
  Chat: { recipientUid: string };
};

const Stack = createStackNavigator<RootParamList>();
const Tab = createBottomTabNavigator();

const linking = {
  prefixes: ['securecomm://'],
  config: {
    screens: {
      MagicLink: 'auth/:token', // deep link like securecomm://auth/abcdef1234
    },
  },
};

function HomeTabs() {
  return (
    <Tab.Navigator initialRouteName="MessagesList">
      <Tab.Screen
        name="MessagesList"
        component={MessagesListScreen}
        options={{ title: 'Messages' }}
      />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MagicLink" component={MagicLinkScreen} />
        <Stack.Screen name="ShowSocialNumber" component={ShowSocialNumber} />
        <Stack.Screen name="HomeTabs" component={HomeTabs} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
