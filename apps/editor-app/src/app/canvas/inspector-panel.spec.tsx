import { fireEvent, render, screen } from '@testing-library/react';
import { chooseOption, optionNames } from '../../test/select.test-fixture';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { InspectorPanel } from './inspector-panel';

vi.mock('./custom-fields/custom-field-controls', () => ({
  CUSTOM_FIELD_CONTROLS: {
    media: ({ onChange }: { onChange: (value: unknown) => void }) => (
      <button onClick={() => onChange({ mediaId: 'm1', url: '/m1.jpg' })}>
        Scegli immagine
      </button>
    ),
    date: () => <input type="date" />,
  },
}));

describe('InspectorPanel', () => {
  it('renders nothing for a block with no fields (e.g. a pure layout container)', () => {
    const block: Block = { id: 'container-1', type: 'Container', props: {} };
    const descriptor: BlockDescriptor = {
      type: 'Container',
      label: 'Contenitore',
      category: 'layout',
      defaultProps: {},
      fields: [],
    };
    const { container } = render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders a text input pre-filled with the current value, and reports changes', () => {
    const block: Block = {
      id: 'hero-1',
      type: 'Hero',
      props: { title: 'Old' },
    };
    const descriptor: BlockDescriptor = {
      type: 'Hero',
      label: 'Hero',
      category: 'content',
      defaultProps: { title: '' },
      fields: [{ kind: 'text', key: 'title', label: 'Titolo' }],
    };
    const onChangeProp = vi.fn();
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={onChangeProp}
        onChangeVariant={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue('Old');
    fireEvent.change(input, { target: { value: 'New' } });

    expect(onChangeProp).toHaveBeenCalledWith('title', 'New');
  });

  it('renders a boolean field as a checkbox', () => {
    const block: Block = {
      id: 'plan-1',
      type: 'PricingPlan',
      props: { highlighted: false },
    };
    const descriptor: BlockDescriptor = {
      type: 'PricingPlan',
      label: 'Piano prezzo',
      category: 'socialProof',
      defaultProps: { highlighted: false },
      fields: [{ kind: 'boolean', key: 'highlighted', label: 'In evidenza' }],
    };
    const onChangeProp = vi.fn();
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={onChangeProp}
        onChangeVariant={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(checkbox);

    expect(onChangeProp).toHaveBeenCalledWith('highlighted', true);
  });

  /*
   * `radio` and `select` used to fall through to the same `<select>`, so
   * a descriptor could say one and get the other. This checks the two are
   * now actually different controls — the point of the fix, and the thing
   * a test asserting "some element with these options" would keep passing
   * through.
   */
  it('renders a radio field as a radio group, one option at a time visible', () => {
    const block: Block = {
      id: 'columns-1',
      type: 'Columns',
      props: { layout: 'two-equal' },
    };
    const descriptor: BlockDescriptor = {
      type: 'Columns',
      label: 'Colonne',
      category: 'layout',
      defaultProps: { layout: 'two-equal' },
      fields: [
        {
          kind: 'radio',
          key: 'layout',
          label: 'Layout',
          options: [
            { label: '2 uguali', value: 'two-equal' },
            { label: '3 uguali', value: 'three-equal' },
          ],
        },
      ],
    };
    const onChangeProp = vi.fn();
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={onChangeProp}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.getByRole('radiogroup')).toBeTruthy();
    const options = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(options).toHaveLength(2);
    expect(options[0].checked).toBe(true);

    fireEvent.click(options[1]);
    expect(onChangeProp).toHaveBeenCalledWith('layout', 'three-equal');
  });

  it('renders a select field as a dropdown', () => {
    const block: Block = {
      id: 'columns-1',
      type: 'Columns',
      props: { layout: 'two-equal' },
    };
    const descriptor: BlockDescriptor = {
      type: 'Columns',
      label: 'Colonne',
      category: 'layout',
      defaultProps: { layout: 'two-equal' },
      fields: [
        {
          kind: 'select',
          key: 'layout',
          label: 'Layout',
          options: [
            { label: '2 uguali', value: 'two-equal' },
            { label: '3 uguali', value: 'three-equal' },
          ],
        },
      ],
    };
    const onChangeProp = vi.fn();
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={onChangeProp}
        onChangeVariant={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Layout' });
    expect(select.textContent).toContain('2 uguali');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    chooseOption(select, '3 uguali');

    expect(onChangeProp).toHaveBeenCalledWith('layout', 'three-equal');
  });

  // A custom field names its control; the map in custom-field-controls.tsx
  // turns that name into a component. Mocked here so this stays a test of
  // the INDIRECTION — that the right control is picked and its onChange
  // reaches the right prop — rather than of the media picker's own UI,
  // which has its own spec.
  it('renders the control a custom field names, and wires its onChange', () => {
    const block: Block = { id: 'img-1', type: 'Image', props: { media: null } };
    const descriptor: BlockDescriptor = {
      type: 'Image',
      label: 'Immagine',
      category: 'content',
      defaultProps: { media: null },
      fields: [
        { kind: 'custom', key: 'media', label: 'Immagine', control: 'media' },
      ],
    };
    const onChangeProp = vi.fn();
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={onChangeProp}
        onChangeVariant={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Scegli immagine'));

    expect(onChangeProp).toHaveBeenCalledWith('media', {
      mediaId: 'm1',
      url: '/m1.jpg',
    });
  });

  it('shows a required-field warning for an empty required text field', () => {
    const block: Block = {
      id: 'img-1',
      type: 'Image',
      props: { alt: '', isDecorative: false },
    };
    const descriptor: BlockDescriptor = {
      type: 'Image',
      label: 'Immagine',
      category: 'content',
      defaultProps: { alt: '', isDecorative: false },
      fields: [
        {
          kind: 'text',
          key: 'alt',
          label: 'Testo alternativo',
          required: true,
          requiredUnless: 'isDecorative',
        },
      ],
    };
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.getByText('Campo obbligatorio')).toBeTruthy();
  });

  it('does not warn once the required field has a value', () => {
    const block: Block = {
      id: 'img-1',
      type: 'Image',
      props: { alt: 'Un gatto', isDecorative: false },
    };
    const descriptor: BlockDescriptor = {
      type: 'Image',
      label: 'Immagine',
      category: 'content',
      defaultProps: { alt: '', isDecorative: false },
      fields: [
        {
          kind: 'text',
          key: 'alt',
          label: 'Testo alternativo',
          required: true,
          requiredUnless: 'isDecorative',
        },
      ],
    };
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.queryByText('Campo obbligatorio')).toBeNull();
  });

  it("does not warn when requiredUnless's sibling prop is true (deliberately decorative)", () => {
    const block: Block = {
      id: 'img-1',
      type: 'Image',
      props: { alt: '', isDecorative: true },
    };
    const descriptor: BlockDescriptor = {
      type: 'Image',
      label: 'Immagine',
      category: 'content',
      defaultProps: { alt: '', isDecorative: false },
      fields: [
        {
          kind: 'text',
          key: 'alt',
          label: 'Testo alternativo',
          required: true,
          requiredUnless: 'isDecorative',
        },
      ],
    };
    render(
      <InspectorPanel
        block={block}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.queryByText('Campo obbligatorio')).toBeNull();
  });
});

describe('InspectorPanel required-field nudge with a fallback', () => {
  const descriptor: BlockDescriptor = {
    type: 'Image',
    label: 'Immagine',
    category: 'content',
    defaultProps: { media: null, alt: '', isDecorative: false },
    fields: [
      {
        kind: 'text',
        key: 'alt',
        label: 'Testo alternativo',
        required: true,
        requiredUnless: 'isDecorative',
        fallbackFrom: 'media.alt',
      },
    ],
  };
  const picked = (alt?: string) => ({
    mediaId: 'm1',
    url: '/uploads/a.webp',
    ...(alt === undefined ? {} : { alt }),
  });
  const renderWith = (props: Record<string, unknown>) =>
    render(
      <InspectorPanel
        block={{ id: 'img-1', type: 'Image', props }}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

  it('does not warn about an empty alternative text while the file has one to say', () => {
    renderWith({ media: picked('Una moka'), alt: '', isDecorative: false });

    expect(screen.queryByText('Campo obbligatorio')).toBeNull();
  });

  it('still warns when the file has none, or none was ever recorded, or no file is picked', () => {
    for (const props of [
      { media: picked(''), alt: '', isDecorative: false },
      { media: picked(), alt: '', isDecorative: false },
      { media: picked('   '), alt: '', isDecorative: false },
      { media: null, alt: '', isDecorative: false },
      { alt: '', isDecorative: false },
    ]) {
      const { unmount } = renderWith(props);
      expect(screen.getByText('Campo obbligatorio')).toBeTruthy();
      unmount();
    }
  });
});

describe('InspectorPanel variant picker', () => {
  const buttonDescriptor: BlockDescriptor = {
    type: 'Button',
    label: 'Bottone',
    category: 'conversion',
    defaultProps: { label: '' },
    fields: [{ kind: 'text', key: 'label', label: 'Testo' }],
    variants: [{ value: 'secondary', label: 'Secondario' }],
  };

  it('offers the type default plus every declared variant', () => {
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props: { label: '' } }}
        descriptor={buttonDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(
      optionNames(screen.getByRole('combobox', { name: 'Aspetto' })),
    ).toEqual(['Predefinito', 'Secondario']);
  });

  it('shows the variant the block is already wearing', () => {
    render(
      <InspectorPanel
        block={{
          id: 'b1',
          type: 'Button',
          props: { label: '' },
          variant: 'secondary',
        }}
        descriptor={buttonDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Aspetto' }).textContent).toBe(
      'Secondario',
    );
  });

  it('reports a chosen variant', () => {
    const onChangeVariant = vi.fn();
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props: { label: '' } }}
        descriptor={buttonDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={onChangeVariant}
      />,
    );

    chooseOption(
      screen.getByRole('combobox', { name: 'Aspetto' }),
      'Secondario',
    );

    expect(onChangeVariant).toHaveBeenCalledWith('secondary');
  });

  /**
   * The type's own look has no variant of its own, so going back to it
   * has to CLEAR the field rather than store the word "default" — which
   * would then be a variant name, and one no descriptor declares.
   */
  it('clears the field when the type default is chosen again', () => {
    const onChangeVariant = vi.fn();
    render(
      <InspectorPanel
        block={{
          id: 'b1',
          type: 'Button',
          props: { label: '' },
          variant: 'secondary',
        }}
        descriptor={buttonDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={onChangeVariant}
      />,
    );

    chooseOption(
      screen.getByRole('combobox', { name: 'Aspetto' }),
      'Predefinito',
    );

    expect(onChangeVariant).toHaveBeenCalledWith(undefined);
  });

  // A type with variants and no fields still has one thing to show.
  it('renders for a type that has variants and no fields at all', () => {
    const { container } = render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Divider', props: {} }}
        descriptor={{
          type: 'Divider',
          label: 'Separatore',
          category: 'layout',
          defaultProps: {},
          fields: [],
          variants: [{ value: 'thick', label: 'Spesso' }],
        }}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(container.innerHTML).not.toBe('');
  });
});

describe('InspectorPanel conditional fields', () => {
  const imageDescriptor: BlockDescriptor = {
    type: 'Image',
    label: 'Immagine',
    category: 'content',
    defaultProps: { alt: '', isDecorative: false, linkType: 'none', url: '' },
    fields: [
      {
        kind: 'text',
        key: 'alt',
        label: 'Testo alternativo',
        required: true,
        requiredUnless: 'isDecorative',
        showWhen: { field: 'isDecorative', equals: false },
      },
      { kind: 'boolean', key: 'isDecorative', label: 'Decorativa' },
      {
        kind: 'text',
        key: 'url',
        label: 'URL',
        showWhen: { field: 'linkType', equals: 'url' },
      },
    ],
  };

  function renderImage(props: Record<string, unknown>) {
    render(
      <InspectorPanel
        block={{ id: 'img-1', type: 'Image', props }}
        descriptor={imageDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );
  }

  it('draws a field whose condition is met', () => {
    renderImage({ isDecorative: false, linkType: 'url' });

    // The label carries the required marker, so it is matched loosely.
    expect(screen.getByLabelText(/Testo alternativo/)).toBeTruthy();
    expect(screen.getByLabelText('URL')).toBeTruthy();
  });

  it('leaves out a field whose condition is not met', () => {
    renderImage({ isDecorative: true, linkType: 'page' });

    expect(screen.queryByLabelText(/Testo alternativo/)).toBeNull();
    expect(screen.queryByLabelText('URL')).toBeNull();
    // The field that DECIDES is of course still there — hiding it would
    // lock the block in whichever state it happens to be in.
    expect(screen.getByLabelText('Decorativa')).toBeTruthy();
  });

  /*
   * A hidden field must not nag either. The warning is drawn per field,
   * so leaving it behind would put "Campo obbligatorio" under a label
   * that is not on screen — a complaint about an input the person cannot
   * even see, let alone fill in.
   *
   * Deliberately NOT the alt/isDecorative pair: `requiredUnless` already
   * silences that one, so the test would pass with conditional
   * visibility removed entirely. This is a required field that is empty,
   * un-waived, and simply not being asked for right now.
   */
  it('does not warn about a required field it is not showing', () => {
    render(
      <InspectorPanel
        block={{ id: 'link-1', type: 'Link', props: { linkType: 'page' } }}
        descriptor={{
          type: 'Link',
          label: 'Link',
          category: 'content',
          defaultProps: { linkType: 'page', url: '' },
          fields: [
            {
              kind: 'text',
              key: 'url',
              label: 'URL',
              required: true,
              showWhen: { field: 'linkType', equals: 'url' },
            },
          ],
        }}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.queryByText('Campo obbligatorio')).toBeNull();
  });
});

describe('InspectorPanel field groups', () => {
  const descriptor: BlockDescriptor = {
    type: 'Button',
    label: 'Bottone',
    category: 'conversion',
    defaultProps: {},
    fields: [
      { kind: 'text', key: 'label', label: 'Testo' },
      {
        kind: 'boolean',
        key: 'fullWidth',
        label: 'Larghezza piena',
        group: 'style',
      },
      {
        kind: 'boolean',
        key: 'openInNewTab',
        label: 'Nuova scheda',
        group: 'advanced',
      },
    ],
  };

  it('files each field under the group it declares, content by default', () => {
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props: {} }}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    const groupOf = (label: string) =>
      screen.getByLabelText(label).closest('details')?.querySelector('summary')
        ?.textContent;

    expect(groupOf('Testo')).toBe('Contenuto');
    expect(groupOf('Larghezza piena')).toBe('Stile');
    expect(groupOf('Nuova scheda')).toBe('Avanzate');
  });

  /*
   * Open/closed is the whole point of the split: content and style are
   * what people came for, "advanced" is what they should be able to
   * ignore. `<details open>` is what decides it, and a group that opens
   * closed is still fully rendered — so this asserts the attribute, not
   * the presence of the field.
   */
  it('opens content and style, and leaves advanced folded away', () => {
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props: {} }}
        descriptor={descriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    const openOf = (label: string) =>
      screen.getByLabelText(label).closest('details')?.hasAttribute('open');

    expect(openOf('Testo')).toBe(true);
    expect(openOf('Larghezza piena')).toBe(true);
    expect(openOf('Nuova scheda')).toBe(false);
  });

  it('draws no heading for a group with nothing in it', () => {
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props: {} }}
        descriptor={{ ...descriptor, fields: [descriptor.fields[0]] }}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.getByText('Contenuto')).toBeTruthy();
    expect(screen.queryByText('Stile')).toBeNull();
    expect(screen.queryByText('Avanzate')).toBeNull();
  });

  // The merge this whole change is for (ADR-0062): the per-instance
  // style controls were a second popover behind a second button, and are
  // now one group of this panel.
  it('places the instance style controls in the Style group', () => {
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props: {} }}
        descriptor={{ ...descriptor, fields: [descriptor.fields[0]] }}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
        instanceStyleFields={<button>Raggio angoli</button>}
      />,
    );

    expect(
      screen
        .getByText('Raggio angoli')
        .closest('details')
        ?.querySelector('summary')?.textContent,
    ).toBe('Stile');
  });

  it('shows the panel for a block whose only control is its style', () => {
    const { container } = render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Spacer', props: {} }}
        descriptor={{
          type: 'Spacer',
          label: 'Spaziatore',
          category: 'layout',
          defaultProps: {},
          fields: [],
        }}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
        instanceStyleFields={<button>Raggio angoli</button>}
      />,
    );

    expect(container.innerHTML).not.toBe('');
    expect(screen.getByText('Raggio angoli')).toBeTruthy();
  });
});

describe('InspectorPanel required fields beyond text', () => {
  const linkDescriptor: BlockDescriptor = {
    type: 'Button',
    label: 'Bottone',
    category: 'conversion',
    defaultProps: { linkType: 'page', page: null, url: '' },
    fields: [
      {
        kind: 'custom',
        key: 'page',
        label: 'Pagina',
        control: 'media',
        required: true,
        showWhen: { field: 'linkType', equals: 'page' },
      },
    ],
  };

  function renderButton(props: Record<string, unknown>) {
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Button', props }}
        descriptor={linkDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );
  }

  /*
   * The nudge exists because of what the renderer now does (ADR-0063):
   * a block that says "Site page" and has none picked is not a link at
   * all. Before this, the only symptom was a button that quietly did
   * nothing when clicked.
   */
  it('warns when a required picker has nothing picked', () => {
    renderButton({ linkType: 'page', page: null });

    expect(screen.getByText('Campo obbligatorio')).toBeTruthy();
  });

  it('warns for a required date that is still the empty string', () => {
    render(
      <InspectorPanel
        block={{ id: 'e1', type: 'EventItem', props: { startDate: '' } }}
        descriptor={{
          type: 'EventItem',
          label: 'Evento',
          category: 'localBusiness',
          defaultProps: { startDate: '' },
          fields: [
            {
              kind: 'custom',
              key: 'startDate',
              label: 'Data',
              control: 'date',
              required: true,
            },
          ],
        }}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
      />,
    );

    expect(screen.getByText('Campo obbligatorio')).toBeTruthy();
  });

  it('stops warning once something is picked', () => {
    renderButton({
      linkType: 'page',
      page: { pageGroupId: 'g1', title: 'Home' },
    });

    expect(screen.queryByText('Campo obbligatorio')).toBeNull();
  });

  it('marks the label as required whatever kind the field is', () => {
    renderButton({ linkType: 'page', page: null });

    expect(screen.getByText('*')).toBeTruthy();
  });
});

describe('InspectorPanel width', () => {
  const headingDescriptor: BlockDescriptor = {
    type: 'Heading',
    label: 'Titolo',
    category: 'content',
    defaultProps: { text: '' },
    fields: [{ kind: 'text', key: 'text', label: 'Testo' }],
  };

  function renderWidth(align?: 'wide' | 'full') {
    const onChangeAlign = vi.fn();
    render(
      <InspectorPanel
        block={{ id: 'b1', type: 'Heading', props: { text: '' }, align }}
        descriptor={headingDescriptor}
        onChangeProp={vi.fn()}
        onChangeVariant={vi.fn()}
        onChangeAlign={onChangeAlign}
      />,
    );
    return {
      onChangeAlign,
      field: screen.getByRole('combobox', { name: 'Larghezza' }),
    };
  }

  it("shows the block's width, and the content column when it has none", () => {
    expect(renderWidth().field.textContent).toBe('Contenuto');
  });

  it('reports a chosen width', () => {
    const { onChangeAlign, field } = renderWidth();

    chooseOption(field, 'Tutta la larghezza');

    expect(onChangeAlign).toHaveBeenCalledWith('full');
  });

  // The content column is the default, stored as the field's absence.
  it('clears the width when the content column is chosen again', () => {
    const { onChangeAlign, field } = renderWidth('wide');

    chooseOption(field, 'Contenuto');

    expect(onChangeAlign).toHaveBeenCalledWith(undefined);
  });
});
