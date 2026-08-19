# Sidik jari PDF yang STABIL — dipakai check-logo-migration.mjs (K181, butir 4).
#
# Kenapa ada berkas ini: membandingkan PDF byte-per-byte TIDAK BISA dipakai
# sebagai bukti "dokumen tidak berubah". @react-pdf/renderer menghasilkan byte
# yang BERBEDA setiap kali dirender walau datanya identik — tag subset font
# diacak tiap render (/KXLVNJ+Spectral-Bold → /HSKCNK+…) dan penomoran objek
# PDF pun ikut bergeser. Dibuktikan: dua render berturut-turut tanpa perubahan
# data apa pun berbeda 7056 byte.
#
# Jadi yang dibandingkan adalah ISI yang dilihat manusia, bukan bungkusnya:
#   piksel  — tiap halaman dirender 100 DPI, hash sampel piksel mentah.
#             Ini padanan harfiah "bandingkan PDF berdampingan" (§17/8i butir 4).
#   teks    — seluruh teks terekstrak.
#   gambar  — setiap gambar tertanam (logo kop = satu-satunya gambar di
#             dokumen ini), hash byte aslinya.
#
# Ketiganya terbukti STABIL lintas render (dua render identik menghasilkan
# ketiga hash yang sama persis), jadi perbedaan apa pun padanya adalah
# perubahan nyata pada dokumen — bukan derau perender.
#
# Keluaran: satu baris JSON ke stdout.

import hashlib
import json
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"tersedia": False, "sebab": "PyMuPDF (fitz) tidak terpasang"}))
    sys.exit(0)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sidik(path: str) -> dict:
    doc = fitz.open(path)
    piksel = [sha(pg.get_pixmap(dpi=100).samples) for pg in doc]
    teks = sha("".join(pg.get_text() for pg in doc).encode("utf-8"))
    gambar = sorted(
        sha(doc.extract_image(x[0])["image"])
        for pg in doc
        for x in pg.get_images(full=True)
    )
    return {"halaman": len(doc), "piksel": piksel, "teks": teks, "gambar": gambar}


if __name__ == "__main__":
    try:
        hasil = {"tersedia": True}
        for label, path in zip(("a", "b"), sys.argv[1:3]):
            hasil[label] = sidik(path)
        print(json.dumps(hasil))
    except Exception as e:  # noqa: BLE001 — laporkan apa pun, jangan diam
        print(json.dumps({"tersedia": False, "sebab": f"{type(e).__name__}: {e}"}))
