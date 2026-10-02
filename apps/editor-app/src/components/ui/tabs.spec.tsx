import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabPanel, Tabs } from './tabs';

type Section = 'uno' | 'due' | 'tre';

function Strip() {
  const [value, setValue] = useState<Section>('uno');
  return (
    <>
      <Tabs
        id="prova"
        label="Sezioni"
        value={value}
        onChange={setValue}
        tabs={[
          { value: 'uno', label: 'Uno' },
          { value: 'due', label: 'Due' },
          { value: 'tre', label: 'Tre' },
        ]}
      />
      <TabPanel tabsId="prova" value={value}>
        pannello {value}
      </TabPanel>
    </>
  );
}

describe('Tabs', () => {
  it('puts only the chosen tab in the tab order, and points it at its panel', () => {
    render(<Strip />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    const panel = screen.getByRole('tabpanel');
    expect(tabs[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe(
      'Sezioni',
    );
  });

  it('moves with the arrows, round the ends, and takes the focus along', () => {
    render(<Strip />);
    const tabs = () => screen.getAllByRole('tab');

    fireEvent.keyDown(tabs()[0], { key: 'ArrowLeft' });
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[2]);
    expect(screen.getByRole('tabpanel').textContent).toBe('pannello tre');

    fireEvent.keyDown(tabs()[2], { key: 'ArrowRight' });
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the ends with Home and End', () => {
    render(<Strip />);
    const tabs = () => screen.getAllByRole('tab');

    fireEvent.keyDown(tabs()[0], { key: 'End' });
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs()[2], { key: 'Home' });
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('leaves every other key to the page', () => {
    render(<Strip />);

    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowDown' });

    expect(
      screen
        .getAllByRole('tab')
        .map((tab) => tab.getAttribute('aria-selected')),
    ).toEqual(['true', 'false', 'false']);
  });
});
