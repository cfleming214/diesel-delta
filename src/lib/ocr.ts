/**
 * Text recognition for receipt photos. The mock returns a fixed Kroger receipt; the production
 * provider will wrap on-device ML Kit (@react-native-ml-kit/text-recognition, needs a dev build).
 */
export interface OcrProvider {
  recognize(imageUri: string | null): Promise<string>;
}

export const MOCK_RECEIPT_TEXT = `KROGER
Store 00417  Houston TX
10/28/26 18:42
WHOLE MILK 1 GAL        3.89 F
LARGE EGGS 12 CT        3.19 F
BANANAS 2.1 LB          1.32 F
FROZEN PEAS 12 OZ       1.89 F
SUBTOTAL               10.29
TAX                     0.00
TOTAL                  10.29
VISA ************1234  10.29
YOU SAVED               0.40`;

export const mockOcr: OcrProvider = {
  async recognize() {
    // Simulate on-device processing time.
    await new Promise((r) => setTimeout(r, 300));
    return MOCK_RECEIPT_TEXT;
  },
};

export const ocr: OcrProvider = mockOcr;
