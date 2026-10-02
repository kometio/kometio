// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyRootLayout,
  applyBlockInsert,
  applyBlockPatch,
  applyBlockRemove,
  applyBlockReorder,
  applyBlockStyleCss,
  blockIdOf,
  collectBlockElements,
  escapeHtml,
  findFieldElement,
  findFieldUnderPointer,
  findRealInteractiveAncestor,
  isBlockInteractive,
  parseEditingSection,
  scrollBlockIntoView,
  toBlockRects,
} from './preview-bridge-client';

function requireElement(id: string): Element {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Test fixture is missing #${id}`);
  }
  return el;
}

function requireQuery(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Test fixture is missing ${selector}`);
  }
  return el;
}

describe('parseEditingSection', () => {
  it('reads a valid header/footer value from the query string', () => {
    expect(parseEditingSection('?editingSection=header')).toBe('header');
    expect(parseEditingSection('?editingSection=footer')).toBe('footer');
  });

  it('returns null when absent — editing the page itself', () => {
    expect(parseEditingSection('')).toBeNull();
    expect(parseEditingSection('?token=abc')).toBeNull();
  });

  it('returns null for an unrecognized value instead of trusting it', () => {
    expect(parseEditingSection('?editingSection=sidebar')).toBeNull();
  });
});

describe('isBlockInteractive', () => {
  function buildDom() {
    document.body.innerHTML = `
      <header><div data-kometio-block-id="h1" id="h1"></div></header>
      <div data-kometio-block-id="p1" id="p1"></div>
      <footer><div data-kometio-block-id="f1" id="f1"></div></footer>
    `;
    return {
      headerBlock: requireElement('h1'),
      pageBlock: requireElement('p1'),
      footerBlock: requireElement('f1'),
    };
  }

  it('when editing the page (no section), only the page block is interactive', () => {
    const { headerBlock, pageBlock, footerBlock } = buildDom();
    expect(isBlockInteractive(pageBlock, null)).toBe(true);
    expect(isBlockInteractive(headerBlock, null)).toBe(false);
    expect(isBlockInteractive(footerBlock, null)).toBe(false);
  });

  it('when editing the header, only header blocks are interactive', () => {
    const { headerBlock, pageBlock, footerBlock } = buildDom();
    expect(isBlockInteractive(headerBlock, 'header')).toBe(true);
    expect(isBlockInteractive(pageBlock, 'header')).toBe(false);
    expect(isBlockInteractive(footerBlock, 'header')).toBe(false);
  });

  it('when editing the footer, only footer blocks are interactive', () => {
    const { headerBlock, pageBlock, footerBlock } = buildDom();
    expect(isBlockInteractive(footerBlock, 'footer')).toBe(true);
    expect(isBlockInteractive(pageBlock, 'footer')).toBe(false);
    expect(isBlockInteractive(headerBlock, 'footer')).toBe(false);
  });
});

describe('collectBlockElements', () => {
  it('finds every wrapper BlockRenderer.astro marks, in document order', () => {
    document.body.innerHTML = `
      <div data-kometio-block-id="a"></div>
      <div><div data-kometio-block-id="b"></div></div>
      <div data-kometio-no-block></div>
    `;
    const ids = collectBlockElements(document).map(
      (el) => (el as HTMLElement).dataset['kometioBlockId'],
    );
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('findRealInteractiveAncestor', () => {
  it('finds the nearest real <a>/<button>/<details> ancestor', () => {
    document.body.innerHTML = `
      <a href="/somewhere"><span id="inside-link">click me</span></a>
      <button id="btn">go</button>
      <details id="det"><summary id="sum">toggle</summary></details>
      <div id="plain">nothing special</div>
    `;
    expect(
      findRealInteractiveAncestor(requireElement('inside-link'))?.tagName,
    ).toBe('A');
    expect(findRealInteractiveAncestor(requireElement('btn'))?.tagName).toBe(
      'BUTTON',
    );
    expect(findRealInteractiveAncestor(requireElement('sum'))?.tagName).toBe(
      'DETAILS',
    );
    expect(findRealInteractiveAncestor(requireElement('plain'))).toBeNull();
  });
});

describe('toBlockRects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pairs each element with its own rect, keyed by its block id', () => {
    // jsdom doesn't implement Range.getBoundingClientRect at all, so it's
    // assigned directly rather than spied on.
    Range.prototype.getBoundingClientRect = vi.fn(
      () => ({ top: 1, left: 2, width: 3, height: 4 }) as DOMRect,
    );
    document.body.innerHTML = `<div data-kometio-block-id="a"></div>`;
    const el = requireQuery('[data-kometio-block-id]');

    expect(toBlockRects([el])).toEqual([
      { id: 'a', top: 1, left: 2, width: 3, height: 4 },
    ]);
  });

  it('skips an element with no block id rather than throwing', () => {
    document.body.innerHTML = `<div></div>`;
    const el = requireQuery('div');
    expect(toBlockRects([el])).toEqual([]);
  });
});

describe('applyBlockPatch', () => {
  it('replaces the matching wrapper via outerHTML, keeping its position', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="a">old</div>' +
      '<div data-kometio-block-id="b">unrelated</div>';

    const patched = applyBlockPatch(
      document,
      'a',
      '<div data-kometio-block-id="a" data-kometio-block-type="Text">new</div>',
    );

    expect(patched?.textContent).toBe('new');
    expect(document.body.innerHTML).toBe(
      '<div data-kometio-block-id="a" data-kometio-block-type="Text">new</div>' +
        '<div data-kometio-block-id="b">unrelated</div>',
    );
  });

  it('returns null without throwing when the block id is not in the document', () => {
    document.body.innerHTML = '<div data-kometio-block-id="a">old</div>';

    expect(applyBlockPatch(document, 'missing', '<div>new</div>')).toBeNull();
    expect(document.body.innerHTML).toBe(
      '<div data-kometio-block-id="a">old</div>',
    );
  });
});

describe('applyBlockInsert', () => {
  it('appends to the root blocks list for the current editing scope when there is no beforeBlockId', () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="page">' +
      '<div class="kometio-root-block">' +
      '<div data-kometio-block-id="a">first</div>' +
      '</div>' +
      '</div>';

    const inserted = applyBlockInsert(
      document,
      '<div data-kometio-block-id="b">second</div>',
      null,
      null,
      null,
    );

    // The returned node is the BLOCK, not the wrapper around it: every
    // caller uses it to select and measure the block it just inserted.
    expect(inserted?.getAttribute('data-kometio-block-id')).toBe('b');
    expect(document.body.innerHTML).toBe(
      '<div data-kometio-root-blocks="page">' +
        // The block that was last is no longer last, so it gets the
        // default gap below it back.
        '<div class="kometio-root-block">' +
        '<div data-kometio-block-id="a">first</div>' +
        '</div>' +
        '<div class="kometio-root-block kometio-rb-b">' +
        '<div data-kometio-block-id="b">second</div>' +
        '</div>' +
        '</div>',
    );
  });

  it("inserts before an existing root sibling, using its wrapper's parent as the container", () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="page">' +
      '<div class="kometio-root-block">' +
      '<div data-kometio-block-id="a">first</div>' +
      '</div>' +
      '</div>';

    applyBlockInsert(
      document,
      '<div data-kometio-block-id="b">new</div>',
      null,
      'a',
      null,
    );

    expect(document.body.innerHTML).toBe(
      '<div data-kometio-root-blocks="page">' +
        '<div class="kometio-root-block kometio-rb-b">' +
        '<div data-kometio-block-id="b">new</div>' +
        '</div>' +
        '<div class="kometio-root-block">' +
        '<div data-kometio-block-id="a">first</div>' +
        '</div>' +
        '</div>',
    );
  });

  /*
   * The three tests above model a root block as a direct child of the
   * marker. The real page does not: PublicPageContent.astro wraps every
   * root block in a `.kometio-root-block` div, which is what carries the
   * block's spacing and — since ADR-0049 — the width and alignment that
   * used to sit on `<main>` itself.
   *
   * That wrapper makes both branches of the container search wrong in a
   * way the simplified fixture could never show: `beforeEl.parentElement`
   * finds the SIBLING'S wrapper rather than the list, and appending to the
   * list produces a block with no wrapper at all. The first nests a block
   * inside its neighbour; the second drops it outside the content column
   * entirely, full-bleed, until the next reload.
   */
  const rootList = (...blocks: string[]) =>
    '<main data-kometio-root-blocks="page" class="flex flex-col">' +
    blocks
      .map((block, index) => `<div class="kometio-root-block">${block}</div>`)
      .join('') +
    '</main>';

  it('wraps a block appended to the real root list, so it keeps the content column', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="a" style="display:contents">first</div>',
    );

    const inserted = applyBlockInsert(
      document,
      '<div data-kometio-block-id="b" style="display:contents">second</div>',
      null,
      null,
      null,
    );

    expect(inserted?.textContent).toBe('second');
    const wrappers = document.querySelectorAll(
      '[data-kometio-root-blocks="page"] > .kometio-root-block',
    );
    expect(wrappers).toHaveLength(2);
    expect(
      wrappers[1]?.querySelector('[data-kometio-block-id]')?.textContent,
    ).toBe('second');
  });

  /*
   * The page renders each root wrapper with the class holding the block's
   * own margins and animation, its width and its hover effect. A wrapper
   * built here had none of the three, so a pasted or duplicated block lost
   * them until the page was reloaded.
   */
  it('builds the wrapper the page would have rendered for that block', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="a" style="display:contents">first</div>',
    );

    applyBlockInsert(
      document,
      '<div data-kometio-block-id="copy-1" style="display:contents">copy</div>',
      null,
      null,
      null,
      { align: 'full', styleOverride: { base: { hoverEffect: 'lift' } } },
    );

    const wrapper = document.querySelector(
      '[data-kometio-block-id="copy-1"]',
    )?.parentElement;
    expect(wrapper?.className).toBe('kometio-root-block kometio-rb-copy-1');
    expect(wrapper?.getAttribute('data-kometio-align')).toBe('full');
    expect(wrapper?.getAttribute('data-kometio-hover')).toBe('lift');
  });

  it('leaves out the attributes a block does not ask for, as the page does', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="a" style="display:contents">first</div>',
    );

    applyBlockInsert(
      document,
      '<div data-kometio-block-id="plain" style="display:contents">plain</div>',
      null,
      null,
      null,
      { align: 'content' },
    );

    const wrapper = document.querySelector(
      '[data-kometio-block-id="plain"]',
    )?.parentElement;
    expect(wrapper?.hasAttribute('data-kometio-align')).toBe(false);
    expect(wrapper?.hasAttribute('data-kometio-hover')).toBe(false);
  });

  /*
   * Width and hover effect both live on the wrapper, and both are written
   * as the absence of the attribute at their default — the same shape the
   * page renders, so the canvas and a reload cannot disagree.
   */
  it('writes the width and the hover effect a root block was given', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="a">first</div>',
    );

    expect(applyRootLayout(document, 'a', 'full', 'lift')).toBe(true);

    const wrapper = document.querySelector('.kometio-root-block');
    expect(wrapper?.getAttribute('data-kometio-align')).toBe('full');
    expect(wrapper?.getAttribute('data-kometio-hover')).toBe('lift');
  });

  it('takes them off again at their default', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="a">first</div>',
    );
    const wrapper = document.querySelector('.kometio-root-block');
    wrapper?.setAttribute('data-kometio-align', 'full');
    wrapper?.setAttribute('data-kometio-hover', 'lift');

    applyRootLayout(document, 'a', 'content', null);

    expect(wrapper?.hasAttribute('data-kometio-align')).toBe(false);
    expect(wrapper?.hasAttribute('data-kometio-hover')).toBe(false);
  });

  it('says no for a block that has no wrapper of its own', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="box"><div data-kometio-block-id="inner">nested</div></div>',
    );

    expect(applyRootLayout(document, 'inner', 'full', 'lift')).toBe(false);
  });

  it('inserts a new wrapper BESIDE an existing root block, never inside its neighbour', () => {
    document.body.innerHTML = rootList(
      '<div data-kometio-block-id="a" style="display:contents">first</div>',
    );

    applyBlockInsert(
      document,
      '<div data-kometio-block-id="b" style="display:contents">new</div>',
      null,
      'a',
      null,
    );

    const wrappers = document.querySelectorAll(
      '[data-kometio-root-blocks="page"] > .kometio-root-block',
    );
    expect(wrappers).toHaveLength(2);
    expect(
      wrappers[0]?.querySelector('[data-kometio-block-id]')?.textContent,
    ).toBe('new');
    // The neighbour holds its own block and nothing else — the failure this
    // guards against nests the new block inside it and reads as "the
    // block went to the wrong place" rather than as a DOM bug.
    expect(
      wrappers[1]?.querySelectorAll('[data-kometio-block-id]'),
    ).toHaveLength(1);
  });

  it('picks the header/footer root list matching the current editing scope', () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="page"></div>' +
      '<div data-kometio-root-blocks="header"></div>' +
      '<div data-kometio-root-blocks="footer"></div>';

    applyBlockInsert(
      document,
      '<div data-kometio-block-id="h1">nav</div>',
      null,
      null,
      'header',
    );

    expect(
      document.querySelector('[data-kometio-root-blocks="header"]')?.innerHTML,
    ).toBe('<div data-kometio-block-id="h1">nav</div>');
    expect(
      document.querySelector('[data-kometio-root-blocks="page"]')?.innerHTML,
    ).toBe('');
  });

  it("appends into an empty container via its wrapper's first element child", () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="container-1">' +
      '<div class="rendered-container"></div>' +
      '</div>';

    const inserted = applyBlockInsert(
      document,
      '<div data-kometio-block-id="child-1">inside</div>',
      'container-1',
      null,
      null,
    );

    expect(inserted?.textContent).toBe('inside');
    expect(document.querySelector('.rendered-container')?.innerHTML).toBe(
      '<div data-kometio-block-id="child-1">inside</div>',
    );
  });

  it('returns null without throwing when neither a sibling nor the parent/root container can be found', () => {
    document.body.innerHTML = '<div>unrelated</div>';

    expect(
      applyBlockInsert(
        document,
        '<div>new</div>',
        'missing-parent',
        null,
        null,
      ),
    ).toBeNull();
  });

  it('finds the wrapper by data-kometio-block-id rather than assuming it is the first node, when the fragment leads with a <script> (Countdown/Form/MapEmbed... shape)', () => {
    document.body.innerHTML = '<div data-kometio-root-blocks="page"></div>';

    const inserted = applyBlockInsert(
      document,
      '<script>window.__kometioTestFlag = 1;</script>' +
        '<div data-kometio-block-id="countdown-1">tick</div>',
      null,
      null,
      null,
    );

    expect(inserted?.getAttribute('data-kometio-block-id')).toBe('countdown-1');
  });

  it('recreates a sibling <script> so it is eligible to execute again, placed right after the block it belongs to', () => {
    document.body.innerHTML = '<div data-kometio-root-blocks="page"></div>';

    applyBlockInsert(
      document,
      '<script>window.__kometioTestFlag = 1;</script>' +
        '<div data-kometio-block-id="countdown-1">tick</div>',
      null,
      null,
      null,
    );

    // Inside the root wrapper, beside the block: that is where a
    // server-rendered page puts it, since the wrapper encloses the whole
    // of BlockRenderer's output rather than the block element alone.
    const wrapper = requireQuery(
      '[data-kometio-root-blocks="page"] > .kometio-root-block',
    );
    expect(wrapper.children).toHaveLength(2);
    expect(wrapper.children[0]?.getAttribute('data-kometio-block-id')).toBe(
      'countdown-1',
    );
    const script = wrapper.children[1] as HTMLScriptElement;
    expect(script.tagName).toBe('SCRIPT');
    expect(script.textContent).toBe('window.__kometioTestFlag = 1;');
  });

  it('copies every attribute onto the recreated <script>, including src/async/defer (Turnstile shape)', () => {
    document.body.innerHTML = '<div data-kometio-root-blocks="page"></div>';

    applyBlockInsert(
      document,
      '<div data-kometio-block-id="form-1">form</div>' +
        '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
      null,
      null,
      null,
    );

    const script = requireQuery(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    expect(script.hasAttribute('async')).toBe(true);
    expect(script.hasAttribute('defer')).toBe(true);
  });

  it('recreates a <script> nested inside the block wrapper too, in place', () => {
    document.body.innerHTML = '<div data-kometio-root-blocks="page"></div>';

    const inserted = applyBlockInsert(
      document,
      '<div data-kometio-block-id="stat-1">' +
        '<script>window.__kometioTestFlag = 2;</script>' +
        '<span>42</span>' +
        '</div>',
      null,
      null,
      null,
    );

    const nestedScript = inserted?.querySelector('script');
    expect(nestedScript?.textContent).toBe('window.__kometioTestFlag = 2;');
    expect(inserted?.querySelector('span')?.textContent).toBe('42');
  });
});

describe('applyBlockRemove', () => {
  it('removes the matching block from the document', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="a">first</div>' +
      '<div data-kometio-block-id="b">second</div>';

    const removed = applyBlockRemove(document, 'a');

    expect(removed).toBe(true);
    expect(document.body.innerHTML).toBe(
      '<div data-kometio-block-id="b">second</div>',
    );
  });

  it('returns false without throwing when the block id is not in the document', () => {
    document.body.innerHTML = '<div data-kometio-block-id="a">first</div>';

    expect(applyBlockRemove(document, 'missing')).toBe(false);
    expect(document.body.innerHTML).toBe(
      '<div data-kometio-block-id="a">first</div>',
    );
  });
});

describe('applyBlockReorder', () => {
  it('re-appends the existing siblings in the given order, moving them (not cloning)', () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="page">' +
      '<div data-kometio-block-id="a">first</div>' +
      '<div data-kometio-block-id="b">second</div>' +
      '<div data-kometio-block-id="c">third</div>' +
      '</div>';
    const originalA = document.querySelector('[data-kometio-block-id="a"]');

    applyBlockReorder(document, null, ['c', 'a', 'b'], null);

    expect(document.body.innerHTML).toBe(
      '<div data-kometio-root-blocks="page">' +
        '<div data-kometio-block-id="c">third</div>' +
        '<div data-kometio-block-id="a">first</div>' +
        '<div data-kometio-block-id="b">second</div>' +
        '</div>',
    );
    // The same node, only moved — never cloned through innerHTML.
    expect(document.querySelector('[data-kometio-block-id="a"]')).toBe(
      originalA,
    );
  });

  it('reorders within the scope matching the current editing section, when header/footer/page coexist', () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="header">' +
      '<div data-kometio-block-id="nav-1">nav</div>' +
      '<div data-kometio-block-id="nav-2">nav2</div>' +
      '</div>' +
      '<div data-kometio-root-blocks="page"></div>';

    applyBlockReorder(document, null, ['nav-2', 'nav-1'], 'header');

    expect(
      document.querySelector('[data-kometio-root-blocks="header"]')?.innerHTML,
    ).toBe(
      '<div data-kometio-block-id="nav-2">nav2</div>' +
        '<div data-kometio-block-id="nav-1">nav</div>',
    );
  });

  it('ignores ids no longer present in the document instead of throwing', () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="page">' +
      '<div data-kometio-block-id="a">first</div>' +
      '</div>';

    applyBlockReorder(document, null, ['missing', 'a'], null);

    expect(
      document.querySelector('[data-kometio-root-blocks="page"]')?.innerHTML,
    ).toBe('<div data-kometio-block-id="a">first</div>');
  });

  it('does nothing when none of the ordered ids are present', () => {
    document.body.innerHTML = '<div data-kometio-root-blocks="page"></div>';

    expect(() =>
      applyBlockReorder(document, null, ['missing-1', 'missing-2'], null),
    ).not.toThrow();
  });
});

describe('findFieldElement', () => {
  it('finds the field node inside the matching block', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="hero-1">' +
      '<h1 data-kometio-field="title">Titolo</h1>' +
      '<p data-kometio-field="subtitle">Sottotitolo</p>' +
      '</div>';

    const el = findFieldElement(document, 'hero-1', 'subtitle');

    expect(el?.tagName).toBe('P');
    expect(el?.textContent).toBe('Sottotitolo');
  });

  it('returns null when the block id does not exist', () => {
    document.body.innerHTML = '<div data-kometio-block-id="hero-1"></div>';
    expect(findFieldElement(document, 'missing', 'title')).toBeNull();
  });

  it('returns null when the field does not exist on that block', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="hero-1"><h1 data-kometio-field="title"></h1></div>';
    expect(findFieldElement(document, 'hero-1', 'subtitle')).toBeNull();
  });
});

describe('findFieldUnderPointer', () => {
  it('finds the data-kometio-field value nearest the click target', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="hero-1">' +
      '<h1 data-kometio-field="title"><span id="inner">Titolo</span></h1>' +
      '</div>';
    const blockEl = requireQuery('[data-kometio-block-id="hero-1"]');
    const target = requireElement('inner');

    expect(findFieldUnderPointer(blockEl, target)).toBe('title');
  });

  it('returns null when the click landed outside any field, even inside the block', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="hero-1">' +
      '<h1 data-kometio-field="title">Titolo</h1>' +
      '<div id="padding"></div>' +
      '</div>';
    const blockEl = requireQuery('[data-kometio-block-id="hero-1"]');
    const target = requireElement('padding');

    expect(findFieldUnderPointer(blockEl, target)).toBeNull();
  });

  it('returns null for a field element that belongs to a different block', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="hero-1"></div>' +
      '<div data-kometio-block-id="hero-2"><h1 data-kometio-field="title" id="other">Altro</h1></div>';
    const blockEl = requireQuery('[data-kometio-block-id="hero-1"]');
    const target = requireElement('other');

    expect(findFieldUnderPointer(blockEl, target)).toBeNull();
  });
});

describe('scrollBlockIntoView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls the window to center the block, measured via a Range (a direct scrollIntoView on the block's display:contents wrapper would be a no-op)", () => {
    document.body.innerHTML = '<div data-kometio-block-id="a">block</div>';
    Range.prototype.getBoundingClientRect = vi.fn(
      () => ({ top: 500, left: 0, width: 100, height: 50 }) as DOMRect,
    );
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(200);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    expect(scrollBlockIntoView(document, 'a')).toBe(true);

    // scrollY(200) + rect.top(500) - (innerHeight(800) - rect.height(50)) / 2
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 325, behavior: 'smooth' });
  });

  it('clamps the scroll target to 0 instead of going negative for a block already near the top', () => {
    document.body.innerHTML = '<div data-kometio-block-id="a">block</div>';
    Range.prototype.getBoundingClientRect = vi.fn(
      () => ({ top: 10, left: 0, width: 100, height: 50 }) as DOMRect,
    );
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    scrollBlockIntoView(document, 'a');

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('returns false without throwing when the block id is not in the document', () => {
    document.body.innerHTML = '<div data-kometio-block-id="a">block</div>';
    expect(scrollBlockIntoView(document, 'missing')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes &, < and > so TipTap never parses user text as markup', () => {
    expect(escapeHtml('Tom & Jerry <script>')).toBe(
      'Tom &amp; Jerry &lt;script&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Ciao mondo')).toBe('Ciao mondo');
  });
});

describe('applyBlockStyleCss', () => {
  afterEach(() => {
    document.getElementById('kometio-block-style-overrides')?.remove();
  });

  it('creates the style element on the first call and writes the css into it', () => {
    applyBlockStyleCss(
      document,
      '.kometio-button { --kometio-override-bg: red; }',
    );

    const styleEl = document.getElementById('kometio-block-style-overrides');
    expect(styleEl?.tagName).toBe('STYLE');
    expect(styleEl?.textContent).toBe(
      '.kometio-button { --kometio-override-bg: red; }',
    );
    expect(styleEl?.parentElement).toBe(document.head);
  });

  it('reuses the same element and replaces its content on a later call, not appending a second one', () => {
    applyBlockStyleCss(
      document,
      '.kometio-button { --kometio-override-bg: red; }',
    );
    applyBlockStyleCss(
      document,
      '.kometio-banner { --kometio-override-bg: blue; }',
    );

    const styleEls = document.head.querySelectorAll(
      '#kometio-block-style-overrides',
    );
    expect(styleEls).toHaveLength(1);
    expect(styleEls[0]?.textContent).toBe(
      '.kometio-banner { --kometio-override-bg: blue; }',
    );
  });

  it('clears the style element when called with an empty string (last styled type removed)', () => {
    applyBlockStyleCss(
      document,
      '.kometio-button { --kometio-override-bg: red; }',
    );
    applyBlockStyleCss(document, '');

    expect(
      document.getElementById('kometio-block-style-overrides')?.textContent,
    ).toBe('');
  });
});

describe('root blocks travel with their wrapper', () => {
  /*
   * `.kometio-root-block` carries a root block's spacing and, since
   * ADR-0049, the width and alignment that used to be written on `<main>`.
   * Every DOM operation the bridge performs on a root block has to move,
   * remove or reorder that wrapper rather than the block inside it — the
   * three tests here each pin one operation that did not, and each failed
   * before the wrapper became load-bearing enough to notice.
   */
  const rootList = (...ids: string[]) =>
    '<main data-kometio-root-blocks="page" class="flex flex-col">' +
    ids
      .map(
        (id) =>
          '<div class="kometio-root-block">' +
          `<div data-kometio-block-id="${id}" style="display:contents">${id}</div>` +
          '</div>',
      )
      .join('') +
    '</main>';

  const wrappers = () => [
    ...document.querySelectorAll(
      '[data-kometio-root-blocks="page"] > .kometio-root-block',
    ),
  ];
  const orderOf = () =>
    wrappers().map((wrapper) =>
      wrapper
        .querySelector('[data-kometio-block-id]')
        ?.getAttribute('data-kometio-block-id'),
    );

  it('removes the wrapper with the block, leaving no empty band behind', () => {
    document.body.innerHTML = rootList('a', 'b');

    applyBlockRemove(document, 'a');

    expect(wrappers()).toHaveLength(1);
    expect(orderOf()).toEqual(['b']);
  });

  it('leaves the spacing to the stylesheet, writing no style of its own', () => {
    // The gap between root blocks is `.kometio-root-block` and its
    // `:last-child` rule now (ADR-0050), so removing the last block
    // promotes its neighbour with nothing for the bridge to recompute.
    // It used to be an inline style per block, which meant every insert
    // and delete had to re-space the neighbours — and had to tell a
    // default gap from one somebody typed, or silently discard it.
    document.body.innerHTML = rootList('a', 'b');

    applyBlockRemove(document, 'b');
    applyBlockInsert(
      document,
      '<div data-kometio-block-id="c">third</div>',
      null,
      null,
      null,
    );

    for (const wrapper of wrappers()) {
      expect(wrapper.getAttribute('style')).toBeNull();
    }
  });

  it('reorders the wrappers, instead of collapsing every block into the first one', () => {
    document.body.innerHTML = rootList('a', 'b', 'c');

    applyBlockReorder(document, null, ['c', 'a', 'b'], null);

    expect(wrappers()).toHaveLength(3);
    expect(orderOf()).toEqual(['c', 'a', 'b']);
  });
});

describe('a section instance is one object on the canvas', () => {
  /*
   * The blocks inside a section instance carry ids — they have to, or
   * their per-instance style rules would not match — but they are not in
   * the page's block tree. Selecting or dragging one is a request the
   * editor cannot honour, so they never reach it (docs/adr/0059).
   */
  it('leaves out the blocks rendered inside a section', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-kometio-block-id="page-block"></div>
      <div data-kometio-block-id="instance">
        <section data-kometio-section-content>
          <div data-kometio-block-id="instance--inner-1"></div>
          <div data-kometio-block-id="instance--inner-2"></div>
        </section>
      </div>`;

    expect(collectBlockElements(root).map(blockIdOf)).toEqual([
      'page-block',
      'instance',
    ]);
  });
});
