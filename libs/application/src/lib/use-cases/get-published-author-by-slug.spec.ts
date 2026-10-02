import { beforeEach, describe, expect, it } from 'vitest';
import { PageGroup, PageTranslation, User } from '@kometio/domain-core';
import {
  InMemoryMediaStorage,
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemorySiteLayoutSectionRepository,
  InMemorySiteRepository,
  InMemorySiteThemeBlockStylesRepository,
  InMemoryTaxonomyRepository,
  InMemoryUserRepository,
  buildSite,
} from '@kometio/testing';
import { getPublishedAuthorBySlug } from './get-published-author-by-slug.use-case';

const tenantId = 'tenant-1';
const domain = 'example.com';

describe('getPublishedAuthorBySlug', () => {
  let deps: ReturnType<typeof setup>;
  const siteId = 'site-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    return {
      siteRepository: new InMemorySiteRepository(),
      userRepository: new InMemoryUserRepository(),
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      pageGroupRepository: new InMemoryPageGroupRepository(
        pageGroupVersionRepository,
      ),
      pageTranslationRepository: new InMemoryPageTranslationRepository(
        pageTranslationVersionRepository,
      ),
      siteLayoutSectionRepository: new InMemorySiteLayoutSectionRepository(),
      siteThemeBlockStylesRepository:
        new InMemorySiteThemeBlockStylesRepository(),
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
      mediaStorage: new InMemoryMediaStorage(),
    };
  }

  beforeEach(async () => {
    deps = setup();
    const site = buildSite({
      tenantId,
      name: 'Sito',
      domain,
      enabledLocales: ['it', 'en'],
      searchEngineIndexingEnabled: true,
      createdAt: new Date(),
    });
    await deps.siteRepository.add(site);
  });

  async function seedAuthor(
    id: string,
    options: {
      displayName?: string | null;
      slug?: string | null;
      /** Somebody who has left the team: switched off from the start. */
      isActive?: boolean;
    } = {},
  ) {
    const user = User.create({
      id,
      tenantId,
      email: `${id}@example.test`,
      displayName:
        options.displayName === undefined
          ? 'Giulia Rossi'
          : (options.displayName ?? ''),
      passwordHash: 'x',
      role: 'editor',
      isActive: options.isActive ?? true,
      slug: options.slug === undefined ? 'giulia-rossi' : options.slug,
    });
    if (options.displayName === null) user.changeDisplayName(null);
    user.changeBio({
      it: 'Scrive di caffè a Bologna.',
      en: 'Writes about coffee.',
    });
    user.changeAvatar({ storageKey: 'giulia.webp', width: 400, height: 400 });
    await deps.userRepository.add(user);
    return user;
  }

  async function seedPage(options: {
    id: string;
    slug: string;
    title: string;
    createdBy: string | null;
    collectionId: string | null;
    locale?: string;
    publishedAt?: Date;
  }) {
    const locale = options.locale ?? 'it';
    let group = await deps.pageGroupRepository.findById(tenantId, options.id);
    if (!group) {
      group = PageGroup.create({
        id: options.id,
        tenantId,
        siteId,
        createdBy: options.createdBy,
        collectionId: options.collectionId,
      });
      await deps.pageGroupRepository.add(group);
    }
    const translation = PageTranslation.create({
      id: `${options.id}-${locale}`,
      tenantId,
      siteId,
      pageGroupId: group.id,
      locale,
      slug: options.slug,
      seoMeta: { title: options.title, description: '' },
      createdBy: options.createdBy,
    });
    translation.publish(
      [{ id: 'b', type: 'Text', props: { body: options.title } }],
      {
        by: options.createdBy,
        now: options.publishedAt,
      },
    );
    await deps.pageTranslationRepository.add(translation, null);
  }

  const ask = (slug: string, locale = 'it') =>
    getPublishedAuthorBySlug(deps, { tenantId, domain, locale, slug });

  it('draws the person and the articles they wrote, newest first', async () => {
    await seedAuthor('giulia');
    await seedPage({
      id: 'old',
      slug: 'vecchio',
      title: 'Vecchio',
      createdBy: 'giulia',
      collectionId: 'news',
      publishedAt: new Date('2026-01-01'),
    });
    await seedPage({
      id: 'new',
      slug: 'nuovo',
      title: 'Nuovo',
      createdBy: 'giulia',
      collectionId: 'news',
      publishedAt: new Date('2026-06-01'),
    });

    const { author } = await ask('giulia-rossi');

    expect(author?.author).toEqual({
      id: 'giulia',
      name: 'Giulia Rossi',
      bio: 'Scrive di caffè a Bologna.',
      avatar: {
        mediaId: 'avatar:giulia.webp',
        url: 'https://fake-storage.test/giulia.webp',
        width: 400,
        height: 400,
      },
      path: '/it/autore/giulia-rossi',
    });
    const [box, grid] = author?.content ?? [];
    expect(box?.type).toBe('AuthorBox');
    expect(box?.props['isProfilePage']).toBe(true);
    expect(grid?.type).toBe('PageGrid');
    expect(
      (grid?.props['items'] as { title: string }[]).map((item) => item.title),
    ).toEqual(['Nuovo', 'Vecchio']);
  });

  it('lists only their articles — not a page outside a collection, not someone else’s', async () => {
    await seedAuthor('giulia');
    await seedAuthor('mario', { displayName: 'Mario', slug: 'mario' });
    await seedPage({
      id: 'article',
      slug: 'articolo',
      title: 'Articolo',
      createdBy: 'giulia',
      collectionId: 'news',
    });
    await seedPage({
      id: 'privacy',
      slug: 'privacy',
      title: 'Privacy',
      createdBy: 'giulia',
      collectionId: null,
    });
    await seedPage({
      id: 'other',
      slug: 'altro',
      title: 'Di Mario',
      createdBy: 'mario',
      collectionId: 'news',
    });

    const { author } = await ask('giulia-rossi');

    const grid = author?.content.find((block) => block.type === 'PageGrid');
    expect(
      (grid?.props['items'] as { title: string }[]).map((item) => item.title),
    ).toEqual(['Articolo']);
  });

  it('has no page for someone who wrote no article, even with pages of their own', async () => {
    await seedAuthor('giulia');
    await seedPage({
      id: 'home',
      slug: 'home',
      title: 'Home',
      createdBy: 'giulia',
      collectionId: null,
    });

    expect(await ask('giulia-rossi')).toEqual({
      author: null,
      redirectTo: null,
    });
  });

  it('has no page for someone with no name, or in a language they have no article in', async () => {
    await seedAuthor('nameless', { displayName: null, slug: 'nameless' });
    await seedPage({
      id: 'a',
      slug: 'a',
      title: 'A',
      createdBy: 'nameless',
      collectionId: 'news',
    });
    expect((await ask('nameless')).author).toBeNull();

    await seedAuthor('giulia');
    await seedPage({
      id: 'b',
      slug: 'b',
      title: 'B',
      createdBy: 'giulia',
      collectionId: 'news',
    });
    expect((await ask('giulia-rossi', 'en')).author).toBeNull();
  });

  it('refuses a language the site does not publish', async () => {
    await seedAuthor('giulia');
    await seedPage({
      id: 'b',
      slug: 'b',
      title: 'B',
      createdBy: 'giulia',
      collectionId: 'news',
      locale: 'fr',
    });

    expect((await ask('giulia-rossi', 'fr')).author).toBeNull();
  });

  it('sends an address the person left on to the one they have now', async () => {
    const user = await seedAuthor('giulia', { slug: 'giulia' });
    user.changeSlug('giulia-rossi');
    await deps.userRepository.saveProfile(user);
    await seedPage({
      id: 'a',
      slug: 'a',
      title: 'A',
      createdBy: 'giulia',
      collectionId: 'news',
    });

    expect(await ask('giulia')).toEqual({
      author: null,
      redirectTo: '/it/autore/giulia-rossi',
    });
  });

  /*
   * A 301 to a 404 is worse than a 404, and it would tell anyone the new
   * address — usually their name — of someone with nothing published.
   */
  it('does not send an address on to someone who has no page there', async () => {
    const user = await seedAuthor('giulia', { slug: 'giulia' });
    user.changeSlug('giulia-rossi');
    await deps.userRepository.saveProfile(user);

    expect(await ask('giulia')).toEqual({ author: null, redirectTo: null });
  });

  it('has no page for someone who has left the team', async () => {
    await seedAuthor('giulia', { isActive: false });
    await seedPage({
      id: 'a',
      slug: 'a',
      title: 'A',
      createdBy: 'giulia',
      collectionId: 'news',
    });

    expect((await ask('giulia-rossi')).author).toBeNull();
  });

  /*
   * A page an editor put at `/it/autore/giulia-rossi` wins the address, as
   * a page always does; the person then has no page, rather than a byline
   * and a sitemap entry pointing at someone else's.
   */
  it('gives the address up to a page published there', async () => {
    await seedAuthor('giulia');
    await seedPage({
      id: 'a',
      slug: 'a',
      title: 'A',
      createdBy: 'giulia',
      collectionId: 'news',
    });
    await seedPage({
      id: 'autore',
      slug: 'autore',
      title: 'Autori',
      createdBy: null,
      collectionId: null,
    });
    const parent = await deps.pageGroupRepository.findById(tenantId, 'autore');
    const child = PageGroup.create({
      id: 'giulia-page',
      tenantId,
      siteId,
      createdBy: null,
      parentId: parent?.id ?? null,
    });
    await deps.pageGroupRepository.add(child);
    const translation = PageTranslation.create({
      id: 'giulia-page-it',
      tenantId,
      siteId,
      pageGroupId: child.id,
      locale: 'it',
      slug: 'giulia-rossi',
      seoMeta: { title: 'Una pagina', description: '' },
      createdBy: null,
    });
    translation.publish([], { by: null });
    await deps.pageTranslationRepository.add(translation, null);

    expect((await ask('giulia-rossi')).author).toBeNull();
  });

  it('is in the languages they wrote in, each under its own word', async () => {
    await seedAuthor('giulia');
    await seedPage({
      id: 'x',
      slug: 'articolo',
      title: 'Articolo',
      createdBy: 'giulia',
      collectionId: 'news',
      locale: 'it',
    });
    await seedPage({
      id: 'x',
      slug: 'article',
      title: 'Article',
      createdBy: 'giulia',
      collectionId: 'news',
      locale: 'en',
    });

    const { author } = await ask('giulia-rossi');

    expect(author?.translations).toEqual([
      { locale: 'it', slug: 'giulia-rossi', ancestorSlugs: ['autore'] },
      { locale: 'en', slug: 'giulia-rossi', ancestorSlugs: ['author'] },
    ]);
  });

  it('describes the page with the name, the bio and the picture', async () => {
    await seedAuthor('giulia');
    await seedPage({
      id: 'x',
      slug: 'a',
      title: 'A',
      createdBy: 'giulia',
      collectionId: 'news',
    });

    expect((await ask('giulia-rossi')).author?.seoMeta).toEqual({
      title: 'Giulia Rossi',
      description: 'Scrive di caffè a Bologna.',
      ogTags: { image: 'https://fake-storage.test/giulia.webp' },
    });
  });
});
