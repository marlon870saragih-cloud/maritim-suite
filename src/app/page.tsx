'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useT, LangToggle } from '@/lib/i18n'

/**
 * Landing page publik — arah "Port Call Ledger" (tema kuningan + tinta + kertas/buku).
 * Konsep buku: sampul gelap (hero tinta) → halaman ivory ber-garis ledger (harga) → sampul
 * belakang (footer). Bilingual ID/EN: auto-detect dari navigator.language, bisa diganti manual.
 * Statis (tanpa video) = ringan. Angka tetap dihitung mesin, dokumen tersusun otomatis.
 */
type Lang = 'id' | 'en'

export default function LandingPage() {
  const t = useT(STR)

  return (
    <div className="lnd-root">
      {/* ============ HERO — sampul (tinta + kuningan) ============ */}
      <section className="lnd-hero">
        <div className="lnd-depth" aria-hidden="true" />

        <nav className="lnd-nav">
          <div className="lnd-brand">
            <span className="lnd-mark">
              <Image src="/logo-transparent.png" alt="Logo PT Tribuana Solusi Maritim" width={120} height={120} priority />
            </span>
            <span className="lnd-name">
              PT Tribuana Solusi Maritim<span>Maritime Suite</span>
            </span>
          </div>
          <div className="lnd-navright">
            <a href="#harga" className="lnd-navlink">{t.navHarga}</a>
            <Link href="/login" className="lnd-navlink">{t.navMasuk}</Link>
            <LangToggle tone="ink" />
            <Link href="/register" className="lnd-btn lnd-btn-line lnd-btn-sm">{t.navCoba}</Link>
          </div>
        </nav>

        <main className="lnd-hero-grid">
          <section className="lnd-pitch">
            <p className="lnd-eyebrow">
              <span className="lnd-anchor" aria-hidden="true" /> {t.eyebrow}
            </p>
            <h1 className="lnd-h1">
              {t.h1a} <span className="lnd-ital">{t.h1b}</span>
            </h1>
            <p className="lnd-lead">{t.lead}</p>

            <div className="lnd-cta">
              <Link href="/register" className="lnd-btn lnd-btn-brass">
                {t.ctaPrimary}
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link href="/login" className="lnd-btn lnd-btn-line">{t.ctaMasuk}</Link>
            </div>

            <p className="lnd-manifest" aria-label={t.manifestLabel}>
              <span>EPDA</span><span>FPDA</span><span>SOF</span><span>NOR</span><span>FAL</span>
              <span>Invoice</span><span>{t.kwitansi}</span><span className="lnd-mf-ai">{t.aiTag}</span>
            </p>
            <p className="lnd-note">{t.note}</p>
          </section>

          {/* SIGNATURE — kartu Statement of Facts di atas kertas peta */}
          <aside className="lnd-doc">
            <div className="lnd-doc-stamp" aria-hidden="true"><span /></div>
            <div className="lnd-doc-head">
              <span className="lnd-doc-kind">Statement of Facts</span>
              <span className="lnd-doc-no">SOF/2026/06/0044</span>
            </div>
            <p className="lnd-doc-vessel">MT&nbsp;Soechi&nbsp;Asia · IMO&nbsp;9456231 · GT&nbsp;8,432 · Samarinda</p>

            <ol className="lnd-log">
              {t.chrono.map((e) => (
                <li key={e.t}><time>{e.t}</time><span>{e.d}</span></li>
              ))}
            </ol>

            <div className="lnd-doc-foot">
              <span className="lnd-doc-fk">EPDA · disbursement</span>
              <span className="lnd-doc-total">Rp 76.400.000</span>
            </div>
            <p className="lnd-doc-by">{t.docBy}</p>
          </aside>
        </main>
      </section>

      {/* ============ PRICING — halaman ledger (kertas ivory) ============ */}
      <section className="lnd-pricing" id="harga">
        <div className="lnd-pricing-head">
          <p className="lnd-eyebrow lnd-eyebrow-paper">
            <span className="lnd-anchor" aria-hidden="true" /> {t.priceEyebrow}
          </p>
          <h2 className="lnd-h2">{t.priceH2}</h2>
          <p className="lnd-price-sub">{t.priceSub}</p>
          <p className="lnd-price-annual">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {t.annualNote}
          </p>
        </div>

        <div className="lnd-plans">
          {t.plans.map((p) => (
            <div className={`lnd-plan${p.featured ? ' lnd-plan-featured' : ''}${p.custom ? ' lnd-plan-custom' : ''}`} key={p.name}>
              {p.featured && <div className="lnd-plan-tag">{t.priceTag}</div>}
              <h3 className="lnd-plan-name">{p.name}</h3>
              <p className="lnd-plan-modules">{p.modules}</p>
              <div className="lnd-plan-price">
                {p.custom ? (
                  <span className="lnd-plan-amt lnd-plan-amt-custom">{t.customPrice}</span>
                ) : (
                  <>
                    <span className="lnd-plan-cur">Rp</span>
                    <span className="lnd-plan-amt">{p.price}</span>
                    <span className="lnd-plan-per">{t.perMonth}</span>
                  </>
                )}
              </div>
              <ul className="lnd-plan-feats">
                {p.features.map((f) => (
                  <li key={f}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {p.custom ? (
                <a
                  href="https://wa.me/6282154950193?text=Halo%20Maritime%20Suite%2C%20saya%20ingin%20bertanya%20tentang%20paket%20Custom%20%2F%20pembuatan%20aplikasi."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lnd-btn lnd-btn-block lnd-btn-ink"
                >
                  {t.customCta}
                </a>
              ) : (
                <Link href="/register" className={`lnd-btn lnd-btn-block ${p.featured ? 'lnd-btn-brass' : 'lnd-btn-ink'}`}>
                  {t.planCta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="lnd-pricing-note">{t.priceNote}</p>
      </section>

      {/* ============ FOOTER — sampul belakang ============ */}
      <footer className="lnd-footer">
        <div className="lnd-footer-inner">
          <div className="lnd-footer-brand">
            <Image src="/logo-transparent.png" alt="PT Tribuana Solusi Maritim" width={88} height={88} />
            <div>
              <div className="lnd-footer-co">PT Tribuana Solusi Maritim</div>
              <div className="lnd-footer-tag">{t.footerTag}</div>
            </div>
          </div>
          <div className="lnd-footer-contact">
            <div>Jl. Abdul Azis Samad No. 59B, Kel. Pelita, Samarinda, Kalimantan Timur</div>
            <div>
              {t.phone} <a href="tel:05412226588">0541-2226588</a> · {t.mobile}{' '}
              <a href="tel:+6282154950193">0821-5495-0193</a>
            </div>
            <div>
              <a href="mailto:adm@tribuanagency.co.id">adm@tribuanagency.co.id</a>
            </div>
          </div>
        </div>
        <div className="lnd-footer-bar">{t.rights}</div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  )
}

// ===== Konten bilingual (ID / EN) =====
const STR: Record<Lang, {
  navHarga: string; navMasuk: string; navCoba: string
  eyebrow: string; h1a: string; h1b: string; lead: string
  ctaPrimary: string; ctaMasuk: string; manifestLabel: string; kwitansi: string; aiTag: string; note: string
  chrono: { t: string; d: string }[]; docBy: string
  priceEyebrow: string; priceH2: string; priceSub: string; perMonth: string; priceTag: string; planCta: string; priceNote: string
  annualNote: string; customPrice: string; customCta: string
  plans: { name: string; modules: string; price: string; featured?: boolean; custom?: boolean; features: string[] }[]
  footerTag: string; phone: string; mobile: string; rights: string
}> = {
  id: {
    navHarga: 'Harga', navMasuk: 'Masuk', navCoba: 'Coba gratis',
    eyebrow: 'Software keagenan kapal · Indonesia',
    h1a: 'Dari labuh sampai invoice,', h1b: 'satu alur dokumen.',
    lead: 'Port call, clearance, EPDA/FPDA, hingga invoice — terbit rapi & ber-branding perusahaan Anda. Angka dihitung mesin, dokumen tersusun otomatis, kini dengan Asisten AI.',
    ctaPrimary: 'Mulai uji coba 14 hari', ctaMasuk: 'Masuk',
    manifestLabel: 'Dokumen yang dihasilkan', kwitansi: 'Kwitansi', aiTag: '+ Asisten AI',
    note: 'Tanpa kartu kredit · akses semua modul selama uji coba.',
    chrono: [
      { t: '06:00', d: 'Tiba di area labuh — EOSP' },
      { t: '08:30', d: 'Notice of Readiness diserahkan' },
      { t: '13:40', d: 'Sandar, all fast' },
      { t: '14:30', d: 'Mulai muat' },
      { t: '02:10', d: 'Selesai muat — dokumen on board' },
    ],
    docBy: 'Subtotal, agency fee & total dihitung otomatis — bukan diketik.',
    priceEyebrow: 'Harga berlangganan',
    priceH2: 'Bayar sesuai modul yang Anda pakai',
    priceSub: 'Pilih paket sesuai kebutuhan. Semua paket termasuk uji coba gratis 14 hari, ditagih per bulan.',
    perMonth: '/bulan', priceTag: 'Paling hemat', planCta: 'Coba gratis 14 hari',
    priceNote: '4 modul: Finance Generator · Maritime Dokumen · Port Call Manager · DA & Invoice Tracker. Bisa upgrade kapan saja.',
    annualNote: 'Berlangganan setahun — gratis 2 bulan.',
    customPrice: 'Custom', customCta: 'Hubungi via WhatsApp',
    plans: [
      { name: '1 Modul', modules: '1 modul pilihan Anda', price: '350.000', featured: false,
        features: ['1 dari 4 modul', '2 akun email (pengguna)', '100 dokumen/formulir per bulan', 'PDF ber-branding perusahaan'] },
      { name: '2 Modul', modules: '2 modul pilihan Anda', price: '690.000', featured: false,
        features: ['2 dari 4 modul', '5 akun email (pengguna)', '200 dokumen/formulir per bulan', 'Semua fitur paket 1 Modul'] },
      { name: 'Semua Modul', modules: 'Keempat modul aktif', price: '990.000', featured: true,
        features: ['Keempat modul aktif penuh', 'Email/pengguna bebas', 'Dokumen/formulir bebas', 'Priority support'] },
      { name: 'Custom', modules: 'Kebutuhan khusus', price: '', custom: true,
        features: ['Dokumen/formulir khusus sesuai permintaan', 'Rencana pembuatan aplikasi', 'Integrasi & penyesuaian', 'Konsultasi langsung'] },
    ],
    footerTag: 'Maritime Suite — software keagenan kapal',
    phone: 'Telp', mobile: 'HP',
    rights: '© 2026 PT Tribuana Solusi Maritim. Seluruh hak cipta dilindungi.',
  },
  en: {
    navHarga: 'Pricing', navMasuk: 'Sign in', navCoba: 'Try free',
    eyebrow: 'Ship agency software · Indonesia',
    h1a: 'From anchorage to invoice,', h1b: 'one document flow.',
    lead: 'Port call, clearance, EPDA/FPDA, through to invoice — issued clean and branded to your company. Figures computed by the system, documents assembled automatically, now with an AI assistant.',
    ctaPrimary: 'Start 14-day trial', ctaMasuk: 'Sign in',
    manifestLabel: 'Documents produced', kwitansi: 'Receipt', aiTag: '+ AI assistant',
    note: 'No credit card · full module access during the trial.',
    chrono: [
      { t: '06:00', d: 'Arrived at anchorage — EOSP' },
      { t: '08:30', d: 'Notice of Readiness tendered' },
      { t: '13:40', d: 'Berthed, all fast' },
      { t: '14:30', d: 'Cargo loading commenced' },
      { t: '02:10', d: 'Loading completed — docs on board' },
    ],
    docBy: 'Subtotal, agency fee & total computed automatically — not typed.',
    priceEyebrow: 'Subscription pricing',
    priceH2: 'Pay for the modules you use',
    priceSub: 'Choose the plan that fits. Every plan includes a 14-day free trial, billed monthly.',
    perMonth: '/month', priceTag: 'Best value', planCta: 'Start 14-day trial',
    priceNote: '4 modules: Finance Generator · Maritime Documents · Port Call Manager · DA & Invoice Tracker. Upgrade anytime.',
    annualNote: 'Subscribe yearly — get 2 months free.',
    customPrice: 'Custom', customCta: 'Contact via WhatsApp',
    plans: [
      { name: '1 module', modules: '1 module of your choice', price: '350.000', featured: false,
        features: ['1 of 4 modules', '2 email accounts (users)', '100 documents/forms per month', 'PDFs branded to your company'] },
      { name: '2 modules', modules: '2 modules of your choice', price: '690.000', featured: false,
        features: ['2 of 4 modules', '5 email accounts (users)', '200 documents/forms per month', 'Everything in the 1-module plan'] },
      { name: 'All modules', modules: 'All four modules active', price: '990.000', featured: true,
        features: ['All four modules fully active', 'Unlimited emails/users', 'Unlimited documents/forms', 'Priority support'] },
      { name: 'Custom', modules: 'Special requirements', price: '', custom: true,
        features: ['Custom documents/forms on request', 'App development plans', 'Integrations & customization', 'Direct consultation'] },
    ],
    footerTag: 'Maritime Suite — ship agency software',
    phone: 'Tel', mobile: 'Mobile',
    rights: '© 2026 PT Tribuana Solusi Maritim. All rights reserved.',
  },
}

// ===== CSS (prefix .lnd- agar tidak bocor ke app) =====
const CSS = `
.lnd-root{
  --ink:#0A1C24; --ink-2:#0E2731; --chart:#F2EBD9; --chart-line:#D9CDA8; --chart-ink:#1C2A2C; --chart-mut:#6B6553;
  --brass:#C79A3E; --brass-2:#A87E26; --brass-deep:#7A5E1C; --signal:#C0432E; --depth:#3C6B7A; --paper-mut:#8FA6AB;
  --maxw:1160px;
  font-family:var(--font-body),system-ui,sans-serif; color:#DCE6E6; -webkit-font-smoothing:antialiased; background:var(--ink);
}
.lnd-root *{box-sizing:border-box}
.lnd-root a{color:inherit; text-decoration:none}
.lnd-root button:focus-visible, .lnd-root a:focus-visible{outline:2px solid var(--brass); outline-offset:3px; border-radius:4px}

/* ----- HERO (sampul tinta) ----- */
.lnd-hero{position:relative; overflow:hidden; min-height:100svh; display:flex; flex-direction:column; background:var(--ink)}
.lnd-depth{position:absolute; inset:0; z-index:0; pointer-events:none; opacity:.5;
  background:
    repeating-radial-gradient(circle at 92% 8%, rgba(60,107,122,.16) 0 1px, transparent 1px 52px),
    radial-gradient(120% 90% at 88% -10%, rgba(60,107,122,.14), transparent 55%);
}

.lnd-nav{position:relative; z-index:2; max-width:var(--maxw); width:100%; margin:0 auto;
  display:flex; align-items:center; justify-content:space-between; gap:16px; padding:22px clamp(18px,4vw,40px)}
.lnd-brand{display:flex; align-items:center; gap:12px}
.lnd-mark img{height:44px!important; width:auto!important; display:block}
.lnd-name{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1rem; line-height:1.1; color:#F4F0E6}
.lnd-name span{display:block; font-family:var(--font-mono),monospace; font-weight:400; font-size:.62rem;
  letter-spacing:.26em; text-transform:uppercase; color:var(--brass); margin-top:3px}
.lnd-navright{display:flex; align-items:center; gap:18px; font-size:.92rem; color:#b9cccf}
.lnd-navlink{transition:color .2s}
.lnd-navlink:hover{color:#fff}

.lnd-lang{display:inline-flex; border:1px solid rgba(143,166,171,.34); border-radius:9px; overflow:hidden}
.lnd-lang button{appearance:none; border:0; background:transparent; cursor:pointer; padding:6px 10px;
  font-family:var(--font-mono),monospace; font-size:.72rem; letter-spacing:.06em; color:#9fb6b9; transition:background .2s, color .2s}
.lnd-lang button.on{background:var(--brass); color:#231a06; font-weight:700}
.lnd-lang button:not(.on):hover{color:#fff}

.lnd-btn{display:inline-flex; align-items:center; justify-content:center; gap:9px; height:50px; padding:0 24px;
  border-radius:11px; font-weight:600; font-size:1rem; font-family:var(--font-body),sans-serif; cursor:pointer;
  transition:transform .12s, background .2s, border-color .2s, color .2s}
.lnd-btn:active{transform:translateY(1px)}
.lnd-btn-sm{height:44px; padding:0 18px; font-size:.9rem; border-radius:10px}
.lnd-btn-brass{background:var(--brass); color:#231a06; font-weight:700; border:0; box-shadow:0 14px 30px -14px rgba(199,154,62,.6)}
.lnd-btn-brass:hover{background:#d6a945; color:#231a06}
.lnd-btn-line{border:1.5px solid rgba(143,166,171,.4); color:#e7eeef; background:transparent}
.lnd-btn-line:hover{border-color:var(--brass); color:#fff}
.lnd-btn-ink{border:1.5px solid #cdbf98; color:#3a2f12; background:transparent}
.lnd-btn-ink:hover{border-color:var(--brass-2); background:rgba(199,154,62,.1)}
.lnd-btn-block{width:100%}

.lnd-hero-grid{position:relative; z-index:2; flex:1; max-width:var(--maxw); width:100%; margin:0 auto;
  padding:clamp(14px,3vh,46px) clamp(18px,4vw,40px) clamp(40px,6vh,72px);
  display:grid; grid-template-columns:1.06fr .94fr; gap:clamp(30px,5vw,68px); align-items:center}

.lnd-pitch{max-width:560px}
.lnd-eyebrow{display:inline-flex; align-items:center; gap:10px; font-family:var(--font-mono),monospace;
  font-size:.72rem; letter-spacing:.2em; text-transform:uppercase; color:var(--brass); margin:0 0 22px}
.lnd-anchor{width:9px; height:9px; flex:0 0 auto; transform:rotate(45deg); background:var(--brass)}
.lnd-h1{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:clamp(2.3rem,5vw,3.7rem);
  line-height:1.04; letter-spacing:-.005em; color:#F4F0E6; margin:0}
.lnd-ital{font-style:italic; color:var(--brass)}
.lnd-lead{margin:20px 0 0; font-size:clamp(1rem,1.35vw,1.12rem); line-height:1.62; color:#bcd0d2; max-width:500px}

.lnd-cta{margin-top:30px; display:flex; flex-wrap:wrap; gap:14px}

.lnd-manifest{margin:30px 0 0; display:flex; flex-wrap:wrap; gap:8px 0; align-items:center;
  font-family:var(--font-mono),monospace; font-size:.74rem; color:#9fb6b9}
.lnd-manifest span{padding:0 13px; border-left:1px solid rgba(143,166,171,.28); line-height:1}
.lnd-manifest span:first-child{padding-left:0; border-left:0}
.lnd-mf-ai{color:var(--brass)!important}
.lnd-note{margin:12px 0 0; font-size:.82rem; color:#7d9498}

/* SIGNATURE: kartu Statement of Facts */
.lnd-doc{position:relative; justify-self:end; width:100%; max-width:412px; background:var(--chart); color:var(--chart-ink);
  border-radius:6px; padding:26px 26px 22px; box-shadow:0 40px 80px -30px rgba(0,0,0,.7);
  border:1px solid #cdbf98; background-image:linear-gradient(var(--chart-line) 1px, transparent 1px); background-size:100% 30px}
.lnd-doc::before{content:""; position:absolute; left:0; top:0; bottom:0; width:5px; border-radius:6px 0 0 6px; background:var(--brass)}
.lnd-doc-stamp{position:absolute; top:18px; right:20px; width:60px; height:60px; border-radius:50%;
  border:2px solid rgba(192,67,46,.5); display:grid; place-items:center; transform:rotate(-12deg); opacity:.75}
.lnd-doc-stamp span{width:42px; height:42px; border-radius:50%; border:1px dashed rgba(192,67,46,.55);
  display:grid; place-items:center; font-family:var(--font-mono),monospace; font-size:.5rem; letter-spacing:.12em;
  color:var(--signal); text-align:center}
.lnd-doc-stamp span::after{content:"FINAL"}
.lnd-doc-head{display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding-right:54px}
.lnd-doc-kind{font-family:var(--font-display),Georgia,serif; font-size:1.34rem; color:#172324; line-height:1}
.lnd-doc-no{font-family:var(--font-mono),monospace; font-size:.74rem; color:var(--brass-deep)}
.lnd-doc-vessel{margin:9px 0 0; font-family:var(--font-mono),monospace; font-size:.72rem; color:var(--chart-mut); line-height:1.5}
.lnd-log{list-style:none; margin:16px 0 0; padding:14px 0 0; border-top:1.5px solid #cdbf98; display:flex; flex-direction:column}
.lnd-log li{display:grid; grid-template-columns:58px 1fr; align-items:center; gap:12px; padding:7px 0}
.lnd-log li + li{border-top:1px solid #e2d8bd}
.lnd-log time{font-family:var(--font-mono),monospace; font-size:.84rem; font-weight:500; color:#1d4f4a; position:relative; padding-left:14px}
.lnd-log time::before{content:""; position:absolute; left:0; top:50%; transform:translateY(-50%);
  width:7px; height:7px; border-radius:50%; background:var(--brass); box-shadow:0 0 0 3px rgba(199,154,62,.18)}
.lnd-log span{font-size:.86rem; color:#33433f; line-height:1.3}
.lnd-doc-foot{margin-top:14px; padding-top:13px; border-top:1.5px solid #cdbf98;
  display:flex; align-items:baseline; justify-content:space-between; gap:12px}
.lnd-doc-fk{font-family:var(--font-mono),monospace; font-size:.68rem; letter-spacing:.06em; text-transform:uppercase; color:var(--chart-mut)}
.lnd-doc-total{font-family:var(--font-mono),monospace; font-size:1.45rem; font-weight:500; color:var(--brass-deep)}
.lnd-doc-by{margin:9px 0 0; font-size:.72rem; color:var(--chart-mut); line-height:1.45}

/* ----- PRICING (halaman ledger ivory) ----- */
.lnd-pricing{position:relative; z-index:2; background:var(--chart); color:var(--chart-ink);
  padding:clamp(56px,8vh,96px) clamp(18px,4vw,40px);
  background-image:linear-gradient(var(--chart-line) 1px, transparent 1px); background-size:100% 34px;
  border-top:3px double #cdbf98; border-bottom:3px double #cdbf98}
.lnd-pricing-head{max-width:680px; margin:0 auto 46px; text-align:center}
.lnd-eyebrow-paper{color:var(--brass-deep); justify-content:center}
.lnd-eyebrow-paper .lnd-anchor{background:var(--brass-2)}
.lnd-h2{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:clamp(1.8rem,3.4vw,2.6rem);
  color:#16201f; line-height:1.12; margin:0}
.lnd-price-sub{margin:14px 0 0; font-size:1rem; line-height:1.6; color:#4b554f}

.lnd-plans{max-width:var(--maxw); margin:0 auto; display:grid; grid-template-columns:repeat(4,1fr); gap:16px; align-items:stretch}
.lnd-plan{position:relative; display:flex; flex-direction:column; background:#FBF7EB;
  border:1px solid #d8cca6; border-radius:8px; padding:26px 20px; box-shadow:0 16px 34px -24px rgba(40,30,10,.5);
  transition:transform .2s, box-shadow .2s, border-color .2s}
.lnd-plan:hover{transform:translateY(-3px); box-shadow:0 26px 48px -26px rgba(40,30,10,.6); border-color:var(--brass-2)}
.lnd-plan-featured{border:1.5px solid var(--brass); box-shadow:0 26px 54px -26px rgba(199,154,62,.55)}
.lnd-plan-tag{position:absolute; top:-12px; left:50%; transform:translateX(-50%);
  font-family:var(--font-mono),monospace; font-size:.64rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  color:#231a06; background:var(--brass); padding:5px 14px; border-radius:999px}
.lnd-plan-name{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:1.45rem; color:#16201f; margin:0}
.lnd-plan-modules{margin:3px 0 0; font-family:var(--font-mono),monospace; font-size:.72rem; letter-spacing:.04em; color:var(--brass-deep)}
.lnd-plan-price{display:flex; align-items:baseline; gap:4px; margin:18px 0 4px}
.lnd-plan-cur{font-size:1rem; font-weight:700; color:#4b554f}
.lnd-plan-amt{font-family:var(--font-mono),monospace; font-weight:600; font-size:2rem; line-height:1; color:#16201f}
.lnd-plan-amt-custom{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:1.7rem; color:var(--brass-deep)}
.lnd-plan-per{font-size:.86rem; color:#7a7361}
.lnd-price-annual{display:inline-flex; align-items:center; gap:7px; margin:16px 0 0; padding:7px 15px; border-radius:999px;
  background:rgba(199,154,62,.14); border:1px solid var(--brass); color:var(--brass-deep);
  font-family:var(--font-mono),monospace; font-size:.8rem; font-weight:600; letter-spacing:.02em}
.lnd-price-annual svg{color:var(--brass-2)}
.lnd-plan-custom{background:#F4EEDC; border-style:dashed}
.lnd-plan-feats{list-style:none; margin:20px 0 24px; padding:0; display:flex; flex-direction:column; gap:11px; flex:1}
.lnd-plan-feats li{display:flex; align-items:flex-start; gap:9px; font-size:.9rem; line-height:1.45; color:#3a4540}
.lnd-plan-feats li svg{flex:0 0 auto; margin-top:3px; color:var(--brass-2)}
.lnd-pricing-note{max-width:var(--maxw); margin:36px auto 0; text-align:center; font-size:.84rem; color:#6b6553; line-height:1.6}

/* ----- FOOTER (sampul belakang) ----- */
.lnd-footer{position:relative; z-index:2; background:var(--ink-2); border-top:1px solid #14323d}
.lnd-footer-inner{max-width:var(--maxw); margin:0 auto; padding:38px clamp(18px,4vw,40px);
  display:flex; flex-wrap:wrap; gap:24px 48px; justify-content:space-between}
.lnd-footer-brand{display:flex; align-items:center; gap:14px}
.lnd-footer-brand img{height:48px!important; width:auto!important}
.lnd-footer-co{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1.02rem; color:#eaf0ef}
.lnd-footer-tag{font-size:.8rem; color:var(--brass); margin-top:2px}
.lnd-footer-contact{font-size:.86rem; line-height:1.8; color:#9fb6b9}
.lnd-footer-contact a{color:#cdd9d9; font-weight:600}
.lnd-footer-contact a:hover{color:#fff}
.lnd-footer-bar{border-top:1px solid #14323d; text-align:center; padding:16px; font-size:.78rem; color:#6d8488}

/* ----- RESPONSIF ----- */
@media(max-width:980px){
  .lnd-hero-grid{grid-template-columns:1fr; gap:34px; align-content:start; padding-top:10px}
  .lnd-doc{justify-self:stretch; max-width:none}
  .lnd-pitch,.lnd-lead{max-width:none}
}
@media(max-width:1100px){
  .lnd-plans{grid-template-columns:repeat(2,1fr); max-width:680px}
}
@media(max-width:820px){
  .lnd-navright a[href="#harga"]{display:none}
}
@media(max-width:560px){
  .lnd-plans{grid-template-columns:1fr; max-width:420px}
}
@media(max-width:520px){
  .lnd-cta{flex-direction:column}
  .lnd-btn-brass,.lnd-btn-line{width:100%}
  .lnd-name{font-size:.92rem}
  .lnd-manifest{font-size:.68rem}
}
@media(prefers-reduced-motion:reduce){
  .lnd-root *,.lnd-root *::before,.lnd-root *::after{transition:none!important; animation:none!important}
}
`
