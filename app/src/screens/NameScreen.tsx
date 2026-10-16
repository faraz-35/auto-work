import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { Btn, Card, Field } from '../components/ui';
import { useApp } from '../state/AppContext';

/** The whole onboarding: one field. The device signs itself in silently and
 *  joins (or creates) the household — no codes, no accounts. */
export function NameScreen() {
  const { actions } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      Alert.alert('Your name', 'Type the name the family calls you (1–30 letters).');
      return;
    }
    setBusy(true);
    try {
      await actions.signIn(trimmed);
    } catch (e) {
      Alert.alert('Could not reach the server', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.flex} contentContainerStyle={s.content}>
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <Text style={s.logo}>Ghar</Text>
          <Text style={s.tagline}>Everything the house needs done — and who's doing it.</Text>
        </View>
        <Card>
          <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Faraz" />
          <Btn title="That's me — let's go" onPress={go} loading={busy} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  content: { padding: 28, gap: 16, flexGrow: 1, justifyContent: 'center' },
  logo: { color: C.accent, fontSize: 52, fontWeight: '800', letterSpacing: -1 },
  tagline: { color: C.dim, fontSize: 15, textAlign: 'center' },
});
