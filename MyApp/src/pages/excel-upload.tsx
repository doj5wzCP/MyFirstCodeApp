import { useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import type { CandidateProfile } from "@/lib/talent-types"
import { analyzeUploadData, executeBulkImport, type ImportReview } from "@/lib/talent-data"

type UploadedRow = Record<string, string>
type ResolutionChoice = "uploaded" | "existing"
type ConflictDecisions = Record<number, Partial<Record<keyof CandidateProfile, ResolutionChoice>>>

const CONFLICT_FIELDS: Array<{ key: keyof CandidateProfile; label: string }> = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "country", label: "Country" },
  { key: "legalEntity", label: "Legal Entity" },
  { key: "organizationalUnit", label: "Organizational Unit" },
  { key: "careerPath", label: "Career Path" },
  { key: "developmentPool", label: "Development Pool" },
  { key: "promotionCandidate", label: "Self Nomination" },
]

type ExtendedCandidate = Partial<CandidateProfile> & {
  userSystemId?: string
  localId?: string
  username?: string
  hrManagerUsername?: string
  hrManagerFirstName?: string
  hrManagerLastName?: string
  targetManagerFirstName?: string
  targetManagerLastName?: string
  executiveManagement?: string
  location?: string
  functionalArea?: string
  globalEmployeeGroup?: string
  dateOfBirth?: string
  age?: string
  gender?: string
  nominationComments?: string
  talentPoolStart?: string
  talentPoolEnd?: string
  referencesBAMS?: string
  followUpMeasures?: string
  selfNomination?: string
  email?: string
}

export default function ExcelUploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedRows, setUploadedRows] = useState<UploadedRow[]>([])
  const [preview, setPreview] = useState<UploadedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [uploadStatus, setUploadStatus] = useState("")
  const [errorDetails, setErrorDetails] = useState<string[]>([])
  const [importReview, setImportReview] = useState<ImportReview | null>(null)
  const [selectedNewRecords, setSelectedNewRecords] = useState<Set<number>>(new Set())
  const [selectedChangedRecords, setSelectedChangedRecords] = useState<Set<number>>(new Set())
  const [conflictDecisions, setConflictDecisions] = useState<ConflictDecisions>({})

  function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase()
  }

  function valuesDiffer(current: CandidateProfile[keyof CandidateProfile], incoming: CandidateProfile[keyof CandidateProfile]): boolean {
    if (typeof current === "boolean" || typeof incoming === "boolean") {
      return Boolean(current) !== Boolean(incoming)
    }
    return normalizeText(String(current ?? "")) !== normalizeText(String(incoming ?? ""))
  }

  function getChangedFields(existing: CandidateProfile, uploaded: Partial<CandidateProfile>): Array<keyof CandidateProfile> {
    return CONFLICT_FIELDS
      .filter(({ key }) => uploaded[key] !== undefined && valuesDiffer(existing[key], uploaded[key] as CandidateProfile[keyof CandidateProfile]))
      .map(({ key }) => key)
  }

  function formatFieldValue(value: CandidateProfile[keyof CandidateProfile] | undefined): string {
    if (typeof value === "boolean") return value ? "Yes" : "No"
    return String(value ?? "(empty)")
  }

  function parseSeparatedLine(line: string, delimiter: string): string[] {
    const values: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
        continue
      }

      if (char === delimiter && !inQuotes) {
        values.push(current.trim())
        current = ""
        continue
      }

      current += char
    }

    values.push(current.trim())
    return values
  }

  function detectDelimiter(headerLine: string): string {
    const candidates = [",", "\t", ";"]
    let selected = ","
    let bestScore = -1

    for (const candidate of candidates) {
      const score = parseSeparatedLine(headerLine, candidate).length
      if (score > bestScore) {
        bestScore = score
        selected = candidate
      }
    }

    return selected
  }

  function normalizeHeader(value: string): string {
    return value
      .replace(/^\uFEFF/, "")
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/["']/g, "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
  }

  function getRowValue(row: UploadedRow, ...aliases: string[]): string {
    for (const alias of aliases) {
      const direct = row[alias]
      if (typeof direct === "string" && direct.trim()) return direct.trim()
    }

    const rowEntries = Object.entries(row)
    const normalizedAliases = aliases.map(normalizeHeader)

    for (const [key, value] of rowEntries) {
      if (normalizedAliases.includes(normalizeHeader(key)) && value.trim()) {
        return value.trim()
      }
    }

    return ""
  }

  function parseBooleanValue(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    if (["true", "yes", "y", "1"].includes(normalized)) return true
    if (["false", "no", "n", "0"].includes(normalized)) return false
    return false
  }

  // Parse CSV content (supports quoted commas and escaped quotes)
  function parseCSV(content: string): UploadedRow[] {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) return []

    const delimiter = detectDelimiter(lines[0])
    const headers = parseSeparatedLine(lines[0], delimiter)
    const rows: UploadedRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = parseSeparatedLine(lines[i], delimiter)
      const row: UploadedRow = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx] || ""
      })
      rows.push(row)
    }

    return rows
  }

  // Parse Excel file
  async function parseExcelFile(file: File): Promise<UploadedRow[]> {
    try {
      const content = await file.text()
      if (file.name.endsWith(".csv")) {
        return parseCSV(content)
      }

      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        toast.error("Excel files require xlsx library installation. Using CSV format is recommended.")
        return []
      }

      toast.error("Unsupported file format. Please use CSV or Excel (.xlsx)")
      return []
    } catch (error) {
      toast.error(`Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`)
      return []
    }
  }

  // Handle file selection
  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setErrorDetails([])
      setSelectedFile(file)
      const rows = await parseExcelFile(file)

      if (rows.length === 0) {
        toast.error("No data found in file")
        setSelectedFile(null)
        return
      }

      setUploadedRows(rows)
      setPreview(rows.slice(0, 5))
      setShowPreview(true)
      toast.success(`Loaded ${rows.length} rows from ${file.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setErrorDetails([`Error loading file: ${message}`])
      toast.error(`Error loading file: ${message}`)
      setSelectedFile(null)
    } finally {
      setLoading(false)
    }
  }

  // Map CSV columns to Extended Candidate Profile
  function mapRowToCandidate(row: UploadedRow): ExtendedCandidate {
    return {
      firstName: getRowValue(row, "First Name", "first_name", "FirstName"),
      lastName: getRowValue(row, "Last Name", "last_name", "LastName"),
      globalId: getRowValue(row, "Global ID", "global_id", "GlobalID"),
      country: getRowValue(row, "Talent Metric: Country", "Country", "country"),
      legalEntity: getRowValue(row, "Legal Entity", "legal_entity", "LegalEntity"),
      organizationalUnit: getRowValue(row, "Organizational Unit", "organizational_unit", "OrganizationalUnit"),
      careerPath: getRowValue(row, "Talent Metric: Career Path", "Career Path", "career_path", "CareerPath"),
      developmentPool: getRowValue(row, "Development Pool", "development_pool", "DevelopmentPool"),
      promotionCandidate: parseBooleanValue(getRowValue(row, "Self Nomination", "self_nomination", "SelfNomination")),
      userSystemId: getRowValue(row, "User System ID", "UserSystemID"),
      localId: getRowValue(row, "Local ID", "LocalID"),
      username: getRowValue(row, "Username"),
      hrManagerUsername: getRowValue(row, "HR Manager Username"),
      hrManagerFirstName: getRowValue(row, "HR Manager First Name"),
      hrManagerLastName: getRowValue(row, "HR Manager Last Name"),
      targetManagerFirstName: getRowValue(row, "Target Manager First Name"),
      targetManagerLastName: getRowValue(row, "Target Manager Last Name"),
      executiveManagement: getRowValue(row, "Executive Management"),
      location: getRowValue(row, "Location"),
      functionalArea: getRowValue(row, "Functional Area"),
      globalEmployeeGroup: getRowValue(row, "Global Employee Group"),
      dateOfBirth: getRowValue(row, "Date of Birth"),
      age: getRowValue(row, "Talent Metric: Age", "Age"),
      gender: getRowValue(row, "Talent Metric: Gender", "Gender"),
      nominationComments: getRowValue(row, "Nomination Comments"),
      talentPoolStart: getRowValue(row, "Talent Pool Start"),
      talentPoolEnd: getRowValue(row, "Talent Pool End"),
      referencesBAMS: getRowValue(row, "References BA-MS", "References BAMS"),
      followUpMeasures: getRowValue(row, "Follow-Up Measures", "Follow Up Measures"),
      selfNomination: getRowValue(row, "Self Nomination", "self_nomination", "SelfNomination"),
      email: getRowValue(row, "Email", "email"),
    }
  }

  // Analyze data and show review
  async function handleAnalyzeData() {
    if (uploadedRows.length === 0) {
      toast.error("No data to analyze")
      return
    }

    try {
      setLoading(true)
      setUploadStatus("Analyzing data...")
      setErrorDetails([])

      const candidates = uploadedRows.map(mapRowToCandidate)
      const missingGlobalIdRows = candidates
        .map((candidate, index) => ({ index, globalId: candidate.globalId ?? "" }))
        .filter((x) => !x.globalId.trim())

      if (missingGlobalIdRows.length > 0) {
        const detectedHeaders = Object.keys(uploadedRows[0] ?? {})
          .map((h) => h || "(empty)")
          .slice(0, 12)
          .join(" | ")
        throw new Error(
          `Missing Global ID in ${missingGlobalIdRows.length} row(s). First few row indexes: ${missingGlobalIdRows
            .slice(0, 5)
            .map((x) => x.index + 2)
            .join(", ")}. Detected headers: ${detectedHeaders}`
        )
      }

      const review = await analyzeUploadData(candidates)
      const initialDecisions: ConflictDecisions = {}
      review.changedRecords.forEach(({ existing, uploaded }, idx) => {
        const fieldDecisions: Partial<Record<keyof CandidateProfile, ResolutionChoice>> = {}
        getChangedFields(existing, uploaded).forEach((field) => {
          fieldDecisions[field] = "uploaded"
        })
        initialDecisions[idx] = fieldDecisions
      })

      setImportReview(review)
      setConflictDecisions(initialDecisions)
      setSelectedNewRecords(new Set(Array.from({ length: review.newRecords.length }, (_, i) => i)))
      setSelectedChangedRecords(new Set(Array.from({ length: review.changedRecords.length }, (_, i) => i)))
      setShowPreview(false)
      setShowReview(true)

      toast.success(
        `Analysis complete: ${review.newRecords.length} new, ${review.changedRecords.length} changed, ${review.skippedRecords.length} unchanged`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setErrorDetails([
        `Analysis failed: ${message}`,
        "Tip: verify CSV headers exactly match expected names, especially Global ID.",
        "Tip: if a value contains commas, it must be wrapped in double quotes.",
      ])
      toast.error(`Analysis failed: ${message}`)
      setUploadStatus("Analysis failed")
    } finally {
      setLoading(false)
    }
  }

  // Execute import
  async function handleConfirmImport() {
    if (!importReview) return

    try {
      setLoading(true)
      setUploadStatus("Importing...")
      setErrorDetails([])

      // Prepare data for import
      const newRecords = importReview.newRecords.filter((_, i) => selectedNewRecords.has(i))
      const updatedRecords = importReview.changedRecords
        .map(({ existing, uploaded }, i) => {
          if (!selectedChangedRecords.has(i)) return null

          const updates: Partial<CandidateProfile> = {}
          const changedFields = getChangedFields(existing, uploaded)
          changedFields.forEach((field) => {
            const decision = conflictDecisions[i]?.[field] ?? "uploaded"
            if (decision === "uploaded") {
              if (field === "firstName" && uploaded.firstName !== undefined) updates.firstName = uploaded.firstName
              if (field === "lastName" && uploaded.lastName !== undefined) updates.lastName = uploaded.lastName
              if (field === "country" && uploaded.country !== undefined) updates.country = uploaded.country
              if (field === "legalEntity" && uploaded.legalEntity !== undefined) updates.legalEntity = uploaded.legalEntity
              if (field === "organizationalUnit" && uploaded.organizationalUnit !== undefined) {
                updates.organizationalUnit = uploaded.organizationalUnit
              }
              // careerPath is displayed as a conflict but not written from CSV label text (OptionSet in Dataverse)
              if (field === "developmentPool" && uploaded.developmentPool !== undefined) {
                updates.developmentPool = uploaded.developmentPool
              }
              if (field === "promotionCandidate" && uploaded.promotionCandidate !== undefined) {
                updates.promotionCandidate = uploaded.promotionCandidate
              }
            }
          })

          if (Object.keys(updates).length === 0) return null
          return { id: existing.id, updates }
        })
        .filter((row): row is { id: string; updates: Partial<CandidateProfile> } => row !== null)

      const result = await executeBulkImport(newRecords, updatedRecords)

      setUploadStatus(
        `Import complete: ${result.created} created, ${result.updated} updated${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`
      )
      toast.success(
        `Import complete: ${result.created} created, ${result.updated} updated${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`
      )

      if (result.errors.length > 0) {
        setErrorDetails(result.errors)
      }

      setShowReview(false)
      setUploadedRows([])
      setSelectedFile(null)
      setImportReview(null)
      setConflictDecisions({})
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      setErrorDetails([`Import failed: ${message}`])
      toast.error(`Import failed: ${message}`)
      setUploadStatus("Import failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full p-6 md:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Import</h1>
          <p className="text-sm text-muted-foreground">
            Upload candidate data from CSV or Excel. Review and select which records to create or update.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Upload Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Local File Upload */}
              <div className="space-y-2">
                <Label htmlFor="file-input" className="text-sm font-medium">
                  Upload from Computer
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file-input"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    disabled={loading}
                    className="cursor-pointer"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Supports: CSV, Excel (.xlsx, .xls)</p>
              </div>

              {/* OneDrive Integration */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Upload from OneDrive</Label>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    toast.info("OneDrive file picker coming soon. Use local file upload for now.")
                  }}
                  className="w-full"
                >
                  Choose from OneDrive
                </Button>
                <p className="text-xs text-muted-foreground">Microsoft Graph integration pending</p>
              </div>
            </div>

            {selectedFile && (
              <div className="rounded-md border bg-blue-50 p-3 text-sm">
                <strong>Selected file:</strong> {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}

            {uploadStatus && (
              <div className="rounded-md border bg-amber-50 p-3 text-sm">
                <strong>Status:</strong> {uploadStatus}
              </div>
            )}

            {errorDetails.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
                <div className="font-semibold text-red-900">Error details</div>
                <ul className="mt-2 list-disc pl-5 text-red-800">
                  {errorDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Supported Columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your CSV/Excel file should include the following columns. Column names are case-sensitive as shown:
            </p>

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold mb-2">Core Identity Fields</h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-muted/30 p-3 rounded">
                  <div>User System ID</div>
                  <div>Global ID</div>
                  <div>Local ID</div>
                  <div>Username</div>
                  <div>First Name</div>
                  <div>Last Name</div>
                  <div>Date of Birth</div>
                  <div>Email (optional)</div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Organization & Role</h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-muted/30 p-3 rounded">
                  <div>Legal Entity</div>
                  <div>Organizational Unit</div>
                  <div>Location</div>
                  <div>Functional Area</div>
                  <div>Global Employee Group</div>
                  <div>Executive Management</div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Talent & Development</h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-muted/30 p-3 rounded">
                  <div>Talent Metric: Career Path</div>
                  <div>Development Pool</div>
                  <div>Talent Metric: Age</div>
                  <div>Talent Metric: Gender</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/">Back to Talent Overview</Link>
          </Button>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="h-[94vh] w-[98vw] !max-w-[98vw] sm:!max-w-[98vw] overflow-hidden p-0">
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4 sm:p-6">
            <DialogHeader className="shrink-0">
              <DialogTitle>Data Preview</DialogTitle>
              <DialogDescription>
                Showing first {preview.length} of {uploadedRows.length} rows. Review before proceeding.
              </DialogDescription>
              <div className="text-xs text-muted-foreground">
                Columns detected: {Object.keys(preview[0] || {}).length}. Use the horizontal scrollbar to see all columns.
              </div>
            </DialogHeader>

            <div className="min-h-0 space-y-3 overflow-hidden">
              <div className="h-full rounded-md border">
                <div className="h-full overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]">
                  <table className="w-max min-w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted">
                        {Object.keys(preview[0] || {}).map((key) => (
                          <th key={key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/50">
                          {Object.values(row).map((value, cidx) => (
                            <td key={cidx} className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                              {value || "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {errorDetails.length > 0 && (
                <div className="max-h-28 overflow-auto rounded-md border border-red-300 bg-red-50 p-3 text-xs">
                  <div className="font-semibold text-red-900">Debug details</div>
                  <ul className="mt-2 list-disc pl-5 text-red-800">
                    {errorDetails.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleAnalyzeData()} disabled={loading}>
                {loading ? "Analyzing..." : "Proceed to Review"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review & Confirmation Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="h-[94vh] w-[98vw] !max-w-[98vw] sm:!max-w-[98vw] overflow-hidden p-0">
          <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4 sm:p-6">
            <DialogHeader className="shrink-0">
              <DialogTitle>Review Import</DialogTitle>
              <DialogDescription>
                Select which records to create or update. Unselected records will be skipped.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            {/* New Records */}
            {importReview && importReview.newRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id="select-all-new"
                    checked={selectedNewRecords.size === importReview.newRecords.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedNewRecords(
                          new Set(Array.from({ length: importReview.newRecords.length }, (_, i) => i))
                        )
                      } else {
                        setSelectedNewRecords(new Set())
                      }
                    }}
                  />
                  <label htmlFor="select-all-new" className="text-sm font-semibold cursor-pointer">
                    Create New Records ({importReview.newRecords.length})
                  </label>
                </div>
                <div className="space-y-2 pl-6 text-xs">
                  {importReview.newRecords.map((record, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-${idx}`}
                        checked={selectedNewRecords.has(idx)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedNewRecords)
                          if (checked) {
                            newSet.add(idx)
                          } else {
                            newSet.delete(idx)
                          }
                          setSelectedNewRecords(newSet)
                        }}
                      />
                      <label htmlFor={`new-${idx}`} className="cursor-pointer">
                        {record.firstName} {record.lastName} (ID: {record.globalId})
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Changed Records */}
            {importReview && importReview.changedRecords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id="select-all-changed"
                    checked={selectedChangedRecords.size === importReview.changedRecords.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedChangedRecords(
                          new Set(Array.from({ length: importReview.changedRecords.length }, (_, i) => i))
                        )
                      } else {
                        setSelectedChangedRecords(new Set())
                      }
                    }}
                  />
                  <label htmlFor="select-all-changed" className="text-sm font-semibold cursor-pointer">
                    Update Changed Records ({importReview.changedRecords.length})
                  </label>
                </div>
                <div className="space-y-2 pl-6 text-xs">
                  {importReview.changedRecords.map(({ existing, uploaded }, idx) => {
                    const changedFields = getChangedFields(existing, uploaded)
                    return (
                      <div key={idx} className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
                        <div className="mb-2 flex items-center gap-2 border-b pb-2">
                          <Checkbox
                            id={`changed-${idx}`}
                            checked={selectedChangedRecords.has(idx)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedChangedRecords)
                              if (checked) {
                                newSet.add(idx)
                              } else {
                                newSet.delete(idx)
                              }
                              setSelectedChangedRecords(newSet)
                            }}
                          />
                          <label htmlFor={`changed-${idx}`} className="cursor-pointer font-medium">
                            {existing.firstName} {existing.lastName} (ID: {existing.globalId})
                          </label>
                        </div>

                        <div className="space-y-2">
                          {changedFields.map((field) => {
                            const fieldLabel = CONFLICT_FIELDS.find((f) => f.key === field)?.label ?? String(field)
                            const decision = conflictDecisions[idx]?.[field] ?? "uploaded"
                            return (
                              <div key={`${idx}-${String(field)}`} className="rounded border bg-white p-2">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {fieldLabel}
                                </div>
                                {field === "careerPath" && (
                                  <div className="mb-2 text-[11px] text-amber-700">
                                    Displayed for conflict visibility. CSV label value is not written automatically for this OptionSet field.
                                  </div>
                                )}
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <button
                                    type="button"
                                    className={`rounded border px-2 py-1 text-left text-[11px] ${
                                      decision === "existing" ? "border-emerald-500 bg-emerald-50" : "border-muted"
                                    }`}
                                    onClick={() =>
                                      setConflictDecisions((prev) => ({
                                        ...prev,
                                        [idx]: { ...(prev[idx] ?? {}), [field]: "existing" },
                                      }))
                                    }
                                  >
                                    <div className="font-semibold">Keep Current</div>
                                    <div className="truncate text-muted-foreground">
                                      {formatFieldValue(existing[field])}
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    className={`rounded border px-2 py-1 text-left text-[11px] ${
                                      decision === "uploaded" ? "border-blue-500 bg-blue-50" : "border-muted"
                                    }`}
                                    onClick={() =>
                                      setConflictDecisions((prev) => ({
                                        ...prev,
                                        [idx]: { ...(prev[idx] ?? {}), [field]: "uploaded" },
                                      }))
                                    }
                                  >
                                    <div className="font-semibold">Use Uploaded</div>
                                    <div className="truncate text-muted-foreground">
                                      {formatFieldValue(uploaded[field])}
                                    </div>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Skipped Records */}
            {importReview && importReview.skippedRecords.length > 0 && (
              <div className="bg-muted/30 p-3 rounded text-xs">
                <p className="font-semibold mb-1">⊘ Skipped (No Changes): {importReview.skippedRecords.length}</p>
                <p className="text-muted-foreground">These records already exist and match the upload data.</p>
              </div>
            )}

            {errorDetails.length > 0 && (
              <div className="max-h-28 overflow-auto rounded-md border border-red-300 bg-red-50 p-3 text-xs">
                <div className="font-semibold text-red-900">Debug details</div>
                <ul className="mt-2 list-disc pl-5 text-red-800">
                  {errorDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
            </div>

            <DialogFooter className="shrink-0 border-t pt-3">
              <Button variant="outline" onClick={() => setShowReview(false)}>
                Back to Preview
              </Button>
              <Button onClick={() => void handleConfirmImport()} disabled={loading}>
                {loading ? "Importing..." : "Confirm Import"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
