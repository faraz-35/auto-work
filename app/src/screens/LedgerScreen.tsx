import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Alert } from 'react-native';
import { C } from '../theme';
import { Screen } from '../components/Screen';
import { Btn, Card, Field, Overflow, Row, SectionTitle } from '../components/ui';
import { useApp } from '../state/AppContext';
import { formatPKR, groupByMonth, memberTotals, monthLabel } from '../logic/ledger';

/** The home-invoice port: whatever anyone buys goes in here. Insert, read,
 *  and a careful two-tap delete — no editing, by design. */
export function LedgerScreen() {
  const { purchases, members, me, actions } = useApp();
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void actions.loadPurchases(); }, []);

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? '—';

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
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        <SectionTitle>Add a purchase</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="What did you buy" value={item} onChangeText={setItem} placeholder="Groceries" />
          <Field label="How much (Rs)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="3250" />
          <Btn title="Add" compact onPress={add} loading={busy} disabled={!item.trim() || !(Number(amount) > 0)} />
        </Card>

        {purchases == null && <Text style={s.meta}>loading the ledger…</Text>}

        {[...byMonth.entries()].map(([month, list]) => {
          const total = list.reduce((n, p) => n + p.amount, 0);
          const totals = memberTotals(list, members);
          return (
            <View key={month} style={{ gap: 12 }}>
              <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <SectionTitle>{monthLabel(month)}</SectionTitle>
                <Text style={s.total}>{formatPKR(total)}</Text>
              </Row>
              <Card style={{ gap: 10 }}>
                {list.map((p) => (
                  <Row key={p.id} style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.item}>{p.item}</Text>
                      <Text style={s.meta}>
                        {memberName(p.member_id)} · {p.created_at.slice(8, 10)} {monthLabel(p.created_at.slice(0, 7)).slice(0, 3)}
                      </Text>
                    </View>
                    <Text style={s.amount}>{formatPKR(p.amount)}</Text>
                    <Overflow
                      label={`Options for ${p.item}`}
                      onPress={() => Alert.alert('Delete this entry?', `${p.item} · ${formatPKR(p.amount)}`, [
                        { text: 'Keep', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => actions.deletePurchase(p.id) },
                      ])}
                    />
                  </Row>
                ))}
              </Card>
              <Card style={{ gap: 6 }}>
                {totals.map((t) => (
                  <Row key={t.member.id} style={{ justifyContent: 'space-between' }}>
                    <Text style={s.meta}>{t.member.name} paid</Text>
                    <Text style={s.amount}>{formatPKR(t.total)}</Text>
                  </Row>
                ))}
              </Card>
            </View>
          );
        })}

        {purchases != null && purchases.length === 0 && (
          <Text style={s.meta}>Nothing bought yet — add the first purchase above.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 12, paddingBottom: 96 },
  total: { color: C.accent, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  item: { color: C.text, fontSize: 15, fontWeight: '500' },
  amount: { color: C.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  meta: { color: C.dim, fontSize: 12 },
});
