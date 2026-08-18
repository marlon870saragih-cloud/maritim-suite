// Aritmatika PO/PR (K118, Fase 7i) — MURNI (K11/K51). SENGAJA TIDAK lewat
// calc-engine.ts (mesin tarif pelabuhan PER_GT/TIERED/minCharge/etmal): sebuah
// PO adalah qty×harga, lalu pajak, lalu total — tak satu pun dari kerumitan
// calc-engine relevan di sini. Memaksanya lewat sana berarti setiap baris PO
// butuh `calcMethod` yang nilainya cuma PER_UNIT — membawa mesin tarif untuk
// satu perkalian, dan membuat calc-engine punya dua kelompok pemanggil.
//
// `bulatkan()` (pembulatan per `Currency.decimals`, K23) TETAP dipakai ulang
// dari calc-engine.ts — itu bukan bagian mesin tarif, ia aturan pembulatan
// uang yang berlaku di semua tempat.
//
// Berkas ini sumber kebenaran TUNGGAL untuk total PO: server (purchase.service.ts),
// klien (PurchaseBuilder.tsx), dan PDF (purchase-proc-data.ts) memanggil fungsi
// yang SAMA — bukan tiga penjumlahan yang mirip (asal K118).

import { bulatkan } from '../finance/calc-engine'

export type BarisPembelian = {
  quantity: number
  unitPrice: number
}

export type TotalPembelian = {
  subtotal: number
  taxAmount: number
  grandTotal: number
}

/** Satu baris = qty × harga. Tidak dibulatkan di sini — pembulatan terjadi sekali di total. */
export function jumlahBaris(baris: BarisPembelian): number {
  return (baris.quantity || 0) * (baris.unitPrice || 0)
}

/**
 * Subtotal (Σ baris) → pajak (persentase dari subtotal) → grand total,
 * dibulatkan menurut desimal mata uang (K23). `taxPct` null/undefined = 0
 * (PR internal lazimnya tanpa pajak; PO boleh punya).
 */
export function hitungTotalPembelian(
  baris: readonly BarisPembelian[],
  taxPct: number | null | undefined,
  desimal: number,
): TotalPembelian {
  const subtotalMentah = baris.reduce((s, b) => s + jumlahBaris(b), 0)
  const subtotal = bulatkan(subtotalMentah, desimal)
  const taxAmount = bulatkan((subtotal * (taxPct || 0)) / 100, desimal)
  const grandTotal = bulatkan(subtotal + taxAmount, desimal)
  return { subtotal, taxAmount, grandTotal }
}
