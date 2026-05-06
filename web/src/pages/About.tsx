import type { Dataset } from '../lib/types.ts';

interface Props {
  dataset: Dataset;
}

const SOURCES: Array<{ store: string; url: string; method: string }> = [
  { store: 'Tesco', url: 'nakup.itesco.cz', method: 'JSON-LD na stránkách produktů' },
  { store: 'Rohlík', url: 'rohlik.cz', method: 'JSON-LD + sitemap.xml' },
  { store: 'Košík', url: 'kosik.cz', method: 'interní API /api/front/product/slug/' },
  { store: 'Billa', url: 'shop.billa.cz', method: 'Nuxt 3 __NUXT_DATA__ payload (REWE)' },
  { store: 'Penny', url: 'penny.cz', method: 'Nuxt 3 __NUXT_DATA__ payload (REWE)' },
  { store: 'Globus', url: 'globus.cz', method: 'parsování listing stránek' },
  { store: 'Kaufland', url: 'kaufland.cz', method: 'API /product-tiles + reálný Chrome' },
];

export function About({ dataset }: Props): React.ReactElement {
  return (
    <div className="container" style={{ padding: '40px 28px 64px', maxWidth: 760 }}>
      <div className="meta">O&nbsp;PROJEKTU</div>
      <h1 className="display" style={{ fontSize: 44, lineHeight: 1.1, margin: '8px 0 24px' }}>
        Cenovka je veřejná služba.
      </h1>

      <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--ink-2)', marginBottom: 24 }}>
        Sleduje ceny potravin v sedmi českých řetězcích a dělá je porovnatelné. Bez reklam,
        bez účtu, bez sledování. Inspirováno rakouským{' '}
        <a href="https://heisse-preise.io" target="_blank" rel="noopener noreferrer" style={{ borderBottom: '1px solid currentColor' }}>
          heisse-preise.io
        </a>
        .
      </p>

      <Section title="Proč existuje">
        <p>
          Ceny v supermarketech se za poslední tři roky výrazně rozkolísaly. Stejné jogurty
          stojí v jednom obchodě 23 korun a o ulici dál 38. Žádný oficiální nástroj rozdíly
          neukazuje — řetězce nemají důvod, aby je ukazovaly. Cenovka tu mezeru zaplňuje.
        </p>
        <p>
          Není to obchodní projekt. Není to srovnávač s affiliate odkazy. Je to{' '}
          <strong>otevřený dataset</strong>, který si může kdokoli stáhnout, použít,
          rozvíjet — pod licencí ODbL.
        </p>
      </Section>

      <Section title="Jak data sbíráme">
        <p>
          Každou noc proběhne stahování z veřejných stránek řetězců. Žádné přihlašování,
          žádné API klíče, žádné CAPTCHA-bypass triky. Jen veřejně dostupné stránky tak,
          jak je vidí kdokoli s prohlížečem.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule-2)', textAlign: 'left' }}>
              <th style={{ padding: '8px 0' }}>Řetězec</th>
              <th style={{ padding: '8px 0' }}>Zdroj</th>
              <th style={{ padding: '8px 0' }}>Metoda</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.store} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={{ padding: '8px 0', fontWeight: 500 }}>{s.store}</td>
                <td style={{ padding: '8px 0' }}><span className="mono" style={{ fontSize: 12 }}>{s.url}</span></td>
                <td style={{ padding: '8px 0', color: 'var(--ink-3)' }}>{s.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
          Albert spustil 23. prosince 2025 ukončení svého e-shopu, takže není zahrnut. Lidl
          v Česku nemá veřejnou online prodejnu, jen příležitostné letáky.
        </p>
      </Section>

      <Section title="Jak párujeme produkty napříč řetězci">
        <p>
          Stejné máslo v Tescu a v Penny má jiné ID, jiný název („Madeta máslo 250g" vs.
          „Madeta jihočeské máslo 250 g"), občas i jinak uvedenou značku. Aby porovnání
          dávalo smysl, párujeme produkty heuristikou:
        </p>
        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
          <li>Rozdělení do skupin podle (kategorie, jednotka, množství).</li>
          <li>Vážená Jaccardova podobnost názvů s IDF váhou frekventovaných tokenů.</li>
          <li>Kontrola shody značky (necitlivá na diakritiku a velikost).</li>
          <li>
            Pravidlo „rozlišovacích tokenů" — pokud oba produkty mají vlastní variantní
            slova (např. <em>višeň</em> vs. <em>jahoda</em>), pár se zamítne.
          </li>
        </ol>
        <p>
          Detaily a parametry najdeš ve zdrojovém kódu (<span className="mono">src/common/match-core.ts</span>).
          Skupiny nejsou dokonalé — některé se rozpadnou na menší shluky, jiné spojí
          podobné produkty různých značek. Páry napříč řetězci dnes pokrývají zhruba
          polovinu katalogu.
        </p>
      </Section>

      <Section title="Soukromí">
        <p>
          Cenovka neukládá žádná data o&nbsp;tobě. Žádné cookies, žádné analytics, žádný
          tracking pixel. Tvé oblíbené a&nbsp;košík jsou v&nbsp;<span className="mono">localStorage</span> tvého
          prohlížeče — nikdy neopustí tvůj počítač.
        </p>
        <p>
          Statické soubory hostuje Cloudflare Pages, takže přístupové logy jdou tam. Žádný
          z&nbsp;těch logů Cenovka nečte.
        </p>
      </Section>

      <Section title="Licence a přispívání">
        <p>
          Dataset: <strong>ODbL 1.0</strong> — můžeš s&nbsp;ním cokoli, jen uveď zdroj a sdílej
          případné odvozeniny pod stejnou licencí.<br />
          Kód: <strong>MIT</strong> — bez ceremonie.<br />
          Issues, PR, návrhy:{' '}
          <a href="https://github.com/marco/cenovka" target="_blank" rel="noopener noreferrer" style={{ borderBottom: '1px solid currentColor' }}>
            github.com/marco/cenovka
          </a>
        </p>
      </Section>

      <Section title="Důležité co Cenovka neumí">
        <ul style={{ paddingLeft: 20, margin: '0 0 0 0' }}>
          <li>Nezná tvou nejbližší prodejnu — ceny jsou e-shopové, regionální rozdíly jsou minimální.</li>
          <li>Nezahrnuje akce a slevy z letáků, jen cenu uvedenou na webu v okamžiku stahování.</li>
          <li>Nepočítá dopravné u Rohlíku/Košíku — porovnává ceny zboží.</li>
          <li>Nepořádává „nejlepší obchod" — to závisí na tvém konkrétním nákupu.</li>
        </ul>
      </Section>

      <p style={{ marginTop: 40, fontSize: 13, color: 'var(--ink-3)' }}>
        Aktuální dataset: {dataset.products.length.toLocaleString('cs')} produktů,{' '}
        {dataset.groups.length.toLocaleString('cs')} skupin napříč řetězci.{' '}
        Generováno {new Date(dataset.generatedAt).toLocaleDateString('cs')}.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 className="display" style={{
        fontSize: 22,
        margin: 0,
        borderTop: '2px solid var(--ink)',
        padding: '16px 0 8px',
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        {children}
      </div>
    </section>
  );
}
