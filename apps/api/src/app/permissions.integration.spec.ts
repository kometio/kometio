import { randomUUID } from 'node:crypto';
import type request from 'supertest';
import { type UserRole } from '@kometio/shared-types';
import { CollectionsModule } from './collections/collections.module';
import { FormsModule } from './forms/forms.module';
import { MediaModule } from './media/media.module';
import { PagesModule } from './pages/pages.module';
import { ReusableSectionsModule } from './reusable-sections/reusable-sections.module';
import { SiteLayoutSectionsModule } from './site-layout-sections/site-layout-sections.module';
import { SiteArchiveModule } from './site-archive/site-archive.module';
import { SitesModule } from './sites/sites.module';
import { TaxonomiesModule } from './taxonomies/taxonomies.module';
import { UsersModule } from './users/users.module';
import { IntegrationApp } from '../test/integration-app.test-fixture';

type Agent = ReturnType<typeof request.agent>;

/**
 * The role matrix (docs/roles.md), over real HTTP. Each route is called
 * with an id that does not exist: the roles are checked before the route
 * runs, so a role that may not gets 403, and one that may gets past the
 * check — to a 404 or a 400, never a 403.
 */
describe('Who may do what (integration)', () => {
  let integration: IntegrationApp;
  const agents = {} as Record<UserRole, Agent>;
  const id = randomUUID();

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [
        CollectionsModule,
        FormsModule,
        MediaModule,
        PagesModule,
        ReusableSectionsModule,
        SiteLayoutSectionsModule,
        SiteArchiveModule,
        SitesModule,
        TaxonomiesModule,
        UsersModule,
      ],
    });
    for (const role of ['admin', 'publisher', 'editor'] as const) {
      agents[role] = await integration.login(
        await integration.createUser({ role }),
      );
    }
  });

  afterAll(async () => {
    await integration.close();
  });

  const changesTheLiveSite: [string, string][] = [
    ['post', `/page-groups/translations/${id}/publish`],
    ['patch', `/page-groups/translations/${id}/seo`],
    ['patch', `/page-groups/translations/${id}/slug`],
    ['patch', `/page-groups/${id}/parent`],
    ['patch', `/page-groups/${id}/terms`],
    ['patch', `/page-groups/${id}/collection`],
    ['patch', '/page-groups/reorder'],
    ['post', `/site-layout-sections/${id}/publish`],
    ['patch', `/site-layout-sections/${id}/sticky`],
    ['post', `/reusable-sections/${id}/publish`],
    ['patch', `/reusable-sections/${id}/exposed-fields`],
    ['post', '/forms'],
    ['post', `/forms/${id}/duplicate`],
    ['patch', `/forms/${id}`],
    ['post', '/collections'],
    ['patch', `/taxonomies/${id}`],
    ['post', `/taxonomies/${id}/terms`],
    ['patch', `/taxonomies/terms/${id}`],
    ['patch', `/taxonomies/${id}/terms/reorder`],
  ];
  const deletes: [string, string][] = [
    ['delete', `/page-groups/${id}`],
    ['delete', `/media/${id}`],
    ['delete', `/forms/${id}`],
    ['delete', `/forms/${id}/submissions/${id}`],
    ['delete', `/reusable-sections/${id}`],
    ['delete', `/collections/${id}`],
    ['delete', `/taxonomies/${id}`],
  ];
  const configuresTheSite: [string, string][] = [
    ['patch', `/sites/${id}/general-settings`],
    ['patch', `/sites/${id}/seo-settings`],
    ['patch', `/sites/${id}/theme-tokens`],
    ['patch', `/sites/${id}/locale-settings`],
    ['get', '/users'],
    ['get', '/site-archive'],
    ['get', `/sites/${id}/form-submissions/count?olderThanDays=30`],
    ['delete', `/users/${id}/invite`],
  ];

  async function statusOf(role: UserRole, [method, path]: [string, string]) {
    const agent = agents[role];
    const call =
      method === 'post'
        ? agent.post(path)
        : method === 'patch'
          ? agent.patch(path)
          : method === 'delete'
            ? agent.delete(path)
            : agent.get(path);
    return (await call.send({})).status;
  }

  /** The routes of a list that answer a role with this status (or without it). */
  async function answering(
    role: UserRole,
    routes: [string, string][],
    forbidden: boolean,
  ): Promise<string[]> {
    const out: string[] = [];
    for (const route of routes) {
      const status = await statusOf(role, route);
      if ((status === 403) === forbidden)
        out.push(`${route.join(' ')} ${status}`);
    }
    return out;
  }

  const everything = () => [
    ...changesTheLiveSite,
    ...deletes,
    ...configuresTheSite,
  ];

  it('keeps an editor to drafts: nothing that goes online, nothing deleted, no settings', async () => {
    expect(await answering('editor', everything(), false)).toEqual([]);
  });

  it('lets a publisher change the live site and delete, but not configure it', async () => {
    expect(
      await answering('publisher', [...changesTheLiveSite, ...deletes], true),
    ).toEqual([]);
    expect(await answering('publisher', configuresTheSite, false)).toEqual([]);
  });

  it('lets an admin do all of it', async () => {
    expect(await answering('admin', everything(), true)).toEqual([]);
  });
});
