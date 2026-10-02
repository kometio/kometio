import type { InterfaceLanguage } from '@kometio/shared-types';

/**
 * Table-based layout + inline styles — email clients largely ignore
 * `<style>` blocks and external CSS, so this is the one place in the
 * codebase where that's the correct choice, not a shortcut. Single accent
 * color (indigo): no visual identity exists yet elsewhere in the project
 * (apps/editor-app has no styling of its own before this), so this picks
 * something clean and neutral rather than guessing a brand.
 */

const ACCENT_COLOR = '#4f46e5';

/** The one line every email ends with: a record, so a language added to `INTERFACE_LANGUAGES` does not compile until it has one. */
const IGNORE_IF_NOT_YOURS: Record<InterfaceLanguage, string> = {
  it: 'Se non hai richiesto questa email, ignorala.',
  en: 'If you did not request this email, ignore it.',
};

export function ctaButtonHtml(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:${ACCENT_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;margin-top:8px;">${label}</a>`;
}

/** The only email body built from untrusted (visitor-submitted) input — every other template's content is server-controlled. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `lang` on the outer table: a screen reader reads the message in the language it is written in, not the reader's default. */
export function renderEmailLayout(
  language: InterfaceLanguage,
  bodyHtml: string,
): string {
  return `<table role="presentation" width="100%" lang="${language}" style="background:#f4f4f5;padding:32px 0;font-family:-apple-system,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" style="background:#ffffff;border-radius:8px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 24px;font-size:20px;color:#111827;">Kometio</h1>
        ${bodyHtml}
        <p style="margin-top:24px;color:#9ca3af;font-size:12px;">${IGNORE_IF_NOT_YOURS[language]}</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
