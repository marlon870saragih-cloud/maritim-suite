// Deklarasi tipe minimal untuk `midtrans-client` (paket CommonJS tanpa tipe bawaan).
// Hanya mencakup bagian yang dipakai di app ini (Snap.createTransaction).
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

  interface SnapInstance {
    createTransaction(params: Record<string, unknown>): Promise<SnapTransactionResult>
  }

  interface MidtransClient {
    Snap: new (config: Config) => SnapInstance
  }

  const midtransClient: MidtransClient
  export default midtransClient
}
