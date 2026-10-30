import { DownloadSimple, ShareNetwork } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View, type HostInstance } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { ASPECTS, ShareCard, type Aspect } from '@/components/ShareCard';
import { useDeltaModel } from '@/data';
import { formatDate } from '@/domain';
import { links } from '@/lib/links';
import { captureCard, saveToPhotos, shareImage } from '@/lib/shareImage';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { useUi } from '@/store/ui';
import { Button, Screen, Seg, Text } from '@/ui';

const ASPECT_OPTIONS = (Object.keys(ASPECTS) as Aspect[]).map((value) => ({
  value,
  label: ASPECTS[value].label,
}));

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

  const run = async (action: (uri: string) => Promise<boolean>, done: string, denied: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureCard(card, ASPECTS[aspect].export);
      toast((await action(uri)) ? done : denied);
    } catch {
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
          onPress={() =>
            run(saveToPhotos, 'Image saved to Photos', 'Allow Photos access in Settings to save')
          }
        />
        <Button
          label="Share"
          icon={ShareNetwork}
          height={48}
          style={styles.action}
          disabled={!model || busy}
          onPress={() =>
            run(
              (uri) => shareImage(uri, 'Share your Delta'),
              'Share sheet opened',
              'Sharing is not available on this device',
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
