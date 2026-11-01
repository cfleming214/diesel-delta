import { DownloadSimple, ShareNetwork } from '@/ui/icons';
import { useRef, useState } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { ASPECTS, ShareCard, type Aspect } from '@/components/ShareCard';
import { useDeltaModel } from '@/data';
import { formatDate } from '@/domain';
import { links } from '@/lib/links';
import {
  captureCard,
  saveImage,
  shareImage,
  type SaveResult,
  type ShareResult,
} from '@/lib/shareImage';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { useUi } from '@/store/ui';
import { Button, Screen, Seg, Text } from '@/ui';
import { track } from '@/lib/telemetry';

const ASPECT_OPTIONS = (Object.keys(ASPECTS) as Aspect[]).map((value) => ({
  value,
  label: ASPECTS[value].label,
}));

const SAVE_MESSAGES: Record<SaveResult, string> = {
  photos: 'Image saved to Photos',
  downloaded: 'Image downloaded',
  denied: 'Allow Photos access in Settings to save',
};
const SHARE_MESSAGES: Record<ShareResult, string | null> = {
  shared: 'Share sheet opened',
  copied: 'Link copied. Paste it anywhere to share.',
  cancelled: null,
  unavailable: 'Sharing is not available on this device',
};

export default function ShareScreen() {
  const [aspect, setAspect] = useState<Aspect>('story');
  const [busy, setBusy] = useState(false);
  const card = useRef<HostInstance>(null);
  const window = useUi((s) => s.window);
  const zip = usePrefs((s) => s.zip);
  const { model, state } = useDeltaModel({ window });

  const place = `${state ?? ''} ${zip ?? ''}`.trim();
  const asOf = model ? formatDate(model.latestDate, true) : '';
  const link = links.shortLink({ state: state ?? '', window, asOf });

  const run = async (kind: 'save' | 'share', action: (uri: string) => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureCard(card, ASPECTS[aspect].export);
      const message = await action(uri);
      track('share', { action: kind, aspect, ok: message != null });
      if (message) toast(message);
    } catch {
      track('share', { action: kind, aspect, ok: false });
      toast('Could not create the image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll bottomInset={24} contentStyle={styles.content}>
      <View style={styles.top}>
        <BackButton close />
        <Text variant="section" style={styles.title} accessibilityRole="header">
          Share card
        </Text>
      </View>
      <Seg
        height={38}
        value={aspect}
        onChange={setAspect}
        options={ASPECT_OPTIONS}
        accessibilityLabel="Card size"
      />
      <View style={styles.stage}>
        {model ? (
          <ShareCard
            ref={card}
            aspect={aspect}
            windowLabel={model.windowLabel}
            deltaText={Math.abs(model.delta).toFixed(1)}
            verdict={model.verdict}
            fuel={model.fuel}
            basket={model.basket}
            start={model.start}
            end={model.end}
            asOf={asOf}
            place={place}
            link={link}
          />
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button
          label="Save image"
          icon={DownloadSimple}
          variant="secondary"
          height={48}
          style={styles.action}
          disabled={!model || busy}
          onPress={() => run('save', async (uri) => SAVE_MESSAGES[await saveImage(uri)])}
        />
        <Button
          label="Share"
          icon={ShareNetwork}
          height={48}
          style={styles.action}
          disabled={!model || busy}
          onPress={() =>
            run(
              'share',
              async (uri) => SHARE_MESSAGES[await shareImage(uri, 'Share your Delta', link)],
            )
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 20 },
  stage: { minHeight: 390, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
