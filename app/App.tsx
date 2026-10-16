import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { C } from './src/theme';
import { AppProvider, useApp } from './src/state/AppContext';
import { TodayScreen } from './src/screens/TodayScreen';
import { ChoresScreen } from './src/screens/ChoresScreen';
import { LedgerScreen } from './src/screens/LedgerScreen';
import { FamilyScreen } from './src/screens/FamilyScreen';

const Tabs = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Today: 'today-outline',
  Chores: 'checkbox-outline',
  Ledger: 'receipt-outline',
  Family: 'people-outline',
};

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
  const { phase, error, actions } = useApp();

  if (phase === 'boot') {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={s.bootText}>waking this phone up…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={s.center}>
        <Text style={s.errorTitle}>Can't reach the server</Text>
        <Text style={s.errorBody}>{error}</Text>
        <Text style={s.press} onPress={actions.retry}>Try again</Text>
      </View>
    );
  }

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
      }}
    >
      <Tabs.Screen
        name="Today"
        component={TodayScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Today} color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Chores"
        component={ChoresScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Chores} color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Ledger"
        component={LedgerScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Ledger} color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Family"
        component={FamilyScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Family} color={color} size={size} /> }}
      />
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
  errorTitle: { color: C.bad, fontSize: 20, fontWeight: '700' },
  errorBody: { color: C.dim, fontSize: 14, textAlign: 'center' },
  press: { color: C.accent, fontSize: 16, fontWeight: '700', marginTop: 8 },
});
