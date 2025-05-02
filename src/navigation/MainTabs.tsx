import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MessagingScreen from '../screens/MessagingScreen';
import ContactsScreen from '../screens/ContactsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const MainTabs = () => {
  return (
    <Tab.Navigator initialRouteName="Messages">
      <Tab.Screen name="Messages" component={MessagingScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default MainTabs;
