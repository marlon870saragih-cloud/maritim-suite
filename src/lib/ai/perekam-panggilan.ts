// Konteks perekam panggilan model per-permintaan (PRD-005 Step 3B).
//
// MENGAPA AsyncLocalStorage: tanda tangan pengekstrak intake & baris-baris kodenya
// dikunci uji (check-intake-policy.mjs: `Promise.race([pengekstrak(masukan, signal),
// habis])`, pemilihan FAKE/OPENROUTER). Menambah parameter "perekam" ke setiap
// pengekstrak berarti mengubah kontrak yang dikunci. Konteks ini membawa dua hal
// melintasi panggilan asinkron TANPA mengubah tanda tangan apa pun:
//   1. `model` + `kemampuan` hasil resolusi TAH_INTAKE_MODEL (null = perilaku lama);
//   2. `catat` — penerima metadata SETIAP percobaan panggilan penyedia (hanya saat
//      TAH Core aktif; tanpa itu metadata dibuang).
//
// Di luar konteks (fitur AI lain, TAH Core mati) semuanya NO-OP: lapor() tak berbuat
// apa-apa, modelAktif() = null → pemanggil memakai bawaan lama.
//
// Metadata yang boleh lewat sini SENGAJA terbatas (lihat MetaPanggilanModel): tanpa
// prompt, tanpa isi pesan, tanpa respons mentah, tanpa kunci.

import { AsyncLocalStorage } from 'node:async_hooks'
import type { KemampuanModel } from './model-capabilities'
import type { PemakaianToken } from '@/services/tah/tah-policy'

export type MetaPanggilanModel = {
  provider: 'OPENROUTER' | 'FAKE'
  requestedModel: string
  servedModel: string | null
  providerRequestId: string | null
  promptId: string
  promptVersion: string
  promptHash: string
  schemaId: string | null
  schemaVersion: string | null
  /** Disaring lagi oleh daftar izin saat disimpan (saringParameterPanggilan). */
  params: Record<string, unknown>
  status: 'OK' | 'ERROR' | 'TIMEOUT'
  errorCode: string | null
  latencyMs: number
  pemakaian: PemakaianToken
}

export type KonteksPanggilan = {
  /** null = perilaku lama (model bawaan klien, parameter lama). */
  model: string | null
  kemampuan: KemampuanModel | null
  /** Hanya ada saat TAH Core aktif. */
  catat?: (m: MetaPanggilanModel) => void
}

const penyimpanan = new AsyncLocalStorage<KonteksPanggilan>()

export function jalankanDenganKonteks<T>(k: KonteksPanggilan, fn: () => Promise<T>): Promise<T> {
  return penyimpanan.run(k, fn)
}

/** Model yang diminta konteks aktif (null = bawaan lama). */
export function konteksModel(): { model: string | null; kemampuan: KemampuanModel | null } | null {
  const k = penyimpanan.getStore()
  return k ? { model: k.model, kemampuan: k.kemampuan } : null
}

/** Laporkan satu percobaan panggilan. Tak pernah melempar; no-op di luar konteks perekam. */
export function laporPanggilan(m: MetaPanggilanModel): void {
  const k = penyimpanan.getStore()
  if (!k?.catat) return
  try {
    k.catat(m)
  } catch {
    // Pencatatan tak boleh mengganggu ekstraksi.
  }
}
