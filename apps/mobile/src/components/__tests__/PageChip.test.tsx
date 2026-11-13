import { render, screen } from '@testing-library/react-native';

import { PageChip } from '../PageChip';
import { TAB_PAGES, type TabPage } from '../tabPages';

describe('PageChip', () => {
  it.each(Object.keys(TAB_PAGES) as TabPage[])(
    "names the %s page with its tab's own label, so headers match the bottom bar",
    async (page) => {
      await render(<PageChip page={page} />);
      expect(screen.getByLabelText(`${TAB_PAGES[page].label} page`)).toBeOnTheScreen();
      expect(screen.getByText(TAB_PAGES[page].label)).toBeOnTheScreen();
    },
  );
});
