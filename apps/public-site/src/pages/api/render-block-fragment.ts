import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import {
  getPreviewPageById,
  getPreviewSectionById,
} from '../../lib/public-api-client';
import {
  FragmentComponentScripts,
  buildFragmentBlock,
  isValidRenderBlockFragmentBody,
  renderBlockFragmentCorsHeaders,
} from '../../lib/render-block-fragment-helpers';
import RenderSingleBlock from '../../components/RenderSingleBlock.astro';

// Called by apps/editor-app (canvas-frame.tsx/block-fragment-api-client.ts),
// never by a real visitor: editor-app runs on a different origin (port 4200
// in dev), so explicit CORS is needed here, scoped to EDITOR_APP_URL alone
// — the real authentication stays the preview token validated below (the
// same token as the preview route, see the visual editor plan, Day 1/3),
// and CORS only decides "which JS may read the response", not "who is
// authorized".
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: renderBlockFragmentCorsHeaders(),
  });

export const POST: APIRoute = async ({ request }) => {
  const body: unknown = await request.json().catch(() => null);
  if (!isValidRenderBlockFragmentBody(body)) {
    return new Response('Bad request', {
      status: 400,
      headers: renderBlockFragmentCorsHeaders(),
    });
  }

  // The same "indistinguishable from non-existent" collapse as the preview
  // route: a missing, expired or mismatched token and a page that does not
  // exist all get the same 404.
  // A section's token is validated against the SECTION, a page's against
  // the page — the branch is what keeps one from standing in for the
  // other (docs/adr/0059). Either way what comes back is page-shaped, so
  // everything below this line is the same code for both.
  const page = body.sectionId
    ? await getPreviewSectionById(body.sectionId, body.token, body.locale ?? '')
    : await getPreviewPageById(body.pageId, body.token);
  if (!page) {
    return new Response('Not found', {
      status: 404,
      headers: renderBlockFragmentCorsHeaders(),
    });
  }

  const block = buildFragmentBlock(body, page);

  // See FragmentComponentScripts: without its `resolve`, every block with
  // a behaviour sent back the server's absolute path to its component.
  const scripts = new FragmentComponentScripts();
  const container = await AstroContainer.create({ resolve: scripts.resolve });
  const rendered = await container.renderToString(RenderSingleBlock, {
    props: {
      block,
      locale: page.locale,
      translations: page.translations,
      site: page.site,
      ancestors: page.ancestors,
      currentPageTitle: page.seoMeta.title,
    },
  });
  const html = scripts.strip(rendered);

  return new Response(JSON.stringify({ html }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...renderBlockFragmentCorsHeaders(),
    },
  });
};
