import { getClient } from "@microsoft/power-apps/data"
import { emptyFilters } from "@/lib/talent-types"
import type { CandidateFilters, CandidateNote, CandidateProfile } from "@/lib/talent-types"

// Confirmed Dataverse schema (from Dataverse Model Builder metadata)
// Main table:  logical name = doj5wz_employeetalentprofile  | schema name = doj5wz_employeetalentprofile
// Notes table: logical name = doj5wz_notes                  | schema name = doj5wz_Notes
const TALENT_TABLE = "doj5wz_employeetalentprofile"
const NOTES_TABLE = "doj5wz_notes"
const TALENT_ENTITY_SET = "doj5wz_employeetalentprofiles"
const NOTES_ENTITY_SET = "doj5wz_noteses"

// Display names matching databaseReferences.default.cds.dataSources keys in power.config.json
// The SDK resolves connection references by these keys — they MUST match the config.
const TALENT_DS = "EmployeeTalentProfile"
const NOTES_DS = "Notes"
const DATAVERSE_DS_TYPE = "Dataverse"

const TALENT_BRIDGE_KEYS = [TALENT_TABLE, TALENT_ENTITY_SET, TALENT_DS]
const NOTES_BRIDGE_KEYS = [NOTES_TABLE, NOTES_ENTITY_SET, NOTES_DS]

// DataSourcesInfo wires each data source name to its logical name for OData calls
const dataSourcesInfo = {
  [TALENT_TABLE]: { tableId: TALENT_TABLE, dataSourceType: DATAVERSE_DS_TYPE, apis: {} },
  [TALENT_ENTITY_SET]: { tableId: TALENT_TABLE, dataSourceType: DATAVERSE_DS_TYPE, apis: {} },
  [TALENT_DS]: { tableId: TALENT_TABLE, dataSourceType: DATAVERSE_DS_TYPE, apis: {} },
  [NOTES_TABLE]: { tableId: NOTES_TABLE, dataSourceType: DATAVERSE_DS_TYPE, apis: {} },
  [NOTES_ENTITY_SET]: { tableId: NOTES_TABLE, dataSourceType: DATAVERSE_DS_TYPE, apis: {} },
  [NOTES_DS]: { tableId: NOTES_TABLE, dataSourceType: DATAVERSE_DS_TYPE, apis: {} },
}

export type DataConnectionStatus = {
  mode: "unknown" | "dataverse" | "fallback" | "error"
  message: string
}

export type DataverseDiagnostics = {
  bridgeAvailable: boolean
  bridgeSource: string
  xrmAvailable: boolean
  runtimeHost: string
  runtimeHref: string
  configuredTables: string[]
  lastOperation: string
  lastError: string
  lastUpdated: string
  connectionMode: DataConnectionStatus["mode"]
  connectionMessage: string
  notesNavProp: string
  notesCount: number
  lastNotesFilter: string
}

let connectionStatus: DataConnectionStatus = { mode: "unknown", message: "Checking Dataverse connection" }
let lastOperation = "none"
let lastError = ""
let lastBridgeSource = "none"
let notesNavProp = "unknown"
let notesCount = 0
let lastNotesFilter = ""

type XrmWebApi = {
  retrieveMultipleRecords: (entityLogicalName: string, options?: string) => Promise<{ entities: Row[] }>
  retrieveRecord: (entityLogicalName: string, id: string, options?: string) => Promise<Row>
  updateRecord: (entityLogicalName: string, id: string, data: Row) => Promise<unknown>
  createRecord: (entityLogicalName: string, data: Row) => Promise<{ id?: string }>
}

type RuntimeWindow = Window & {
  powerAppsBridge?: unknown
  Xrm?: { WebApi?: XrmWebApi }
}

function nowIso(): string {
  return new Date().toISOString()
}

function readBridge(target: Window | null | undefined): unknown {
  if (!target) return undefined
  try {
    return (target as RuntimeWindow).powerAppsBridge
  } catch {
    return undefined
  }
}

function isBridgeLike(value: unknown): value is { initialize: () => Promise<void>; executePluginAsync: unknown } {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.initialize === "function" && typeof candidate.executePluginAsync === "function"
}

function readPropertySafely(target: Window, key: string): unknown {
  try {
    return (target as unknown as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function findBridgeLikeGlobal(target: Window | null | undefined): { key: string; value: unknown } | null {
  if (!target) return null
  try {
    const keys = Object.getOwnPropertyNames(target)
    for (const key of keys) {
      if (!/bridge|powerapps/i.test(key)) continue
      const value = readPropertySafely(target, key)
      if (isBridgeLike(value)) return { key, value }
    }

    for (const key of keys) {
      const value = readPropertySafely(target, key)
      if (isBridgeLike(value)) return { key, value }
    }
  } catch {
    return null
  }
  return null
}

function hydrateBridgeFromHostFrames(): boolean {
  if (typeof window === "undefined") return false
  const runtimeWindow = window as RuntimeWindow
  if (runtimeWindow.powerAppsBridge) {
    lastBridgeSource = "window.powerAppsBridge"
    return true
  }

  const candidates: Array<{ label: string; target: Window | null | undefined }> = [
    { label: "window", target: window },
    { label: "parent", target: window.parent },
    { label: "top", target: window.top },
    { label: "opener", target: window.opener },
  ]
  for (const candidate of candidates) {
    const bridge = readBridge(candidate.target)
    if (!bridge) continue
    runtimeWindow.powerAppsBridge = bridge
    lastBridgeSource = `${candidate.label}.powerAppsBridge`
    return true
  }

  for (const candidate of candidates) {
    const discovered = findBridgeLikeGlobal(candidate.target)
    if (!discovered) continue
    runtimeWindow.powerAppsBridge = discovered.value
    lastBridgeSource = `${candidate.label}.${discovered.key}`
    return true
  }

  lastBridgeSource = "none"
  return false
}

function isBridgeAvailable(): boolean {
  if (typeof window === "undefined") return false
  if (hydrateBridgeFromHostFrames()) return true
  const runtimeWindow = window as RuntimeWindow
  return Boolean(runtimeWindow.powerAppsBridge)
}

function readXrmWebApi(target: Window | null | undefined): XrmWebApi | null {
  if (!target) return null
  try {
    const webApi = (target as RuntimeWindow).Xrm?.WebApi
    if (!webApi) return null
    if (typeof webApi.retrieveMultipleRecords !== "function") return null
    if (typeof webApi.retrieveRecord !== "function") return null
    if (typeof webApi.updateRecord !== "function") return null
    if (typeof webApi.createRecord !== "function") return null
    return webApi
  } catch {
    return null
  }
}

function getXrmWebApi(): XrmWebApi | null {
  if (typeof window === "undefined") return null
  const candidates: Array<Window | null | undefined> = [window, window.parent, window.top, window.opener]
  for (const candidate of candidates) {
    const webApi = readXrmWebApi(candidate)
    if (webApi) return webApi
  }
  return null
}

function buildODataQuery(options: {
  select?: string[]
  filter?: string
  orderBy?: string[]
  top?: number
}): string {
  const parts: string[] = []
  if (options.select && options.select.length > 0) parts.push(`$select=${options.select.join(",")}`)
  if (options.filter) parts.push(`$filter=${options.filter}`)
  if (options.orderBy && options.orderBy.length > 0) parts.push(`$orderby=${options.orderBy.join(",")}`)
  if (typeof options.top === "number") parts.push(`$top=${options.top}`)
  return parts.length > 0 ? `?${parts.join("&")}` : ""
}

function markOperation(name: string): void {
  lastOperation = name
}

function formatOperationError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error.trim()) return error
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    const message = record.message
    const code = record.code
    const details = record.details
    const parts = [
      typeof message === "string" && message.trim() ? message : "",
      typeof code === "string" && code.trim() ? `Code: ${code}` : "",
      typeof details === "string" && details.trim() ? details : "",
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(" | ")
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return fallback
}

function setErrorStatus(operation: string, error: unknown, fallback: string): string {
  markOperation(operation)
  const message = formatOperationError(error, fallback)
  lastError = message
  connectionStatus = { mode: "error", message }
  return message
}

function setDataverseConnected(operation: string, via: "bridge" | "xrm" = "bridge"): void {
  markOperation(operation)
  lastError = ""
  connectionStatus = {
    mode: "dataverse",
    message: via === "xrm" ? "Connected to Dataverse via Xrm.WebApi" : "Connected to Dataverse",
  }
}

function isMissingConnectionLookupError(error: unknown): boolean {
  const message = formatOperationError(error, "").toLowerCase()
  return (
    message.includes("connection reference not found")
    || message.includes("unable to find data source")
    || message.includes("no dataverse data source found for table")
  )
}

async function runBridgeWithKeyFallback<T>(
  candidateKeys: string[],
  action: (tableName: string) => Promise<T>
): Promise<T> {
  let lastError: unknown = null
  for (const tableName of candidateKeys) {
    try {
      return await action(tableName)
    } catch (error) {
      lastError = error
      if (!isMissingConnectionLookupError(error)) {
        throw error
      }
    }
  }

  if (lastError) throw lastError
  throw new Error("Bridge call failed")
}

async function resolveRuntime(operation: string): Promise<"bridge" | "xrm"> {
  markOperation(operation)

  if (getXrmWebApi()) return "xrm"

  // In some Power Apps hosting shells the bridge is not exposed as a direct
  // global property; the SDK can still establish plugin communication.
  // Prefer attempting the SDK path instead of failing early.
  return "bridge"
}

export function getDataConnectionStatus(): DataConnectionStatus {
  return connectionStatus
}

export function getDataverseDiagnostics(): DataverseDiagnostics {
  const currentBridgeAvailable = isBridgeAvailable()
  const currentXrmAvailable = Boolean(getXrmWebApi())
  const runtimeHost = typeof window !== "undefined" ? window.location.host : ""
  const runtimeHref = typeof window !== "undefined" ? window.location.href : ""
  return {
    bridgeAvailable: currentBridgeAvailable,
    bridgeSource: currentBridgeAvailable ? lastBridgeSource : "none",
    xrmAvailable: currentXrmAvailable,
    runtimeHost,
    runtimeHref,
    configuredTables: [TALENT_TABLE, NOTES_TABLE],
    notesNavProp,
    notesCount,
    lastNotesFilter,
    lastOperation,
    lastError,
    lastUpdated: nowIso(),
    connectionMode: connectionStatus.mode,
    connectionMessage: connectionStatus.message,
  }
}

// --- field mapping helpers ---

type Row = Record<string, unknown>

function str(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === "string") return v
  }
  return ""
}

function bool(row: Row, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === "boolean") return v
  }
  return false
}

function mapCandidate(row: Row): CandidateProfile {
  return {
    id: str(row, "doj5wz_employeetalentprofileid"),
    firstName: str(row, "doj5wz_firstname"),
    lastName: str(row, "doj5wz_lastname"),
    globalId: str(row, "doj5wz_globalidentifier"),
    country: str(row, "doj5wz_country"),
    legalEntity: str(row, "doj5wz_legalentity"),
    organizationalUnit: str(row, "doj5wz_organizationalunit"),
    // careerpath is an OptionSet — SDK returns label in OData@formattedValue or as string key
    careerPath: str(row, "doj5wz_careerpath@OData.Community.Display.V1.FormattedValue", "doj5wz_careerpath"),
    developmentPool: str(row, "doj5wz_developmentpool"),
    promotionCandidate: bool(row, "doj5wz_selfnomination"),
  }
}

function mapNote(row: Row): CandidateNote {
  return {
    id: str(row, "doj5wz_notesid"),
    candidateId: str(row, "_doj5wz_employeetalentprofileid_value"),
    title: str(row, "doj5wz_notes1"),
    description: str(row, "doj5wz_notecontent"),
    createdBy: str(
      row,
      "_createdby_value@OData.Community.Display.V1.FormattedValue",
      "createdby",
      "_createdby_value"
    ) || "System",
    createdOn: str(row, "createdon") || new Date().toISOString(),
  }
}

function toLower(v: string) { return v.trim().toLowerCase() }

function applyFilters(items: CandidateProfile[], filters: CandidateFilters): CandidateProfile[] {
  return items.filter((c) => {
    if (filters.country && c.country !== filters.country) return false
    if (filters.legalEntity && c.legalEntity !== filters.legalEntity) return false
    if (filters.organizationalUnit && c.organizationalUnit !== filters.organizationalUnit) return false
    if (filters.careerPath && c.careerPath !== filters.careerPath) return false
    if (filters.developmentPool && c.developmentPool !== filters.developmentPool) return false
    if (filters.onlyPromotionCandidates && !c.promotionCandidate) return false
    if (filters.searchText) {
      const q = toLower(filters.searchText)
      return toLower(c.firstName).includes(q) || toLower(c.lastName).includes(q) || toLower(c.globalId).includes(q)
    }
    return true
  })
}

// --- public API ---

export async function listCandidates(filters: CandidateFilters = emptyFilters): Promise<CandidateProfile[]> {
  const operation = "listCandidates"
  const runtime = await resolveRuntime(operation)
  const select = [
    "doj5wz_employeetalentprofileid",
    "doj5wz_firstname",
    "doj5wz_lastname",
    "doj5wz_globalidentifier",
    "doj5wz_country",
    "doj5wz_legalentity",
    "doj5wz_organizationalunit",
    "doj5wz_careerpath",
    "doj5wz_developmentpool",
    "doj5wz_selfnomination",
  ]

  try {
    const rows = runtime === "bridge"
      ? await (async () => {
          const client = getClient(dataSourcesInfo)
          return runBridgeWithKeyFallback(TALENT_BRIDGE_KEYS, async (tableName) => {
            const result = await client.retrieveMultipleRecordsAsync<Row>(tableName, { select })
            if (!result.success) throw result.error ?? new Error("Dataverse call failed")
            return result.data
          })
        })()
      : await (async () => {
          const webApi = getXrmWebApi()
          if (!webApi) throw new Error("Xrm.WebApi became unavailable")
          const result = await webApi.retrieveMultipleRecords(TALENT_TABLE, buildODataQuery({ select }))
          return result.entities
        })()

    setDataverseConnected(operation, runtime)
    const mapped = rows.map(mapCandidate).filter((c: CandidateProfile) => c.id)
    return applyFilters(mapped, filters)
  } catch (error) {
    const message = setErrorStatus(operation, error, "Dataverse call failed")
    throw new Error(message)
  }
}

export async function getCandidate(candidateId: string): Promise<CandidateProfile | null> {
  const operation = "getCandidate"
  const runtime = await resolveRuntime(operation)
  const select = [
    "doj5wz_employeetalentprofileid",
    "doj5wz_firstname",
    "doj5wz_lastname",
    "doj5wz_globalidentifier",
    "doj5wz_country",
    "doj5wz_legalentity",
    "doj5wz_organizationalunit",
    "doj5wz_careerpath",
    "doj5wz_developmentpool",
    "doj5wz_selfnomination",
  ]

  try {
    const row = runtime === "bridge"
      ? await (async () => {
          const client = getClient(dataSourcesInfo)
          return runBridgeWithKeyFallback(TALENT_BRIDGE_KEYS, async (tableName) => {
            const result = await client.retrieveRecordAsync<Row>(tableName, candidateId, { select })
            if (!result.success) throw result.error ?? new Error("Failed to retrieve candidate")
            return result.data
          })
        })()
      : await (async () => {
          const webApi = getXrmWebApi()
          if (!webApi) throw new Error("Xrm.WebApi became unavailable")
          return webApi.retrieveRecord(TALENT_TABLE, candidateId, buildODataQuery({ select }))
        })()

    setDataverseConnected(operation, runtime)
    return mapCandidate(row)
  } catch (error) {
    setErrorStatus(operation, error, "Failed to retrieve candidate")
    return null
  }
}

export async function updateCandidate(
  candidateId: string,
  updatedFields: Partial<CandidateProfile>
): Promise<CandidateProfile | null> {
  const operation = "updateCandidate"
  const runtime = await resolveRuntime(operation)

  const payload: Row = {}
  if (updatedFields.firstName !== undefined) payload.doj5wz_firstname = updatedFields.firstName
  if (updatedFields.lastName !== undefined) payload.doj5wz_lastname = updatedFields.lastName
  if (updatedFields.globalId !== undefined) payload.doj5wz_globalidentifier = updatedFields.globalId
  if (updatedFields.country !== undefined) payload.doj5wz_country = updatedFields.country
  if (updatedFields.legalEntity !== undefined) payload.doj5wz_legalentity = updatedFields.legalEntity
  if (updatedFields.organizationalUnit !== undefined) payload.doj5wz_organizationalunit = updatedFields.organizationalUnit
  if (updatedFields.developmentPool !== undefined) payload.doj5wz_developmentpool = updatedFields.developmentPool
  if (updatedFields.promotionCandidate !== undefined) payload.doj5wz_selfnomination = updatedFields.promotionCandidate
  // careerpath is an OptionSet integer — skipped for free-text edit; map values later if needed

  try {
    if (runtime === "bridge") {
      const client = getClient(dataSourcesInfo)
      await runBridgeWithKeyFallback(TALENT_BRIDGE_KEYS, async (tableName) => {
        const result = await client.updateRecordAsync<Row, Row>(tableName, candidateId, payload)
        if (!result.success) throw result.error ?? new Error("Update failed")
      })
    } else {
      const webApi = getXrmWebApi()
      if (!webApi) throw new Error("Xrm.WebApi became unavailable")
      await webApi.updateRecord(TALENT_TABLE, candidateId, payload)
    }

    setDataverseConnected(operation, runtime)
    return getCandidate(candidateId)
  } catch (error) {
    const message = setErrorStatus(operation, error, "Update failed")
    throw new Error(message)
  }
}

export async function listNotes(candidateId: string, searchText = ""): Promise<CandidateNote[]> {
  const operation = "listNotes"
  const runtime = await resolveRuntime(operation)
  const select = [
    "doj5wz_notesid",
    "doj5wz_notes1",
    "doj5wz_notecontent",
    "createdon",
    "createdby",
    "_doj5wz_employeetalentprofileid_value",
    "_createdby_value",
  ]
  const filter = `_doj5wz_employeetalentprofileid_value eq ${candidateId}`
  lastNotesFilter = filter

  try {
    const rows = runtime === "bridge"
      ? await (async () => {
          const client = getClient(dataSourcesInfo)
          return runBridgeWithKeyFallback(NOTES_BRIDGE_KEYS, async (tableName) => {
            const result = await client.retrieveMultipleRecordsAsync<Row>(tableName, {
              select,
              filter,
              orderBy: ["createdon desc"],
            })
            if (!result.success) throw result.error ?? new Error("Failed to load notes")
            return result.data
          })
        })()
      : await (async () => {
          const webApi = getXrmWebApi()
          if (!webApi) throw new Error("Xrm.WebApi became unavailable")
          const result = await webApi.retrieveMultipleRecords(
            NOTES_TABLE,
            buildODataQuery({ select, filter, orderBy: ["createdon desc"] })
          )
          return result.entities
        })()

    setDataverseConnected(operation, runtime)
    const lowered = toLower(searchText)
    const filteredNotes = rows
      .map(mapNote)
      .filter((n: CandidateNote) => !lowered || toLower(n.title).includes(lowered) || toLower(n.description).includes(lowered))
    notesCount = rows.length
    return filteredNotes
  } catch (error) {
    notesCount = -1  // Indicate error
    const message = setErrorStatus(operation, error, "Failed to load notes")
    throw new Error(message)
  }
}

// Queries the live Dataverse OData metadata to find the single-valued navigation
// property name for the notes → candidate lookup. Must match exactly what appears
// in EntityDefinitions/ManyToOneRelationships/ReferencingEntityNavigationPropertyName.
async function probeNotesNavProp(): Promise<string> {
  try {
    const client = getClient(dataSourcesInfo)
    const result = await runBridgeWithKeyFallback(NOTES_BRIDGE_KEYS, async (tableName) => {
      const r = await client.executeAsync<unknown, Record<string, unknown>>({
        dataverseRequest: {
          action: "getEntityMetadata",
          parameters: {
            tableName,
            options: {
              metadata: ["LogicalName"],
              schema: { manyToOne: true },
            },
          },
        },
      })
      if (!r.success) throw r.error ?? new Error("metadata probe failed")
      return r.data
    })

    type Rel = Record<string, string>
    const rels = (result as Record<string, unknown>).ManyToOneRelationships as Rel[] | undefined
    if (!rels || rels.length === 0) return "no-relationships-found"

    const rel = rels.find(
      (r) => (r.ReferencingAttribute ?? "").toLowerCase() === "doj5wz_employeetalentprofileid"
    )
    return rel?.ReferencingEntityNavigationPropertyName ?? `not-found:${rels.map((r) => r.ReferencingEntityNavigationPropertyName).join(",")}`
  } catch (e) {
    return `error:${formatOperationError(e, "probe failed")}`
  }
}

export async function createNote(candidateId: string, title: string, description: string): Promise<void> {
  const operation = "createNote"
  const runtime = await resolveRuntime(operation)
  const trimmedTitle = title.trim()
  const trimmedDescription = description.trim()
  if (!trimmedTitle || !trimmedDescription) throw new Error("Title and description are required")

  // Probe the live OData metadata to find the correct navigation property name.
  // Store in module-level variable so it is reused on subsequent calls.
  if (notesNavProp === "unknown") {
    notesNavProp = await probeNotesNavProp()
  }

  // Build the payload with the correct @odata.bind key sourced from live metadata.
  // Use the probed nav property if successful, otherwise fall back to the lookup attribute name.
  const isValidNavProp = notesNavProp && !notesNavProp.startsWith("error") && !notesNavProp.startsWith("not-found") && notesNavProp !== "unknown"
  const bindKey = isValidNavProp
    ? `${notesNavProp}@odata.bind`
    : "doj5wz_employeetalentprofileid@odata.bind"

  const payload: Row = {
    doj5wz_notes1: trimmedTitle,
    doj5wz_notecontent: trimmedDescription,
    [bindKey]: `/${TALENT_ENTITY_SET}(${candidateId})`,
  }

  try {
    if (runtime === "bridge") {
      const client = getClient(dataSourcesInfo)
      await runBridgeWithKeyFallback(NOTES_BRIDGE_KEYS, async (tableName) => {
        const result = await client.createRecordAsync<Row, Row>(tableName, payload)
        if (!result.success) throw result.error ?? new Error("Failed to create note")
      })
    } else {
      const webApi = getXrmWebApi()
      if (!webApi) throw new Error("Xrm.WebApi became unavailable")
      await webApi.createRecord(NOTES_TABLE, payload)
    }

    setDataverseConnected(operation, runtime)
  } catch (error) {
    const message = setErrorStatus(operation, error, "Failed to create note")
    throw new Error(message)
  }
}

// --- Bulk Import Types and Functions ---

export type ImportReview = {
  newRecords: CandidateProfile[]
  changedRecords: Array<{ existing: CandidateProfile; uploaded: Partial<CandidateProfile> }>
  skippedRecords: CandidateProfile[]
}

export async function analyzeUploadData(
  uploadedCandidates: Partial<CandidateProfile>[]
): Promise<ImportReview> {
  const operation = "analyzeUploadData"

  try {
    // Load all existing candidates
    const existingCandidates = await listCandidates()

    const newRecords: CandidateProfile[] = []
    const changedRecords: ImportReview["changedRecords"] = []
    const skippedRecords: CandidateProfile[] = []

    for (const uploaded of uploadedCandidates) {
      // Try to find existing by globalId
      const existing = existingCandidates.find((c) => c.globalId && c.globalId === uploaded.globalId)

      if (!existing) {
        // Map to full CandidateProfile with defaults
        const newCand: CandidateProfile = {
          id: "", // Will be assigned by Dataverse
          firstName: uploaded.firstName || "",
          lastName: uploaded.lastName || "",
          globalId: uploaded.globalId || "",
          country: uploaded.country || "",
          legalEntity: uploaded.legalEntity || "",
          organizationalUnit: uploaded.organizationalUnit || "",
          careerPath: uploaded.careerPath || "",
          developmentPool: uploaded.developmentPool || "",
          promotionCandidate: uploaded.promotionCandidate ?? false,
        }
        newRecords.push(newCand)
      } else {
        // Check if any fields are different
        const isDifferent =
          (uploaded.firstName && uploaded.firstName !== existing.firstName) ||
          (uploaded.lastName && uploaded.lastName !== existing.lastName) ||
          (uploaded.country && uploaded.country !== existing.country) ||
          (uploaded.legalEntity && uploaded.legalEntity !== existing.legalEntity) ||
          (uploaded.organizationalUnit && uploaded.organizationalUnit !== existing.organizationalUnit) ||
          (uploaded.careerPath && uploaded.careerPath !== existing.careerPath) ||
          (uploaded.developmentPool && uploaded.developmentPool !== existing.developmentPool) ||
          (uploaded.promotionCandidate !== undefined && uploaded.promotionCandidate !== existing.promotionCandidate)

        if (isDifferent) {
          changedRecords.push({ existing, uploaded })
        } else {
          skippedRecords.push(existing)
        }
      }
    }

    setDataverseConnected(operation)
    return { newRecords, changedRecords, skippedRecords }
  } catch (error) {
    const message = setErrorStatus(operation, error, "Failed to analyze upload data")
    throw new Error(message)
  }
}

export async function executeBulkImport(
  newRecords: CandidateProfile[],
  updatedRecords: Array<{ id: string; updates: Partial<CandidateProfile> }>
): Promise<{ created: number; updated: number; errors: string[] }> {
  const operation = "executeBulkImport"
  const errors: string[] = []

  try {
    const runtime = await resolveRuntime(operation)
    let createdCount = 0
    let updatedCount = 0

    // Create new records
    for (const candidate of newRecords) {
      try {
        const payload: Row = {
          doj5wz_firstname: candidate.firstName,
          doj5wz_lastname: candidate.lastName,
          doj5wz_globalidentifier: candidate.globalId,
          doj5wz_country: candidate.country,
          doj5wz_legalentity: candidate.legalEntity,
          doj5wz_organizationalunit: candidate.organizationalUnit,
          doj5wz_careerpath: candidate.careerPath,
          doj5wz_developmentpool: candidate.developmentPool,
          doj5wz_selfnomination: candidate.promotionCandidate,
        }

        if (runtime === "bridge") {
          const client = getClient(dataSourcesInfo)
          await runBridgeWithKeyFallback(TALENT_BRIDGE_KEYS, async (tableName) => {
            const result = await client.createRecordAsync<Row, Row>(tableName, payload)
            if (!result.success) throw result.error ?? new Error("Failed to create record")
          })
        } else {
          const webApi = getXrmWebApi()
          if (!webApi) throw new Error("Xrm.WebApi became unavailable")
          await webApi.createRecord(TALENT_TABLE, payload)
        }
        createdCount++
      } catch (error) {
        errors.push(
          `Failed to create ${candidate.firstName} ${candidate.lastName}: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    }

    // Update existing records
    for (const { id, updates } of updatedRecords) {
      try {
        const payload: Row = {}
        if (updates.firstName) payload.doj5wz_firstname = updates.firstName
        if (updates.lastName) payload.doj5wz_lastname = updates.lastName
        if (updates.country) payload.doj5wz_country = updates.country
        if (updates.legalEntity) payload.doj5wz_legalentity = updates.legalEntity
        if (updates.organizationalUnit) payload.doj5wz_organizationalunit = updates.organizationalUnit
        if (updates.developmentPool) payload.doj5wz_developmentpool = updates.developmentPool
        if (updates.promotionCandidate !== undefined) payload.doj5wz_selfnomination = updates.promotionCandidate

        if (runtime === "bridge") {
          const client = getClient(dataSourcesInfo)
          await runBridgeWithKeyFallback(TALENT_BRIDGE_KEYS, async (tableName) => {
            const result = await client.updateRecordAsync<Row, Row>(tableName, id, payload)
            if (!result.success) throw result.error ?? new Error("Failed to update record")
          })
        } else {
          const webApi = getXrmWebApi()
          if (!webApi) throw new Error("Xrm.WebApi became unavailable")
          await webApi.updateRecord(TALENT_TABLE, id, payload)
        }
        updatedCount++
      } catch (error) {
        errors.push(`Failed to update record ${id}: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }

    setDataverseConnected(operation)
    return { created: createdCount, updated: updatedCount, errors }
  } catch (error) {
    const message = setErrorStatus(operation, error, "Bulk import failed")
    throw new Error(message)
  }
}


