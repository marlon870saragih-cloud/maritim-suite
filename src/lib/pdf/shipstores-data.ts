import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type StoreItem = {
  item: string
  quantity: string
  unit: string
  location?: string // tempat penyimpanan (opsional)
}

export type ShipStoresData = {
  tenant: EpdaTenant
  docNumber: string
  vesselName: string
  imo: string
  flag?: string
  port: string
  mode: string // 'Arrival' | 'Departure'
  master: string
  stores: StoreItem[]
  remarks: string
  signRole: string
}

// ====== DATA CONTOH (IMO FAL Form 3 — Ship's Stores Declaration) ======
export const SAMPLE_SHIPSTORES: ShipStoresData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'SS/2026/06/0071',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  mode: 'Arrival',
  master: 'Capt. Bambang S.',
  stores: [
    { item: 'Cigarettes', quantity: '4,000', unit: 'sticks', location: 'Bond store' },
    { item: 'Spirits / liquor', quantity: '12', unit: 'bottles', location: 'Bond store' },
    { item: 'Beer', quantity: '48', unit: 'cans', location: 'Bond store' },
    { item: 'Provisions (dry & frozen)', quantity: '1,200', unit: 'kg', location: 'Provision room' },
    { item: 'Fresh water', quantity: '180', unit: 'MT', location: 'FW tanks' },
    { item: 'Fuel oil (MGO)', quantity: '320', unit: 'MT', location: 'Bunker tanks' },
    { item: 'Lubricating oil', quantity: '8', unit: 'drums', location: 'Engine store' },
  ],
  remarks: "Ship's stores declared for the vessel's own use during the stay. Bonded stores sealed.",
  signRole: 'Port Agent',
}
