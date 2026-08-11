// Klien tipis ke OpenRouter (OpenAI-compatible) — dipakai fitur AI "pintu ngobrol".
// AI HANYA untuk bahasa: menerjemahkan instruksi ke field form. Tak pernah menghitung
// uang & tak pernah jadi sumber kebenaran angka. Dipanggil server-side; key tak ke browser.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Slug model bisa di-override via env bila katalog OpenRouter berubah, tanpa edit kode.
// Dinaikkan dari Haiku 4.5 → Sonnet 4.5 demi akurasi (mis. AI Cost Prediction v2).
// Untuk pakai Sonnet 5, set env OPENROUTER_SPK_MODEL="anthropic/claude-sonnet-5"
// (pastikan slug persis sesuai katalog OpenRouter).
export const SPK_MODEL = process.env.OPENROUTER_SPK_MODEL || 'anthropic/claude-sonnet-4.5'

// Isi pesan multimodal. `content` tetap boleh string biasa (semua pemanggil lama
// mengirim string) — array hanya dipakai saat melampirkan berkas/gambar.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  // Blok berkas OpenAI-compatible; `file_data` = data URI base64 untuk berkas lokal.
  | { type: 'file'; file: { filename: string; file_data: string } }

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

/**
 * Plugin OpenRouter (top-level body, bukan di dalam messages). Yang kita pakai:
 * `file-parser` dengan engine `native` → PDF diteruskan apa adanya ke Claude
 * (vision-nya sendiri, ditagih sebagai token input). Engine ini disebut eksplisit
 * karena dokumentasi OpenRouter menyebut default-nya bisa jatuh ke `mistral-ocr`
 * (biaya per halaman) — kita tak mau ketagihan itu tanpa sengaja.
 */
export type PluginDef = {
  id: string
  pdf?: { engine: 'native' | 'mistral-ocr' | 'cloudflare-ai' }
}

/** Plugin siap-pakai untuk lampiran PDF ke model Claude. Bisa dioverride via env. */
export const PDF_NATIVE_PLUGIN: PluginDef[] = [
  { id: 'file-parser', pdf: { engine: (process.env.OPENROUTER_PDF_ENGINE as 'native') || 'native' } },
]

export type ToolDef = {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

type ToolChoice = { type: 'function'; function: { name: string } } | 'auto' | 'required' | 'none'

type ChatOptions = {
  model?: string
  messages: ChatMessage[]
  tools?: ToolDef[]
  toolChoice?: ToolChoice
  temperature?: number
  plugins?: PluginDef[]
}

type ToolCall = { function?: { name?: string; arguments?: string } }
type ChatResponse = {
  choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[]
  error?: { message?: string }
}

/** Panggil chat completion OpenRouter. Lempar Error berlabel bila gagal. */
export async function chatCompletion(opts: ChatOptions): Promise<ChatResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY belum diset di .env')

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Header opsional yang disarankan OpenRouter (atribusi & analitik).
      'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
      'X-Title': 'Maritime Suite',
    },
    body: JSON.stringify({
      model: opts.model || SPK_MODEL,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.toolChoice,
      temperature: opts.temperature ?? 0.2,
      plugins: opts.plugins,
    }),
  })

  const json = (await res.json().catch(() => ({}))) as ChatResponse
  if (!res.ok) {
    throw new Error(json.error?.message || `OpenRouter error (${res.status})`)
  }
  return json
}

/** Ambil argumen JSON dari tool-call pertama (model dipaksa memanggil satu tool). */
export function firstToolArguments(resp: ChatResponse): string | null {
  const call = resp.choices?.[0]?.message?.tool_calls?.[0]
  return call?.function?.arguments ?? null
}

/** Ambil nama + argumen tool-call pertama (saat model boleh memilih antar-tool). */
export function firstToolCall(resp: ChatResponse): { name: string; arguments: string } | null {
  const call = resp.choices?.[0]?.message?.tool_calls?.[0]
  if (!call?.function?.name) return null
  return { name: call.function.name, arguments: call.function.arguments ?? '{}' }
}

/** Ambil isi teks jawaban (untuk percakapan biasa tanpa tool). */
export function firstMessageText(resp: ChatResponse): string {
  return (resp.choices?.[0]?.message?.content ?? '').trim()
}
