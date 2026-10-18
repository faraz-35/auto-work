import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { C, T, W, getScheme, setScheme, themeEpoch } from './theme';
import { ThemeEpoch, useStyles } from './components/useStyles';
import { AppProvider, useApp } from './state/AppContext';
import { HomeScreen } from './screens/HomeScreen';
import { TodayScreen } from './screens/TodayScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { ChoresScreen } from './screens/ChoresScreen';
import { LedgerScreen } from './screens/LedgerScreen';
import { UpdatePrompt } from './update/UpdatePrompt';

const Tabs = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Today: 'today-outline',
  Analytics: 'stats-chart-outline',
  Chores: 'checkbox-outline',
  Ledger: 'receipt-outline',
};

function Root() {
  const { phase, error, actions } = useApp();
  const styles = useStyles(makeStyles);

  if (phase === 'boot') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={styles.bootText}>waking this phone up…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Can't reach the server</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Text style={styles.press} onPress={actions.retry}>Try again</Text>
      </View>
    );
  }

  return (
    <>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: C.accent,
          tabBarInactiveTintColor: C.dim,
          tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
        }}
      >
          <Tabs.Screen
          name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Home} color={color} size={size} /> }}
      />
        <Tabs.Screen
          name="Today"
        component={TodayScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Today} color={color} size={size} /> }}
      />
        <Tabs.Screen
          name="Analytics"
        component={AnalyticsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS.Analytics} color={color} size={size} /> }}
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
      </Tabs.Navigator>
    </>
  );
}

export default function App() {
  const [epoch, setEpoch] = useState(themeEpoch());
  // useColorScheme is the one source of truth: it resolves after mount (the
  // import-time read can be too early) and re-fires on system changes
  const systemScheme = useColorScheme();

  useEffect(() => {
    setScheme(systemScheme === 'light' ? 'light' : 'dark');
    setEpoch(themeEpoch());
  }, [systemScheme]);

  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: C.bg,
        card: C.card,
        border: C.border,
        text: C.text,
        primary: C.accent,
      },
    }),
    // re-derive the navigation colors on every scheme flip
    [epoch]  // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <AppProvider>
      <ThemeEpoch.Provider value={epoch}>
        <NavigationContainer theme={navTheme}>
          <StatusBar style={getScheme() === 'dark' ? 'light' : 'dark'} />
          <Root />
          <UpdatePrompt />
        </NavigationContainer>
      </ThemeEpoch.Provider>
    </AppProvider>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    bootText: { color: C.dim, fontSize: T.body },
    errorTitle: { color: C.bad, fontSize: T.hero, fontWeight: W.bold },
    errorBody: { color: C.dim, fontSize: T.body, textAlign: 'center' },
    press: { color: C.accent, fontSize: T.title, fontWeight: W.bold, marginTop: 8 },
  });
