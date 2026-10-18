import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, S, T, W } from '../theme';
import { useStyles } from '../components/useStyles';
import { Screen } from '../components/Screen';
import { ActionSheet } from '../components/ActionSheet';
import { Btn, Card, Field, Overflow, Row, SectionTitle, roles } from '../components/ui';
import { useApp } from '../state/AppContext';
import { formatPKR, groupByMonth, memberTotals, monthLabel } from '../logic/ledger';
import type { Purchase } from '../types';

/** The home-invoice port: whatever anyone buys goes in here. Insert, read,
 *  and a careful two-tap delete — no editing, by design. */
export function LedgerScreen() {
  const { purchases, members, memberName, actions } = useApp();
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const styles = useStyles(makeStyles);

  useEffect(() => { void actions.loadPurchases(); }, []);

  const byMonth = useMemo(() => groupByMonth(purchases ?? []), [purchases]);

  const add = async () => {
    const name = item.trim();
    const n = Number(amount.trim());
    if (name.length < 1 || name.length > 120) return;
    if (!(n > 0)) return;
    setBusy(true);
    try {
      actions.addPurchase(name, n);
      setItem(''); setAmount('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <SectionTitle>Add a purchase</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="What did you buy" value={item} onChangeText={setItem} placeholder="Groceries" />
          <Field label="How much (Rs)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="3250" />
          <Btn title="Add" compact onPress={add} loading={busy} disabled={!item.trim() || !(Number(amount) > 0)} />
        </Card>

        {purchases == null && <Text style={styles.meta}>loading the ledger…</Text>}

        {[...byMonth.entries()].map(([month, list]) => {
          const total = list.reduce((n, p) => n + p.amount, 0);
          const totals = memberTotals(list, members);
          return (
            <View key={month} style={{ gap: 12 }}>
              <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <SectionTitle>{monthLabel(month)}</SectionTitle>
                <Text style={styles.total}>{formatPKR(total)}</Text>
              </Row>
              <Card style={{ gap: 10 }}>
                {list.map((p) => (
                  <Row key={p.id} style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.item}>{p.item}</Text>
                      <Text style={styles.meta}>
                        {memberName(p.member_id)} · {p.created_at.slice(8, 10)} {monthLabel(p.created_at.slice(0, 7)).slice(0, 3)}
                      </Text>
                    </View>
                    <Text style={styles.amount}>{formatPKR(p.amount)}</Text>
                    <Overflow label={`Options for ${p.item}`} onPress={() => setDeleting(p)} />
                  </Row>
                ))}
              </Card>
              <Card style={{ gap: 6 }}>
                {totals.map((t) => (
                  <Row key={t.member.id} style={{ justifyContent: 'space-between' }}>
                    <Text style={styles.meta}>{t.member.name} paid</Text>
                    <Text style={styles.amount}>{formatPKR(t.total)}</Text>
                  </Row>
                ))}
              </Card>
            </View>
          );
        })}

        {purchases != null && purchases.length === 0 && (
          <Text style={styles.meta}>Nothing bought yet — add the first purchase above.</Text>
        )}

        <ActionSheet
          visible={deleting != null}
          onClose={() => setDeleting(null)}
          title="Delete this entry?"
          subtitle={deleting ? `${deleting.item} · ${formatPKR(deleting.amount)}` : undefined}
          cancelLabel="Keep"
          actions={[{
            label: 'Delete',
            destructive: true,
            onPress: () => { if (deleting) actions.deletePurchase(deleting.id); },
          }]}
        />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.screen, gap: S.gapTight, paddingBottom: 96 },
  total: { color: C.accent, fontSize: T.title, fontWeight: W.heavy, fontVariant: ['tabular-nums'] },
  item: { ...roles().item },
  amount: { ...roles().amount },
  meta: { ...roles().meta },
});
