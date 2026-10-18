# WA-2a 2a-G — Panduan demo & penerimaan owner (Windows / PowerShell)

> **Status:** kit demo untuk **persiapan** penerimaan owner (T5/G-12). Ini **bukan** penerimaan produk.
> Semua keputusan pada §8 tetap **BELUM DINILAI** sampai owner memutuskan. Pertanyaan kebijakan Q-1 (§8) menunggu owner.
>
> **Batas:**
> - lokal, data **sintetis**, **tanpa Send**;
> - tanpa provider, kredensial WhatsApp, LLM, deploy, atau perubahan konfigurasi lingkungan nyata;
> - server aplikasi dan database demo hanya terikat **127.0.0.1** (tanpa tunnel, tanpa akses LAN).
>
> Kode aplikasi yang didemokan: `main` @ `1b20baa1ac83e3ab2689bff4a77f290fc2aadd91` (merge PR #38, perbaikan login; PR #37 sudah termasuk).
>
> **Status verifikasi panduan:**
> - **Windows/PowerShell/Edge: satu run uji coba oleh owner (18 Oktober 2026), bukan run penerimaan bersih.** Blok 0–6, D1–D16, dan pembersihan 10a–10f dijalankan di laptop owner (Windows, PowerShell 7.6.7, Node 24.16.0, PostgreSQL 16.14, Edge) dan berakhir `[OK]`; temuan **F-6** (§9). Satu run bukan statistik; Windows PowerShell 5.1 belum dijalankan.
> - Bukti Linux pada §9 (Chromium, bukan Edge) **tidak** menggantikan uji Windows/Edge.

## Mulai di sini

**Tujuan demo:** Anda mencoba sendiri alur kontak → consent → draft → pratinjau → approval sampai status **"Disetujui — BELUM DIKIRIM"**. Tidak ada WhatsApp yang dikirim.

**Yang perlu disiapkan:** laptop Windows dengan Git, Node.js 18.18+, binary PostgreSQL 16, dan Edge (atau Chrome). Jaringan diperlukan hanya untuk `git clone` dan `npm ci`. Siapkan waktu sekitar 60–90 menit.

**Urutan:**

| Bagian | Siapa | Isi |
|---|---|---|
| **A. Persiapan teknis** (§0–§5, Blok 6) | Anda atau pendamping teknis | Tempel blok PowerShell satu per satu. Setiap blok harus berakhir `[OK]`. Bila muncul `[GAGAL]` atau `DEMO BERHENTI`: berhenti, catat, lanjut ke C |
| **B. Demo owner** (§6.2–§8) | Anda | Login per peran, klik skenario D1–D16, lalu isi lembar A-01–A-10. Jangan memperbaiki apa pun selama demo |
| **C. Pembersihan** (§10) | Anda atau pendamping teknis | Blok 10a–10f, urutan wajib. Folder catatan **tidak** dihapus |

**Tiga hal yang berubah sejak kit v3 (perbaikan login PR #37 dan #38):**
1. Tombol **Masuk** abu-abu (nonaktif) sampai halaman siap. Tunggu tombol aktif, lalu klik. Tombol mata tidak lagi diperlukan sebagai indikator.
2. Sesudah "Berhasil masuk…", **halaman tujuan dimuat ulang penuh** (layar dapat berkedip putih sebentar). Itu normal.
3. Bila tampil **"Status masuk tidak dapat dipastikan…"**: aplikasi **tidak** mencoba ulang sendiri. Muat ulang halaman (F5), lalu periksa sesi (§6.3). Jangan klik Masuk lagi sebelum memeriksa.

Hasil uji teknis (§9) **bukan** penerimaan. A-01–A-10 tetap **BELUM DINILAI** sampai Anda mencoba dan memutuskan.

# A. Persiapan teknis

## 0. Cara memakai panduan ini dan aturan berhenti

**Satu jendela PowerShell untuk semua blok.** Pakai jendela PowerShell biasa (Windows PowerShell 5.1 atau PowerShell 7), **bukan** PowerShell ISE atau terminal editor, dan **bukan** sebagai Administrator.

Cara menempel blok:
- Tempel **satu blok** pada satu waktu, lalu tunggu sampai blok selesai.
- Setiap blok berbentuk `. { try { ... } catch { ... } }`, sehingga PowerShell menjalankannya sebagai **satu perintah**. Bila satu langkah di dalam blok gagal, sisa blok tidak dijalankan.
- Blok 0 memasang status global. Sesudah satu blok gagal, setiap blok persiapan berikutnya menolak berjalan (`DEMO BERHENTI pada langkah sebelumnya`). Hanya blok pembersihan (§10) yang tetap boleh dijalankan.
- Menempel blok di konsol tidak menjalankan berkas skrip, sehingga kebijakan eksekusi (*execution policy*) tidak perlu diubah.
- Jangan menekan Ctrl+C selama blok berjalan. Klaster DB demo berbagi konsol dengan jendela ini, sehingga Ctrl+C dapat ikut menghentikannya. Bila ini terjadi, pemeriksaan berikutnya akan gagal; catat, lalu lanjut ke §10.

Program eksternal (`git`, `npm`, `node`, `initdb`, `pg_ctl`, `createdb`, migrasi) diperiksa lewat **kode keluarnya** (`$LASTEXITCODE`). Pemeriksaan ini tidak hanya mengandalkan `$ErrorActionPreference`. Pesan galat hanya menyebut nama langkah dan kode keluar. Pesan itu **tidak** memuat argumen, URL database, atau isi variabel lingkungan.

**Hentikan alur penerimaan**, lalu catat langkah dan pesan yang tampil (tanpa sandi atau URL bersandi), bila salah satu hal ini terjadi:
- sebuah blok mencetak `[GAGAL]` atau `DEMO BERHENTI`;
- hasil berbeda dari kolom "Harus terlihat";
- terjadi salah satu kondisi STOP login (§6);
- muncul data yang tampak bukan sintetis;
- ada tombol atau teks yang mengesankan pesan **dikirim**.

Jangan memperbaiki apa pun selama demo. Run yang berhenti **bukan** bukti penerimaan, dan tidak boleh diubah menjadi "lulus" dengan mencoba ulang. Owner yang memutuskan apakah dilakukan run baru dari awal. Run baru itu dicatat sebagai run terpisah, dan catatan run yang berhenti tetap disimpan. Sesudah berhenti, lanjut ke pembersihan (§10).

## 1. Blok 0 (fungsi bantu) dan Blok 1 (prasyarat)

Isi folder binary PostgreSQL 16 terlebih dulu. Panduan ini hanya memakai **binary** `initdb.exe`, `pg_ctl.exe`, dan `createdb.exe`. Layanan atau database PostgreSQL yang sudah ada **tidak** dipakai atau disentuh.

```powershell
Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\initdb.exe' -ErrorAction SilentlyContinue | Select-Object FullName
$global:PgBin = 'C:\Program Files\PostgreSQL\16\bin'     # sesuaikan dengan hasil di atas
```

**Blok 0 — fungsi bantu.** Tempel sekali di awal. Bila jendela tertutup, tempel lagi sebelum §10.

```powershell
. {
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$global:DemoStatus = 'OK'
$global:DemoSha = '1b20baa1ac83e3ab2689bff4a77f290fc2aadd91'

function global:Stop-Demo([string]$Pesan) { $global:DemoStatus = 'GAGAL'; throw ('DEMO BERHENTI: ' + $Pesan) }
function global:Assert-Lanjut {
  if ($global:DemoStatus -ne 'OK') { throw 'DEMO BERHENTI pada langkah sebelumnya. Jangan lanjut; catat, lalu ke Bagian 10.' }
}
function global:Write-DemoGagal($Err) {
  $global:DemoStatus = 'GAGAL'
  Write-Host ('[GAGAL] ' + $Err.Exception.Message) -ForegroundColor Red
  Write-Host 'Langkah persiapan berikutnya diblokir. Catat pesan ini, lalu lanjut ke Bagian 10.' -ForegroundColor Red
  if ($global:DemoCatatanFile) { Add-DemoCatatan ('[GAGAL] ' + $Err.Exception.Message) }
}
function global:Invoke-Native {
  param([Parameter(Mandatory = $true)][string]$Label, [Parameter(Mandatory = $true)][string]$File, [string[]]$Arg = @())
  & $File @Arg
  $kode = $LASTEXITCODE
  if ($kode -ne 0) { Stop-Demo ($Label + ' gagal (exit ' + $kode + ')') }
}
function global:Get-NativeOutput {
  param([Parameter(Mandatory = $true)][string]$Label, [Parameter(Mandatory = $true)][string]$File, [string[]]$Arg = @())
  $out = & $File @Arg
  $kode = $LASTEXITCODE
  if ($kode -ne 0) { Stop-Demo ($Label + ' gagal (exit ' + $kode + ')') }
  return (@($out) -join "`n")
}
function global:Invoke-NativeFile {
  # Untuk program yang meninggalkan proses latar (pg_ctl start): keluaran ke berkas, bukan pipe, agar tidak menggantung.
  param([Parameter(Mandatory = $true)][string]$Label, [Parameter(Mandatory = $true)][string]$File, [Parameter(Mandatory = $true)][string]$ArgLine,
        [Parameter(Mandatory = $true)][string]$LogBase, [int]$TimeoutSec = 120)
  $p = Start-Process -FilePath $File -ArgumentList $ArgLine -NoNewWindow -PassThru -RedirectStandardOutput ($LogBase + '.out.txt') -RedirectStandardError ($LogBase + '.err.txt')
  $null = $p.Handle
  if (-not $p.WaitForExit($TimeoutSec * 1000)) { Stop-Demo ($Label + ' tidak selesai dalam ' + $TimeoutSec + ' detik') }
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { Stop-Demo ($Label + ' gagal (exit ' + $p.ExitCode + '); lihat ' + (Split-Path -Leaf $LogBase) + '.*.txt di folder demo') }
}
function global:Get-DemoListener([int]$Port) { return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }
function global:Test-Keturunan([int]$Anak, [int]$Akar) {
  $cur = $Anak
  for ($i = 0; $i -lt 16; $i++) {
    if ($cur -eq $Akar) { return $true }
    $wp = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $cur) -ErrorAction SilentlyContinue
    if (-not $wp) { return $false }
    $cur = [int]$wp.ParentProcessId
    if ($cur -le 0) { return $false }
  }
  return $false
}
function global:Get-HttpStatus([string]$Url) {
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Proxy = $null; $req.AllowAutoRedirect = $false; $req.Timeout = 10000
    $res = $req.GetResponse(); $kode = [int]$res.StatusCode; $res.Close(); return $kode
  } catch {
    $r = $null
    if ($_.Exception.InnerException -and $_.Exception.InnerException.Response) { $r = $_.Exception.InnerException.Response }
    if ($r) { $kode = [int]$r.StatusCode; $r.Close(); return $kode }
    return 0
  }
}
function global:Read-LogBersama([string]$Path) {
  if (-not $Path) { return '' }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
  $fs = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try { $sr = New-Object System.IO.StreamReader($fs); return $sr.ReadToEnd() } finally { $fs.Dispose() }
}
function global:ConvertTo-Tersamar([string]$Teks) {
  $t = [regex]::Replace($Teks, '(?i)(password=)[^&\s"''<>]*', '$1***')
  $t = [regex]::Replace($t, '(?i)(password%3D)(?:(?!%26)[^&\s"''<>])*', '$1***')
  $t = [regex]::Replace($t, '(?i)("password"\s*:\s*")[^"]*(")', '$1***$2')
  $t = [regex]::Replace($t, '(?i)(postgres(?:ql)?://[^:/@\s]+:)[^@\s]+@', '$1***@')
  foreach ($rahasia in @($global:DbPw, $global:DemoNaSecret)) { if ($rahasia) { $t = $t.Replace([string]$rahasia, '***') } }
  return $t
}
function global:Save-Identitas {
  [IO.File]::WriteAllText($global:DemoIdFile, ($global:DemoId | ConvertTo-Json -Depth 4))
}
function global:Add-DemoCatatan([string]$Baris) {
  [IO.File]::AppendAllText($global:DemoCatatanFile, ((Get-Date).ToString('s') + '  ' + $Baris + [Environment]::NewLine))
}
function global:Set-DemoDbEnv {
  $env:DATABASE_URL = $global:DemoUrl; $env:DIRECT_URL = $global:DemoUrl; $env:PORTAL_DATABASE_URL = $global:DemoUrl
}
function global:Clear-DemoEnv {
  foreach ($n in 'DATABASE_URL','DIRECT_URL','PORTAL_DATABASE_URL','WA2G_DEMO_DB_URL','NEXTAUTH_SECRET','NEXTAUTH_URL',
                 'AUTOMATION_MONITORING_ENABLED','AUTOMATION_TENANT_IDS','WA2_CLIENT_FOUNDATION_ENABLED',
                 'NEXT_TELEMETRY_DISABLED','NODE_OPTIONS','PGPASSWORD') {
    Remove-Item -LiteralPath ('Env:' + $n) -ErrorAction SilentlyContinue
  }
}
Write-Host '[OK] Blok 0: fungsi bantu terpasang.' -ForegroundColor Green
}
```

**Blok 1 — prasyarat.** Blok ini tidak memasang, mengubah, atau menghentikan apa pun.

```powershell
. { try {
  Assert-Lanjut
  $v = $PSVersionTable.PSVersion
  if (-not (($v.Major -eq 5 -and $v.Minor -ge 1) -or $v.Major -ge 7)) { Stop-Demo ('PowerShell ' + $v + ' tidak didukung') }
  if ($Host.Name -ne 'ConsoleHost') { Stop-Demo ('Host ' + $Host.Name + ': pakai jendela PowerShell biasa, bukan ISE/editor') }
  $adm = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($adm) { Stop-Demo 'Jendela ini berjalan sebagai Administrator; buka sebagai pengguna biasa' }
  foreach ($c in 'git', 'node', 'npm.cmd', 'Get-NetTCPConnection', 'Get-CimInstance') {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Stop-Demo ('Perintah tidak ditemukan: ' + $c) }
  }
  $global:DemoGit  = (Get-Command git -CommandType Application | Select-Object -First 1).Source
  $global:DemoNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
  $global:DemoNpm  = (Get-Command npm.cmd -CommandType Application | Select-Object -First 1).Source
  Invoke-Native 'git --version' $global:DemoGit @('--version')
  Invoke-Native 'npm --version' $global:DemoNpm @('--version')
  $nv = Get-NativeOutput 'node --version' $global:DemoNode @('--version')
  if ($nv -notmatch '^v(\d+)\.(\d+)') { Stop-Demo 'Versi Node tidak terbaca' }
  $maj = [int]$Matches[1]; $min = [int]$Matches[2]
  if ($maj -lt 18 -or ($maj -eq 18 -and $min -lt 18)) { Stop-Demo ('Node ' + $nv + ' terlalu lama; butuh 18.18+') }
  Write-Host ('Node ' + $nv)
  if (-not $global:PgBin) { Stop-Demo 'Variabel $global:PgBin belum diisi' }
  foreach ($b in 'initdb.exe', 'pg_ctl.exe', 'createdb.exe') {
    if (-not (Test-Path -LiteralPath (Join-Path $global:PgBin $b) -PathType Leaf)) { Stop-Demo ('Tidak ada ' + $b + ' di $global:PgBin') }
  }
  $pv = Get-NativeOutput 'initdb --version' (Join-Path $global:PgBin 'initdb.exe') @('--version')
  if ($pv -notmatch '\(PostgreSQL\) 16\.') { Stop-Demo ('Butuh binary PostgreSQL 16; terbaca: ' + $pv) }
  Write-Host $pv
  # Variabel lingkungan yang dapat mengarahkan aplikasi/DB ke konfigurasi lain: hanya NAMA yang dilaporkan.
  $pola = '^(DATABASE_URL|DIRECT_URL|PORTAL_|NEXTAUTH_|DUITKU_|MIDTRANS_|OPENROUTER_|JOB_RUNNER_|WA_|WA1_|WA2|WHATSAPP|AUTOMATION_|NEXT_PUBLIC_|NODE_OPTIONS$|NODE_ENV$|UPLOAD_DIR$|SUPERADMIN_EMAILS$|PG[A-Z]+$)'
  $ada = @(Get-ChildItem Env: | Where-Object { $_.Name -match $pola } | ForEach-Object { $_.Name })
  if ($ada.Count -gt 0) { Stop-Demo ('Variabel lingkungan sudah ada (nilai tidak ditampilkan): ' + ($ada -join ', ') + '. Buka jendela tanpa variabel ini.') }
  foreach ($p in 3000, 55433) {
    if ((Get-DemoListener $p).Count -gt 0) { Stop-Demo ('Port ' + $p + ' sudah dipakai proses lain. Jangan hentikan proses itu; laporkan.') }
  }
  if ($global:DemoEdge) {
    # Pilihan pengguna (mis. Chrome) dipertahankan; hanya divalidasi.
    if (-not (Test-Path -LiteralPath $global:DemoEdge -PathType Leaf)) { Stop-Demo 'Path peramban di $global:DemoEdge tidak ada' }
    $leaf = (Split-Path -Leaf $global:DemoEdge).ToLowerInvariant()
    if ($leaf -ne 'msedge.exe' -and $leaf -ne 'chrome.exe') { Stop-Demo '$global:DemoEdge harus menunjuk msedge.exe atau chrome.exe' }
  } else {
    $calon = @()
    if (${env:ProgramFiles(x86)}) { $calon += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe') }
    if ($env:ProgramFiles) { $calon += (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe') }
    foreach ($e in $calon) { if (Test-Path -LiteralPath $e -PathType Leaf) { $global:DemoEdge = $e; break } }
    if (-not $global:DemoEdge) { Stop-Demo 'msedge.exe tidak ditemukan (lihat catatan Chrome di bawah)' }
  }
  Write-Host ('Peramban: ' + $global:DemoEdge)
  if (Test-Path -LiteralPath (Join-Path $HOME 'wa2g-demo')) { Stop-Demo 'Folder $HOME\wa2g-demo sudah ada. Jangan menimpa; laporkan.' }
  Write-Host '[OK] Blok 1: prasyarat terpenuhi.' -ForegroundColor Green
} catch { Write-DemoGagal $_ } }
```

| Bila Blok 1 berhenti karena | Lakukan |
|---|---|
| Git, Node.js, atau npm tidak ada / terlalu lama | **Berhenti.** Laporkan versinya. Panduan ini tidak memasang apa pun secara global |
| Binary PostgreSQL 16 tidak ada | **Berhenti.** Ada dua pilihan, dan keduanya memerlukan keputusan owner: (a) binary dari instalasi PostgreSQL yang sudah ada dipakai **hanya** untuk klaster baru di folder demo, tanpa menyentuh layanan yang ada; atau (b) arsip ZIP binary PostgreSQL resmi diekstrak, tanpa installer dan tanpa layanan |
| Variabel lingkungan sudah ada | **Berhenti.** Jangan hapus variabel milik sistem. Laporkan namanya, lalu tunggu keputusan |
| Port 3000 atau 55433 terpakai | **Berhenti.** Jangan hentikan proses lain. Laporkan, lalu ganti port hanya dengan persetujuan; mengganti port berarti panduan harus disesuaikan |
| Edge tidak ditemukan | Chrome boleh dipakai: tempel ulang Blok 0, isi `$global:DemoEdge = '<path lengkap chrome.exe>'`, lalu jalankan ulang Blok 1. Blok 1 mempertahankan pilihan ini dan hanya memeriksa bahwa berkasnya ada dan bernama `msedge.exe` atau `chrome.exe` |

## 2. Blok 2 — folder catatan, folder demo, checkout terpisah

Dua folder dibuat dengan fungsi berbeda:
- **Folder demo** `$HOME\wa2g-demo` berisi checkout, klaster DB, log mentah, dan profil peramban. Seluruh isinya dihapus di §10.
- **Folder catatan** `$HOME\wa2g-demo-catatan\<waktu>` berada **di luar** folder demo dan **tidak** dihapus. Isinya:
  - `identitas-demo.json`: path, penanda, PID, dan waktu mulai proses demo. Tidak memuat sandi atau secret;
  - `catatan-penerimaan.md`: daftar periksa dan log kejadian;
  - bukti yang sudah disamarkan (§10).

```powershell
. { try {
  Assert-Lanjut
  $global:Demo = [IO.Path]::GetFullPath((Join-Path $HOME 'wa2g-demo'))
  if (Test-Path -LiteralPath $global:Demo) { Stop-Demo 'Folder demo sudah ada. Jangan menimpa; laporkan.' }
  $global:Catatan = [IO.Path]::GetFullPath((Join-Path (Join-Path $HOME 'wa2g-demo-catatan') (Get-Date -Format 'yyyyMMdd-HHmmss')))
  if (Test-Path -LiteralPath $global:Catatan) { Stop-Demo 'Folder catatan dengan nama yang sama sudah ada' }
  [IO.Directory]::CreateDirectory($global:Catatan) | Out-Null
  $global:DemoCatatanFile = Join-Path $global:Catatan 'catatan-penerimaan.md'
  $isi = @('# Catatan demo WA-2a 2a-G (run ' + (Split-Path -Leaf $global:Catatan) + ')', '',
           'Baseline: ' + $global:DemoSha, 'Status run: BERJALAN (bukan penerimaan sampai owner menilai)', '',
           '## Daftar periksa (diisi owner)')
  foreach ($a in 'A-01','A-02','A-03','A-04','A-05','A-06','A-07','A-08','A-09','A-10') {
    $isi += ('- ' + $a + ' | Hasil aktual: | Bukti/catatan: | Keputusan owner: BELUM DINILAI')
  }
  $isi += @('- Q-1 (pembatalan oleh peminta/pencatat bukti) | Jawaban owner: BELUM DIJAWAB', '', '## Log kejadian')
  [IO.File]::WriteAllText($global:DemoCatatanFile, (($isi -join [Environment]::NewLine) + [Environment]::NewLine))
  [IO.Directory]::CreateDirectory($global:Demo) | Out-Null
  $guid = [guid]::NewGuid().ToString()
  [IO.File]::WriteAllText((Join-Path $global:Demo '.wa2g-demo-penanda'), $guid)
  $global:DemoIdFile = Join-Path $global:Catatan 'identitas-demo.json'
  $global:DemoId = [ordered]@{
    Versi = 1; Baseline = $global:DemoSha; Status = 'DISIAPKAN'; Dibuat = (Get-Date).ToString('s')
    DemoPath = $global:Demo; Penanda = $guid
    AppPath = (Join-Path $global:Demo 'app'); DataPath = (Join-Path $global:Demo 'pgdata'); PgBin = $global:PgBin
    PortApp = 3000; PortDb = 55433
    ServerPid = $null; ServerStartTicks = $null; PgPid = $null; PgStartTicks = $null
    EdgeProfilAwalan = (Join-Path $global:Demo 'profil-'); Dibersihkan = $null
  }
  Save-Identitas
  Add-DemoCatatan ('Folder demo dibuat: ' + $global:Demo)
  $App = $global:DemoId.AppPath
  Invoke-Native 'git clone' $global:DemoGit @('clone', 'https://github.com/marlon870saragih-cloud/maritim-suite.git', $App)
  Invoke-Native 'git checkout' $global:DemoGit @('-C', $App, '-c', 'advice.detachedHead=false', 'checkout', '--detach', $global:DemoSha)
  $head = (Get-NativeOutput 'git rev-parse' $global:DemoGit @('-C', $App, 'rev-parse', 'HEAD')).Trim()
  if ($head -ne $global:DemoSha) { Stop-Demo ('HEAD bukan baseline: ' + $head) }
  $cekBersih = {
    $s = Get-NativeOutput 'git status' $global:DemoGit @('-C', $App, 'status', '--porcelain', '--untracked-files=all')
    if ($s.Trim() -ne '') { Stop-Demo 'Checkout tidak bersih (git status --porcelain tidak kosong)' }
    foreach ($d in $App, (Join-Path $App 'prisma')) {
      $f = @(Get-ChildItem -LiteralPath $d -Force -File | Where-Object { $_.Name -like '.env*' -and $_.Name -ne '.env.example' })
      if ($f.Count -gt 0) { Stop-Demo ('Ada berkas env nyata: ' + (($f | ForEach-Object { $_.Name }) -join ', ')) }
    }
  }
  & $cekBersih
  Push-Location -LiteralPath $App
  try { Invoke-Native 'npm ci' $global:DemoNpm @('ci') } finally { Pop-Location }
  & $cekBersih
  Add-DemoCatatan ('Checkout ' + $head + ' bersih; npm ci selesai')
  Write-Host ('[OK] Blok 2: checkout ' + $head + ' bersih, tanpa .env nyata, npm ci selesai.') -ForegroundColor Green
  Write-Host ('Folder catatan (simpan path ini): ' + $global:Catatan)
} catch { Write-DemoGagal $_ } }
```

`git clone` dan `npm ci` memerlukan jaringan, yaitu GitHub dan registry npm. Dependensi hanya dipasang di `$HOME\wa2g-demo\app\node_modules`.

**Jangan menyalin `.env` dari lingkungan lain.** Seluruh konfigurasi demo diberikan sebagai variabel proses. Variabel itu dihapus dari jendela segera sesudah dipakai (Blok 4 dan 5).

## 3. Blok 3 — database demo sekali pakai (klaster baru, loopback)

```powershell
. { try {
  Assert-Lanjut
  $Data = $global:DemoId.DataPath
  $rb = New-Object byte[] 24; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($rb); $rng.Dispose()
  $global:DbPw = -join ($rb | ForEach-Object { $_.ToString('x2') })
  $pwFile = Join-Path $global:Demo 'pw.tmp'
  try {
    [IO.File]::WriteAllText($pwFile, $global:DbPw)
    Invoke-Native 'initdb' (Join-Path $global:PgBin 'initdb.exe') @('-D', $Data, '-U', 'demo', ('--pwfile=' + $pwFile), '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C')
  } finally { if (Test-Path -LiteralPath $pwFile) { Remove-Item -LiteralPath $pwFile -Force } }
  $argPg = '-D "' + $Data + '" -l "' + (Join-Path $global:Demo 'pg.log') + '" -o "-p 55433 -c listen_addresses=127.0.0.1" -w -t 60 start'
  Invoke-NativeFile 'pg_ctl start' (Join-Path $global:PgBin 'pg_ctl.exe') $argPg (Join-Path $global:Demo 'pgctl-start') 90
  $pgPid = [int]((Get-Content -LiteralPath (Join-Path $Data 'postmaster.pid') -TotalCount 1).Trim())
  $global:DemoId.PgPid = $pgPid
  $global:DemoId.PgStartTicks = [int64](Get-Process -Id $pgPid).StartTime.ToUniversalTime().Ticks
  $global:DemoId.Status = 'DB_BERJALAN'; Save-Identitas
  $l = Get-DemoListener 55433
  if ($l.Count -eq 0) { Stop-Demo 'DB demo tidak listen di 55433' }
  foreach ($x in $l) {
    if ($x.LocalAddress -ne '127.0.0.1') { Stop-Demo ('DB demo listen di alamat ' + $x.LocalAddress) }
    if ([int]$x.OwningProcess -ne $pgPid) { Stop-Demo 'Listener 55433 bukan postmaster klaster demo' }
  }
  $env:PGPASSWORD = $global:DbPw
  try { Invoke-Native 'createdb' (Join-Path $global:PgBin 'createdb.exe') @('-h', '127.0.0.1', '-p', '55433', '-U', 'demo', 'maritime_suite') }
  finally { Remove-Item -LiteralPath 'Env:PGPASSWORD' -ErrorAction SilentlyContinue }
  $global:DemoUrl = 'postgresql://demo:' + $global:DbPw + '@127.0.0.1:55433/maritime_suite'
  Add-DemoCatatan ('Klaster demo berjalan, PID ' + $pgPid + ', listen 127.0.0.1:55433 saja')
  Write-Host ('[OK] Blok 3: klaster demo PID ' + $pgPid + ' hanya di 127.0.0.1:55433; DB maritime_suite dibuat.') -ForegroundColor Green
} catch { Write-DemoGagal $_ } }
```

`pg_ctl start` dijalankan lewat `Start-Process` dengan keluaran ke berkas (`pgctl-start.*.txt` di folder demo). Cara ini dipilih karena proses PostgreSQL tetap berjalan sesudah `pg_ctl` selesai. Bila keluaran ditangkap lewat pipe, PowerShell dapat menunggu tanpa akhir. Risiko ini adalah dugaan penyusun berdasarkan cara Windows mewariskan handle ke proses anak, dan **belum diuji** di Windows.

Sandi role DB demo dibuat acak. Sandi itu hanya ada di variabel jendela ini dan tidak ditampilkan. Berkas `pw.tmp` dihapus sesudah `initdb`, termasuk bila `initdb` gagal.

**Nama database wajib `maritime_suite`** (temuan F-2). Migrasi `20260818163500_fase8a_portal_rls` memuat `GRANT CONNECT ON DATABASE maritime_suite`, sehingga dengan nama lain migrasi gagal (P3018). Nama ini aman karena berada di **klaster baru** milik folder demo (port 55433), bukan di server PostgreSQL yang sudah ada. Migrasi yang sama juga membuat role `maritime_portal` dengan sandi pengembangan tetap; role itu hanya ada di klaster demo.

## 4. Blok 4 — migrasi (hanya ke DB demo) dan seed sintetis

```powershell
. { try {
  Assert-Lanjut
  if (-not $global:DemoUrl) { Stop-Demo 'URL DB demo belum ada (Blok 3 belum berhasil)' }
  Push-Location -LiteralPath $global:DemoId.AppPath
  try {
    Set-DemoDbEnv
    Invoke-Native 'prisma migrate deploy' $global:DemoNode @('node_modules/prisma/build/index.js', 'migrate', 'deploy')
    $env:WA2G_DEMO_DB_URL = $global:DemoUrl
    Invoke-Native 'seed demo' $global:DemoNode @('prisma/seed-wa2a-g-demo.mjs')
  } finally { Clear-DemoEnv; Pop-Location }
  Add-DemoCatatan 'Migrasi dan seed demo selesai (exit 0)'
  Write-Host '[OK] Blok 4: migrasi dan seed selesai.' -ForegroundColor Green
} catch { Write-DemoGagal $_ } }
```

**Harus terlihat:**
- `All migrations have been successfully applied.` (24 migrasi);
- `Tenant demo wa2gdemotenantaaaaaa01 siap (2 voyage + sinyal ETA terkonfirmasi, 1 kontak opt-in, 1 kontak tanpa opt-in).`;
- lima akun `wa2g-demo-*@uji.local` dengan **satu sandi demo yang sama**.

Seed mencetak sandi demo itu ke layar. Sandi itu **tercantum di repo publik** (temuan F-4), sehingga hanya boleh dipakai di lingkungan sintetis terisolasi ini. Seed menolak DB yang bukan loopback.

| Akun | Peran | Fungsi di demo |
|---|---|---|
| `wa2g-demo-maker@uji.local` | ADMIN | Pembuat draft |
| `wa2g-demo-peminta@uji.local` | ADMIN | Tandai pratinjau dan minta approval |
| `wa2g-demo-manajer@uji.local` | MANAJER_OPERASI | Pencatat konfirmasi ETA (bukti), tidak boleh memutuskan |
| `wa2g-demo-checker@uji.local` | MANAJER_OPERASI | Checker: setujui/tolak |
| `wa2g-demo-operator@uji.local` | OPERATOR | Tanpa akses (harus 404) |

## 5. Blok 5 — menjalankan aplikasi di latar (proses tercatat, loopback)

Server dijalankan sebagai **satu proses tercatat**: `node node_modules/next/dist/bin/next dev`. Keluarannya dialihkan ke `server.out.log` dan `server.err.log` di folder demo. Tidak ada pipeline `Tee-Object`, sehingga kegagalan server tidak tertutup oleh status pipeline.

Blok ini menyimpan PID dan waktu mulai proses server. Blok baru selesai `[OK]` hanya bila semua syarat ini terpenuhi:
- `/login` menjawab 200;
- penanda perangkap egress muncul;
- listener port 3000 hanya di 127.0.0.1 dan dimiliki proses server itu atau turunannya.

Server dijalankan dengan jendela tersembunyi (`-WindowStyle Hidden`). Apakah jendela benar-benar tersembunyi saat keluaran dialihkan ke berkas **belum diuji** di Windows. Bila tetap muncul jendela konsol kosong, **jangan ditutup**; server dihentikan di §10.

```powershell
. { try {
  Assert-Lanjut
  if ((Get-DemoListener 3000).Count -gt 0) { Stop-Demo 'Port 3000 sudah dipakai proses lain. Jangan hentikan proses itu; laporkan.' }
  $sb = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($sb); $rng.Dispose()
  $global:DemoNaSecret = [Convert]::ToBase64String($sb)
  $global:DemoOut = Join-Path $global:Demo 'server.out.log'; $global:DemoErr = Join-Path $global:Demo 'server.err.log'
  try {
    Set-DemoDbEnv
    $env:NEXTAUTH_SECRET = $global:DemoNaSecret
    $env:NEXTAUTH_URL = 'http://127.0.0.1:3000'
    $env:AUTOMATION_MONITORING_ENABLED = 'true'
    $env:AUTOMATION_TENANT_IDS = 'wa2gdemotenantaaaaaa01'
    $env:WA2_CLIENT_FOUNDATION_ENABLED = 'true'
    $env:NEXT_TELEMETRY_DISABLED = '1'
    $env:NODE_OPTIONS = '--import ./prisma/wa1-egress-trap.mjs'
    $p = Start-Process -FilePath $global:DemoNode -ArgumentList 'node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 3000' -WorkingDirectory $global:DemoId.AppPath -RedirectStandardOutput $global:DemoOut -RedirectStandardError $global:DemoErr -WindowStyle Hidden -PassThru
  } finally { Clear-DemoEnv }
  $null = $p.Handle
  $global:DemoServer = $p
  $global:DemoId.ServerPid = $p.Id
  $global:DemoId.ServerStartTicks = [int64]$p.StartTime.ToUniversalTime().Ticks
  $global:DemoId.Status = 'SERVER_BERJALAN'; Save-Identitas
  Add-DemoCatatan ('Server demo dimulai, PID ' + $p.Id)
  $batas = (Get-Date).AddSeconds(300); $kode = 0
  while ((Get-Date) -lt $batas) {
    if ($p.HasExited) { Stop-Demo ('Server demo berhenti sendiri (exit ' + $p.ExitCode + '); lihat server.err.log') }
    $kode = Get-HttpStatus 'http://127.0.0.1:3000/login'
    if ($kode -eq 200) { break }
    Start-Sleep -Seconds 3
  }
  if ($kode -ne 200) { Stop-Demo ('Server demo tidak siap dalam 300 detik (status terakhir ' + $kode + ')') }
  $log = (Read-LogBersama $global:DemoOut) + "`n" + (Read-LogBersama $global:DemoErr)
  if ($log -notmatch 'WA1-EGRESS\] TRAP-AKTIF') { Stop-Demo 'Penanda perangkap egress TRAP-AKTIF tidak ditemukan' }
  $l = Get-DemoListener 3000
  if ($l.Count -eq 0) { Stop-Demo 'Port 3000 tidak listen' }
  foreach ($x in $l) {
    if ($x.LocalAddress -ne '127.0.0.1') { Stop-Demo ('Server listen di alamat ' + $x.LocalAddress) }
    if (-not (Test-Keturunan ([int]$x.OwningProcess) $p.Id)) { Stop-Demo 'Listener port 3000 bukan proses server demo atau turunannya' }
  }
  Add-DemoCatatan 'Server siap: /login 200, TRAP-AKTIF, listener 3000 hanya 127.0.0.1 milik proses demo'
  Write-Host ('[OK] Blok 5: server demo PID ' + $p.Id + ' siap di http://127.0.0.1:3000 (loopback saja).') -ForegroundColor Green
} catch { Write-DemoGagal $_ } }
```

Variabel `$env:` demo dihapus dari jendela ini segera sesudah server dimulai. Proses server menyimpan salinannya sendiri. Tidak ada `setx`, dan konfigurasi sistem tidak berubah.

## 6. Peramban dan login

### 6.1 Blok 6 — satu profil Edge sekali pakai per peran

```powershell
. { try {
  Assert-Lanjut
  if ($global:DemoId.Status -ne 'SERVER_BERJALAN') { Stop-Demo 'Server demo belum siap (Blok 5)' }
  foreach ($r in 'maker', 'peminta', 'manajer', 'checker', 'operator') {
    $prof = $global:DemoId.EdgeProfilAwalan + $r
    $argStr = '--user-data-dir="' + $prof + '" --no-first-run --no-default-browser-check --lang=id http://127.0.0.1:3000/login'
    Start-Process -FilePath $global:DemoEdge -ArgumentList $argStr | Out-Null
  }
  Add-DemoCatatan 'Lima jendela Edge profil demo dibuka'
  Write-Host '[OK] Blok 6: lima jendela Edge dibuka (satu profil per peran).' -ForegroundColor Green
} catch { Write-DemoGagal $_ } }
```

Setiap jendela punya cookie sendiri. **Login satu akun per jendela**, dan selalu pakai alamat `http://127.0.0.1:3000`, bukan `localhost`. Edge mungkin menampilkan layar sambutan profil baru. Lewati layar itu **tanpa** masuk ke akun Microsoft.

# B. Demo owner (yang Anda lakukan)

### 6.2 Langkah login (setiap jendela)

1. Tunggu sampai kartu login tampil.
2. **Indikator siap: tombol Masuk aktif.** Selama halaman belum siap, tombol **Masuk** tampil pudar dan tidak dapat diklik. Tunggu sampai tombol tampil penuh (tidak pudar). Biasanya beberapa detik; pada server yang baru dimulai bisa lebih lama.
3. Ketik email dan sandi demo, lalu klik **Masuk** **satu kali**. Jangan klik berulang. Selama menunggu, tombol kembali nonaktif dan menampilkan putaran.
4. **Harus terlihat:** pesan "Berhasil masuk. Mengarahkan ke dashboard…", lalu **halaman tujuan dimuat ulang penuh** (bawaan: `/dokumen`; layar dapat berkedip putih sebentar). Sesudah pesan sukses, tombol tetap nonaktif sampai halaman berganti. Itu disengaja.
5. **Bukti sesi.** Di jendela yang sama, buka `http://127.0.0.1:3000/api/auth/session`.
   - Harus tampil JSON yang memuat `"email":"wa2g-demo-<peran>@uji.local"` sesuai jendelanya.
   - `{}` berarti **tidak ada sesi**.
6. Buka `http://127.0.0.1:3000/automation/client-messages`. Sebelum mengklik apa pun, tunggu sampai tulisan "Memuat…" hilang dan daftar atau keterangan "kosong" tampil.

**Batas indikator tombol Masuk:**
- Tombol aktif berarti komponen login **sudah aktif di peramban** (PR #37, F-1). Form juga memakai `method="post"`, sehingga pengiriman sebelum halaman siap tidak menaruh sandi di URL. Perilaku ini diuji di Chromium Linux (§9), **belum** di Edge Windows.
- Halaman login menunggu permintaan `/api/auth/*` lain selesai sebelum mengambil token CSRF (PR #38). Penantian ini tidak terlihat oleh Anda dan tidak perlu ditunggu secara manual.
- Indikator **tidak** menjamin login berhasil. Satu-satunya bukti sesi adalah langkah 5.

### 6.3 Kondisi STOP login (alur penerimaan berhenti)

Perbaikan login sudah ada di `main` (PR #37 dan #38). Baris F-1 dan F-3 di bawah dipertahankan sebagai **tanda regresi**: bila salah satunya terlihat, perbaikan tidak bekerja di laptop ini.

| Bila terlihat | Arti | Lakukan |
|---|---|---|
| Alamat memuat `password=` atau `?email=` | F-1 terjadi (regresi): sandi demo masuk ke URL, riwayat profil demo, dan log server | **STOP penerimaan.** Jangan screenshot dan jangan salin URL ke mana pun. Tutup jendela itu. Catat hanya: "F-1 terjadi, jendela <peran>". Lanjut ke §10; profil dan log mentah ikut terhapus, dan hanya salinan tersamar yang disimpan |
| Pesan "Berhasil masuk…", lalu kembali ke `/login`; atau langkah 5 menampilkan `{}` | F-3 terjadi (regresi): UI menampilkan sukses tanpa sesi | **STOP penerimaan.** Catat: "F-3 terjadi, jendela <peran>". Jangan login ulang untuk melanjutkan run ini. Lanjut ke §10 |
| "Status masuk tidak dapat dipastikan karena koneksi terputus. Muat ulang halaman untuk memeriksa sebelum mencoba lagi." | Permintaan login sudah terkirim, lalu koneksi terputus. Server mungkin sudah membuat sesi, mungkin juga belum. Aplikasi **tidak** mencoba ulang sendiri | **Jangan klik Masuk lagi.** Catat: "Status tidak pasti, jendela <peran>". Muat ulang halaman (F5), lalu buka `/api/auth/session` (langkah 5). **Sesi akun yang benar ada:** lanjutkan, dan catat kejadian ini di A-01. **`{}` atau akun lain:** **STOP penerimaan**, catat, lalu lanjut ke §10. Di loopback, koneksi terputus tidak diharapkan terjadi |
| "Gagal masuk: sesi tidak dapat dibuat…" | Login ditolak secara eksplisit (mis. penolakan CSRF), atau sesi tidak cocok dengan akun | **STOP penerimaan.** Catat, lalu lanjut ke §10 |
| "Gagal menghubungi server…" | Permintaan gagal **sebelum** kredensial dikirim (mis. server tidak menjawab dalam batas waktu) | **STOP penerimaan.** Catat. Periksa jendela PowerShell; jangan memperbaiki apa pun. Lanjut ke §10 |
| JSON sesi memuat email peran lain | Jendela/profil tertukar | **STOP penerimaan.** Catat, lalu lanjut ke §10 |
| "Email atau kata sandi salah." | Salah ketik, atau seed bermasalah | Bila yakin salah ketik, ketik ulang **sekali** dan catat kejadiannya. Bila sandi yakin benar: **STOP**, catat, lalu lanjut ke §10 |

Coba-ulang, pemanasan server, atau login ulang **bukan** cara meluluskan run. Satu-satunya pengecualian adalah ketik ulang sekali karena salah ketik, dan itu dicatat. Pada uji Linux pasca-merge (§9), login pertama sesudah server `next dev` dingin berhasil dengan satu klik. Itu bukan jaminan untuk Edge Windows.

Mencatat ke berkas catatan (contoh, tanpa URL atau sandi):

```powershell
Add-DemoCatatan 'STOP: F-3 terjadi, jendela checker, langkah login'
```

Bila UI berbahasa Inggris, ganti bahasa lewat pengaturan bahasa aplikasi. Label EN padanannya: "Approved — NOT SENT".

## 7. Skenario demo (klik, hasil yang harus terlihat, berhenti bila berbeda)

**URL detail pesan baru diperoleh sesudah draft dibuat di D3.** Sesudah D3, jendela maker membuka detail draft. Salin alamatnya (`http://127.0.0.1:3000/automation/client-messages/<id>`; alamat ini tidak memuat sandi) untuk dibuka di jendela lain pada D4 dan seterusnya.

| # | Jendela | Klik/aksi | Harus terlihat |
|---|---|---|---|
| D1 | maker | Buka daftar | Spanduk **"BELUM DIKIRIM — tidak ada pengiriman pada fase ini"**; daftar kosong |
| D2 | maker | **Buat draft** → **1. Pilih sinyal** (pilih sinyal ETA pertama) → **2. Pilih kontak** | Satu kontak **Layak** dan satu **Tidak layak** dengan alasan opt-in; nomor tersamar (`+62••••…`) |
| D3 | maker | Pilih kontak layak → **Buat draft dari pilihan ini** | Detail draft terbuka: hasil "Draft dibuat"; status **Draf**; isi pesan read-only; tidak ada tombol Setujui/Tolak. **Salin URL detail dari bilah alamat** |
| D4 | peminta | Buka URL detail → **Tandai sudah dipratinjau** | Status **Sudah dipratinjau** |
| D5 | peminta | **Minta approval** | Status **Menunggu approval**; "Berlaku s.d." (2 jam); **tidak ada** tombol Setujui/Tolak untuk peminta |
| D6 | manajer | Buka URL detail | Tidak ada tombol Setujui/Tolak (pencatat bukti ETA) |
| D7 | checker | Buka URL detail di **dua tab** jendela checker | Tombol **Setujui** dan **Tolak** tampil di kedua tab |
| D8 | checker | Tab 1: **Setujui** | Status **Disetujui — BELUM DIKIRIM**; tidak ada tombol Kirim/Send |
| D9 | checker | Tab 2 (belum dimuat ulang): **Setujui** | Hasil **"Approval sudah diputuskan sebelumnya"**; data dimuat ulang; tetap disetujui; tidak ada keputusan ganda |
| D10 | checker | **Batalkan pesan** → **Konfirmasi** tanpa alasan | Galat alasan wajib (3–1000 karakter); status tetap disetujui |
| D11 | checker | **Batalkan pesan** → isi alasan → **Konfirmasi** | Status **Dibatalkan**; hanya **Buat revisi (kontak sama)** |
| D12 | checker | **Buat revisi (kontak sama)** | Aplikasi **langsung membuka detail revisi baru**: hasil "Draft dibuat", status **Draf**, **Revisi 2**, penerima tersamar sama dengan pesan asal |
| D13 | maker → peminta → checker | Buat draft dari **sinyal kedua** → pratinjau → minta approval → checker **Tolak** dengan alasan 2 huruf | Galat alasan wajib; status tetap Menunggu approval |
| D14 | checker | **Tolak** dengan alasan sah | Status **Ditolak**; hanya **Buat revisi** |
| D15 | operator | Login (§6.2), buka `/automation/client-messages` | Halaman **404**; tanpa isi pesan |
| D16 | — | Akhir demo: jalankan Blok 7 | `BLOCKED` = 0 dan `password=` = 0 (lihat batas di §9) |

**Arti D8–D9.** D8 dan D9 adalah **dua POST approve berurutan** untuk approval yang sama, dari dua tab:
- POST pertama (D8) mencatat keputusan.
- POST kedua (D9) datang dari tab yang datanya sudah basi. POST itu harus **ditolak** dengan konflik "sudah diputuskan", sehingga keputusan kedua tidak tercatat.

D9 membuktikan penolakan keputusan kedua secara berurutan. D9 **bukan** uji balapan serentak; uji konkurensi ada di uji otomatis F4 dan tidak diperagakan.

**Tidak diperagakan** (dibuktikan uji otomatis, lihat §8):
- approval **kedaluwarsa** (TTL 2 jam);
- status **tidak pasti** (koneksi putus);
- **akses lintas tenant**, karena seed demo hanya punya satu tenant. Uji otomatis g-ui memakai tenant sintetis kedua.

D15 (operator 404) membuktikan pembatasan **peran**, bukan isolasi tenant.

### Blok 7 — bukti akhir demo (sebelum §10)

Blok ini hanya membaca log dan mencetak **jumlah**. Isi log dan URL tidak ditampilkan.

```powershell
. { try {
  $t = (Read-LogBersama $global:DemoOut) + "`n" + (Read-LogBersama $global:DemoErr)
  $trap = ([regex]::Matches($t, 'WA1-EGRESS\] TRAP-AKTIF')).Count
  $blk  = ([regex]::Matches($t, 'WA1-EGRESS\] BLOCKED')).Count
  $f1   = ([regex]::Matches($t, '(?i)[?&]password=')).Count
  $ringkas = 'Bukti log server: TRAP-AKTIF=' + $trap + ' BLOCKED=' + $blk + ' URL-dengan-password=' + $f1
  Write-Host $ringkas
  Add-DemoCatatan $ringkas
  if ($trap -eq 0 -or $blk -ne 0 -or $f1 -ne 0) { Write-Host 'Hasil tidak sesuai harapan: catat sebagai temuan (F-1 bila URL-dengan-password > 0).' -ForegroundColor Yellow }
} catch { Write-DemoGagal $_ } }
```

`URL-dengan-password` lebih dari 0 berarti F-1 terjadi, walaupun tidak terlihat di peramban. Run itu **berhenti** sebagai bukti penerimaan (§6.3).

## 8. Daftar periksa penerimaan

Isi daftar ini di `catatan-penerimaan.md` di folder catatan.
- Kolom "Bukti otomatis" mencatat uji yang **sudah ada**. Bukti itu tidak menggantikan peragaan atau penilaian owner.
- Kolom keputusan diisi owner.
- Bila run berhenti (§0, §6.3), kriteria yang belum diperagakan tetap **BELUM DINILAI**. Penyebab berhenti dicatat di A-01 atau di kriteria yang sedang diperagakan.

| ID | Kriteria | Bukti otomatis (sumber) | Diperagakan (§7) | Hasil aktual | Bukti/catatan | Keputusan owner |
|---|---|---|---|---|---|---|
| A-01 | Persiapan lokal (checkout, DB demo, migrasi, seed, server loopback, login dengan sesi) berjalan sesuai panduan; tanpa data/kredensial nyata | Linux historis saja (§9); Windows belum | §1–§6 | | | **BELUM DINILAI** |
| A-02 | Daftar, spanduk BELUM DIKIRIM, dan bahasa ID/EN dapat dipahami | g-ui (label ID/EN) | D1 | | | **BELUM DINILAI** |
| A-03 | Kandidat sinyal & kontak masuk akal; alasan kontak tidak layak jelas; nomor tersamar | g-ui (kandidat, penyamaran nomor) | D2 | | | **BELUM DINILAI** |
| A-04 | Draft → pratinjau → minta approval → setujui → "Disetujui — BELUM DIKIRIM" | g-ui dev 45/0 (`9a9fa2e`); uji asap seed (§9) | D3–D5, D8 | | | **BELUM DINILAI** |
| A-05 | Maker-checker: pembuat, peminta, pencatat bukti tidak dapat menyetujui (UI dan server) | g-ui (403 `SELF_APPROVAL_FORBIDDEN`/`CHECKER_IS_MAKER`/`CHECKER_IS_EVIDENCE_RECORDER`) | D3, D5, D6 (UI saja) | | | **BELUM DINILAI** |
| A-06 | Tolak (alasan wajib), batalkan (alasan wajib), revisi dapat dipahami | g-ui | D10–D14 | | | **BELUM DINILAI** |
| A-07 | Status terminal tak dapat diubah; konflik "sudah diputuskan" dan kedaluwarsa jelas | g-ui (konflik, kedaluwarsa, tidak pasti) | D9, D11, D14 (kedaluwarsa tidak diperagakan) | | | **BELUM DINILAI** |
| A-08 | Peran tak berhak tidak melihat; tenant lain tidak melihat | g-ui (OPERATOR 404; tenant B daftar kosong & detail 404) | D15 (peran saja; lintas tenant tidak diperagakan) | | | **BELUM DINILAI** |
| A-09 | Tidak ada tombol, kesan, atau jalur pengiriman nyata; tanpa egress dari server aplikasi | g-static (tanpa route kirim/provider); g-ui (origin peramban, Chromium otomatis); perangkap egress server | D8, D16 (egress peramban **tidak** dipantau, §9) | | | **BELUM DINILAI** |
| A-10 | Keputusan akhir owner: diterima / diterima dengan catatan / ditolak, beserta daftar temuan | — | — | | | **BELUM DINILAI** |

**Q-1 — pertanyaan kebijakan untuk owner** (teramati; bukan cacat yang dinyatakan; **menunggu owner**): pada status Menunggu approval, **peminta** dan **pencatat bukti (manajer)** dapat memilih **Batalkan pesan**, meski tidak dapat menyetujui. Apakah ini sesuai kebijakan PT TSM? Nilai di A-05/A-06.

**Kesesuaian operasional** adalah penilaian owner, dan tidak dibuktikan oleh uji. Contoh pertanyaannya: apakah peran sesuai organisasi PT TSM, apakah kata-kata pesan tepat, dan apakah alur kerja ini dipakai staf.

## 9. Bukti verifikasi kit dan batas klaim egress

Bagian ini adalah bukti **teknis**. Bukti ini bukan penerimaan owner dan tidak menilai A-01–A-10.

**Linux, kit v4 (baru, otomatis, oleh penyusun; baseline `1b20baa`):**
- **Lingkungan:** Linux 6.18 x86_64, Node v22.22.0, PostgreSQL 16.15. Checkout baru dari GitHub (`origin/main` = HEAD = `1b20baa`, tree bersih, tanpa `.env` nyata, `faseAktif` `{}`). Klaster baru (scram, `listen_addresses=127.0.0.1`, port 55433), DB `maritime_suite`, 24 migrasi, seed sintetis. Server `next dev -H 127.0.0.1 -p 3000` dengan flag hanya di proses server dan perangkap egress. Satu konteks Chromium Playwright (locale `id-ID`) per peran. Satu run.
- **Login (meniru pengguna):** tunggu tombol Masuk aktif, isi, klik **satu kali**. Tanpa penantian sinyal internal, tanpa pemanasan, tanpa coba-ulang. **5 dari 5 login berhasil**, termasuk **login pertama sesudah server dingin**. Setiap login menampilkan pesan sukses, memuat dokumen `/dokumen` secara penuh, dan `/api/auth/session` memuat email akun yang sama. Tombol aktif 0,7–2,1 detik sesudah halaman dibuka.
- **Alur inti:** D1–D9 dan D15 lulus (draft → pratinjau → minta approval → setujui → "Disetujui — BELUM DIKIRIM", konflik "sudah diputuskan", operator 404). Total uji asap 17/0.
  - 0 permintaan peramban dengan `password` di query;
  - 0 permintaan peramban ke origin lain (hanya konteks yang diamati);
  - Blok 7 padanan: TRAP-AKTIF 49, BLOCKED 0, URL-dengan-password 0.
  - **Koreksi (18 Oktober 2026):** `BLOCKED 0` di Linux **tidak** membuktikan server tanpa egress. Container uji memakai proxy HTTPS di `127.0.0.1`; `next/font/google` mengunduh Google Fonts lewat proxy itu, dan perangkap mengizinkan loopback. Jadi server **berhasil** menghubungi Google Fonts tanpa tercatat. Lihat F-6.
- **Tidak dijalankan pada v4:**
  - D10–D14 (batal, tolak, revisi); bukti tetap dari run historis di bawah dan uji g-ui;
  - status "tidak pasti", penolakan CSRF, dan batas waktu; bukti ada di uji `check-login-ui` PR #38 (pra-merge, dilaporkan di PR, tidak diukur ulang di sini);
  - Edge dan Windows.
- **Pembersihan (urutan §10, padanan Linux):**
  - identitas PID dan waktu mulai diverifikasi sebelum menghentikan;
  - tidak ada proses dari folder demo; `pg_ctl status` exit 3; port 3000 dan 55433 bebas;
  - penanda cocok; folder demo dihapus; folder catatan tetap;
  - pindai rahasia pada bukti: 0.
- **Teks panduan:** pemeriksaan teks blok PowerShell dan uji penyamar (regex Python) dijalankan ulang pada berkas ini. Hasilnya ada di arsip kit. Keduanya **bukan** parser PowerShell atau uji .NET.
- **Perbedaan dengan Windows:** sama seperti daftar run historis di bawah (user OS `postgres` untuk `initdb`, `node_modules` disymlink, Chromium bukan Edge, sinyal Linux bukan `taskkill`, `pg_ctl` langsung).

**Linux (historis, otomatis, oleh penyusun; sebelum perbaikan login):**
- **Lingkungan:** baseline `a50c9bf`; padanan bash dari panduan versi sebelumnya; klaster PostgreSQL 16 baru (scram, `listen_addresses=127.0.0.1`, port 55433); DB `maritime_suite`; 24 migrasi; seed; `next dev -H 127.0.0.1 -p 3000` dengan perangkap egress; satu konteks Chromium Playwright (locale `id-ID`) per peran.
- **Hasil:** skenario D1–D15 **lulus 16/0**.
- **Batas hasil itu:**
  - Runner menunggu tanda internal yang tidak terlihat oleh pengguna, yaitu properti React pada tombol login dan selesainya permintaan `/api/auth/*`.
  - Percobaan sebelumnya memunculkan F-1 dan F-3. Pada run 16/0, login berhasil pada percobaan pertama.
  - Runner versi itu berisi aturan coba-ulang login satu kali. Aturan itu tidak terpakai pada run 16/0, tetapi panduan ini **tidak** lagi mengizinkan coba-ulang sebagai lulus.
- **Uji terarah revisi kit v2 (historis; Linux, dua run, baseline `a50c9bf` sebelum perbaikan login; log di arsip kit v3, bukan di repo):**
  - Server dijalankan lewat `node node_modules/next/dist/bin/next dev`, dengan stdout dan stderr ke berkas terpisah. `/login` menjawab 200, `TRAP-AKTIF` muncul, dan listener port 3000 hanya ada di 127.0.0.1. Pemilik soket adalah **proses turunan** dari PID yang tercatat, bukan PID itu sendiri; inilah alasan Blok 5 memeriksa garis keturunan. Pemeriksaan pemilik listener hanya terjadi pada run 2, karena alat bantu penyusun gagal pada run 1.
  - Tanpa hidrasi (JS aplikasi diblokir), klik tombol mata tidak mengubah ikon maupun `aria-pressed`, dan klik Masuk mengirim GET dengan sandi di URL. Dengan kata lain, F-1 direproduksi dengan sengaja.
  - Meniru pengguna (klik mata tiap 1 detik sampai berubah, lalu klik Masuk, tanpa coba-ulang): **29 dari 30 login** menghasilkan sesi tanpa sandi di URL. **1 dari 30 (login pertama sesudah server mulai, run 1) adalah F-3**: pesan sukses tampil tanpa sesi, walaupun indikator sudah berubah. Indikator tombol mata **tidak mencegah F-3**. Karena itu langkah 5 (§6.2) dan aturan STOP diperlukan, dan **run penerimaan dapat berhenti di login**.
  - Penyamar log diuji dengan pola yang diambil langsung dari `ConvertTo-Tersamar`, tetapi dijalankan dengan mesin regex **Python**, bukan .NET. Pola itu menyamarkan `password=` pada log server nyata (1 kemunculan dari uji F-1 yang disengaja). Pindai rahasia pada bukti: 0.
  - Pembersihan meniru urutan §10. Langkahnya: hentikan PID tercatat, lalu periksa tidak ada proses dari folder demo; `pg_ctl status` exit 3; port 3000 dan 55433 tidak listen; penanda cocok; folder demo terhapus; folder catatan tetap ada.
  - Pemeriksaan **teks** blok PowerShell (ASCII saja, tanpa sintaks khusus PS7, kurung seimbang, setiap blok punya `catch`, variabel rahasia tidak dicetak) lulus. Pemeriksaan ini **bukan** parser PowerShell dan bukan uji sintaks.
- **Perbedaan dengan Windows:**
  - `initdb` dijalankan sebagai user OS `postgres`;
  - `node_modules` disymlink, bukan hasil `npm ci`;
  - peramban adalah Chromium Playwright, bukan Edge;
  - proses dihentikan dengan sinyal Linux ke grup proses tercatat, bukan `taskkill /T`;
  - `pg_ctl start` dijalankan langsung, bukan lewat `Start-Process`.

**Windows: satu run uji coba oleh owner (18 Oktober 2026).** Laptop owner: Windows, PowerShell 7.6.7 (Windows Terminal), Node 24.16.0, npm 11.13.0, Git 2.55.0, binary PostgreSQL 16.14, Edge. Blok 0–4 dijalankan dengan panduan identik (SHA-256 berkas sama) lewat asisten lain; Blok 5–10f dari panduan ini. Hasil yang dilaporkan owner lewat tangkapan layar:
- Blok 0–6 `[OK]`; Blok 5 tanpa jendela konsol tambahan (`-WindowStyle Hidden` bekerja); server PID tercatat, klaster 127.0.0.1:55433.
- Login pertama sesudah server dingin dan login semua peran: bersesi, tanpa STOP; `URL-dengan-password=0`.
- D1–D16 sesuai kolom "Harus terlihat", **kecuali D16**: `TRAP-AKTIF=185 BLOCKED=20` — semuanya `tls fonts.googleapis.com:443` (**F-6**). Karena itu run ini dicatat **uji coba**, bukan run penerimaan bersih; owner memilih melanjutkan.
- Pembersihan 10a–10f `[OK]`: proses dihentikan berdasarkan PID + waktu mulai; `pg_ctl` exit 3; Edge demo tertutup; bukti tersamar disalin; folder demo dihapus setelah `HAPUS`; folder catatan tetap.
- Tidak dijalankan: Windows PowerShell 5.1, kedaluwarsa approval, lintas tenant, penolakan server untuk self-approval (hanya UI).

**Bukti reviewer Windows** (dilaporkan reviewer; arsipnya tidak diperiksa ulang penyusun):
- Parser Windows PowerShell 5.1.26100.9711 dan PowerShell 7.6.5 menguraikan 16 blok panduan **versi sebelumnya** dengan 0 galat sintaks.
- Fungsi penyamaran lulus lima kasus sintetis dengan .NET di kedua versi: query `password`, query terenkode, JSON `password`, URL PostgreSQL, dan secret literal.
- Ini bukan uji runtime kit.
- Sesudah pemeriksaan itu, **Blok 1, Blok 5, dan Blok 10c diubah** (kit v3), dan Blok 0 diubah lagi di kit v4 (hanya literal SHA baseline). Blok yang diubah itu belum diurai ulang di Windows.

**Diagnosa login historis (Linux, `next dev`, baseline `a50c9bf`, sebelum PR #37/#38):**
- Pada login **pertama sesudah server `next dev` dimulai dingin** (folder `.next` baru), F-3 terjadi pada 7 dari 7 siklus yang direkam.
- Pada ketujuh kejadian itu, token CSRF yang dikirim berbeda dari token di cookie, dan server menjawab `…/signin?csrf=true`.
- Login berikutnya pada server yang sama: 24 dari 24 bersesi.
- Hasil ini **bukan** bukti untuk `next start` atau produksi.

**Sesudah perbaikan (PR #37 dan #38, merged di `1b20baa`):**
- PR #37 menutup F-1: form `method="post"`, tombol nonaktif sampai halaman siap. PR #37 juga menutup sukses palsu F-3: sukses hanya bila sesi akun yang sama terkonfirmasi.
- PR #38 menunggu permintaan `/api/auth/*` selesai sebelum mengambil token CSRF, membuat percobaan login dapat dibatalkan, menampilkan status "tidak pasti" tanpa coba-ulang otomatis, dan memuat penuh halaman tujuan sesudah sukses.
- **Bukti pra-merge PR #38 (dilaporkan di PR #38, tidak diukur ulang di sini):** `check-login-ui` 61/0 pada `next dev` ×3 dan `next start` ×2. Login sah pertama sesudah server dingin berhasil di kelima run. Linux, Chromium 141 headless.
- **Bukti kit v4:** login pertama sesudah server dingin berhasil dengan satu klik (lihat atas). Satu run, bukan statistik.
- **Belum dibuktikan:** perilaku yang sama di **Edge Windows**. Karena itu aturan STOP §6.3 tetap berlaku penuh.

**F-6 — Google Fonts dari server `next dev`:** `src/app/layout.tsx` memakai `next/font/google`. Dalam `next dev`, server mengunduh font dari `fonts.googleapis.com`. Tanpa proxy (laptop owner) perangkap memblokirnya (BLOCKED=20) dan aplikasi memakai font cadangan; dengan proxy loopback (container Linux) unduhan lolos tanpa tercatat. Ini bukan jalur WhatsApp dan tidak membawa data aplikasi, tetapi tetap egress dari proses server. Keputusan owner: diterima apa adanya untuk demo lokal (OD-30). Akibatnya D16 (`BLOCKED`=0) **tidak** dapat terpenuhi selama aplikasi memakai `next/font/google`.

**Arti `BLOCKED` = 0 dan batas klaim egress:**
- Perangkap egress hanya berlaku untuk proses Node yang **memuatnya**, yaitu server `next dev` dan turunannya yang tercatat `TRAP-AKTIF`. Untuk proses itu, koneksi non-loopback diblokir dan dicatat.
- Perangkap ini **tidak** mencakup `git clone`, `npm ci`, migrasi, seed, binary PostgreSQL, maupun **peramban**.
- Perangkap mengizinkan semua tujuan loopback. Bila ada proxy HTTP(S) di loopback (`HTTPS_PROXY=http://127.0.0.1:…`), koneksi keluar lewat proxy **tidak** tercatat sebagai BLOCKED. Jalankan demo tanpa variabel proxy (Blok 1 tidak memeriksanya).
- Pada demo manual, lalu lintas jaringan Edge **tidak dipantau**. Edge sendiri dapat menghubungi layanan Microsoft, misalnya pembaruan atau SmartScreen. Karena itu demo ini **tidak** membuktikan bahwa peramban tanpa egress.
- Pemeriksaan origin peramban hanya ada di uji otomatis g-ui dan Linux (Chromium), dan hanya untuk konteks yang diamati.

# C. Pembersihan

## 10. Pembersihan (hanya proses dan data demo yang tercatat)

Pembersihan berjalan per blok, dan **urutannya wajib**. Setiap blok memeriksa identitas yang tercatat di `identitas-demo.json`:
- Proses dihentikan **hanya** bila PID **dan** waktu mulainya cocok dengan catatan.
- Proses **tidak pernah** dihentikan hanya berdasarkan nomor port.
- Bila satu blok gagal, folder demo **tidak** dihapus.

Bukti tersamar disalin ke folder catatan **sebelum** folder demo dihapus.

**Blok 10a — muat identitas.** Bila jendela PowerShell asli masih terbuka, blok ini langsung jalan. Bila jendela tertutup:
1. tempel Blok 0;
2. isi `$global:Catatan = '<path folder catatan>'`; path dicetak di akhir Blok 2, dan foldernya ada di bawah `$HOME\wa2g-demo-catatan`;
3. tempel blok ini.

```powershell
. { try {
  $global:BersihStatus = 'OK'
  $global:BersihServer = $false; $global:BersihDb = $false; $global:BersihEdge = $false; $global:BersihBukti = $false
  if (-not $global:DemoId) {
    if (-not $global:Catatan) { throw 'Isi $global:Catatan dengan folder catatan demo terlebih dulu' }
    $global:DemoIdFile = Join-Path $global:Catatan 'identitas-demo.json'
    $global:DemoCatatanFile = Join-Path $global:Catatan 'catatan-penerimaan.md'
    $global:DemoId = Get-Content -LiteralPath $global:DemoIdFile -Raw | ConvertFrom-Json
  }
  Set-Location -LiteralPath $HOME
  Write-Host ('Folder demo tercatat : ' + $global:DemoId.DemoPath)
  Write-Host ('Server PID tercatat  : ' + $global:DemoId.ServerPid + '; klaster PID: ' + $global:DemoId.PgPid + '; status: ' + $global:DemoId.Status)
  Add-DemoCatatan 'Pembersihan dimulai'
  Write-Host '[OK] Blok 10a: identitas dimuat.' -ForegroundColor Green
} catch { $global:BersihStatus = 'GAGAL'; Write-Host ('[GAGAL] ' + $_.Exception.Message) -ForegroundColor Red } }
```

**Blok 10b — hentikan server demo (PID tercatat saja).**

```powershell
. { try {
  if ($global:BersihStatus -ne 'OK') { throw 'Pembersihan berhenti sebelumnya' }
  $sid = $global:DemoId.ServerPid
  if ($sid) {
    $proc = Get-Process -Id $sid -ErrorAction SilentlyContinue
    if ($proc) {
      if ([int64]$proc.StartTime.ToUniversalTime().Ticks -ne [int64]$global:DemoId.ServerStartTicks) { throw 'PID server tercatat kini milik proses lain (waktu mulai berbeda). Tidak dihentikan.' }
      if ($proc.ProcessName -ne 'node') { throw 'PID server tercatat bukan proses node. Tidak dihentikan.' }
      & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $sid /T /F
      if ($LASTEXITCODE -ne 0) { throw ('taskkill server demo gagal (exit ' + $LASTEXITCODE + ')') }
    }
    $batas = (Get-Date).AddSeconds(30)
    while ((Get-Process -Id $sid -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $batas)) { Start-Sleep -Seconds 1 }
    if (Get-Process -Id $sid -ErrorAction SilentlyContinue) { throw 'Server demo masih berjalan sesudah 30 detik' }
  }
  $app = [string]$global:DemoId.AppPath
  $sisa = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($app, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
  if ($sisa.Count -gt 0) { throw ('Masih ada ' + $sisa.Count + ' proses node dari folder demo (PID ' + (($sisa | ForEach-Object { $_.ProcessId }) -join ',') + '). Laporkan; folder tidak dihapus.') }
  if ((Get-DemoListener 3000).Count -gt 0) { throw 'Port 3000 masih listen sesudah server demo berhenti. Jangan hentikan berdasarkan port; laporkan. Folder tidak dihapus.' }
  $global:BersihServer = $true
  Add-DemoCatatan 'Server demo berhenti; tidak ada proses node dari folder demo; port 3000 bebas'
  Write-Host '[OK] Blok 10b: server demo berhenti.' -ForegroundColor Green
} catch { $global:BersihStatus = 'GAGAL'; Write-Host ('[GAGAL] ' + $_.Exception.Message) -ForegroundColor Red; Add-DemoCatatan ('[GAGAL pembersihan] ' + $_.Exception.Message) } }
```

**Blok 10c — hentikan klaster demo (identitas diverifikasi lebih dulu).** Sebelum `pg_ctl stop`, blok ini memeriksa semua hal berikut:
- path klaster tercatat = `<folder demo tercatat>\pgdata`, dan folder itu bukan link/junction;
- penanda folder demo cocok dengan GUID tercatat;
- PID di `postmaster.pid` sama dengan PID tercatat, dan path data di berkas itu sama dengan path klaster;
- proses dengan PID itu bernama `postgres` dengan waktu mulai yang sama dengan catatan.

Bila identitas hilang atau berbeda, **tidak ada proses yang dihentikan**. Blok melaporkan kondisinya, dan folder tidak dihapus. Kepemilikan tidak pernah ditebak dari port. Pemeriksaan sesudah penghentian tetap dijalankan.

```powershell
. { try {
  if ($global:BersihStatus -ne 'OK') { throw 'Pembersihan berhenti sebelumnya' }
  $demoPath = [IO.Path]::GetFullPath([string]$global:DemoId.DemoPath).TrimEnd('\')
  $data = [IO.Path]::GetFullPath([string]$global:DemoId.DataPath).TrimEnd('\')
  if (-not [string]::Equals($data, (Join-Path $demoPath 'pgdata'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Path klaster tercatat bukan <folder demo>\pgdata. Tidak ada proses yang dihentikan; laporkan.' }
  $pen = Join-Path $demoPath '.wa2g-demo-penanda'
  if (-not (Test-Path -LiteralPath $pen -PathType Leaf)) { throw 'Penanda folder demo hilang. Tidak ada proses yang dihentikan; laporkan.' }
  if (([IO.File]::ReadAllText($pen)).Trim() -ne [string]$global:DemoId.Penanda) { throw 'Penanda folder demo berbeda. Tidak ada proses yang dihentikan; laporkan.' }
  $pgctl = Join-Path ([string]$global:DemoId.PgBin) 'pg_ctl.exe'
  if (Test-Path -LiteralPath $data) {
    if ((Get-Item -LiteralPath $data -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Folder klaster adalah link/junction. Tidak ada proses yang dihentikan; laporkan.' }
    $pidFile = Join-Path $data 'postmaster.pid'
    $identitasCocok = $false
    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
      $baris = @(Get-Content -LiteralPath $pidFile -TotalCount 2)
      if ($baris.Count -lt 2) { throw 'postmaster.pid tidak lengkap. Tidak ada proses yang dihentikan; laporkan.' }
      $pidNow = 0
      if (-not [int]::TryParse($baris[0].Trim(), [ref]$pidNow)) { throw 'PID di postmaster.pid tidak terbaca. Tidak ada proses yang dihentikan; laporkan.' }
      if (-not $global:DemoId.PgPid -or $pidNow -ne [int]$global:DemoId.PgPid) { throw ('PID di postmaster.pid (' + $pidNow + ') berbeda dari PID tercatat (' + $global:DemoId.PgPid + '). Tidak ada proses yang dihentikan; laporkan.') }
      if (-not [string]::Equals([IO.Path]::GetFullPath($baris[1].Trim()).TrimEnd('\'), $data, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path data di postmaster.pid berbeda dari klaster tercatat. Tidak ada proses yang dihentikan; laporkan.' }
      $pp = Get-Process -Id $pidNow -ErrorAction SilentlyContinue
      if ($pp) {
        if ($pp.ProcessName -ne 'postgres') { throw ('PID ' + $pidNow + ' bukan proses postgres. Tidak ada proses yang dihentikan; laporkan.') }
        if ([int64]$pp.StartTime.ToUniversalTime().Ticks -ne [int64]$global:DemoId.PgStartTicks) { throw ('Waktu mulai PID ' + $pidNow + ' berbeda dari catatan. Tidak ada proses yang dihentikan; laporkan.') }
        $identitasCocok = $true
      }
    }
    if (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION')) {
      & $pgctl -D $data status
      $st = $LASTEXITCODE
      if ($st -eq 0) {
        if (-not $identitasCocok) { throw 'pg_ctl melaporkan klaster berjalan, tetapi identitas postmaster tidak terverifikasi. Tidak ada proses yang dihentikan; laporkan.' }
        & $pgctl -D $data stop -m fast -w -t 60
        if ($LASTEXITCODE -ne 0) { throw ('pg_ctl stop gagal (exit ' + $LASTEXITCODE + ')') }
      } elseif ($st -ne 3) { throw ('pg_ctl status tak terduga (exit ' + $st + ')') }
      & $pgctl -D $data status
      if ($LASTEXITCODE -ne 3) { throw ('Klaster demo belum berhenti (pg_ctl status exit ' + $LASTEXITCODE + ')') }
    }
  }
  if ($global:DemoId.PgPid) {
    $pp = Get-Process -Id $global:DemoId.PgPid -ErrorAction SilentlyContinue
    if ($pp -and ([int64]$pp.StartTime.ToUniversalTime().Ticks -eq [int64]$global:DemoId.PgStartTicks)) { throw 'Postmaster demo masih berjalan' }
  }
  $sisa = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($data, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
  if ($sisa.Count -gt 0) { throw ('Masih ada ' + $sisa.Count + ' proses postgres klaster demo. Folder tidak dihapus.') }
  if ((Get-DemoListener 55433).Count -gt 0) { throw 'Port 55433 masih listen. Jangan hentikan berdasarkan port; laporkan. Folder tidak dihapus.' }
  $global:BersihDb = $true
  Add-DemoCatatan 'Klaster demo berhenti (identitas terverifikasi); port 55433 bebas'
  Write-Host '[OK] Blok 10c: klaster demo berhenti.' -ForegroundColor Green
} catch { $global:BersihStatus = 'GAGAL'; Write-Host ('[GAGAL] ' + $_.Exception.Message) -ForegroundColor Red; Add-DemoCatatan ('[GAGAL pembersihan] ' + $_.Exception.Message) } }
```

**Blok 10d — pastikan peramban profil demo tertutup.** Tutup kelima jendela Edge demo secara manual, lalu jalankan blok ini.

```powershell
. { try {
  if ($global:BersihStatus -ne 'OK') { throw 'Pembersihan berhenti sebelumnya' }
  $awal = [string]$global:DemoId.EdgeProfilAwalan
  $e = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($awal, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
  if ($e.Count -gt 0) { throw ('Masih ada ' + $e.Count + ' proses peramban profil demo. Tutup jendela demo, tunggu 10 detik, lalu ulangi Blok 10d (jangan ulangi 10a).') }
  $global:BersihEdge = $true
  Add-DemoCatatan 'Tidak ada proses peramban profil demo'
  Write-Host '[OK] Blok 10d: peramban profil demo tertutup.' -ForegroundColor Green
} catch { Write-Host ('[BELUM] ' + $_.Exception.Message) -ForegroundColor Yellow } }
```

Blok 10d tidak menghentikan proses apa pun. Bila proses Edge profil demo tetap ada sesudah semua jendelanya ditutup (Edge dapat tetap berjalan di latar), laporkan. Jangan menghapus folder, dan jangan menghentikan proses Edge lain.

**Blok 10e — salin bukti tersamar ke folder catatan.** Blok ini hanya membaca dan menyalin, sehingga boleh dijalankan walaupun blok lain gagal.

```powershell
. { try {
  $tujuan = Join-Path $global:Catatan 'bukti-tersamar'
  [IO.Directory]::CreateDirectory($tujuan) | Out-Null
  $hitung = @()
  foreach ($n in 'server.out.log', 'server.err.log', 'pg.log') {
    $asal = Join-Path ([string]$global:DemoId.DemoPath) $n
    if (-not (Test-Path -LiteralPath $asal -PathType Leaf)) { $hitung += ($n + ': tidak ada'); continue }
    $mentah = Read-LogBersama $asal
    $hitung += ($n + ': password=' + ([regex]::Matches($mentah, '(?i)password=')).Count + ', BLOCKED=' + ([regex]::Matches($mentah, 'WA1-EGRESS\] BLOCKED')).Count + ', TRAP-AKTIF=' + ([regex]::Matches($mentah, 'WA1-EGRESS\] TRAP-AKTIF')).Count)
    $bersih = ConvertTo-Tersamar $mentah
    if ([regex]::IsMatch($bersih, '(?i)password(=|%3D)(?!\*\*\*)')) { throw ('Penyamaran ' + $n + ' tidak lengkap; tidak disalin') }
    [IO.File]::WriteAllText((Join-Path $tujuan ($n + '.tersamar.txt')), $bersih)
  }
  [IO.File]::WriteAllText((Join-Path $tujuan ('ringkasan-hitungan-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')), (($hitung -join [Environment]::NewLine) + [Environment]::NewLine))
  $global:BersihBukti = $true
  Add-DemoCatatan ('Bukti tersamar disalin: ' + ($hitung -join ' | '))
  Write-Host '[OK] Blok 10e: bukti tersamar disalin ke folder catatan.' -ForegroundColor Green
} catch { Write-Host ('[GAGAL] ' + $_.Exception.Message) -ForegroundColor Red; Add-DemoCatatan ('[GAGAL bukti] ' + $_.Exception.Message) } }
```

**Blok 10f — hapus folder demo (dengan pemeriksaan identitas).** Folder baru dihapus bila 10b, 10c, 10d, dan 10e berhasil, dan path yang di-resolve sama persis dengan folder demo yang dibuat Blok 2:
- path di `identitas-demo.json` = `$HOME\wa2g-demo`;
- folder itu bukan link/junction dan tidak berisi link/junction;
- berkas penanda berisi GUID yang tercatat.

```powershell
. { try {
  if ($global:BersihStatus -ne 'OK') { throw 'Pembersihan berhenti sebelumnya; folder tidak dihapus' }
  if (-not ($global:BersihServer -and $global:BersihDb -and $global:BersihEdge -and $global:BersihBukti)) { throw 'Blok 10b-10e belum semuanya berhasil; folder tidak dihapus' }
  $harap = [IO.Path]::GetFullPath((Join-Path $HOME 'wa2g-demo'))
  $tercatat = [IO.Path]::GetFullPath([string]$global:DemoId.DemoPath)
  if (-not [string]::Equals($harap, $tercatat, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path tercatat tidak sama dengan $HOME\wa2g-demo' }
  if ($harap.TrimEnd('\') -eq ([IO.Path]::GetPathRoot($harap)).TrimEnd('\') -or [string]::Equals($harap.TrimEnd('\'), ([IO.Path]::GetFullPath($HOME)).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Path demo tidak sah' }
  if (-not (Test-Path -LiteralPath $harap -PathType Container)) { throw 'Folder demo tidak ada' }
  $item = Get-Item -LiteralPath $harap -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Folder demo adalah link/junction; tidak dihapus' }
  if (-not [string]::Equals([IO.Path]::GetFullPath($item.FullName).TrimEnd('\'), $harap.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Path resolve berbeda' }
  $pen = Join-Path $harap '.wa2g-demo-penanda'
  if (-not (Test-Path -LiteralPath $pen -PathType Leaf)) { throw 'Berkas penanda tidak ada; tidak dihapus' }
  if (([IO.File]::ReadAllText($pen)).Trim() -ne [string]$global:DemoId.Penanda) { throw 'Penanda tidak cocok; tidak dihapus' }
  $rp = @(Get-ChildItem -LiteralPath $harap -Recurse -Force -Attributes ReparsePoint)
  if ($rp.Count -gt 0) { throw ('Ada ' + $rp.Count + ' link/junction di dalam folder demo; tidak dihapus otomatis. Laporkan.') }
  Write-Host ('Akan dihapus: ' + $harap)
  $jawab = Read-Host 'Ketik HAPUS (huruf besar) untuk menghapus folder di atas'
  if ($jawab -cne 'HAPUS') { throw 'Dibatalkan pengguna; folder tidak dihapus' }
  Get-ChildItem -LiteralPath $harap -Force | Where-Object { $_.Name -ne '.wa2g-demo-penanda' } | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  $sisa = @(Get-ChildItem -LiteralPath $harap -Force | Where-Object { $_.Name -ne '.wa2g-demo-penanda' })
  if ($sisa.Count -gt 0) { throw ('Penghapusan belum lengkap (' + $sisa.Count + ' entri tersisa); penanda dipertahankan agar blok ini dapat diulang') }
  Remove-Item -LiteralPath $pen -Force
  Remove-Item -LiteralPath $harap -Force
  if (Test-Path -LiteralPath $harap) { throw 'Folder demo masih ada' }
  $global:DemoId.Status = 'DIBERSIHKAN'; $global:DemoId.Dibersihkan = (Get-Date).ToString('s'); Save-Identitas
  Add-DemoCatatan 'Folder demo dihapus'
  Clear-DemoEnv
  foreach ($v in 'DbPw', 'DemoUrl', 'DemoNaSecret') { Remove-Variable -Name $v -Scope Global -ErrorAction SilentlyContinue }
  Write-Host ('[OK] Blok 10f: folder demo dihapus. Catatan tetap di ' + $global:Catatan) -ForegroundColor Green
} catch { Write-Host ('[GAGAL] ' + $_.Exception.Message) -ForegroundColor Red; Add-DemoCatatan ('[GAGAL hapus] ' + $_.Exception.Message) } }
```

Sesudah 10f, tutup jendela PowerShell. Tenant demo tidak perlu dihapus terpisah, karena seluruh klaster demo ikut terhapus bersama folder.

Folder catatan **tidak** dihapus otomatis. Sebelum folder itu diarsipkan atau dibagikan, periksa isinya: harus memuat hanya catatan, identitas tanpa secret, dan log tersamar.
