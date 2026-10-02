import { randomUUID } from 'node:crypto';
import { PageGroup, PageTranslation } from '@kometio/domain-core';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import {
  buildLegalPageContent,
  DRAFT_NOTICE_TEXT,
  LEGAL_DOCUMENT_DEFAULT_SLUGS,
  LEGAL_DOCUMENT_TEMPLATES,
  resolveTemplateLocale,
  type LegalDocumentAnswers,
  type LegalDocumentKind,
} from '../legal-documents';
import { findAvailableSlug } from './find-available-slug';
import { requireSite } from './require-site';

export type { LegalDocumentKind };

// baseSlug, then -2, -3, ... — same resolution loop as
// duplicate-page-group.use-case.ts's own `-copy`/`-copy-N`, different
// suffix shape (see findAvailableSlug's own doc comment).
function buildCandidateSlug(baseSlug: string, attempt: number): string {
  return attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
}

export interface GenerateLegalDocumentsDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
}

export interface GenerateLegalDocumentsInput {
  tenantId: string;
  siteId: string;
  documents: LegalDocumentKind[];
  locales: string[];
  answers: LegalDocumentAnswers;
  createdBy: string | null;
}

export interface GeneratedLegalDocumentTranslation {
  locale: string;
  translationId: string;
  slug: string;
}

export interface GeneratedLegalDocument {
  kind: LegalDocumentKind;
  pageGroupId: string;
  translations: GeneratedLegalDocumentTranslation[];
}

export interface GenerateLegalDocumentsResult {
  documents: GeneratedLegalDocument[];
}

/**
 * Orchestrates creating up to 3 legal-document page groups, each with one
 * draft PageTranslation per requested locale (docs/adr/0040) — sequential,
 * not transactional, the same accepted trade-off already documented on
 * duplicate-page-group.use-case.ts (the only other multi-repository-save
 * orchestration in this codebase; no unit-of-work port exists to wrap this
 * in one DB transaction). A partial failure midway leaves whatever was
 * already created as real drafts — never published, so nothing this
 * leaves behind reaches a visitor.
 *
 * i18n: shared structure + `fieldValues` overlay (ADR-0034), not diverged
 * content — every locale's template output has the identical
 * section/paragraph shape by construction, which is exactly what makes
 * the overlay valid (see build-legal-page-content.ts). This keeps full
 * version history on a legal document, unlike diverged content.
 */
export async function generateLegalDocuments(
  deps: GenerateLegalDocumentsDeps,
  input: GenerateLegalDocumentsInput,
): Promise<GenerateLegalDocumentsResult> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  // Every language before any page: a refused one halfway through would
  // leave the documents before it written and the rest not.
  for (const locale of input.locales) {
    site.assertLocaleEnabled(locale);
  }

  const documents: GeneratedLegalDocument[] = [];

  for (const kind of input.documents) {
    const template = LEGAL_DOCUMENT_TEMPLATES[kind];
    const defaultTemplateLocale = resolveTemplateLocale(site.defaultLocale);
    const defaultOutline = template[defaultTemplateLocale](input.answers);
    const built = buildLegalPageContent(
      defaultOutline,
      DRAFT_NOTICE_TEXT[defaultTemplateLocale],
    );

    const siblings = await deps.pageGroupRepository.listSiblings(
      input.tenantId,
      site.id,
      null,
    );
    const order = Math.max(-1, ...siblings.map((sibling) => sibling.order)) + 1;

    const group = PageGroup.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      siteId: site.id,
      parentId: null,
      content: built.content,
      order,
      createdBy: input.createdBy,
    });
    await deps.pageGroupRepository.addWithVersion(group, {
      id: randomUUID(),
      tenantId: group.tenantId,
      pageGroupId: group.id,
      content: group.content,
      createdBy: input.createdBy,
      createdAt: group.updatedAt,
    });

    const translations: GeneratedLegalDocumentTranslation[] = [];
    for (const locale of input.locales) {
      const templateLocale = resolveTemplateLocale(locale);
      const baseSlug = LEGAL_DOCUMENT_DEFAULT_SLUGS[kind][templateLocale];
      const slug = await findAvailableSlug(deps.pageTranslationRepository, {
        tenantId: input.tenantId,
        siteId: site.id,
        locale,
        parentGroupId: null,
        baseSlug,
        buildCandidate: buildCandidateSlug,
      });
      const outline = template[templateLocale](input.answers);

      const translation = PageTranslation.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        siteId: site.id,
        pageGroupId: group.id,
        locale,
        slug,
        seoMeta: { title: outline.title, description: '' },
        createdBy: input.createdBy,
      });
      await deps.pageTranslationRepository.add(translation, group.parentId);

      // The default locale's text already IS the group's own content — no
      // overlay needed. Every other requested locale gets one.
      if (locale !== site.defaultLocale) {
        const overlay = built.fieldValuesFor(
          outline,
          DRAFT_NOTICE_TEXT[templateLocale],
        );
        if (overlay) {
          translation.saveFieldValues(overlay, { by: input.createdBy });
          await deps.pageTranslationRepository.saveContent(
            translation,
            translation.toVersion(randomUUID()),
          );
        }
      }

      translations.push({ locale, translationId: translation.id, slug });
    }

    documents.push({ kind, pageGroupId: group.id, translations });
  }

  return { documents };
}
