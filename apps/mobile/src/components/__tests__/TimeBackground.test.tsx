import { render } from '@testing-library/react-native';

import { TimeBackground } from '../TimeBackground';
import { getTimeBackgroundAsset } from '@/domain/timeOfDay';

// The background is decorative and hidden from screen readers, so queries must opt in to see it.
const HIDDEN = { includeHiddenElements: true };

describe('TimeBackground', () => {
  it('shows the image for the current time of day, hidden from screen readers', async () => {
    const { getByTestId, queryByTestId, toJSON } = await render(
      <TimeBackground timeOfDay="night" />,
    );
    // expo-image keeps its source as a list.
    expect(getByTestId('time-bg-current', HIDDEN).props.source).toEqual([
      getTimeBackgroundAsset('night'),
    ]);
    expect(queryByTestId('time-bg-previous', HIDDEN)).toBeNull();
    expect(JSON.stringify(toJSON())).toContain('"importantForAccessibility":"no-hide-descendants"');
  });

  it('puts the new image on top when the time of day changes', async () => {
    const { getByTestId, queryByTestId, rerender } = await render(
      <TimeBackground timeOfDay="evening" />,
    );
    await rerender(<TimeBackground timeOfDay="night" />);
    // expo-image keeps its source as a list.
    expect(getByTestId('time-bg-current', HIDDEN).props.source).toEqual([
      getTimeBackgroundAsset('night'),
    ]);
    // The old image is either still fading out underneath or already gone, never on top.
    const previous = queryByTestId('time-bg-previous', HIDDEN);
    if (previous) expect(previous.props.source).toEqual([getTimeBackgroundAsset('evening')]);
  });
});
