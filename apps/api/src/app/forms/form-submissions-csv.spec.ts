import type { SubmissionOriginPage } from '@kometio/application';
import { Form, FormSubmission } from '@kometio/domain-core';
import { buildFormSubmissionsCsv } from './form-submissions-csv';

function form(fields: { id: string; label: string }[]): Form {
  return Form.fromProps({
    id: 'f1',
    tenantId: 't1',
    siteId: 's1',
    name: 'Contact',
    fields: fields.map((f) => ({
      id: f.id,
      type: 'text',
      label: f.label,
      required: false,
    })),
    notificationEmails: [],
    newsletterProvider: null,
    successMessage: '',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as unknown as Parameters<typeof Form.fromProps>[0]);
}

function submission(
  payload: Record<string, unknown>,
  at = '2026-03-04T10:00:00.000Z',
  pageId: string | null = null,
) {
  return FormSubmission.fromProps({
    id: 'sub',
    tenantId: 't1',
    siteId: 's1',
    pageId,
    formId: 'f1',
    payload,
    createdAt: new Date(at),
  });
}

const CONTACTS: SubmissionOriginPage = {
  id: 'pt-1',
  pageGroupId: 'pg-1',
  locale: 'it',
  title: 'Contatti',
};

describe('buildFormSubmissionsCsv', () => {
  it('writes a header from the form fields and a row per submission', () => {
    const csv = buildFormSubmissionsCsv(
      form([
        { id: 'a', label: 'Name' },
        { id: 'b', label: 'Email' },
      ]),
      [submission({ a: 'Mario', b: 'm@x.it' })],
      [],
    );

    expect(csv.split('\r\n')).toEqual([
      'Submitted at,Page,Name,Email',
      '2026-03-04T10:00:00.000Z,,Mario,m@x.it',
    ]);
  });

  it('keeps answers whose field was removed from the form', () => {
    // The reason the export exists is to have everything. Silently dropping
    // a real answer because the form changed afterwards is the one failure
    // that would make it untrustworthy.
    const csv = buildFormSubmissionsCsv(
      form([{ id: 'a', label: 'Name' }]),
      [submission({ a: 'Mario', company: 'Acme' })],
      [],
    );

    expect(csv).toContain('company (removed field)');
    expect(csv).toContain('Acme');
  });

  it('neutralizes a value that a spreadsheet would run as a formula', () => {
    // The payload is attacker-controlled by definition: anyone on the
    // internet can fill in a public form.
    const csv = buildFormSubmissionsCsv(
      form([{ id: 'a', label: 'Name' }]),
      [submission({ a: '=HYPERLINK("http://evil","click")' })],
      [],
    );

    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
  });

  it('quotes and escapes commas, quotes and newlines', () => {
    const csv = buildFormSubmissionsCsv(
      form([{ id: 'a', label: 'Message' }]),
      [submission({ a: 'Hello, "world"\nsecond line' })],
      [],
    );

    expect(csv).toContain('"Hello, ""world""\nsecond line"');
  });

  it('renders a file answer as filename and url, not [object Object]', () => {
    const csv = buildFormSubmissionsCsv(
      form([{ id: 'a', label: 'CV' }]),
      [submission({ a: { filename: 'cv.pdf', url: 'https://x/cv.pdf' } })],
      [],
    );

    expect(csv).toContain('cv.pdf (https://x/cv.pdf)');
    expect(csv).not.toContain('[object Object]');
  });

  it('renders booleans and blanks readably', () => {
    const csv = buildFormSubmissionsCsv(
      form([
        { id: 'a', label: 'Newsletter' },
        { id: 'b', label: 'Note' },
      ]),
      [submission({ a: true })],
      [],
    );

    expect(csv.split('\r\n')[1]).toBe('2026-03-04T10:00:00.000Z,,yes,');
  });

  it('writes just a header when there are no submissions', () => {
    expect(
      buildFormSubmissionsCsv(form([{ id: 'a', label: 'Name' }]), [], []),
    ).toBe('Submitted at,Page,Name');
  });

  it('names the page a submission was filled on', () => {
    const csv = buildFormSubmissionsCsv(
      form([{ id: 'a', label: 'Name' }]),
      [submission({ a: 'Mario' }, '2026-03-04T10:00:00.000Z', 'pt-1')],
      [CONTACTS],
    );

    expect(csv.split('\r\n')[1]).toBe(
      '2026-03-04T10:00:00.000Z,Contatti (it),Mario',
    );
  });

  it('leaves the page empty when the one it points at is gone', () => {
    // `page_id` is `on delete set null`, but a page deleted between the
    // read of the submissions and the read of the pages leaves an id
    // nothing answers for. The answers still have to export.
    const csv = buildFormSubmissionsCsv(
      form([{ id: 'a', label: 'Name' }]),
      [submission({ a: 'Mario' }, '2026-03-04T10:00:00.000Z', 'pt-gone')],
      [CONTACTS],
    );

    expect(csv.split('\r\n')[1]).toBe('2026-03-04T10:00:00.000Z,,Mario');
  });
});
