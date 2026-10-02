import { describe, expect, it } from 'vitest';
import { buildLegalPageContent } from './build-legal-page-content';
import type { LegalDocumentOutline } from './legal-document-section';

const outline: LegalDocumentOutline = {
  title: 'Privacy Policy',
  sections: [
    { heading: 'Data controller', paragraphs: ['Para 1.'] },
    { heading: 'Data collected', paragraphs: ['Para 2a.', 'Para 2b.'] },
  ],
};

describe('buildLegalPageContent', () => {
  it('starts with a warning Callout carrying the draft notice', () => {
    const { content } = buildLegalPageContent(outline, 'DRAFT NOTICE');

    expect(content[0]).toMatchObject({
      type: 'Callout',
      props: { message: '<p>DRAFT NOTICE</p>', tone: 'warning' },
    });
  });

  it('emits one Heading (h2) followed by one Text per paragraph, per section, in order', () => {
    const { content } = buildLegalPageContent(outline, 'DRAFT NOTICE');

    expect(content.slice(1)).toMatchObject([
      { type: 'Heading', props: { text: 'Data controller', level: 'h2' } },
      { type: 'Text', props: { body: '<p>Para 1.</p>' } },
      { type: 'Heading', props: { text: 'Data collected', level: 'h2' } },
      { type: 'Text', props: { body: '<p>Para 2a.</p>' } },
      { type: 'Text', props: { body: '<p>Para 2b.</p>' } },
    ]);
  });

  it('gives every block a unique, stable id', () => {
    const { content } = buildLegalPageContent(outline, 'DRAFT NOTICE');

    const ids = content.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(
      true,
    );
  });

  describe('fieldValuesFor', () => {
    it('maps every other-locale heading/paragraph onto the SAME block ids as the base content', () => {
      const { content, fieldValuesFor } = buildLegalPageContent(
        outline,
        'DRAFT NOTICE (en)',
      );
      const otherOutline: LegalDocumentOutline = {
        title: 'Informativa sulla Privacy',
        sections: [
          { heading: 'Titolare del trattamento', paragraphs: ['Par 1 IT.'] },
          {
            heading: 'Dati raccolti',
            paragraphs: ['Par 2a IT.', 'Par 2b IT.'],
          },
        ],
      };

      const overlay = fieldValuesFor(otherOutline, 'AVVISO BOZZA (it)');

      expect(overlay).not.toBeNull();
      // content = [Callout, Heading, Text (section 1), Heading, Text, Text (section 2)]
      const calloutId = content[0].id as string;
      const headingIds = [content[1].id, content[3].id];
      const textIds = [content[2].id, content[4].id, content[5].id];

      expect(overlay?.[calloutId]).toEqual({
        message: '<p>AVVISO BOZZA (it)</p>',
      });
      expect(overlay?.[headingIds[0] as string]).toEqual({
        text: 'Titolare del trattamento',
      });
      expect(overlay?.[headingIds[1] as string]).toEqual({
        text: 'Dati raccolti',
      });
      expect(overlay?.[textIds[0] as string]).toEqual({
        body: '<p>Par 1 IT.</p>',
      });
      expect(overlay?.[textIds[1] as string]).toEqual({
        body: '<p>Par 2a IT.</p>',
      });
      expect(overlay?.[textIds[2] as string]).toEqual({
        body: '<p>Par 2b IT.</p>',
      });
    });

    it('returns null when the other outline has a different number of sections', () => {
      const { fieldValuesFor } = buildLegalPageContent(outline, 'DRAFT NOTICE');

      const mismatched: LegalDocumentOutline = {
        title: 'x',
        sections: [{ heading: 'Only one section', paragraphs: ['x'] }],
      };

      expect(fieldValuesFor(mismatched, 'x')).toBeNull();
    });

    it('returns null when a section has a different number of paragraphs', () => {
      const { fieldValuesFor } = buildLegalPageContent(outline, 'DRAFT NOTICE');

      const mismatched: LegalDocumentOutline = {
        title: 'x',
        sections: [
          { heading: 'Data controller', paragraphs: ['Para 1.'] },
          // Base has 2 paragraphs in its second section, this has 1.
          { heading: 'Data collected', paragraphs: ['Only one.'] },
        ],
      };

      expect(fieldValuesFor(mismatched, 'x')).toBeNull();
    });
  });

  // Generated clauses are prose, and these two fields are rich text
  // (ADR-0046). Left unescaped, a company name with an ampersand loses
  // the rest of its sentence the moment the page is rendered.
  it('escapes what a legal clause really contains', () => {
    const { content } = buildLegalPageContent(
      {
        title: 'Privacy Policy',
        sections: [
          { heading: 'Titolare', paragraphs: ['Rossi & Figli, a < b.'] },
        ],
      },
      'AVVISO',
    );

    expect(content[2].props['body']).toBe(
      '<p>Rossi &amp; Figli, a &lt; b.</p>',
    );
  });
});
