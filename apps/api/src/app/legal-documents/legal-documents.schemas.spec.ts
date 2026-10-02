import { generateLegalDocumentsBodySchema } from './legal-documents.schemas';

const answers = {
  legalEntityName: 'Acme Srl',
  contactEmail: 'privacy@example.com',
  address: null,
  phone: null,
  vatId: null,
  domain: null,
  dataCollected: { contactForm: true, newsletter: false, accounts: false },
  thirdPartyServices: [],
  retentionDays: null,
  jurisdictionCountry: 'IT',
};

const body = (jurisdictionCountry: string) => ({
  documents: ['terms-conditions'],
  locales: ['it'],
  answers: { ...answers, jurisdictionCountry },
});

describe('generateLegalDocumentsBodySchema', () => {
  it('takes the jurisdiction as a country code', () => {
    expect(generateLegalDocumentsBodySchema.safeParse(body('IT')).success).toBe(
      true,
    );
  });

  it.each(['Italia', 'it', 'ZZ', ''])(
    'refuses %j: a name or a code that is not a country would be written into the document as it is',
    (value) => {
      const result = generateLegalDocumentsBodySchema.safeParse(body(value));

      expect(result.success).toBe(false);
    },
  );

  it('takes at most the number of third-party services the wizard lists', () => {
    const services = (count: number) =>
      Array.from({ length: count }, (_, i) => `Service ${i}`);
    const withServices = (count: number) => ({
      ...body('IT'),
      answers: { ...answers, thirdPartyServices: services(count) },
    });

    expect(
      generateLegalDocumentsBodySchema.safeParse(withServices(20)).success,
    ).toBe(true);
    expect(
      generateLegalDocumentsBodySchema.safeParse(withServices(21)).success,
    ).toBe(false);
  });
});
