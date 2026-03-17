import { createClient } from '@supabase/supabase-js';

const vertexUrl = process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL || '';
const vertexKey = process.env.VERTEX_SUPABASE_SERVICE_KEY || '';

type Costume = {
  id: string;
  name: string;
  description: string;
  photo_url: string;
  price: number;
};

export default async function CatalogPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const supabase = createClient(vertexUrl, vertexKey);

  const { data: costumes } = await supabase
    .from('costumes')
    .select('*')
    .eq('brand_key', brand)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  const brandLabel = brand.replace(/_/g, ' ');
  const items: Costume[] = costumes || [];

  return (
    <html lang="ro">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{brandLabel} — Catalog Costume</title>
        <meta name="description" content={`Vedeți toate costumele disponibile de la ${brandLabel}`} />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #fff;
            min-height: 100vh;
          }
          .hero {
            text-align: center;
            padding: 3rem 1.5rem 2rem;
            background: linear-gradient(180deg, rgba(139, 92, 246, 0.15), transparent);
          }
          .hero h1 {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, #a78bfa, #ec4899);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
          }
          .hero p {
            color: #a0a0b0;
            font-size: 0.9rem;
          }
          .count {
            display: inline-block;
            margin-top: 0.75rem;
            background: rgba(139, 92, 246, 0.2);
            border: 1px solid rgba(139, 92, 246, 0.3);
            color: #a78bfa;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 0.3rem 0.8rem;
            border-radius: 99px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 1rem;
            padding: 1rem 1.5rem 3rem;
            max-width: 900px;
            margin: 0 auto;
          }
          @media (min-width: 600px) {
            .grid { grid-template-columns: repeat(3, 1fr); }
          }
          .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 30px rgba(139, 92, 246, 0.2);
            border-color: rgba(139, 92, 246, 0.3);
          }
          .card-img {
            width: 100%;
            aspect-ratio: 1;
            object-fit: cover;
            background: rgba(0,0,0,0.3);
          }
          .card-img-placeholder {
            width: 100%;
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3rem;
            background: rgba(0,0,0,0.3);
            opacity: 0.3;
          }
          .card-body {
            padding: 0.75rem;
          }
          .card-body h3 {
            font-size: 0.85rem;
            font-weight: 700;
            margin-bottom: 0.25rem;
          }
          .card-body .desc {
            font-size: 0.7rem;
            color: #999;
            margin-bottom: 0.25rem;
          }
          .card-body .price {
            font-size: 0.85rem;
            font-weight: 700;
            color: #10b981;
          }
          .empty {
            text-align: center;
            padding: 4rem 1.5rem;
            color: #666;
          }
          .empty .icon { font-size: 4rem; margin-bottom: 1rem; }
          .footer {
            text-align: center;
            padding: 2rem;
            color: #555;
            font-size: 0.7rem;
          }
          .footer a { color: #a78bfa; text-decoration: none; }
        `}</style>
      </head>
      <body>
        <div className="hero">
          <h1>🎭 {brandLabel}</h1>
          <p>Catalog Costume Disponibile</p>
          {items.length > 0 && <div className="count">{items.length} costume</div>}
        </div>

        {items.length === 0 ? (
          <div className="empty">
            <div className="icon">🎭</div>
            <p>Momentan nu sunt costume disponibile.</p>
          </div>
        ) : (
          <div className="grid">
            {items.map((c) => (
              <div key={c.id} className="card">
                {c.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo_url} alt={c.name} className="card-img" loading="lazy" />
                ) : (
                  <div className="card-img-placeholder">🎭</div>
                )}
                <div className="card-body">
                  <h3>{c.name}</h3>
                  {c.description && <div className="desc">{c.description}</div>}
                  {c.price > 0 && <div className="price">{c.price} RON</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="footer">
          Powered by <a href="https://superparty.ro">Superparty</a> ✨
        </div>
      </body>
    </html>
  );
}
