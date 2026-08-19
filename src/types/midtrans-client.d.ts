// Deklarasi tipe minimal untuk `midtrans-client` (paket CommonJS tanpa tipe bawaan).
// Hanya mencakup bagian yang dipakai di app ini: `Snap.createTransaction` dan —
// sejak Fase 8d / K163 — `Snap.transaction.status` untuk tombol "Periksa status
// pembayaran". Sengaja tetap minimal: mendeklarasikan seluruh permukaan pustaka
// berarti memelihara tipe untuk kode yang tak pernah dipanggil.
declare module 'midtrans-client' {
  interface Config {
    isProduction: boolean
    serverKey: string
    clientKey?: string
  }

  interface SnapTransactionResult {
    token: string
    redirect_url: string
  }

  /** Bentuk balasan `transaction.status()` diketik longgar — isinya berbeda per
   * metode bayar, dan pemanggil hanya membaca `transaction_status`/`fraud_status`. */
  interface SnapTransactionApi {
    status(orderId: string): Promise<Record<string, unknown>>
  }

  interface SnapInstance {
    createTransaction(params: Record<string, unknown>): Promise<SnapTransactionResult>
    transaction: SnapTransactionApi
  }

  interface MidtransClient {
    Snap: new (config: Config) => SnapInstance
  }

  const midtransClient: MidtransClient
  export default midtransClient
}
