import { environment } from './support/environment';
import { expect, test } from './support/test';

/**
 * What a visitor and a search engine get for an old address (docs/adr/0127),
 * through the public site, with no session and without following the answer:
 * the status and the `Location` are the thing being checked.
 */
test.describe('an old address', () => {
  test('is sent to the page that replaced it, with a campaign tag carried on', async ({
    api,
    cleanup,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug: uniqueName,
      title: uniqueName,
      content: [],
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    const old = `old-${uniqueName}`;
    const rule = await api.createRedirect({
      siteId: site.id,
      from: `https://old-site.example/2019/05/${old}/`,
      to: { kind: 'url', url: `/${site.defaultLocale}/${uniqueName}` },
    });
    cleanup.add(() => api.deleteRedirect(rule.id));

    const answer = await request.get(
      `${environment.publicSiteUrl}2019/05/${old}?utm_source=mail`,
      { maxRedirects: 0 },
    );

    expect(answer.status()).toBe(301);
    expect(answer.headers()['location']).toBe(
      `/${site.defaultLocale}/${uniqueName}?utm_source=mail`,
    );
    // And the page is what it points at: stored as the page, not as text.
    expect(rule.target).toMatchObject({
      kind: 'page',
      path: `/${site.defaultLocale}/${uniqueName}`,
    });
  });

  test('is answered by one rule for a whole permalink structure', async ({
    api,
    cleanup,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug: uniqueName,
      title: uniqueName,
      content: [],
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    // A prefix of its own, so that no other address of the dev database is
    // read by this pattern.
    const rule = await api.createRedirect({
      siteId: site.id,
      from: `/${uniqueName}-blog/:year/:month/:slug`,
      to: { kind: 'url', url: `/${site.defaultLocale}/:slug` },
    });
    cleanup.add(() => api.deleteRedirect(rule.id));

    const found = await request.get(
      `${environment.publicSiteUrl}${uniqueName}-blog/2019/05/${uniqueName}`,
      { maxRedirects: 0 },
    );
    // A pattern says where an address goes, whether or not there is a page
    // there yet: it is the person's word, and the 404 is at the other end.
    const toNothing = await request.get(
      `${environment.publicSiteUrl}${uniqueName}-blog/2019/05/not-a-page-${uniqueName}`,
      { maxRedirects: 0 },
    );

    expect(found.status()).toBe(301);
    expect(found.headers()['location']).toBe(
      `/${site.defaultLocale}/${uniqueName}`,
    );
    expect(toNothing.status()).toBe(301);
    expect(toNothing.headers()['location']).toBe(
      `/${site.defaultLocale}/not-a-page-${uniqueName}`,
    );
  });

  test('is told gone, when that is what it is', async ({
    api,
    cleanup,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const rule = await api.createRedirect({
      siteId: site.id,
      from: `/${uniqueName}-removed`,
      to: null,
      status: 410,
    });
    cleanup.add(() => api.deleteRedirect(rule.id));

    const answer = await request.get(
      `${environment.publicSiteUrl}${uniqueName}-removed`,
      { maxRedirects: 0 },
    );

    expect(answer.status()).toBe(410);
  });

  test('has nothing to say for a page that is there: a page always wins', async ({
    api,
    cleanup,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug: uniqueName,
      title: uniqueName,
      content: [],
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    const rule = await api.createRedirect({
      siteId: site.id,
      from: `/${site.defaultLocale}/${uniqueName}`,
      to: { kind: 'url', url: 'https://elsewhere.example/' },
    });
    cleanup.add(() => api.deleteRedirect(rule.id));

    const answer = await request.get(
      `${environment.publicSiteUrl}${site.defaultLocale}/${uniqueName}`,
      { maxRedirects: 0 },
    );

    expect(answer.status()).toBe(200);
  });

  test('is kept to the front door too: `?p=123` goes where the rule says', async ({
    api,
    cleanup,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const number = 100000 + Math.floor(Math.random() * 800000);
    const rule = await api.createRedirect({
      siteId: site.id,
      from: `/?p=${number}`,
      to: { kind: 'url', url: `/${site.defaultLocale}/${uniqueName}-post` },
    });
    cleanup.add(() => api.deleteRedirect(rule.id));

    const answered = await request.get(
      `${environment.publicSiteUrl}?p=${number}&utm_source=mail`,
      { maxRedirects: 0 },
    );
    const unknown = await request.get(
      `${environment.publicSiteUrl}?p=${number + 1}`,
      { maxRedirects: 0 },
    );

    expect(answered.status()).toBe(301);
    expect(answered.headers()['location']).toBe(
      `/${site.defaultLocale}/${uniqueName}-post?utm_source=mail`,
    );
    // A number nobody has a rule for goes where the front door always went.
    expect(unknown.status()).toBe(302);
    expect(unknown.headers()['location']).toBe(`/${site.defaultLocale}/`);
  });

  test('that has no rule is still a 404', async ({ uniqueName, request }) => {
    const answer = await request.get(
      `${environment.publicSiteUrl}never-${uniqueName}/at/all`,
      { maxRedirects: 0 },
    );

    expect(answer.status()).toBe(404);
  });
});
