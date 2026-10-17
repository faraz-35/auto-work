import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { C, T, W } from './theme';
import { AppProvider, useApp } from './state/AppContext';
import { TodayScreen } from './screens/TodayScreen';
import { ChoresScreen } from './screens/ChoresScreen';
import { LedgerScreen } from './screens/LedgerScreen';
import { FamilyScreen } from './screens/FamilyScreen';
import { UpdatePrompt } from './update/UpdatePrompt';

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
        <UpdatePrompt />
      </NavigationContainer>
    </AppProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  bootText: { color: C.dim, fontSize: T.body },
  errorTitle: { color: C.bad, fontSize: T.hero, fontWeight: W.bold },
  errorBody: { color: C.dim, fontSize: T.body, textAlign: 'center' },
  press: { color: C.accent, fontSize: T.title, fontWeight: W.bold, marginTop: 8 },
});
