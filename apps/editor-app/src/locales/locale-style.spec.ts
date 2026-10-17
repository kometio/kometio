import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * docs/adr/0140: the typography and the words the texts of the editor and of
 * the public site's own chrome have in common. A machine can say that an
 * apostrophe is the wrong one or that a word has a name now; whether a
 * sentence is good Italian stays a review.
 */
const REPOSITORY = join(import.meta.dirname, '..', '..', '..', '..');

type Language = 'it' | 'en';
type Text = { where: string; text: string };

function flatten(node: unknown, path: string[], found: Text[], file: string) {
  if (typeof node === 'string') {
    found.push({ where: `${file}: ${path.join('.')}`, text: node });
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, child] of Object.entries(node)) {
      flatten(child, [...path, key], found, file);
    }
  }
}

function read(file: string): unknown {
  return JSON.parse(readFileSync(join(REPOSITORY, file), 'utf8'));
}

/** Every text of a language, from the files that carry one language each and from those that carry both. */
function textsOf(language: Language): Text[] {
  const found: Text[] = [];
  const oneLanguage = [
    `apps/editor-app/src/locales/${language}.json`,
    `libs/theme-runtime/src/lib/locales/${language}.json`,
  ];
  for (const file of oneLanguage) flatten(read(file), [], found, file);
  const bothLanguages = [
    'themes/docs-showcase/locales.json',
    'themes/docs-showcase/blocks/StatusBadge.locales.json',
  ];
  for (const file of bothLanguages) {
    const byLanguage = read(file);
    if (typeof byLanguage === 'object' && byLanguage !== null) {
      flatten(Reflect.get(byLanguage, language), [], found, file);
    }
  }
  return found;
}

/** Code, not prose: what a person types or a browser reads, so its quotes and dots are the code's. */
const IS_CODE = /^<script>\.\.\.<\/script>$/;

const ruleSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  flags: z.string(),
});
type Rule = z.infer<typeof ruleSchema>;

const RULES = z
  .object({
    typography: z.array(ruleSchema),
    words: z.object({ it: z.array(ruleSchema), en: z.array(ruleSchema) }),
  })
  .parse(
    JSON.parse(
      readFileSync(
        join(REPOSITORY, 'tools', 'locale-style-rules.json'),
        'utf8',
      ),
    ),
  );

const compiled = (rules: Rule[]): [string, RegExp][] =>
  rules.map(({ name, pattern, flags }) => [name, new RegExp(pattern, flags)]);

describe.each<Language>(['it', 'en'])('the %s texts', (language) => {
  const texts = textsOf(language).filter(({ text }) => !IS_CODE.test(text));

  it('read the files', () => {
    expect(texts.length).toBeGreaterThan(100);
  });

  it.each(compiled([...RULES.typography, ...RULES.words[language]]))(
    'have no %s',
    (_, pattern) => {
      const offenders = texts
        .filter(({ text }) => pattern.test(text))
        .map(({ where, text }) => `${where} — ${text}`);

      expect(offenders).toEqual([]);
    },
  );
});
