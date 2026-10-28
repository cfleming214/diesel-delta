import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import Home from '@/app/index';

test('renders the home placeholder', async () => {
  await render(<Home />);
  expect(screen.getByText('DieselDelta')).toBeTruthy();
});
