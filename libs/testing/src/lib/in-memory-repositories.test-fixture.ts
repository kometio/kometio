import type {
  Form,
  FormSubmission,
  Media,
  PageGroup,
  PageGroupVersion,
  PageTranslation,
  PageTranslationVersion,
  PreviewContentType,
  ReusableSection,
  ReusableSectionVersion,
  Site,
  SiteLayoutSection,
  SiteLayoutSectionKind,
  Collection,
  SiteLayoutSectionVersion,
  Taxonomy,
  Term,
} from '@kometio/domain-core';
import {
  classifyUpload,
  LastActiveAdminError,
  CollectionNotFoundError,
  FormNotFoundError,
  MediaNotFoundError,
  PageGroupNotFoundError,
  PageSlugAlreadyExistsError,
  PageTranslationNotFoundError,
  ReusableSectionNotFoundError,
  SiteLayoutSectionNotFoundError,
  SiteNotFoundError,
  TaxonomyNotFoundError,
  TermNotFoundError,
  UserEmailAlreadyExistsError,
  UserNotFoundError,
  SecretUnreadableError,
  User,
  hasUnpublishedChanges,
  safeDownloadName,
} from '@kometio/domain-core';
import {
  fileUrlsOf,
  mediaKindOfMime,
  type Block,
  type FieldValueOverlay,
  type MediaKind,
  type PageContent,
  type ResponsiveBlockStyle,
} from '@kometio/shared-types';
import type {
  CollectionRepositoryPort,
  ContentSanitizerPort,
  FormRepositoryPort,
  FormSubmissionRepositoryPort,
  MediaRepositoryPort,
  MediaUsagePort,
  MediaUsageRows,
  MediaStoragePort,
  PaginatedResult,
  Pagination,
  PageGroupListFilters,
  PageGroupListItem,
  PageGroupListSort,
  PageGroupRepositoryPort,
  TaxonomyRepositoryPort,
  PageGroupSummary,
  PageGroupVersionRepositoryPort,
  PageSearchResult,
  PageTranslationRepositoryPort,
  PageTranslationVersionRepositoryPort,
  PreviewToken,
  PreviewTokenPort,
  ReusableSectionRepositoryPort,
  ReusableSectionVersionRepositoryPort,
  SearchPort,
  SiteLayoutSectionRepositoryPort,
  SiteLayoutSectionVersionRepositoryPort,
  SecretCipherPort,
  SiteAiSettingsRepositoryPort,
  SiteRepositoryPort,
  SiteThemeBlockStylesPort,
  StoredSiteAiSettings,
  AvailableTheme,
  ThemeCatalogPort,
  UploadMediaInput,
  UploadMediaResult,
  UserRepositoryPort,
} from '@kometio/ports';

/*
 * The two rules every fake below keeps, as the real repositories do (M1 of
 * the 2026-09-29 audit): adding refuses an id already there, and saving
 * refuses one that is not — so a use case that creates with `save`, or
 * saves after a delete, fails here the way it would in production.
 */
function addNew<T extends { id: string }>(
  store: Map<string, T>,
  entity: T,
  what: string,
): void {
  if (store.has(entity.id)) {
    throw new Error(
      `${what} ${entity.id} already exists: add it once, save it after`,
    );
  }
  store.set(entity.id, entity);
}

function saveExisting<T extends { id: string; tenantId: string }>(
  store: Map<string, T>,
  entity: T,
  notFound: (id: string) => Error,
): void {
  const current = store.get(entity.id);
  if (!current || current.tenantId !== entity.tenantId) {
    throw notFound(entity.id);
  }
  store.set(entity.id, entity);
}

export class InMemoryCollectionRepository implements CollectionRepositoryPort {
  private collections = new Map<string, Collection>();

  /** Starts with these collections, for a spec whose pages are filed in one. */
  constructor(...collections: Collection[]) {
    for (const collection of collections) {
      addNew(this.collections, collection, 'Collection');
    }
  }

  async add(collection: Collection): Promise<void> {
    addNew(this.collections, collection, 'Collection');
  }

  async save(collection: Collection): Promise<void> {
    saveExisting(
      this.collections,
      collection,
      (id) => new CollectionNotFoundError(id),
    );
  }

  async findById(tenantId: string, id: string): Promise<Collection | null> {
    const found = this.collections.get(id);
    return found && found.tenantId === tenantId ? found : null;
  }

  async listBySite(tenantId: string, siteId: string): Promise<Collection[]> {
    return [...this.collections.values()]
      .filter(
        (collection) =>
          collection.tenantId === tenantId && collection.siteId === siteId,
      )
      .sort((a, b) => a.order - b.order);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const found = this.collections.get(id);
    if (found && found.tenantId === tenantId) this.collections.delete(id);
  }
}

export class InMemoryPageGroupRepository implements PageGroupRepositoryPort {
  private groups = new Map<string, PageGroup>();

  // Same reasoning as InMemoryPageRepository's own comment: both
  // repositories are shared collaborators, not a second internal store.
  // `translationRepository` is only needed for listBySiteFiltered (Fase 4)
  // — every other method predates it and doesn't touch translations at
  // all, hence it staying optional here too.
  constructor(
    private readonly versionRepository?: PageGroupVersionRepositoryPort,
    private readonly translationRepository?: PageTranslationRepositoryPort,
  ) {}

  /** Seeds a page directly, as a test's own fixture: no version, no language. */
  async add(group: PageGroup): Promise<void> {
    if (this.groups.has(group.id)) {
      throw new Error(
        `InMemoryPageGroupRepository: ${group.id} already exists`,
      );
    }
    this.groups.set(group.id, group);
  }

  async addWithVersion(
    group: PageGroup,
    version: PageGroupVersion,
  ): Promise<void> {
    await this.add(group);
    await this.versionRepository?.save(version);
  }

  /** All or nothing, as the real adapter's transaction: the address is refused before anything is stored. */
  async addWithTranslation(
    group: PageGroup,
    version: PageGroupVersion,
    translation: PageTranslation,
  ): Promise<void> {
    const translations = this.requireTranslations(
      'add a page with its language',
    );
    const taken = await translations.findByParentGroupAndLocaleSlug(
      group.tenantId,
      group.siteId,
      translation.locale,
      group.parentId,
      translation.slug,
    );
    if (taken) {
      throw new PageSlugAlreadyExistsError(translation.slug);
    }
    await this.addWithVersion(group, version);
    await translations.add(translation, group.parentId);
  }

  async saveContent(
    group: PageGroup,
    version: PageGroupVersion,
  ): Promise<void> {
    this.replace(group);
    await this.versionRepository?.save(version);
  }

  async move(group: PageGroup, translations: PageTranslation[]): Promise<void> {
    const repository = this.requireTranslations('move a page');
    for (const translation of translations) {
      const taken = await repository.findByParentGroupAndLocaleSlug(
        group.tenantId,
        group.siteId,
        translation.locale,
        group.parentId,
        translation.slug,
      );
      if (taken && taken.id !== translation.id) {
        throw new PageSlugAlreadyExistsError(translation.slug);
      }
    }
    this.replace(group);
    for (const translation of translations) {
      await repository.placeUnder(translation, group.parentId);
    }
  }

  async moveToCollection(group: PageGroup): Promise<void> {
    this.replace(group);
  }

  async reorderSiblings(input: {
    tenantId: string;
    siteId: string;
    parentId: string | null;
    orderedIds: readonly string[];
    by: string | null;
  }): Promise<void> {
    for (const [index, id] of input.orderedIds.entries()) {
      const group = this.groups.get(id);
      if (
        group &&
        group.tenantId === input.tenantId &&
        group.siteId === input.siteId &&
        group.parentId === input.parentId
      ) {
        group.reorder(index, { by: input.by });
      }
    }
  }

  /** As the real adapter: changing a page that is not there is an error, never a new page. */
  private replace(group: PageGroup): void {
    const current = this.groups.get(group.id);
    if (!current || current.tenantId !== group.tenantId) {
      throw new PageGroupNotFoundError(group.id);
    }
    this.groups.set(group.id, group);
  }

  private requireTranslations(
    doing: string,
  ): InMemoryPageTranslationRepository {
    if (
      !(this.translationRepository instanceof InMemoryPageTranslationRepository)
    ) {
      throw new Error(
        `InMemoryPageGroupRepository needs its InMemoryPageTranslationRepository to ${doing}`,
      );
    }
    return this.translationRepository;
  }

  async findById(
    tenantId: string,
    pageGroupId: string,
  ): Promise<PageGroup | null> {
    const group = this.groups.get(pageGroupId);
    return group && group.tenantId === tenantId ? group : null;
  }

  async countChildren(tenantId: string, pageGroupId: string): Promise<number> {
    return [...this.groups.values()].filter(
      (group) => group.tenantId === tenantId && group.parentId === pageGroupId,
    ).length;
  }

  async listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<PageGroupSummary>> {
    const matching = [...this.groups.values()].filter(
      (group) => group.tenantId === tenantId && group.siteId === siteId,
    );
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching
        .slice(start, start + pagination.pageSize)
        .map((group) => this.toSummary(group)),
      total: matching.length,
    };
  }

  async listBySiteFiltered(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
    filters: PageGroupListFilters,
    sort: PageGroupListSort = 'tree',
  ): Promise<PaginatedResult<PageGroupListItem>> {
    let matching = [...this.groups.values()].filter(
      (group) => group.tenantId === tenantId && group.siteId === siteId,
    );
    if (filters.createdAfter) {
      const after = filters.createdAfter;
      matching = matching.filter((group) => group.createdAt >= after);
    }
    if (filters.createdBefore) {
      const before = filters.createdBefore;
      matching = matching.filter((group) => group.createdAt <= before);
    }
    if (filters.createdBy) {
      matching = matching.filter(
        (group) => group.createdBy === filters.createdBy,
      );
    }
    if (filters.collectionId !== undefined) {
      matching = matching.filter(
        (group) => group.collectionId === filters.collectionId,
      );
    }
    if (filters.excludeSubtreeOf) {
      // The same walk the adapter does with a recursive CTE, over the
      // whole map rather than the filtered set — a descendant whose
      // ancestor was already filtered out still has to go.
      const excluded = new Set([filters.excludeSubtreeOf]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const group of this.groups.values()) {
          if (
            group.parentId &&
            excluded.has(group.parentId) &&
            !excluded.has(group.id)
          ) {
            excluded.add(group.id);
            grew = true;
          }
        }
      }
      matching = matching.filter((group) => !excluded.has(group.id));
    }
    if (sort === 'newest') {
      matching = [...matching].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }

    const translationsByGroup = new Map<string, PageTranslation[]>();
    for (const group of matching) {
      translationsByGroup.set(
        group.id,
        this.translationRepository
          ? await this.translationRepository.listByGroup(tenantId, group.id)
          : [],
      );
    }

    if (filters.search) {
      const needle = filters.search.toLowerCase();
      matching = matching.filter((group) =>
        (translationsByGroup.get(group.id) ?? []).some((translation) =>
          translation.seoMeta.title.toLowerCase().includes(needle),
        ),
      );
    }
    if (filters.locale) {
      matching = matching.filter((group) =>
        (translationsByGroup.get(group.id) ?? []).some(
          (translation) => translation.locale === filters.locale,
        ),
      );
    }

    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching.slice(start, start + pagination.pageSize).map((group) => {
        const translations = translationsByGroup.get(group.id) ?? [];
        const lastEdit = [group, ...translations].reduce((latest, entity) =>
          entity.updatedAt > latest.updatedAt ? entity : latest,
        );
        return {
          ...this.toSummary(group),
          collectionId: group.collectionId,
          createdByName: null,
          lastEditedAt: lastEdit.updatedAt,
          lastEditedByName: lastEdit.updatedBy,
          childCount: [...this.groups.values()].filter(
            (other) =>
              other.tenantId === group.tenantId && other.parentId === group.id,
          ).length,
          translations: translations.map((translation) => ({
            locale: translation.locale,
            slug: translation.slug,
            title: translation.seoMeta.title,
            status: translation.status,
            isDiverged: translation.isDiverged,
            hasUnpublishedChanges: hasUnpublishedChanges({
              status: translation.status,
              isDiverged: translation.isDiverged,
              contentUpdatedAt: translation.contentUpdatedAt,
              publishedAt: translation.publishedAt,
              groupContentUpdatedAt: group.contentUpdatedAt,
            }),
          })),
        };
      }),
      total: matching.length,
    };
  }

  private toSummary(group: PageGroup): PageGroupSummary {
    const props = group.toProps();
    return {
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      parentId: props.parentId,
      order: props.order,
      collectionId: props.collectionId,
      createdBy: props.createdBy,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }

  async listContentBySite(
    tenantId: string,
    siteId: string,
  ): Promise<{ id: string; content: PageContent }[]> {
    return [...this.groups.values()]
      .filter((group) => group.tenantId === tenantId && group.siteId === siteId)
      .map((group) => ({ id: group.id, content: group.content }));
  }

  async listSiblings(
    tenantId: string,
    siteId: string,
    parentId: string | null,
  ): Promise<PageGroupSummary[]> {
    return [...this.groups.values()]
      .filter(
        (group) =>
          group.tenantId === tenantId &&
          group.siteId === siteId &&
          group.parentId === parentId,
      )
      .map((group) => this.toSummary(group))
      .sort(
        (a, b) =>
          a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  async delete(tenantId: string, pageGroupId: string): Promise<void> {
    const group = this.groups.get(pageGroupId);
    if (group && group.tenantId === tenantId) {
      this.groups.delete(pageGroupId);
    }
  }
}

export class InMemoryPageGroupVersionRepository implements PageGroupVersionRepositoryPort {
  private versions: PageGroupVersion[] = [];

  async save(version: PageGroupVersion): Promise<void> {
    this.versions.push(version);
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<PageGroupVersion | null> {
    return (
      this.versions.find(
        (v) => v.tenantId === tenantId && v.id === versionId,
      ) ?? null
    );
  }

  async listByGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<PageGroupVersion[]> {
    return this.versions.filter(
      (v) => v.tenantId === tenantId && v.pageGroupId === pageGroupId,
    );
  }
}

export class InMemoryPageTranslationRepository implements PageTranslationRepositoryPort {
  private translations = new Map<string, PageTranslation>();
  // parentGroupId isn't stored on PageTranslation itself (see the port's
  // own doc comment) — the fake mirrors that by keeping it alongside the
  // entity instead of pretending it's a getter the entity has.
  private parentGroupIds = new Map<string, string | null>();

  constructor(
    private readonly versionRepository?: PageTranslationVersionRepositoryPort,
  ) {}

  async add(
    translation: PageTranslation,
    parentGroupId: string | null,
  ): Promise<void> {
    if (this.translations.has(translation.id)) {
      throw new Error(
        `InMemoryPageTranslationRepository: ${translation.id} already exists`,
      );
    }
    this.translations.set(translation.id, translation);
    this.parentGroupIds.set(translation.id, parentGroupId);
  }

  async saveContent(
    translation: PageTranslation,
    version: PageTranslationVersion,
  ): Promise<void> {
    this.replace(translation);
    await this.versionRepository?.save(version);
  }

  async publish(translation: PageTranslation): Promise<void> {
    this.replace(translation);
  }

  async saveSeoMeta(translation: PageTranslation): Promise<void> {
    this.replace(translation);
  }

  async rename(translation: PageTranslation): Promise<void> {
    this.replace(translation);
  }

  /** What `InMemoryPageGroupRepository.move` writes for each language, as the real adapter does in the page's transaction. */
  async placeUnder(
    translation: PageTranslation,
    parentGroupId: string | null,
  ): Promise<void> {
    this.replace(translation);
    this.parentGroupIds.set(translation.id, parentGroupId);
  }

  /** As the real adapter: changing a translation that is not there is an error, never a new one. */
  private replace(translation: PageTranslation): void {
    const current = this.translations.get(translation.id);
    if (!current || current.tenantId !== translation.tenantId) {
      throw new PageTranslationNotFoundError(translation.id);
    }
    this.translations.set(translation.id, translation);
  }

  async findById(
    tenantId: string,
    pageTranslationId: string,
  ): Promise<PageTranslation | null> {
    const translation = this.translations.get(pageTranslationId);
    return translation && translation.tenantId === tenantId
      ? translation
      : null;
  }

  async findByGroupAndLocale(
    tenantId: string,
    pageGroupId: string,
    locale: string,
  ): Promise<PageTranslation | null> {
    for (const translation of this.translations.values()) {
      if (
        translation.tenantId === tenantId &&
        translation.pageGroupId === pageGroupId &&
        translation.locale === locale
      ) {
        return translation;
      }
    }
    return null;
  }

  async listByGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<PageTranslation[]> {
    return [...this.translations.values()].filter(
      (translation) =>
        translation.tenantId === tenantId &&
        translation.pageGroupId === pageGroupId,
    );
  }

  async listPublishedBySite(
    tenantId: string,
    siteId: string,
  ): Promise<PageTranslation[]> {
    return [...this.translations.values()].filter(
      (translation) =>
        translation.tenantId === tenantId &&
        translation.siteId === siteId &&
        translation.status === 'published',
    );
  }

  async findByFormerSlug(
    tenantId: string,
    siteId: string,
    locale: string,
    parentGroupId: string | null,
    slug: string,
  ): Promise<PageTranslation | null> {
    for (const translation of this.translations.values()) {
      if (
        translation.tenantId === tenantId &&
        translation.siteId === siteId &&
        translation.locale === locale &&
        translation.formerSlugs.includes(slug) &&
        this.parentGroupIds.get(translation.id) === parentGroupId
      ) {
        return translation;
      }
    }
    return null;
  }

  async findByFormerParent(
    tenantId: string,
    siteId: string,
    locale: string,
    parentGroupId: string | null,
    slug: string,
  ): Promise<PageTranslation | null> {
    for (const translation of this.translations.values()) {
      if (
        translation.tenantId === tenantId &&
        translation.siteId === siteId &&
        translation.locale === locale &&
        translation.formerParents.some(
          (former) =>
            former.parentGroupId === parentGroupId && former.slug === slug,
        )
      ) {
        return translation;
      }
    }
    return null;
  }

  async findByParentGroupAndLocaleSlug(
    tenantId: string,
    siteId: string,
    locale: string,
    parentGroupId: string | null,
    slug: string,
  ): Promise<PageTranslation | null> {
    for (const translation of this.translations.values()) {
      if (
        translation.tenantId === tenantId &&
        translation.siteId === siteId &&
        translation.locale === locale &&
        translation.slug === slug &&
        this.parentGroupIds.get(translation.id) === parentGroupId
      ) {
        return translation;
      }
    }
    return null;
  }

  async delete(tenantId: string, pageTranslationId: string): Promise<void> {
    const translation = this.translations.get(pageTranslationId);
    if (translation && translation.tenantId === tenantId) {
      this.translations.delete(pageTranslationId);
      this.parentGroupIds.delete(pageTranslationId);
    }
  }
}

export class InMemoryPageTranslationVersionRepository implements PageTranslationVersionRepositoryPort {
  private versions: PageTranslationVersion[] = [];

  async save(version: PageTranslationVersion): Promise<void> {
    this.versions.push(version);
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<PageTranslationVersion | null> {
    return (
      this.versions.find(
        (v) => v.tenantId === tenantId && v.id === versionId,
      ) ?? null
    );
  }

  async listByTranslation(
    tenantId: string,
    pageTranslationId: string,
  ): Promise<PageTranslationVersion[]> {
    return this.versions.filter(
      (v) =>
        v.tenantId === tenantId && v.pageTranslationId === pageTranslationId,
    );
  }
}

/**
 * A user as a read hands it out: a copy, as a row read from Postgres is.
 * Handing out the stored object let a change a use case made and then had
 * refused — the last admin's demotion — show up in the store anyway.
 */
function copyOf(user: User): User {
  return User.fromProps(user.toProps());
}

export class InMemoryUserRepository implements UserRepositoryPort {
  private users = new Map<string, User>();
  private afterNextRead: { userId: string; run: () => Promise<void> } | null =
    null;

  /**
   * Makes `run` happen right after the next `findById` of `userId` has
   * handed its copy out: somebody else's write landing between a use case's
   * read and its write — the window a write that puts back every column as
   * it was read loses data in.
   */
  afterTheNextReadOf(userId: string, run: () => Promise<void>): void {
    this.afterNextRead = { userId, run };
  }

  async add(user: User): Promise<void> {
    addNew(this.users, user, 'User');
  }

  /** Only the profile's own fields, onto whatever the stored row holds now — like the real one. */
  async saveProfile(user: User): Promise<void> {
    const stored = this.users.get(user.id);
    if (!stored) return;
    const { displayName, slug, formerSlugs, bio } = user.toProps();
    this.users.set(
      user.id,
      User.fromProps({
        ...stored.toProps(),
        displayName,
        slug,
        formerSlugs,
        bio,
      }),
    );
  }

  /** Only how the person signs in, onto whatever the stored row holds now — and the email unique, like the real one. */
  async saveCredentials(user: User): Promise<void> {
    const stored = this.users.get(user.id);
    if (!stored) return;
    const { email, emailVerifiedAt, passwordHash } = user.toProps();
    const taken = [...this.users.values()].some(
      (other) =>
        other.id !== user.id &&
        other.tenantId === user.tenantId &&
        other.email.toLowerCase() === email.toLowerCase(),
    );
    if (taken) throw new UserEmailAlreadyExistsError(email);
    this.users.set(
      user.id,
      User.fromProps({
        ...stored.toProps(),
        email,
        emailVerifiedAt,
        passwordHash,
      }),
    );
  }

  /** Only the password and the accepted state, and only while the invitation is pending — like the real one. */
  async saveInviteAccepted(user: User): Promise<boolean> {
    const stored = this.users.get(user.id);
    if (!stored || stored.tenantId !== user.tenantId || !stored.invitePending) {
      return false;
    }
    this.users.set(
      user.id,
      User.fromProps({
        ...stored.toProps(),
        passwordHash: user.passwordHash,
        isActive: true,
        invitePending: false,
      }),
    );
    return true;
  }

  async saveLanguage(user: User): Promise<void> {
    const stored = this.users.get(user.id);
    if (!stored) return;
    this.users.set(
      user.id,
      User.fromProps({ ...stored.toProps(), language: user.language }),
    );
  }

  async saveAvatar(user: User): Promise<void> {
    const stored = this.users.get(user.id);
    if (!stored) return;
    this.users.set(
      user.id,
      User.fromProps({ ...stored.toProps(), avatar: user.avatar }),
    );
  }

  /** An admin switching `userId` off right after the next read of them (another active admin has to exist, or the real rule refuses it). */
  switchOffAfterTheNextReadOf(userId: string): void {
    this.afterTheNextReadOf(userId, async () => {
      const stored = this.users.get(userId);
      if (!stored) throw new Error(`No user ${userId} to switch off`);
      const switchedOff = copyOf(stored);
      switchedOff.deactivate();
      await this.saveAccess(switchedOff);
    });
  }

  async findById(tenantId: string, userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    const read = user && user.tenantId === tenantId ? copyOf(user) : null;
    if (this.afterNextRead?.userId === userId) {
      const { run } = this.afterNextRead;
      this.afterNextRead = null;
      await run();
    }
    return read;
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (
        user.tenantId === tenantId &&
        user.email.toLowerCase() === email.toLowerCase()
      ) {
        return copyOf(user);
      }
    }
    return null;
  }

  async findBySlug(tenantId: string, slug: string): Promise<User | null> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.tenantId === tenantId && candidate.slug === slug,
    );
    return user ? copyOf(user) : null;
  }

  async findByFormerSlug(tenantId: string, slug: string): Promise<User | null> {
    const user = [...this.users.values()].find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.formerSlugs.includes(slug),
    );
    return user ? copyOf(user) : null;
  }

  async isSlugTaken(
    tenantId: string,
    slug: string,
    exceptUserId: string | null,
  ): Promise<boolean> {
    return [...this.users.values()].some(
      (user) =>
        user.tenantId === tenantId &&
        user.id !== exceptUserId &&
        (user.slug === slug || user.formerSlugs.includes(slug)),
    );
  }

  async saveAccess(user: User): Promise<void> {
    const stored = this.users.get(user.id);
    if (!stored || stored.tenantId !== user.tenantId) {
      throw new UserNotFoundError(user.id);
    }
    const otherActiveAdmins = [...this.users.values()].filter(
      (other) =>
        other.id !== user.id &&
        other.tenantId === user.tenantId &&
        other.role === 'admin' &&
        other.isActive,
    ).length;
    const staysActiveAdmin = user.role === 'admin' && user.isActive;
    if (otherActiveAdmins === 0 && !staysActiveAdmin) {
      throw new LastActiveAdminError();
    }
    const { role, isActive } = user.toProps();
    this.users.set(
      user.id,
      User.fromProps({ ...stored.toProps(), role, isActive }),
    );
  }

  async removePendingInvite(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const stored = this.users.get(userId);
    if (!stored || stored.tenantId !== tenantId || !stored.invitePending) {
      return false;
    }
    this.users.delete(userId);
    return true;
  }

  async list(
    tenantId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<User>> {
    const matching = [...this.users.values()]
      .filter((user) => user.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching.slice(start, start + pagination.pageSize).map(copyOf),
      total: matching.length,
    };
  }
}

export class InMemorySiteRepository implements SiteRepositoryPort {
  private sites = new Map<string, Site>();

  /** Starts with these sites, for a spec whose pages need a site to live on. */
  constructor(...sites: Site[]) {
    for (const site of sites) {
      addNew(this.sites, site, 'Site');
    }
  }

  /** Seeds a site, as the first-run setup creates one; the port itself only ever saves an existing site. */
  async add(site: Site): Promise<void> {
    addNew(this.sites, site, 'Site');
  }

  async save(site: Site): Promise<void> {
    saveExisting(this.sites, site, (id) => new SiteNotFoundError(id));
  }

  async findByDomain(tenantId: string, domain: string): Promise<Site | null> {
    for (const site of this.sites.values()) {
      if (site.tenantId === tenantId && site.domain === domain) {
        return site;
      }
    }
    return null;
  }

  async findById(tenantId: string, id: string): Promise<Site | null> {
    const site = this.sites.get(id);
    return site && site.tenantId === tenantId ? site : null;
  }

  async listByTenant(tenantId: string): Promise<Site[]> {
    return [...this.sites.values()].filter(
      (site) => site.tenantId === tenantId,
    );
  }
}

export class InMemorySiteAiSettingsRepository implements SiteAiSettingsRepositoryPort {
  private settings = new Map<string, StoredSiteAiSettings>();

  private key(tenantId: string, siteId: string): string {
    return `${tenantId}:${siteId}`;
  }

  async get(
    tenantId: string,
    siteId: string,
  ): Promise<StoredSiteAiSettings | null> {
    return this.settings.get(this.key(tenantId, siteId)) ?? null;
  }

  async save(
    tenantId: string,
    siteId: string,
    settings: Omit<StoredSiteAiSettings, 'updatedAt'>,
  ): Promise<void> {
    this.settings.set(this.key(tenantId, siteId), {
      ...settings,
      updatedAt: new Date(),
    });
  }

  async delete(tenantId: string, siteId: string): Promise<void> {
    this.settings.delete(this.key(tenantId, siteId));
  }
}

/**
 * Reversible and obviously not encryption — the application only needs a
 * value that is not the secret and opens back to it. A value it did not
 * seal cannot be opened, as with the real cipher.
 */
export class FakeSecretCipher implements SecretCipherPort {
  seal(plaintext: string): string {
    return `sealed:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
  }

  open(sealed: string): string {
    if (!sealed.startsWith('sealed:')) throw new SecretUnreadableError();
    return Buffer.from(sealed.slice('sealed:'.length), 'base64').toString(
      'utf8',
    );
  }
}

/**
 * Leaves an overlay as it is — or answers `replacement`, to show a use case
 * keeps what the sanitiser returns. What the real one does is its own
 * spec's business; a use case only has to ask it, against the right tree,
 * which `asked` records.
 */
export class FakeContentSanitizer implements ContentSanitizerPort {
  /** The page trees it was asked to clean against, in order. */
  readonly asked: Block[][] = [];

  constructor(private readonly replacement?: FieldValueOverlay) {}

  sanitizeFieldValueOverlay(
    fieldValues: FieldValueOverlay,
    groupContent: Block[],
  ): FieldValueOverlay {
    this.asked.push(groupContent);
    return this.replacement ?? fieldValues;
  }
}

export class InMemoryThemeCatalog implements ThemeCatalogPort {
  constructor(
    private readonly themes: AvailableTheme[] = [
      { name: 'classic', uploaded: false },
    ],
  ) {}

  async listAvailableThemes(): Promise<AvailableTheme[]> {
    return this.themes;
  }
}

export class InMemorySiteThemeBlockStylesRepository implements SiteThemeBlockStylesPort {
  private styles = new Map<
    string,
    Record<string, Record<string, ResponsiveBlockStyle>>
  >();

  private key(tenantId: string, siteId: string): string {
    return `${tenantId}:${siteId}`;
  }

  async listBySite(
    tenantId: string,
    siteId: string,
  ): Promise<Record<string, Record<string, ResponsiveBlockStyle>>> {
    return { ...(this.styles.get(this.key(tenantId, siteId)) ?? {}) };
  }

  async upsert(
    tenantId: string,
    siteId: string,
    blockType: string,
    variant: string,
    style: ResponsiveBlockStyle,
  ): Promise<void> {
    const key = this.key(tenantId, siteId);
    const existing = this.styles.get(key) ?? {};
    this.styles.set(key, {
      ...existing,
      [blockType]: { ...existing[blockType], [variant]: style },
    });
  }
}

export class InMemorySiteLayoutSectionRepository implements SiteLayoutSectionRepositoryPort {
  private sections = new Map<string, SiteLayoutSection>();

  async add(section: SiteLayoutSection): Promise<void> {
    addNew(this.sections, section, 'SiteLayoutSection');
  }

  async save(section: SiteLayoutSection): Promise<void> {
    saveExisting(
      this.sections,
      section,
      (id) => new SiteLayoutSectionNotFoundError(id),
    );
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<SiteLayoutSection | null> {
    const section = this.sections.get(id);
    return section && section.tenantId === tenantId ? section : null;
  }

  async findBySiteLocaleKind(
    tenantId: string,
    siteId: string,
    locale: string,
    kind: SiteLayoutSectionKind,
  ): Promise<SiteLayoutSection | null> {
    for (const section of this.sections.values()) {
      if (
        section.tenantId === tenantId &&
        section.siteId === siteId &&
        section.locale === locale &&
        section.kind === kind
      ) {
        return section;
      }
    }
    return null;
  }
}

export class InMemorySiteLayoutSectionVersionRepository implements SiteLayoutSectionVersionRepositoryPort {
  private versions: SiteLayoutSectionVersion[] = [];

  async save(version: SiteLayoutSectionVersion): Promise<void> {
    this.versions.push(version);
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<SiteLayoutSectionVersion | null> {
    return (
      this.versions.find(
        (v) => v.tenantId === tenantId && v.id === versionId,
      ) ?? null
    );
  }

  async listBySection(
    tenantId: string,
    siteLayoutSectionId: string,
  ): Promise<SiteLayoutSectionVersion[]> {
    return this.versions.filter(
      (v) =>
        v.tenantId === tenantId &&
        v.siteLayoutSectionId === siteLayoutSectionId,
    );
  }
}

/** A usage port that answers with what it is given, and remembers what it was asked. */
export class FakeMediaUsagePort implements MediaUsagePort {
  readonly asked: { tenantId: string; siteId: string; mediaId: string }[] = [];

  constructor(
    private readonly rows: MediaUsageRows = {
      pages: [],
      sections: [],
      layout: [],
    },
  ) {}

  async findUsages(
    tenantId: string,
    siteId: string,
    mediaId: string,
  ): Promise<MediaUsageRows> {
    this.asked.push({ tenantId, siteId, mediaId });
    return this.rows;
  }
}

export class InMemoryMediaRepository implements MediaRepositoryPort {
  private media = new Map<string, Media>();

  async add(media: Media): Promise<void> {
    addNew(this.media, media, 'Media');
  }

  async save(media: Media): Promise<void> {
    saveExisting(this.media, media, (id) => new MediaNotFoundError(id));
  }

  async findById(tenantId: string, mediaId: string): Promise<Media | null> {
    const media = this.media.get(mediaId);
    return media && media.tenantId === tenantId ? media : null;
  }

  async listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<Media>> {
    const matching = [...this.media.values()]
      .filter((m) => m.tenantId === tenantId && m.siteId === siteId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching.slice(start, start + pagination.pageSize),
      total: matching.length,
    };
  }

  async countByKind(
    tenantId: string,
    siteId: string,
  ): Promise<Record<MediaKind, number>> {
    const counts: Record<MediaKind, number> = {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      other: 0,
    };
    for (const item of this.media.values()) {
      if (item.tenantId === tenantId && item.siteId === siteId) {
        counts[mediaKindOfMime(item.mimeType)] += 1;
      }
    }
    return counts;
  }

  async delete(tenantId: string, mediaId: string): Promise<void> {
    const media = this.media.get(mediaId);
    if (media && media.tenantId === tenantId) {
      this.media.delete(mediaId);
    }
  }
}

export class InMemoryFormRepository implements FormRepositoryPort {
  private forms = new Map<string, Form>();

  async add(form: Form): Promise<void> {
    addNew(this.forms, form, 'Form');
  }

  async save(form: Form): Promise<void> {
    saveExisting(this.forms, form, (id) => new FormNotFoundError(id));
  }

  async findById(tenantId: string, formId: string): Promise<Form | null> {
    const form = this.forms.get(formId);
    return form && form.tenantId === tenantId ? form : null;
  }

  async listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<Form>> {
    const matching = [...this.forms.values()]
      .filter((f) => f.tenantId === tenantId && f.siteId === siteId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching.slice(start, start + pagination.pageSize),
      total: matching.length,
    };
  }

  async delete(tenantId: string, formId: string): Promise<void> {
    const form = this.forms.get(formId);
    if (form && form.tenantId === tenantId) {
      this.forms.delete(formId);
    }
  }
}

export class InMemoryFormSubmissionRepository implements FormSubmissionRepositoryPort {
  readonly submissions: FormSubmission[] = [];

  async save(submission: FormSubmission): Promise<void> {
    this.submissions.push(submission);
  }

  async countOlderThan(
    tenantId: string,
    siteId: string,
    days: number,
  ): Promise<number> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.submissions.filter((submission) => {
      const props = submission.toProps();
      return (
        props.tenantId === tenantId &&
        props.siteId === siteId &&
        props.createdAt.getTime() < cutoff
      );
    }).length;
  }

  async deleteOne(
    tenantId: string,
    formId: string,
    submissionId: string,
  ): Promise<FormSubmission | null> {
    const index = this.submissions.findIndex((submission) => {
      const props = submission.toProps();
      return (
        props.id === submissionId &&
        props.formId === formId &&
        props.tenantId === tenantId
      );
    });
    const [removed] = index === -1 ? [] : this.submissions.splice(index, 1);
    return removed ?? null;
  }

  private byForm(formId: string): FormSubmission[] {
    return this.submissions.filter((s) => s.toProps().formId === formId);
  }

  async listAttachmentUrls(tenantId: string): Promise<Set<string>> {
    const urls = new Set<string>();
    for (const submission of this.submissions) {
      const { tenantId: owner, payload } = submission.toProps();
      if (owner !== tenantId) continue;
      for (const url of fileUrlsOf(payload)) urls.add(url);
    }
    return urls;
  }

  async listByForm(
    _tenantId: string,
    formId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<FormSubmission>> {
    // Newest first, matching the real adapter — a test that asserts on
    // ordering has to be asserting on the same thing production does.
    const all = this.byForm(formId).sort(
      (a, b) =>
        b.toProps().createdAt.getTime() - a.toProps().createdAt.getTime(),
    );
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: all.slice(start, start + pagination.pageSize),
      total: all.length,
    };
  }

  async countByForms(
    _tenantId: string,
    formIds: string[],
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const submission of this.submissions) {
      const formId = submission.toProps().formId;
      if (formId && formIds.includes(formId)) {
        counts[formId] = (counts[formId] ?? 0) + 1;
      }
    }
    return counts;
  }

  async listAllByForm(
    _tenantId: string,
    formId: string,
  ): Promise<FormSubmission[]> {
    // Oldest first for the export, again matching the adapter.
    return this.byForm(formId).sort(
      (a, b) =>
        a.toProps().createdAt.getTime() - b.toProps().createdAt.getTime(),
    );
  }
}

/** Fake, not a real storage backend — records what was uploaded/deleted so
 * use-case tests can assert on the interaction without touching disk/S3. */
export class InMemoryMediaStorage implements MediaStoragePort {
  readonly provider = 'local' as const;
  uploads: UploadMediaInput[] = [];
  deletedKeys: string[] = [];

  async upload(input: UploadMediaInput): Promise<UploadMediaResult> {
    this.uploads.push(input);
    // Mirrors what the real adapters do (ADR-0054, ADR-0070): an image is
    // re-encoded to WebP, video and audio are stored as uploaded with
    // their own sniffed type, and anything the sniffer does not vouch for
    // is kept under `files/` with its own name, for download. A fake that
    // answered `image/webp` to everything would let a test assert a file
    // had been stored correctly when nothing of the kind had happened.
    const sniffed = classifyUpload(input.data, input.filename);
    if (!sniffed.inline) {
      return {
        storageKey: `files/fake-${this.uploads.length}/${safeDownloadName(input.filename)}`,
        mimeType: sniffed.mimeType,
        size: input.data.byteLength,
        width: 0,
        height: 0,
      };
    }
    if (sniffed.kind === 'image') {
      return {
        storageKey: `fake-${this.uploads.length}.webp`,
        mimeType: 'image/webp',
        size: input.data.byteLength,
        width: 800,
        height: 600,
      };
    }
    return {
      storageKey: `fake-${this.uploads.length}.${sniffed.extension}`,
      mimeType: sniffed.mimeType,
      size: input.data.byteLength,
      width: 0,
      height: 0,
    };
  }

  getUrl(storageKey: string): string {
    return `https://fake-storage.test/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    this.deletedKeys.push(storageKey);
  }
}

export class InMemoryReusableSectionRepository implements ReusableSectionRepositoryPort {
  private sections = new Map<string, ReusableSection>();

  async add(section: ReusableSection): Promise<void> {
    addNew(this.sections, section, 'ReusableSection');
  }

  async save(section: ReusableSection): Promise<void> {
    saveExisting(
      this.sections,
      section,
      (id) => new ReusableSectionNotFoundError(id),
    );
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ReusableSection | null> {
    const section = this.sections.get(id);
    return section && section.tenantId === tenantId ? section : null;
  }

  async findByIds(tenantId: string, ids: string[]): Promise<ReusableSection[]> {
    return ids
      .map((id) => this.sections.get(id))
      .filter(
        (section): section is ReusableSection =>
          section !== undefined && section.tenantId === tenantId,
      );
  }

  /** By name, the same order the real adapter returns — the insert menu's order. */
  async listBySite(
    tenantId: string,
    siteId: string,
  ): Promise<ReusableSection[]> {
    return [...this.sections.values()]
      .filter(
        (section) => section.tenantId === tenantId && section.siteId === siteId,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const section = this.sections.get(id);
    if (section && section.tenantId === tenantId) {
      this.sections.delete(id);
    }
  }
}

export class InMemoryReusableSectionVersionRepository implements ReusableSectionVersionRepositoryPort {
  versions: ReusableSectionVersion[] = [];

  async save(version: ReusableSectionVersion): Promise<void> {
    this.versions.push(version);
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<ReusableSectionVersion | null> {
    return (
      this.versions.find(
        (version) => version.tenantId === tenantId && version.id === versionId,
      ) ?? null
    );
  }

  async listBySection(
    tenantId: string,
    reusableSectionId: string,
  ): Promise<ReusableSectionVersion[]> {
    return this.versions.filter(
      (version) =>
        version.tenantId === tenantId &&
        version.reusableSectionId === reusableSectionId,
    );
  }
}

export class InMemorySearchPort implements SearchPort {
  indexed: {
    tenantId: string;
    siteId: string;
    translation: PageTranslation;
    /** What was actually handed to the index — sections already expanded. */
    content: PageContent;
  }[] = [];
  results: PageSearchResult[] = [];

  async indexPage(
    tenantId: string,
    siteId: string,
    translation: PageTranslation,
    content: PageContent,
  ): Promise<void> {
    this.indexed.push({ tenantId, siteId, translation, content });
  }

  async search(): Promise<PageSearchResult[]> {
    return this.results;
  }
}

export class InMemoryPreviewTokenPort implements PreviewTokenPort {
  private tokens = new Map<string, PreviewToken>();

  async createToken(
    tenantId: string,
    contentType: PreviewContentType,
    contentId: string,
    ttlMs: number,
  ): Promise<PreviewToken> {
    const token = `preview-token-${this.tokens.size + 1}`;
    const previewToken: PreviewToken = {
      token,
      tenantId,
      contentType,
      contentId,
      expiresAt: new Date(Date.now() + ttlMs),
    };
    this.tokens.set(token, previewToken);
    return previewToken;
  }

  async validateToken(
    token: string,
    contentType: PreviewContentType,
    contentId: string,
  ): Promise<PreviewToken | null> {
    const found = this.tokens.get(token);
    if (
      !found ||
      found.contentType !== contentType ||
      found.contentId !== contentId
    ) {
      return null;
    }
    if (found.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return found;
  }
}

/**
 * Terms, dimensions and their addresses, in memory (docs/adr/0064).
 *
 * The address index is kept as its own map rather than derived from the
 * terms on every lookup, for the same reason the database keeps
 * `route_prefix` on the slug row: an address is `(locale, prefix, slug)`,
 * and the prefix belongs to the dimension, not to the term.
 */
/** How the database reads terms: by position, the older first among equals. */
function byOrderThenAge(a: Term, b: Term): number {
  return a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime();
}

export class InMemoryTaxonomyRepository implements TaxonomyRepositoryPort {
  readonly taxonomies = new Map<string, Taxonomy>();
  readonly terms = new Map<string, Term>();
  /** termId -> the prefix its addresses were written under. */
  private readonly prefixByTerm = new Map<string, string | null>();
  private readonly pageGroupTerms = new Map<string, string[]>();

  async addTaxonomy(taxonomy: Taxonomy): Promise<void> {
    addNew(this.taxonomies, taxonomy, 'Taxonomy');
  }

  async saveTaxonomy(taxonomy: Taxonomy): Promise<void> {
    saveExisting(
      this.taxonomies,
      taxonomy,
      (id) => new TaxonomyNotFoundError(id),
    );
  }

  async findTaxonomyById(
    tenantId: string,
    id: string,
  ): Promise<Taxonomy | null> {
    const found = this.taxonomies.get(id);
    return found && found.tenantId === tenantId ? found : null;
  }

  async listTaxonomiesBySite(
    tenantId: string,
    siteId: string,
  ): Promise<Taxonomy[]> {
    return [...this.taxonomies.values()].filter(
      (taxonomy) =>
        taxonomy.tenantId === tenantId && taxonomy.siteId === siteId,
    );
  }

  async deleteTaxonomy(tenantId: string, id: string): Promise<void> {
    this.taxonomies.delete(id);
    for (const term of [...this.terms.values()]) {
      if (term.taxonomyId === id) {
        this.terms.delete(term.id);
        this.prefixByTerm.delete(term.id);
      }
    }
  }

  async addTerm(term: Term): Promise<void> {
    addNew(this.terms, term, 'Term');
    this.recordPrefix(term);
  }

  async saveTerm(term: Term): Promise<void> {
    saveExisting(this.terms, term, (id) => new TermNotFoundError(id));
    this.recordPrefix(term);
  }

  private recordPrefix(term: Term): void {
    this.prefixByTerm.set(
      term.id,
      this.taxonomies.get(term.taxonomyId)?.prefix ?? null,
    );
  }

  async findTermById(tenantId: string, id: string): Promise<Term | null> {
    const found = this.terms.get(id);
    return found && found.tenantId === tenantId ? found : null;
  }

  async listTermsByTaxonomy(
    tenantId: string,
    taxonomyId: string,
  ): Promise<Term[]> {
    return [...this.terms.values()]
      .filter(
        (term) => term.tenantId === tenantId && term.taxonomyId === taxonomyId,
      )
      .sort(byOrderThenAge);
  }

  async listTermsBySite(tenantId: string, siteId: string): Promise<Term[]> {
    return [...this.terms.values()]
      .filter((term) => term.tenantId === tenantId && term.siteId === siteId)
      .sort(byOrderThenAge);
  }

  async reorderTermSiblings(input: {
    tenantId: string;
    taxonomyId: string;
    parentId: string | null;
    orderedIds: readonly string[];
    at: Date;
  }): Promise<void> {
    input.orderedIds.forEach((id, index) => {
      const term = this.terms.get(id);
      if (
        term &&
        term.tenantId === input.tenantId &&
        term.taxonomyId === input.taxonomyId &&
        term.parentId === input.parentId
      ) {
        term.setOrder(index, input.at);
      }
    });
  }

  async deleteTerm(tenantId: string, id: string): Promise<void> {
    this.terms.delete(id);
    this.prefixByTerm.delete(id);
  }

  async findTermByAddress(
    tenantId: string,
    siteId: string,
    locale: string,
    prefix: string | null,
    slug: string,
  ): Promise<Term | null> {
    for (const term of this.terms.values()) {
      if (term.tenantId !== tenantId || term.siteId !== siteId) continue;
      if ((this.prefixByTerm.get(term.id) ?? null) !== prefix) continue;
      if (term.slugFor(locale) === slug) return term;
    }
    return null;
  }

  async findTermByLandingPage(
    tenantId: string,
    pageGroupId: string,
  ): Promise<Term | null> {
    for (const term of this.terms.values()) {
      if (
        term.tenantId === tenantId &&
        term.landingPageGroupId === pageGroupId
      ) {
        return term;
      }
    }
    return null;
  }

  async updateTermAddressPrefix(
    tenantId: string,
    taxonomyId: string,
    prefix: string | null,
  ): Promise<void> {
    for (const term of this.terms.values()) {
      if (term.tenantId === tenantId && term.taxonomyId === taxonomyId) {
        this.prefixByTerm.set(term.id, prefix);
      }
    }
  }

  async listTermIdsForPageGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<string[]> {
    return this.pageGroupTerms.get(pageGroupId) ?? [];
  }

  async setTermsForPageGroup(
    tenantId: string,
    pageGroupId: string,
    termIds: string[],
  ): Promise<void> {
    this.pageGroupTerms.set(pageGroupId, [...termIds]);
  }

  async listPageGroupIdsForTerm(
    tenantId: string,
    termId: string,
  ): Promise<string[]> {
    return [...this.pageGroupTerms.entries()]
      .filter(([, termIds]) => termIds.includes(termId))
      .map(([pageGroupId]) => pageGroupId);
  }
}
