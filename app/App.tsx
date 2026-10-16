import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { C } from './src/theme';
import { AppProvider, useApp } from './src/state/AppContext';
import { NameScreen } from './src/screens/NameScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { ChoresScreen } from './src/screens/ChoresScreen';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { FamilyScreen } from './src/screens/FamilyScreen';

const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.card,
    border: C.border,
    text: C.text,
    primary: C.accent,
  },
};

function Root() {
  const { phase } = useApp();

  if (phase === 'boot') {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={s.bootText}>waking this phone up…</Text>
      </View>
    );
  }

  if (phase === 'needName') return <NameScreen />;

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
      }}
    >
      <Tabs.Screen name="Today" component={TodayScreen} />
      <Tabs.Screen name="Chores" component={ChoresScreen} />
      <Tabs.Screen name="Ledger" component={LedgerScreen} />
      <Tabs.Screen name="Family" component={FamilyScreen} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Root />
      </NavigationContainer>
    </AppProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  bootText: { color: C.dim, fontSize: 14 },
});
