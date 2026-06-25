'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

/**
 * Landing page publik (pintu depan, tanpa gerbang login).
 * Pengunjung bisa lihat-lihat + harga dulu, baru klik "Coba Gratis" → input data
 * perusahaan (/register). Desain & branding mengikuti website TSM: video maritim,
 * font Poppins + Open Sans, tema navy.
 */
export default function LandingPage() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      v.removeAttribute('autoplay')
      try {
        v.pause()
      } catch {}
      return
    }
    v.muted = true
    const tryPlay = () => {
      const p = v.play()
      if (p && p.catch) p.catch(() => {})
    }
    tryPlay()
    const onVis = () => {
      if (!document.hidden) tryPlay()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <div className="lnd-root">
      {/* ============ HERO ============ */}
      <section className="lnd-hero">
        <div className="lnd-bg">
          <video ref={videoRef} poster="/login-poster.jpg" autoPlay muted loop playsInline preload="auto" aria-hidden="true">
            <source src="/login-bg.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="lnd-scrim" aria-hidden="true" />

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
            <a href="#harga">Harga</a>
            <Link href="/login" className="lnd-navlink-masuk">
              Masuk
            </Link>
            <Link href="/register" className="lnd-btn-sm">
              Coba Gratis
            </Link>
          </div>
        </nav>

        <div className="lnd-hero-grid">
          <section className="lnd-pitch">
            <div className="lnd-eyebrow">
              <span className="lnd-pin" aria-hidden="true" /> Software Keagenan Kapal · Indonesia
            </div>
            <h1>
              Kelola <b>dokumen &amp; keuangan</b> keagenan kapal dalam satu aplikasi.
            </h1>
            <p className="lnd-lead">
              Dari port call, dokumen clearance, EPDA/FPDA, sampai invoice — semua terbit
              rapi dan ber-branding perusahaan Anda. Mulai gratis, tanpa kartu kredit.
            </p>

            <div className="lnd-cta-row">
              <Link href="/register" className="lnd-btn-primary">
                Coba Gratis 14 Hari
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a href="#harga" className="lnd-btn-ghost">
                Lihat Harga
              </a>
            </div>

            <div className="lnd-modules">
              {MODULES.map((m) => (
                <div className="lnd-svc" key={m.title}>
                  <div className="lnd-ic" aria-hidden="true">
                    {m.icon}
                  </div>
                  <span>
                    {m.title}
                    <small>{m.desc}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* kartu CTA uji coba */}
          <aside className="lnd-trial">
            <div className="lnd-trial-badge">Uji Coba Gratis</div>
            <div className="lnd-trial-price">
              <span className="lnd-trial-num">14</span>
              <span className="lnd-trial-unit">hari gratis</span>
            </div>
            <p className="lnd-trial-sub">Akses penuh semua modul selama masa uji coba. Tanpa kartu kredit.</p>
            <ul className="lnd-trial-list">
              <li>Semua jenis dokumen maritim</li>
              <li>PDF ber-branding perusahaan Anda</li>
              <li>Data perusahaan jadi sumber semua laporan</li>
            </ul>
            <Link href="/register" className="lnd-btn-primary lnd-btn-block">
              Mulai Sekarang
            </Link>
            <p className="lnd-trial-foot">
              Sudah punya akun? <Link href="/login">Masuk</Link>
            </p>
          </aside>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section className="lnd-pricing" id="harga">
        <div className="lnd-pricing-head">
          <div className="lnd-eyebrow lnd-eyebrow-dark">
            <span className="lnd-pin" aria-hidden="true" /> Harga Berlangganan
          </div>
          <h2>Bayar sesuai modul yang Anda pakai</h2>
          <p>
            Pilih jumlah modul yang aktif. Semua paket termasuk{' '}
            <strong>uji coba gratis 14 hari</strong> dan ditagih per bulan.
          </p>
        </div>

        <div className="lnd-plans">
          {PLANS.map((p) => (
            <div className={`lnd-plan${p.featured ? ' lnd-plan-featured' : ''}`} key={p.name}>
              {p.featured && <div className="lnd-plan-tag">Paling Hemat</div>}
              <h3 className="lnd-plan-name">{p.name}</h3>
              <p className="lnd-plan-modules">{p.modules}</p>
              <div className="lnd-plan-price">
                <span className="lnd-plan-cur">Rp</span>
                <span className="lnd-plan-amt">{p.price}</span>
                <span className="lnd-plan-per">/bulan</span>
              </div>
              <ul className="lnd-plan-feats">
                {p.features.map((f) => (
                  <li key={f}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/register" className={p.featured ? 'lnd-btn-primary lnd-btn-block' : 'lnd-btn-outline lnd-btn-block'}>
                Coba Gratis 14 Hari
              </Link>
            </div>
          ))}
        </div>

        <p className="lnd-pricing-note">
          4 modul: Finance Generator · Maritime Dokumen · Port Call Manager · DA &amp; Invoice Tracker.
          Bisa upgrade jumlah modul kapan saja.
        </p>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="lnd-footer">
        <div className="lnd-footer-inner">
          <div className="lnd-footer-brand">
            <Image src="/logo-transparent.png" alt="PT Tribuana Solusi Maritim" width={88} height={88} />
            <div>
              <div className="lnd-footer-co">PT Tribuana Solusi Maritim</div>
              <div className="lnd-footer-tag">Maritime Suite — software keagenan kapal</div>
            </div>
          </div>
          <div className="lnd-footer-contact">
            <div>Jl. Abdul Azis Samad No. 59B, Kel. Pelita, Samarinda, Kalimantan Timur</div>
            <div>
              Telp <a href="tel:05412226588">0541-2226588</a> · HP{' '}
              <a href="tel:+6282154950193">0821-5495-0193</a>
            </div>
            <div>
              <a href="mailto:adm@tribuanagency.co.id">adm@tribuanagency.co.id</a>
            </div>
          </div>
        </div>
        <div className="lnd-footer-bar">© 2026 PT Tribuana Solusi Maritim. Seluruh hak cipta dilindungi.</div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  )
}

// ===== 4 modul aplikasi =====
const MODULES = [
  {
    title: 'Finance Generator',
    desc: 'EPDA · FPDA · Invoice',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: 'Maritime Dokumen',
    desc: 'FAL · SOF · NOR · Clearance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    title: 'Port Call Manager',
    desc: 'Status · Timeline · Task',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v7M5 12l-2 1 1 5a8 8 0 0 0 16 0l1-5-2-1M12 9l7 3M12 9l-7 3" />
        <circle cx="12" cy="5" r="2" />
      </svg>
    ),
  },
  {
    title: 'DA & Invoice Tracker',
    desc: 'Outstanding · Aging',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />
      </svg>
    ),
  },
]

// ===== Paket harga (per jumlah modul) =====
const PLANS = [
  {
    name: '1 Modul',
    modules: 'Pilih 1 dari 4 modul',
    price: '350.000',
    featured: false,
    features: [
      '1 modul pilihan Anda',
      'Semua jenis dokumen di modul itu',
      'PDF ber-branding perusahaan',
      '1 perusahaan (tenant)',
    ],
  },
  {
    name: '2 Modul',
    modules: 'Pilih 2 dari 4 modul',
    price: '515.000',
    featured: false,
    features: [
      '2 modul pilihan Anda',
      'Semua fitur paket 1 Modul',
      'Export laporan ke Excel',
      'Multi-user (tim Anda)',
    ],
  },
  {
    name: 'Semua Modul',
    modules: 'Keempat modul aktif',
    price: '749.000',
    featured: true,
    features: [
      'Keempat modul aktif penuh',
      'Dokumen tanpa batas',
      'Priority support',
      'Hemat dibanding beli per modul',
    ],
  },
]

// ===== CSS (prefix .lnd- agar tidak bocor ke app) =====
const CSS = `
.lnd-root{
  --navy-900:#08182e; --navy-850:#0a1e36; --navy-800:#0a2540;
  --blue-700:#1E40AF; --blue-600:#2563EB; --blue-500:#3B82F6; --blue-300:#93C5FD;
  --ink:#0F172A; --slate-600:#475569; --slate-400:#94A3B8; --slate-200:#E2E8F0;
  --white:#fff; --maxw:1180px;
  font-family:var(--font-opensans),system-ui,sans-serif; color:var(--white);
  background:var(--navy-900); -webkit-font-smoothing:antialiased;
}
.lnd-root *{box-sizing:border-box}
.lnd-root a{color:inherit; text-decoration:none}

/* ----- HERO ----- */
.lnd-hero{position:relative; overflow:hidden; min-height:100svh; display:flex; flex-direction:column}
.lnd-bg{position:absolute; inset:0; z-index:0; overflow:hidden; background:var(--navy-900)}
.lnd-bg video{position:absolute; inset:0; width:100%; height:100%; object-fit:cover}
.lnd-scrim{position:absolute; inset:0; z-index:1; pointer-events:none;
  background:
    linear-gradient(105deg, rgba(8,24,46,.94) 0%, rgba(8,24,46,.72) 38%, rgba(8,24,46,.34) 66%, rgba(8,24,46,.60) 100%),
    linear-gradient(180deg, rgba(8,24,46,.50) 0%, transparent 26%, transparent 60%, rgba(8,24,46,.95) 100%);
}

.lnd-nav{position:relative; z-index:20; max-width:var(--maxw); width:100%; margin:0 auto;
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:20px clamp(18px,4vw,36px)}
.lnd-brand{display:flex; align-items:center; gap:12px}
.lnd-mark{display:inline-flex; align-items:center}
.lnd-mark img{height:46px!important; width:auto!important; display:block; filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.lnd-name{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1.02rem; line-height:1.1}
.lnd-name span{display:block; font-family:var(--font-opensans),sans-serif; font-weight:500; font-size:.7rem;
  letter-spacing:.22em; text-transform:uppercase; color:var(--blue-300); margin-top:2px}
.lnd-navright{display:flex; align-items:center; gap:22px; font-size:.92rem; color:#cfe0f5}
.lnd-navright > a, .lnd-navlink-masuk{transition:color .2s}
.lnd-navright > a:hover, .lnd-navlink-masuk:hover{color:#fff}
.lnd-btn-sm{padding:9px 18px; border-radius:10px; font-weight:700; font-size:.9rem; color:#fff;
  background:linear-gradient(135deg,var(--blue-600),var(--blue-700));
  box-shadow:0 10px 22px -10px rgba(37,99,235,.7); transition:filter .2s}
.lnd-btn-sm:hover{filter:brightness(1.08); color:#fff}

.lnd-hero-grid{position:relative; z-index:2; flex:1; max-width:var(--maxw); width:100%; margin:0 auto;
  padding:clamp(12px,3vh,40px) clamp(18px,4vw,36px) clamp(40px,6vh,80px);
  display:grid; grid-template-columns:1.08fr .92fr; gap:clamp(28px,5vw,64px); align-items:center}

.lnd-pitch{max-width:560px}
.lnd-eyebrow{display:inline-flex; align-items:center; gap:9px; font-size:.78rem; font-weight:600;
  letter-spacing:.15em; text-transform:uppercase; color:var(--blue-300); margin-bottom:18px}
.lnd-pin{width:8px; height:8px; border-radius:50%; background:var(--blue-500);
  box-shadow:0 0 0 0 rgba(59,130,246,.6); animation:lndpulse 2.4s infinite}
@keyframes lndpulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)} 70%{box-shadow:0 0 0 10px rgba(59,130,246,0)} 100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
.lnd-pitch h1{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:clamp(2rem,4.4vw,3.1rem);
  line-height:1.08; letter-spacing:-.01em; text-shadow:0 2px 24px rgba(4,16,32,.5); color:#fff}
.lnd-pitch h1 b{color:var(--blue-300); font-weight:700}
.lnd-lead{margin-top:16px; font-size:clamp(1rem,1.4vw,1.1rem); line-height:1.6; color:#dbe7f7; max-width:480px}

.lnd-cta-row{margin-top:26px; display:flex; flex-wrap:wrap; gap:14px}
.lnd-btn-primary{display:inline-flex; align-items:center; justify-content:center; gap:9px;
  height:50px; padding:0 24px; border-radius:12px; color:#fff; font-weight:700; font-size:1rem;
  background:linear-gradient(135deg,var(--blue-600),var(--blue-700));
  box-shadow:0 14px 28px -10px rgba(37,99,235,.75); transition:filter .2s, transform .08s;
  font-family:var(--font-opensans),sans-serif}
.lnd-btn-primary:hover{filter:brightness(1.08); color:#fff}
.lnd-btn-primary:active{transform:translateY(1px)}
.lnd-btn-ghost{display:inline-flex; align-items:center; height:50px; padding:0 22px; border-radius:12px;
  font-weight:600; font-size:1rem; color:#eaf2fd; border:1.5px solid rgba(255,255,255,.28);
  background:rgba(255,255,255,.06); transition:background .2s, border-color .2s}
.lnd-btn-ghost:hover{background:rgba(255,255,255,.13); border-color:rgba(147,197,253,.55); color:#fff}
.lnd-btn-block{width:100%}

.lnd-modules{margin-top:34px; display:grid; grid-template-columns:1fr 1fr; gap:12px; max-width:520px}
.lnd-svc{display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:12px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); backdrop-filter:blur(6px);
  transition:background .2s, border-color .2s, transform .2s}
.lnd-svc:hover{background:rgba(255,255,255,.14); border-color:rgba(147,197,253,.5); transform:translateY(-2px)}
.lnd-ic{width:34px; height:34px; flex:0 0 auto; border-radius:9px; display:grid; place-items:center;
  background:rgba(59,130,246,.22); color:var(--blue-300)}
.lnd-ic svg{width:19px; height:19px}
.lnd-svc span{font-size:.92rem; font-weight:600; line-height:1.2; color:#eaf2fd}
.lnd-svc small{display:block; font-weight:400; font-size:.74rem; color:var(--slate-400); margin-top:2px}

/* kartu trial kanan */
.lnd-trial{justify-self:end; width:100%; max-width:380px;
  background:linear-gradient(160deg, rgba(15,33,60,.92), rgba(8,24,46,.92));
  border:1px solid rgba(147,197,253,.28); border-radius:20px; padding:30px 28px;
  box-shadow:0 30px 70px -25px rgba(0,0,0,.7); backdrop-filter:blur(10px)}
.lnd-trial-badge{display:inline-block; font-size:.72rem; font-weight:700; letter-spacing:.12em;
  text-transform:uppercase; color:var(--blue-300); background:rgba(59,130,246,.16);
  border:1px solid rgba(59,130,246,.3); padding:5px 12px; border-radius:999px}
.lnd-trial-price{display:flex; align-items:baseline; gap:10px; margin-top:18px}
.lnd-trial-num{font-family:var(--font-poppins),sans-serif; font-weight:800; font-size:3.4rem; line-height:1; color:#fff}
.lnd-trial-unit{font-size:1rem; color:#bcd2ef; font-weight:600}
.lnd-trial-sub{margin-top:10px; font-size:.92rem; line-height:1.55; color:#c4d6f0}
.lnd-trial-list{list-style:none; margin:18px 0 22px; padding:0; display:flex; flex-direction:column; gap:10px}
.lnd-trial-list li{position:relative; padding-left:26px; font-size:.9rem; color:#dbe7f7; line-height:1.4}
.lnd-trial-list li::before{content:""; position:absolute; left:0; top:3px; width:16px; height:16px; border-radius:50%;
  background:rgba(29,212,168,.18) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231DD4A8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E") center/11px no-repeat}
.lnd-trial-foot{margin-top:14px; text-align:center; font-size:.86rem; color:var(--slate-400)}
.lnd-trial-foot a{color:var(--blue-300); font-weight:600}
.lnd-trial-foot a:hover{text-decoration:underline}

/* ----- PRICING ----- */
.lnd-pricing{position:relative; z-index:2; background:var(--navy-900); padding:clamp(56px,8vh,96px) clamp(18px,4vw,36px)}
.lnd-pricing-head{max-width:680px; margin:0 auto 44px; text-align:center}
.lnd-eyebrow-dark{justify-content:center}
.lnd-pricing-head h2{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:clamp(1.7rem,3.2vw,2.4rem);
  color:#fff; line-height:1.15}
.lnd-pricing-head p{margin-top:14px; font-size:1.02rem; line-height:1.6; color:#b7c8e2}
.lnd-pricing-head strong{color:var(--blue-300); font-weight:700}

.lnd-plans{max-width:var(--maxw); margin:0 auto; display:grid; grid-template-columns:repeat(3,1fr); gap:22px; align-items:stretch}
.lnd-plan{position:relative; display:flex; flex-direction:column; background:#0c1d35;
  border:1px solid #16304f; border-radius:18px; padding:30px 26px; transition:border-color .2s, transform .2s}
.lnd-plan:hover{border-color:#2a4d7a; transform:translateY(-3px)}
.lnd-plan-featured{border-color:var(--blue-500); background:linear-gradient(170deg,#102a4d,#0b1d36);
  box-shadow:0 24px 60px -28px rgba(59,130,246,.55)}
.lnd-plan-tag{position:absolute; top:-13px; left:50%; transform:translateX(-50%);
  font-size:.72rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#04101f;
  background:linear-gradient(135deg,var(--blue-300),#52DCC1); padding:6px 16px; border-radius:999px}
.lnd-plan-name{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1.3rem; color:#fff}
.lnd-plan-modules{margin-top:4px; font-size:.86rem; color:var(--blue-300); font-weight:600}
.lnd-plan-price{display:flex; align-items:baseline; gap:4px; margin:18px 0 4px}
.lnd-plan-cur{font-size:1.1rem; font-weight:700; color:#c4d6f0}
.lnd-plan-amt{font-family:var(--font-poppins),sans-serif; font-weight:800; font-size:2.5rem; line-height:1; color:#fff}
.lnd-plan-per{font-size:.92rem; color:var(--slate-400)}
.lnd-plan-feats{list-style:none; margin:20px 0 26px; padding:0; display:flex; flex-direction:column; gap:13px; flex:1}
.lnd-plan-feats li{display:flex; align-items:flex-start; gap:10px; font-size:.92rem; line-height:1.45; color:#d3e0f3}
.lnd-plan-feats li svg{flex:0 0 auto; margin-top:2px; color:var(--secondary,#52DCC1)}
.lnd-btn-outline{display:inline-flex; align-items:center; justify-content:center; height:48px; padding:0 20px;
  border-radius:12px; font-weight:700; font-size:.96rem; color:#cfe0f5; border:1.5px solid #2a4d7a;
  background:transparent; transition:background .2s, border-color .2s, color .2s; font-family:var(--font-opensans),sans-serif}
.lnd-btn-outline:hover{background:rgba(59,130,246,.12); border-color:var(--blue-500); color:#fff}
.lnd-pricing-note{max-width:var(--maxw); margin:34px auto 0; text-align:center; font-size:.86rem; color:var(--slate-400); line-height:1.6}

/* ----- FOOTER ----- */
.lnd-footer{position:relative; z-index:2; background:#061222; border-top:1px solid #122842}
.lnd-footer-inner{max-width:var(--maxw); margin:0 auto; padding:38px clamp(18px,4vw,36px);
  display:flex; flex-wrap:wrap; gap:24px 48px; justify-content:space-between}
.lnd-footer-brand{display:flex; align-items:center; gap:14px}
.lnd-footer-brand img{height:48px!important; width:auto!important; filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.lnd-footer-co{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1.02rem; color:#eaf2fd}
.lnd-footer-tag{font-size:.8rem; color:var(--slate-400); margin-top:2px}
.lnd-footer-contact{font-size:.86rem; line-height:1.8; color:#9fb2cc}
.lnd-footer-contact a{color:#bcd2ef; font-weight:600}
.lnd-footer-contact a:hover{color:#fff}
.lnd-footer-bar{border-top:1px solid #0f2138; text-align:center; padding:16px; font-size:.78rem; color:#5f7596}

/* ----- RESPONSIF ----- */
@media(max-width:980px){
  .lnd-hero-grid{grid-template-columns:1fr; gap:30px; align-content:start; padding-top:10px}
  .lnd-trial{justify-self:stretch; max-width:none}
  .lnd-pitch{max-width:none}
  .lnd-modules{max-width:none}
}
@media(max-width:820px){
  .lnd-plans{grid-template-columns:1fr; max-width:440px}
  .lnd-navright > a[href="#harga"]{display:none}
}
@media(max-width:520px){
  .lnd-modules{grid-template-columns:1fr}
  .lnd-name{font-size:.92rem}
  .lnd-cta-row{flex-direction:column}
  .lnd-btn-primary,.lnd-btn-ghost{width:100%; justify-content:center}
}
@media(prefers-reduced-motion:reduce){ .lnd-pin{animation:none} }
`
