import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { alpha, colors, radius, shadows } from '@/theme';
import { Button, Text } from '@/ui';

type Props = {
  /** Called once per scan session with the decoded UPC/EAN. */
  onScanned: (code: string) => void;
};

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** 240pt camera view with an accent reticle; asks for camera permission first. */
export function BarcodeScanner({ onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  if (!permission) return <View style={styles.frame} />;

  if (!permission.granted) {
    return (
      <View style={styles.gate}>
        <Text variant="bodySmall" color={colors.neutral[300]}>
          {permission.canAskAgain
            ? 'DieselDelta needs the camera to read barcodes. Nothing is recorded or uploaded.'
            : 'Camera access is off for DieselDelta. Turn it on in Settings to scan barcodes.'}
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow camera" block onPress={requestPermission} />
        ) : (
          <Button label="Open Settings" variant="secondary" block onPress={Linking.openSettings} />
        )}
      </View>
    );
  }

  const onBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    handled.current = true;
    onScanned(data);
  };

  return (
    <View style={styles.frame}>
      <CameraView
        testID="barcode-camera"
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View pointerEvents="none" style={styles.reticle} />
      <View pointerEvents="none" style={styles.scanLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 240,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.neutral[900],
    ...shadows.sm,
  },
  reticle: {
    position: 'absolute',
    top: 48,
    bottom: 48,
    left: 40,
    right: 40,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radius.md,
    boxShadow: `0 0 18px ${alpha(colors.accent, 0.4)}`,
  },
  scanLine: {
    position: 'absolute',
    left: 52,
    right: 52,
    top: '50%',
    height: 1,
    backgroundColor: colors.accent,
  },
  gate: { gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
});
