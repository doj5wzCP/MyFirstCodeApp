import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { emptyFilters } from "@/lib/talent-types"
import type { CandidateProfile } from "@/lib/talent-types"
import { getDataConnectionStatus, getDataverseDiagnostics, listCandidates } from "@/lib/talent-data"
import { toast } from "sonner"

const BUILD_STAMP = "2026-04-16.24"

type CandidateOverviewField =
  | "firstName"
  | "lastName"
  | "globalId"
  | "country"
  | "legalEntity"
  | "organizationalUnit"
  | "careerPath"
  | "functionalArea"
  | "developmentPool"
  | "promotionCandidate"

const DEFAULT_VISIBLE_FIELDS: CandidateOverviewField[] = [
  "firstName",
  "lastName",
  "globalId",
  "country",
  "careerPath",
]

const FIELD_DEFINITIONS: Array<{ key: CandidateOverviewField; label: string; width: string }> = [
  { key: "firstName", label: "First Name", width: "1fr" },
  { key: "lastName", label: "Last Name", width: "1fr" },
  { key: "globalId", label: "Global ID", width: "0.95fr" },
  { key: "country", label: "Country", width: "0.9fr" },
  { key: "legalEntity", label: "Legal Entity", width: "1.1fr" },
  { key: "organizationalUnit", label: "Organizational Unit", width: "1.2fr" },
  { key: "careerPath", label: "Career Path", width: "1fr" },
  { key: "functionalArea", label: "Potential Area", width: "1.1fr" },
  { key: "developmentPool", label: "Readiness Level", width: "1.1fr" },
  { key: "promotionCandidate", label: "Promotion Candidate", width: "1fr" },
]

export default function HomePage() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<CandidateProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState(emptyFilters)
  const [connectionStatus, setConnectionStatus] = useState(getDataConnectionStatus())
  const [diagnostics, setDiagnostics] = useState(getDataverseDiagnostics())
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [visibleFields, setVisibleFields] = useState<CandidateOverviewField[]>(DEFAULT_VISIBLE_FIELDS)

  async function loadData(options?: { showToast?: boolean; showDiagnostics?: boolean }) {
    const showToast = options?.showToast ?? false
    const showDiagnostics = options?.showDiagnostics ?? false
    try {
      setLoading(true)
      const data = await listCandidates(filters)
      setCandidates(data)
      setConnectionStatus(getDataConnectionStatus())
      if (showDiagnostics) setShowDiagnostics(true)
      if (showToast) toast.success(`Data refreshed (${data.length} candidates loaded)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load candidate data"
      setConnectionStatus(getDataConnectionStatus())
      toast.error(message)
    } finally {
      setDiagnostics(getDataverseDiagnostics())
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // This view intentionally refreshes when a filter changes.
  }, [
    filters.country,
    filters.legalEntity,
    filters.organizationalUnit,
    filters.careerPath,
    filters.functionalArea,
    filters.developmentPool,
    filters.onlyPromotionCandidates,
    filters.searchText,
  ])

  const countries = useMemo(() => [...new Set(candidates.map((item) => item.country).filter(Boolean))], [candidates])
  const legalEntities = useMemo(
    () => [...new Set(candidates.map((item) => item.legalEntity).filter(Boolean))],
    [candidates]
  )
  const organizationalUnits = useMemo(
    () => [...new Set(candidates.map((item) => item.organizationalUnit).filter(Boolean))],
    [candidates]
  )
  const careerPaths = useMemo(
    () => [...new Set(candidates.map((item) => item.careerPath).filter(Boolean))],
    [candidates]
  )
  const functionalAreas = useMemo(
    () => [...new Set(candidates.map((item) => item.functionalArea).filter(Boolean))],
    [candidates]
  )
  const developmentPools = useMemo(
    () => [...new Set(candidates.map((item) => item.developmentPool).filter(Boolean))],
    [candidates]
  )

  function optionList(items: string[]) {
    return items.map((item) => (
      <option key={item} value={item}>
        {item}
      </option>
    ))
  }

  const selectedFieldDefinitions = FIELD_DEFINITIONS.filter((field) => visibleFields.includes(field.key))
  const columnTemplate = `${selectedFieldDefinitions.map((field) => field.width).join(" ")} auto`

  function toggleVisibleField(field: CandidateOverviewField, checked: boolean) {
    setVisibleFields((prev) => {
      if (checked) {
        if (prev.includes(field)) return prev
        return [...prev, field]
      }

      const next = prev.filter((item) => item !== field)
      if (next.length === 0) {
        toast.error("At least one field must remain selected")
        return prev
      }

      return next
    })
  }

  function renderCandidateCell(candidate: CandidateProfile, field: CandidateOverviewField) {
    if (field === "firstName") return candidate.firstName
    if (field === "lastName") return candidate.lastName
    if (field === "globalId") return <span className="font-medium">{candidate.globalId}</span>
    if (field === "country") return candidate.country
    if (field === "legalEntity") return candidate.legalEntity
    if (field === "organizationalUnit") return candidate.organizationalUnit
    if (field === "careerPath") return candidate.careerPath
    if (field === "functionalArea") return candidate.functionalArea
    if (field === "developmentPool") return candidate.developmentPool
    if (field === "promotionCandidate") return candidate.promotionCandidate ? "Yes" : "No"
    return "-"
  }

  return (
    <div className="h-full bg-[linear-gradient(180deg,var(--bosch-wash),transparent_220px)] p-6 md:p-8">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Talent Overview</h1>
            <p className="mt-1 text-xs text-muted-foreground">{connectionStatus.message}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`status-chip ${
                connectionStatus.mode === "dataverse"
                  ? "status-chip--dataverse"
                  : connectionStatus.mode === "fallback"
                    ? "status-chip--fallback"
                    : connectionStatus.mode === "error"
                      ? "status-chip--error"
                      : ""
              }`}
            >
              {connectionStatus.mode === "dataverse" ? "Dataverse Connected" : "Dataverse Not Connected"}
            </span>
            <Button variant="outline" onClick={() => navigate("/excel-upload")}>
              Upload Excel
            </Button>
            <Button onClick={() => void loadData({ showToast: true, showDiagnostics: true })}>Refresh Data</Button>
          </div>
        </div>

        {showDiagnostics && (
          <Card className="border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dataverse Diagnostics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                <div>build: {BUILD_STAMP}</div>
                <div>bridgeAvailable: {diagnostics.bridgeAvailable ? "yes" : "no"}</div>
                <div>bridgeSource: {diagnostics.bridgeSource || "none"}</div>
                <div>xrmAvailable: {diagnostics.xrmAvailable ? "yes" : "no"}</div>
                <div>runtimeHost: {diagnostics.runtimeHost || "(unknown)"}</div>
                <div>runtimeHref: {diagnostics.runtimeHref || "(unknown)"}</div>
                <div>connectionMode: {diagnostics.connectionMode}</div>
                <div>lastOperation: {diagnostics.lastOperation}</div>
                <div>connectionMessage: {diagnostics.connectionMessage || "(empty)"}</div>
                <div>lastError: {diagnostics.lastError || "(none)"}</div>
                <div>configuredTables: {diagnostics.configuredTables.join(", ")}</div>
                <div>notesNavProp: {diagnostics.notesNavProp}</div>
                <div>notesCount: {diagnostics.notesCount}</div>
                <div>lastNotesFilter: {diagnostics.lastNotesFilter || "(none)"}</div>
                <div>lastUpdated: {diagnostics.lastUpdated}</div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={filters.country}
                onChange={(event) => setFilters((prev) => ({ ...prev, country: event.target.value }))}
              >
                <option value="">Country (All)</option>
                {optionList(countries)}
              </select>

              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={filters.legalEntity}
                onChange={(event) => setFilters((prev) => ({ ...prev, legalEntity: event.target.value }))}
              >
                <option value="">Legal Entity (All)</option>
                {optionList(legalEntities)}
              </select>

              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={filters.organizationalUnit}
                onChange={(event) => setFilters((prev) => ({ ...prev, organizationalUnit: event.target.value }))}
              >
                <option value="">Organizational Unit (All)</option>
                {optionList(organizationalUnits)}
              </select>

              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={filters.careerPath}
                onChange={(event) => setFilters((prev) => ({ ...prev, careerPath: event.target.value }))}
              >
                <option value="">Career Path (All)</option>
                {optionList(careerPaths)}
              </select>

              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={filters.functionalArea}
                onChange={(event) => setFilters((prev) => ({ ...prev, functionalArea: event.target.value }))}
              >
                <option value="">Potential Area (All)</option>
                {optionList(functionalAreas)}
              </select>

              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={filters.developmentPool}
                onChange={(event) => setFilters((prev) => ({ ...prev, developmentPool: event.target.value }))}
              >
                <option value="">Development Pool (All)</option>
                {optionList(developmentPools)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="promotion-only"
                  checked={filters.onlyPromotionCandidates}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({ ...prev, onlyPromotionCandidates: checked === true }))
                  }
                />
                <Label htmlFor="promotion-only">Only promotion candidates</Label>
              </div>

              <div className="w-full md:max-w-sm">
                <Input
                  value={filters.searchText}
                  onChange={(event) => setFilters((prev) => ({ ...prev, searchText: event.target.value }))}
                  placeholder="Search name or global ID"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none flex-1 min-h-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Candidates</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">Select Fields</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Visible fields</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {FIELD_DEFINITIONS.map((field) => (
                    <DropdownMenuCheckboxItem
                      key={field.key}
                      checked={visibleFields.includes(field.key)}
                      onCheckedChange={(checked) => toggleVisibleField(field.key, checked === true)}
                    >
                      {field.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div
              className="grid min-w-[780px] gap-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: columnTemplate }}
            >
              {selectedFieldDefinitions.map((field) => (
                <div key={field.key}>{field.label}</div>
              ))}
              <div className="text-right">Action</div>
            </div>

            {loading ? (
              <div className="py-5 text-sm text-muted-foreground">Loading candidates...</div>
            ) : candidates.length === 0 ? (
              <div className="py-5 text-sm text-muted-foreground">No candidates match the selected filters.</div>
            ) : (
              candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => navigate(`/candidate/${candidate.id}`)}
                  className="grid w-full min-w-[780px] gap-3 border-b py-3 text-left text-sm hover:bg-muted/40"
                  style={{ gridTemplateColumns: columnTemplate }}
                >
                  {selectedFieldDefinitions.map((field) => (
                    <div key={field.key}>{renderCandidateCell(candidate, field.key)}</div>
                  ))}
                  <div className="text-right">
                    <span className="candidate-open-chip">Open</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Existing Dataverse tables only: doj5wz_employeetalentprofile + doj5wz_notes | Build {BUILD_STAMP}</span>
          <Button variant="ghost" size="sm" onClick={() => navigate("/attribute-admin")}>Attribute Management</Button>
        </div>
      </div>
    </div>
  )
}