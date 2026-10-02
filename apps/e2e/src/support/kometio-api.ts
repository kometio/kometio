import type { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';
import {
  accountProfileSchema,
  formSchema,
  layoutSectionSchema,
  layoutSectionVersionSchema,
  mediaSchema,
  pageGroupSchema,
  pageTranslationSchema,
  siteSchema,
  taxonomySchema,
  termSchema,
  submissionSchema,
  type Block,
  type FormField,
} from './wire-schemas';

/**
 * The API as the suite uses it: to put a page or a form in place before a
 * test drives the editor, and to read back what the editor saved. Every
 * answer is parsed (wire-schemas.ts), so a test fails on a changed
 * contract where it happens, not three steps later on an `undefined`.
 */
export class KometioApi {
  constructor(private readonly request: APIRequestContext) {}

  async currentSite() {
    return siteSchema.parse(await this.json(this.request.get('sites/current')));
  }

  /** The language the signed-in person chose for the editor, or `null` while they have not: it then speaks English. */
  async accountLanguage() {
    return accountProfileSchema.parse(
      await this.json(this.request.get('account/profile')),
    ).language;
  }

  /** A page with its first language, as the editor's "New page" creates it. */
  async createPage(input: {
    siteId: string;
    locale: string;
    slug: string;
    title: string;
    content: Block[];
  }) {
    const group = pageGroupSchema.parse(
      await this.json(
        this.request.post('page-groups', {
          data: {
            siteId: input.siteId,
            content: input.content,
            translation: {
              locale: input.locale,
              slug: input.slug,
              seoMeta: { title: input.title, description: '' },
            },
          },
        }),
      ),
    );
    const [translation] = await this.pageTranslations(group.id);
    return { group, translation };
  }

  async pageGroup(id: string) {
    return pageGroupSchema.parse(
      await this.json(this.request.get(`page-groups/${id}`)),
    );
  }

  /** The page's shared structure, as the editor saves it — one version per call. */
  async savePageContent(groupId: string, content: Block[]) {
    return pageGroupSchema.parse(
      await this.json(
        this.request.patch(`page-groups/${groupId}/content`, {
          data: { content },
        }),
      ),
    );
  }

  async pageTranslations(groupId: string) {
    return z
      .array(pageTranslationSchema)
      .parse(
        await this.json(
          this.request.get(`page-groups/${groupId}/translations`),
        ),
      );
  }

  async publishTranslation(translationId: string): Promise<void> {
    await this.ok(
      this.request.post(`page-groups/translations/${translationId}/publish`),
    );
  }

  async deletePage(groupId: string): Promise<void> {
    await this.ok(this.request.delete(`page-groups/${groupId}`));
  }

  async createForm(siteId: string, name: string) {
    return formSchema.parse(
      await this.json(this.request.post('forms', { data: { siteId, name } })),
    );
  }

  async updateForm(
    id: string,
    body: { name: string; fields: FormField[]; notificationEmails: string[] },
  ) {
    return formSchema.parse(
      await this.json(
        this.request.patch(`forms/${id}`, { data: { ...body, steps: [] } }),
      ),
    );
  }

  async formSubmissions(formId: string) {
    return z
      .object({ items: z.array(submissionSchema) })
      .parse(await this.json(this.request.get(`forms/${formId}/submissions`)))
      .items;
  }

  async deleteForm(id: string): Promise<void> {
    await this.ok(this.request.delete(`forms/${id}`));
  }

  /** A file into the library, as the editor's upload does: the site it belongs to, and the file itself. */
  async uploadMedia(
    siteId: string,
    file: { name: string; mimeType: string; buffer: Buffer },
  ) {
    return mediaSchema.parse(
      await this.json(
        this.request.post('media', { multipart: { siteId, file } }),
      ),
    );
  }

  async deleteMedia(id: string): Promise<void> {
    await this.ok(this.request.delete(`media/${id}`));
  }

  /** A category of the site, named in one language. */
  async createTaxonomy(siteId: string, name: { locale: string; text: string }) {
    return taxonomySchema.parse(
      await this.json(
        this.request.post('taxonomies', {
          data: { siteId, name: { [name.locale]: name.text } },
        }),
      ),
    );
  }

  async createTerm(taxonomyId: string, name: { locale: string; text: string }) {
    return termSchema.parse(
      await this.json(
        this.request.post(`taxonomies/${taxonomyId}/terms`, {
          data: { name: { [name.locale]: name.text } },
        }),
      ),
    );
  }

  /** Takes its terms with it. */
  async deleteTaxonomy(id: string): Promise<void> {
    await this.ok(this.request.delete(`taxonomies/${id}`));
  }

  /** The site's header or footer in one language, created empty on first ask — as the editor does. */
  async layoutSection(
    siteId: string,
    locale: string,
    kind: 'header' | 'footer',
  ) {
    return layoutSectionSchema.parse(
      await this.json(
        this.request.get('site-layout-sections', {
          params: { siteId, locale, kind },
        }),
      ),
    );
  }

  async saveLayoutSectionDraft(id: string, content: Block[]) {
    return layoutSectionSchema.parse(
      await this.json(
        this.request.patch(`site-layout-sections/${id}/draft`, {
          data: { content },
        }),
      ),
    );
  }

  async layoutSectionVersions(id: string) {
    return z
      .array(layoutSectionVersionSchema)
      .parse(
        await this.json(
          this.request.get(`site-layout-sections/${id}/versions`),
        ),
      );
  }

  private async json(pending: Promise<APIResponse>): Promise<unknown> {
    return (await this.ok(pending)).json();
  }

  /** A refused request says what was refused and why, instead of a bare parse error on its body. */
  private async ok(pending: Promise<APIResponse>): Promise<APIResponse> {
    const response = await pending;
    if (!response.ok()) {
      throw new Error(
        `${response.status()} from ${response.url()}: ${await response.text()}`,
      );
    }
    return response;
  }
}
