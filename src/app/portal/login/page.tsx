'use client'

// Login portal GENERIK (K144/K149) — tanpa merek tenant. Lihat
// /portal/[slug]/login (K182) untuk versi ber-merek; logikanya sama persis,
// dibagi lewat PortalLoginForm.

import { PortalLoginForm } from '@/components/portal/PortalLoginForm'

export default function PortalLoginPage() {
  return <PortalLoginForm />
}
