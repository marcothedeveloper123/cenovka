import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { extractJsonLd, findProduct, readBreadcrumb } from './jsonld.ts';

describe('extractJsonLd', () => {
  test('parses one block', () => {
    const html = '<script type="application/ld+json">{"@type":"Product","name":"X"}</script>';
    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 1);
  });

  test('skips malformed blocks', () => {
    const html = '<script type="application/ld+json">not json</script>';
    assert.deepEqual(extractJsonLd(html), []);
  });

  test('handles multiple blocks', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Org"}</script>' +
      '<script type="application/ld+json">{"@type":"Product","name":"Y"}</script>';
    assert.equal(extractJsonLd(html).length, 2);
  });
});

describe('findProduct', () => {
  test('finds direct Product node', () => {
    const found = findProduct({ '@type': 'Product', name: 'X' });
    assert.equal(found?.name, 'X');
  });

  test('descends into @graph', () => {
    const found = findProduct({ '@graph': [{ '@type': 'Org' }, { '@type': 'Product', name: 'Y' }] });
    assert.equal(found?.name, 'Y');
  });

  test('returns null when none', () => {
    assert.equal(findProduct({ '@type': 'Org' }), null);
    assert.equal(findProduct(null), null);
    assert.equal(findProduct([]), null);
  });
});

describe('readBreadcrumb', () => {
  test('reads breadcrumb names and drops "Home"', () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        '@type': 'BreadcrumbList',
        itemListElement: [
          { name: 'Home' },
          { name: 'Drogerie' },
          { name: 'Péče o ústa' },
        ],
      }) +
      '</script>';
    assert.equal(readBreadcrumb(html), 'Drogerie > Péče o ústa');
  });

  test('handles nested item.name shape', () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [{ item: { name: 'A' } }, { item: { name: 'B' } }],
          },
        ],
      }) +
      '</script>';
    assert.equal(readBreadcrumb(html), 'A > B');
  });

  test('returns undefined when none present', () => {
    assert.equal(readBreadcrumb(''), undefined);
  });
});
