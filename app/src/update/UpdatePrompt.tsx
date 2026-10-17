import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { Btn } from '../components/ui';
import { checkForUpdate, downloadAndInstall, type Release } from './updater';

type Stage = 'available' | 'downloading' | 'failed';

/** Checks GitHub once per app start and, when a newer APK is out, offers it
 *  in the app's own sheet language: download with a progress bar, then the
 *  system installer takes over. Renders nothing until an update exists, and
 *  a failed check stays silent — updating must never get in the way of the
 *  chores (or of the layout). */
export function UpdatePrompt() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    checkForUpdate()
      .then((r) => { if (r) setRelease(r); })
      .catch(() => undefined);
  }, []);

  // SafeAreaProvider is a flex:1 view: it may only exist while the sheet is
  // on screen, never as a standing sibling of the navigator.
  if (!release) return null;
  return (
    <SafeAreaProvider>
      <UpdateSheet release={release} onClose={() => setRelease(null)} />
    </SafeAreaProvider>
  );
}

function UpdateSheet({ release, onClose }: { release: Release; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>('available');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const start = async () => {
    setStage('downloading');
    try {
      await downloadAndInstall(release, setProgress);
      setStage('available');  // installer took over; if the user backs out, offer again
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('failed');
    }
  };

  const name = release.version.replace(/^v/, '');
  const mb = Math.round(release.sizeBytes / 1_000_000);
  const pct = progress != null ? Math.round(progress * 100) : null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: 16 + insets.bottom }]} onPress={() => undefined}>
          <Text style={s.title}>Update Ghar</Text>
          <Text style={s.subtitle}>
            {stage === 'downloading'
              ? pct != null ? `Downloading Ghar ${name}… ${pct}%` : `Downloading Ghar ${name}…`
              : `Ghar ${name} is out. It downloads about ${mb} MB, then Android installs it.`}
          </Text>
          {stage === 'downloading' && (
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  { width: `${pct ?? 100}%`, opacity: pct != null ? 1 : 0.35 },
                ]}
              />
            </View>
          )}
          {stage === 'failed' && <Text style={s.error}>Download failed: {error}</Text>}
          {stage === 'downloading' ? (
            <Text style={s.hint}>You can keep using Ghar; Android asks when it's ready.</Text>
          ) : (
            <>
              <Btn title={stage === 'failed' ? 'Try again' : 'Update now'} onPress={() => void start()} />
              <Btn title="Not now" kind="ghost" onPress={onClose} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: C.dim, fontSize: 14, marginTop: -6 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  error: { color: C.bad, fontSize: 13 },
  hint: { color: C.dim, fontSize: 13, textAlign: 'center' },
});
