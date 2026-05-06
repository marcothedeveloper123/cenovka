import { tokens } from '../src/common/match-core.ts';
import type { CanonicalProduct } from '../src/common/types.ts';
import { readFile } from 'node:fs/promises';

async function main() {
  const data = JSON.parse(await readFile('data/canonical/latest.json', 'utf8')) as { products: CanonicalProduct[] };
  const bucket = data.products.filter(
    (p) => p.available && p.categoryCanonical === 'napoje' && p.unit === 'ml' && p.quantity === 750,
  );
  console.log('bucket size:', bucket.length);
  const N = bucket.length;
  const freq = new Map<string, number>();
  for (const p of bucket) {
    for (const t of tokens(p.name, p.brand)) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const weight = (t: string) => Math.log(N / Math.max(1, freq.get(t) ?? 1)) + 1;

  // Pick 2 same-brand, different-variety Habánské Sklepy products
  const hs = bucket.filter((p) => /habánské sklepy/i.test(p.name));
  console.log('\nHabánské Sklepy products in bucket:', hs.length);
  if (hs.length < 2) return;
  const A = hs.find((p) => /müller thurgau/i.test(p.name)) ?? hs[0]!;
  const B = hs.find((p) => /veltlínské zelené|frankovka/i.test(p.name)) ?? hs[1]!;
  console.log('\nA:', A.name);
  console.log('B:', B.name);
  const tA = tokens(A.name, A.brand);
  const tB = tokens(B.name, B.brand);
  console.log('tokens A:', [...tA].join(', '));
  console.log('tokens B:', [...tB].join(', '));
  const shared = [...tA].filter((t) => tB.has(t));
  const onlyA = [...tA].filter((t) => !tB.has(t));
  const onlyB = [...tB].filter((t) => !tA.has(t));
  console.log('\nshared:', shared.map((t) => `${t}(${(freq.get(t)??0)}, w=${weight(t).toFixed(2)})`).join(', '));
  console.log('only A:', onlyA.map((t) => `${t}(${(freq.get(t)??0)}, w=${weight(t).toFixed(2)})`).join(', '));
  console.log('only B:', onlyB.map((t) => `${t}(${(freq.get(t)??0)}, w=${weight(t).toFixed(2)})`).join(', '));
  const sharedW = shared.reduce((s, t) => s + weight(t), 0);
  const unionW = [...new Set([...tA, ...tB])].reduce((s, t) => s + weight(t), 0);
  console.log(`\nweighted shared = ${sharedW.toFixed(2)}, union = ${unionW.toFixed(2)}, score = ${(sharedW/unionW).toFixed(3)}`);
  const unwShared = shared.length, unwUnion = new Set([...tA, ...tB]).size;
  console.log(`unweighted Jaccard = ${unwShared}/${unwUnion} = ${(unwShared/unwUnion).toFixed(3)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
