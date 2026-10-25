import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { C, S, T, W } from '../theme';
import { useStyles } from '../components/useStyles';
import { Screen } from '../components/Screen';
import { Btn, Card, Row, roles } from '../components/ui';
import { useApp } from '../state/AppContext';
import * as api from '../db/api';
import { errorMessage } from '../logic/errors';

/** First screen on a fresh phone (and after an update that invalidates the
 *  binding): the household's people, tap yours. Claiming binds the device and
 *  the app continues into the tabs. */
export function WhoScreen() {
  const { claimIdentity } = useApp().actions;
  const styles = useStyles(makeStyles);
  const [roster, setRoster] = useState<api.RosterEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api.householdRoster()
      .then(setRoster)
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  const pick = (id: string) => {
    setBusy(id);
    setClaimError(null);
    claimIdentity(id).catch((e) => setClaimError(errorMessage(e))).finally(() => setBusy(null));
  };

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Who are you?</Text>
        <Text style={styles.sub}>Tap your name once. This phone becomes yours.</Text>

        {loadError && (
          <Card style={{ gap: 10 }}>
            <Text style={roles().meta}>{loadError}</Text>
            <Btn title="Try again" onPress={load} />
          </Card>
        )}

        {roster?.map((m) => (
          <Btn key={m.id} title={m.name} loading={busy === m.id} disabled={busy != null} onPress={() => pick(m.id)} />
        ))}

        {claimError && <Text style={styles.claimError}>{claimError}</Text>}
        {roster && roster.length === 0 && !loadError && (
          <Row><Text style={roles().meta}>Nobody in the household yet.</Text></Row>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: S.screen, gap: 10, justifyContent: 'center', flexGrow: 1 },
    heading: { color: C.text, fontSize: T.hero, fontWeight: W.bold, letterSpacing: -0.3 },
    sub: { color: C.dim, fontSize: T.body, marginBottom: 12 },
    claimError: { color: C.bad, fontSize: T.meta },
  });
