export type ManagedAttributeCategory = "developmentPool" | "functionalArea"

type ManagedAttributeCatalog = Record<ManagedAttributeCategory, string[]>

const STORAGE_KEY = "talent.attributeCatalog.v1"

const emptyCatalog: ManagedAttributeCatalog = {
  developmentPool: [],
  functionalArea: [],
}

function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(normalizeValue).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function readAttributeCatalog(): ManagedAttributeCatalog {
  if (typeof window === "undefined") return emptyCatalog

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyCatalog
    const parsed = JSON.parse(raw) as Partial<ManagedAttributeCatalog>

    return {
      developmentPool: uniqueSorted(parsed.developmentPool ?? []),
      functionalArea: uniqueSorted(parsed.functionalArea ?? []),
    }
  } catch {
    return emptyCatalog
  }
}

export function writeAttributeCatalog(next: ManagedAttributeCatalog): ManagedAttributeCatalog {
  const normalized: ManagedAttributeCatalog = {
    developmentPool: uniqueSorted(next.developmentPool),
    functionalArea: uniqueSorted(next.functionalArea),
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  }

  return normalized
}

export function mergeCatalogWithObserved(
  category: ManagedAttributeCategory,
  observedValues: string[]
): string[] {
  const catalog = readAttributeCatalog()
  return uniqueSorted([...catalog[category], ...observedValues])
}

export function addCatalogValue(category: ManagedAttributeCategory, rawValue: string): ManagedAttributeCatalog {
  const value = normalizeValue(rawValue)
  if (!value) throw new Error("Value is required")

  const catalog = readAttributeCatalog()
  const existing = catalog[category].some((entry) => entry.toLowerCase() === value.toLowerCase())
  if (existing) throw new Error("Value already exists")

  return writeAttributeCatalog({
    ...catalog,
    [category]: [...catalog[category], value],
  })
}

export function renameCatalogValue(
  category: ManagedAttributeCategory,
  oldValue: string,
  newRawValue: string
): ManagedAttributeCatalog {
  const newValue = normalizeValue(newRawValue)
  if (!newValue) throw new Error("New value is required")

  const catalog = readAttributeCatalog()
  const index = catalog[category].findIndex((entry) => entry.toLowerCase() === oldValue.toLowerCase())
  if (index < 0) throw new Error("Value not found")

  const duplicate = catalog[category].some(
    (entry, i) => i !== index && entry.toLowerCase() === newValue.toLowerCase()
  )
  if (duplicate) throw new Error("A value with the same name already exists")

  const updated = [...catalog[category]]
  updated[index] = newValue

  return writeAttributeCatalog({
    ...catalog,
    [category]: updated,
  })
}

export function removeCatalogValue(category: ManagedAttributeCategory, value: string): ManagedAttributeCatalog {
  const catalog = readAttributeCatalog()
  const updated = catalog[category].filter((entry) => entry.toLowerCase() !== value.toLowerCase())

  return writeAttributeCatalog({
    ...catalog,
    [category]: updated,
  })
}
