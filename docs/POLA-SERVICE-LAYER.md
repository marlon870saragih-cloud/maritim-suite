# Pola Service Layer v2

> Hasil **Fase 0**. Ini acuan wajib untuk Fase 1–8.
> Dibuat: 2026-08-10 · Induk: [ROADMAP-v2.md](./ROADMAP-v2.md) · [FASE-0-SKEMA-v2.md](./FASE-0-SKEMA-v2.md)
>
> **Cara memakai dokumen ini:** saat membangun modul baru, buka
> `src/services/master/port.service.ts` + `src/app/api/ports/` sebagai contoh
> lengkap, lalu ikuti §5 (resep). Kalau perlu menyimpang, tulis alasannya di
> komentar supaya tidak dikira kelalaian.

---

## 1. Masalah yang dipecahkan

Pola lama mengulang blok yang sama di **54 route**:

```ts
const session = await getServerSession(authOptions)
if (!session?.user) return new Response('Unauthorized', { status: 401 })
const data = await prisma.vessel.findMany({ where: { tenantId: session.user.tenantId } })
```

Tiga akibatnya:

| Akibat | Kenapa berbahaya |
|---|---|
| Isolasi tenant bergantung ingatan | Satu `where` lupa `tenantId` = data perusahaan lain bocor. Tidak ada yang menahan, dan bug seperti ini **tidak terlihat** saat diuji dengan satu tenant. |
| Logika bisnis tinggal di route | Tak bisa dipakai ulang dari skrip/job, sulit diuji tanpa HTTP. |
| Bentuk kesalahan berbeda-beda | Ada yang balas teks polos, ada yang JSON, status tidak konsisten. |

Fase 1 akan menambah **8+ modul master data** dan Fase 3–4 menambah mesin uang. Melipatgandakan pola lama = melipatgandakan risikonya.

---

## 2. K9 — Tenant-guard di service layer, **bukan** Postgres RLS

Ini menutup *tension* yang tertunda sejak awal roadmap (§8: "isolasi data RLS vs tenant-guard — belum diputus").

**Putusan: tenant-guard lewat Prisma extension.** Alasannya:

| Pertimbangan | RLS (Postgres) | Tenant-guard (dipilih) |
|---|---|---|
| Kekuatan jaminan | Ditegakkan database — paling kuat | Ditegakkan lapisan aplikasi |
| Cocok dengan Prisma | Buruk — butuh `SET LOCAL app.tenant_id` per transaksi | Wajar — `$extends` memang untuk ini |
| Connection pooling | Bentrok: PgBouncer mode transaksi membuat `SET LOCAL` tak andal (Railway/Supabase memakainya) | Tidak terpengaruh |
| Biaya penerapan | Tinggi: kebijakan per tabel + pembungkus transaksi di setiap query | Rendah: satu berkas, ~60 baris |
| Siapa yang diamankan | Termasuk penyerang yang sudah bisa menjalankan SQL | Kode aplikasi yang keliru |

Ancaman nyata saat ini adalah **kode kita sendiri yang lupa menyaring**, bukan penyerang dengan akses SQL langsung. Tenant-guard menutup ancaman itu sepenuhnya dengan biaya kecil.

> **Kapan keputusan ini WAJIB ditinjau ulang:** saat **Fase 8** membuka Customer Portal / Vendor Portal — yaitu ketika pengguna **di luar organisasi** mulai memegang sesi. Saat itu radius ledakan sebuah bug berubah, dan RLS sebagai lapis kedua jadi sepadan. Catat ini di rencana Fase 8; jangan sampai terlewat.

### Pembagian kerja: TypeScript menjaga `create`, guard menjaga `where`

Keduanya menutup celah yang berbeda — ini bukan tumpang tindih:

- **`create()`** — Prisma mewajibkan `tenantId` di tipe datanya, jadi lupa = **gagal kompilasi**. TypeScript sudah cukup.
- **`where`** — TypeScript tidak bisa tahu bahwa sebuah filter *seharusnya* menyertakan `tenantId`. Di sinilah guard bekerja: ia menyuntikkan `tenantId` ke setiap `where`, dan **menimpa** nilai yang disodorkan pemanggil.

### Operasi yang dilarang, dan penggantinya

`findUnique` / `update` / `delete` / `upsert` **melempar kesalahan** pada model bertenant. Prisma mewajibkan selector unik pada operasi itu, sehingga `tenantId` tak bisa ikut menyaring — tidak ada cara membuatnya aman.

| Dilarang | Pakai ini |
|---|---|
| `findUnique({ where: { id } })` | `findFirst({ where: { id } })` |
| `update({ where: { id }, data })` | `updateMany({ where: { id }, data })` → `count === 0` ? `notFound()` |
| `delete({ where: { id } })` | `deleteMany({ where: { id } })` → `count === 0` ? `notFound()` |
| `upsert(...)` | `findFirst()` dulu, lalu `create()` atau `updateMany()` |

Ini **bukan gaya baru**: `src/app/api/vessels/[id]/route.ts` yang sudah ada memang sudah memakai `updateMany`/`deleteMany` berpagar `tenantId`. Guard hanya mewajibkan kebiasaan yang sudah jadi naluri di kode ini.

---

## 3. K10 — Tidak membuat `src/features/` (menyimpang dari PRD §163)

PRD meminta struktur `features/`. **Tidak diikuti.** App A sudah punya dua tempat mapan: halaman di `src/app/(app)/…` dan komponen di `src/components/…`. Menambah lokasi ketiga tanpa memindahkan yang lama akan menghasilkan tiga konvensi hidup berbarengan — dan yang lama tidak akan pernah dipindahkan.

Sejalan dengan **K1** ("ikuti konvensi app A, bukan teks PRD"). Yang benar-benar kurang dari app A bukan folder UI, melainkan **lapisan logika bisnis** — itulah `src/services/`.

---

## 4. Struktur

```
src/services/
  tenant-guard.ts     ← aturan pemagaran. TANPA impor apa pun (bisa diuji langsung Node)
  tenant-db.ts        ← forTenant(ctx): pasang guard ke klien Prisma app
  context.ts          ← TenantContext, requireTenant(), systemContext(), requireRole()
  errors.ts           ← ServiceError + kode → status HTTP
  input.ts            ← pembaca field: str/num/int/bool/tanggal/wajib/pilihan
  http.ts             ← withTenant(): auth + terjemah kesalahan. SATU-SATUNYA yang tahu HTTP
  master/
    port.service.ts   ← ⭐ MODUL RUJUKAN
```

Arah ketergantungan **satu arah**: `route → service → tenant-db → prisma`. Service tidak pernah mengimpor apa pun dari `app/`, dan tidak pernah membaca sesi sendiri.

---

## 5. Resep: menambah modul master data baru

Contoh: `Vendor`.

**1) Service** — salin `port.service.ts` → `src/services/master/vendor.service.ts`:

```ts
function bacaInput(body: Record<string, unknown>) {
  return {
    name: wajib(str(body.name), 'Nama vendor'),
    vendorType: str(body.vendorType),
    // …
    isActive: bool(body.isActive, true),
  }
}

export async function listVendors(ctx: TenantContext) {
  return forTenant(ctx).vendor.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } })
}

export async function getVendor(ctx: TenantContext, id: string) {
  const v = await forTenant(ctx).vendor.findFirst({ where: { id, deletedAt: null } })
  if (!v) throw notFound('Vendor')          // milik tenant lain juga jatuh ke sini — disengaja
  return v
}

export async function createVendor(ctx: TenantContext, body: Record<string, unknown>) {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  return forTenant(ctx).vendor.create({ data: { ...bacaInput(body), tenantId: ctx.tenantId } })
}
```

**2) Route** — `src/app/api/vendors/route.ts`:

```ts
export const GET = withTenant(async (ctx) => Response.json(await listVendors(ctx)))
export const POST = withTenant(async (ctx, req) =>
  Response.json({ ok: true, vendor: await createVendor(ctx, await jsonBody(req)) }, { status: 201 }),
)
```

**3) Uji** — `npm run test:tenant` (wajib lulus) + `npx tsc --noEmit`.

### Enam aturan yang tak boleh dilanggar

1. Argumen pertama service **selalu** `TenantContext`. Service tidak pernah memanggil `getServerSession`.
2. Semua akses DB lewat `forTenant(ctx)`. Tidak pernah `prisma` langsung di dalam service.
3. Tidak ada `findUnique`/`update`/`delete`/`upsert` — pakai penggantinya di §2.
4. Hapus = **soft delete** (isi `deletedAt`). Data lama tidak pernah benar-benar hilang; penting untuk audit dan sengketa dengan principal.
5. Kesalahan dilempar sebagai `ServiceError`, **bukan** `Response`. Service tidak tahu HTTP.
6. Baris milik tenant lain dilaporkan **NOT_FOUND**, bukan FORBIDDEN — membedakannya membocorkan keberadaan data (penyerang bisa menebak id sampai dapat 403).

---

## 6. Menambah model bertenant baru

Tambahkan nama modelnya ke `TENANT_MODELS` di `src/services/tenant-guard.ts`. **Kalau lupa, model itu tidak tersaring sama sekali** — dan `npm run test:tenant` akan gagal dengan menyebut nama modelnya. Itu justru fungsi utama uji tersebut.

---

## 7. Uji pagar

```bash
npm run test:tenant
```

17 pemeriksaan atas dua tenant nyata di DB: daftar model vs schema, keterkurungan baca, `tenantId` sodoran pemanggil ditimpa, operasi terlarang ditolak, model tanpa tenant tetap lolos, `create` mengisi tenant sendiri, `updateMany` tak menyentuh tenant lain. Uji memakai **objek extension yang persis sama** dengan yang dipakai aplikasi, bukan tiruannya.

Jalankan setiap kali menyentuh `tenant-guard.ts` atau menambah model bertenant.

---

## 8. Migrasi route lama — **tidak sekarang**

54 route lama tetap memakai pola manual dan **tidak diubah di Fase 0**. Alasannya sama dengan strategi migrasi data (M6): jangan mengubah yang sedang dipakai tanpa keperluan. Route lama sudah berjalan dan sudah menulis `tenantId` secara manual.

Pindahkan bertahap, saat sebuah route memang perlu disentuh untuk alasan lain. Modul **baru** wajib memakai pola ini sejak awal.
