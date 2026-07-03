interface Props {
  onGetStarted: () => void;
}

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Any image in, a real pattern out',
    body: 'Photos, drawings, logos, or existing pixel art — the image is converted to deterministic pixel art, then to a chart, row-by-row written instructions, a color legend with yardage estimates, and a printable PDF.',
  },
  {
    title: 'Auto mode picks the settings',
    body: 'The image is analyzed and the technique, chart size, color count, and sampling are chosen for you — following standard colorwork practice — with a plain-language reason for every choice. Override any of it whenever you like.',
  },
  {
    title: 'Three techniques',
    body: 'Stranded (Fair Isle) colorwork with float warnings, intarsia with a bobbin-count estimate, and single-color knit/purl texture with right/wrong-side-aware instructions.',
  },
  {
    title: 'Gauge-aware charts',
    body: 'Knit stitches are wider than they are tall. Supply your gauge and the crop, chart cells, and finished-size estimate are all corrected so what you knit looks like what you saw.',
  },
  {
    title: 'Repeats & seamless motifs',
    body: 'Tile a motif across or down for borders and allover designs, with content-aware edge blending so the repeat loops without a visible seam.',
  },
  {
    title: 'Share with a link',
    body: 'Every pattern encodes into a self-contained link — opening it renders the exact same chart with no upload, no account, and no server-side storage.',
  },
];

export function LandingPage({ onGetStarted }: Props) {
  return (
    <div className="landing">
      <section className="landing__hero">
        <h2>Turn any image into a knitting pattern you can actually knit.</h2>
        <p>
          Upload a picture, get a complete colorwork chart with written instructions, yarn
          estimates, and a printable PDF — sized to your stitches, matched to your gauge, and
          identical every single time.
        </p>
        <button type="button" className="landing__cta" onClick={onGetStarted}>
          Make a pattern
        </button>
        <p className="landing__hint">Free to try — no installation required.</p>
      </section>

      <section className="landing__features" aria-label="Features">
        {FEATURES.map((f) => (
          <article key={f.title} className="landing__feature">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className="landing__how">
        <h3>How it works</h3>
        <ol>
          <li>Drop in an image — a photo, a sketch, a logo, or pixel art.</li>
          <li>
            Auto mode analyzes it and proposes the technique, size, and colors (or set everything
            yourself).
          </li>
          <li>Watch the live chart preview update as you adjust.</li>
          <li>Download the PDF/PNG or copy a share link — then cast on.</li>
        </ol>
        <button type="button" className="landing__cta" onClick={onGetStarted}>
          Get started
        </button>
      </section>
    </div>
  );
}
