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
  const [importReview, setImportReview] = useState<ImportReview | null>(null)
  const [selectedNewRecords, setSelectedNewRecords] = useState<Set<number>>(new Set())
  const [selectedChangedRecords, setSelectedChangedRecords] = useState<Set<number>>(new Set())

  // Parse CSV content
  function parseCSV(content: string): UploadedRow[] {
    const lines = content.split("\n").filter((line) => line.trim())
    if (lines.length === 0) return []

    const headers = lines[0].split(",").map((h) => h.trim())
    const rows: UploadedRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim())
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
      toast.error(`Error loading file: ${error instanceof Error ? error.message : "Unknown error"}`)
      setSelectedFile(null)
    } finally {
      setLoading(false)
    }
  }

  // Map CSV columns to Extended Candidate Profile
  function mapRowToCandidate(row: UploadedRow): ExtendedCandidate {
    return {
      firstName: row["First Name"] || row["first_name"] || "",
      lastName: row["Last Name"] || row["last_name"] || "",
      globalId: row["Global ID"] || row["global_id"] || "",
      country: row["Talent Metric: Country"] || row["Country"] || row["country"] || "",
      legalEntity: row["Legal Entity"] || row["legal_entity"] || "",
      organizationalUnit: row["Organizational Unit"] || row["organizational_unit"] || "",
      careerPath: row["Talent Metric: Career Path"] || row["Career Path"] || row["career_path"] || "",
      developmentPool: row["Development Pool"] || row["development_pool"] || "",
      promotionCandidate: (row["Self Nomination"] || row["self_nomination"] || "").toLowerCase() === "true",
      userSystemId: row["User System ID"] || "",
      localId: row["Local ID"] || "",
      username: row["Username"] || "",
      hrManagerUsername: row["HR Manager Username"] || "",
      hrManagerFirstName: row["HR Manager First Name"] || "",
      hrManagerLastName: row["HR Manager Last Name"] || "",
      targetManagerFirstName: row["Target Manager First Name"] || "",
      targetManagerLastName: row["Target Manager Last Name"] || "",
      executiveManagement: row["Executive Management"] || "",
      location: row["Location"] || "",
      functionalArea: row["Functional Area"] || "",
      globalEmployeeGroup: row["Global Employee Group"] || "",
      dateOfBirth: row["Date of Birth"] || "",
      age: row["Talent Metric: Age"] || "",
      gender: row["Talent Metric: Gender"] || "",
      nominationComments: row["Nomination Comments"] || "",
      talentPoolStart: row["Talent Pool Start"] || "",
      talentPoolEnd: row["Talent Pool End"] || "",
      referencesBAMS: row["References BA-MS"] || "",
      followUpMeasures: row["Follow-Up Measures"] || "",
      selfNomination: row["Self Nomination"] || "",
      email: row["Email"] || row["email"] || "",
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

      const candidates = uploadedRows.map(mapRowToCandidate)
      const review = await analyzeUploadData(candidates)

      setImportReview(review)
      setSelectedNewRecords(new Set(Array.from({ length: review.newRecords.length }, (_, i) => i)))
      setSelectedChangedRecords(new Set(Array.from({ length: review.changedRecords.length }, (_, i) => i)))
      setShowPreview(false)
      setShowReview(true)

      toast.success(
        `Analysis complete: ${review.newRecords.length} new, ${review.changedRecords.length} changed, ${review.skippedRecords.length} unchanged`
      )
    } catch (error) {
      toast.error(`Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`)
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

      // Prepare data for import
      const newRecords = importReview.newRecords.filter((_, i) => selectedNewRecords.has(i))
      const updatedRecords = importReview.changedRecords
        .filter((_, i) => selectedChangedRecords.has(i))
        .map(({ existing, uploaded }) => ({
          id: existing.id,
          updates: uploaded,
        }))

      const result = await executeBulkImport(newRecords, updatedRecords)

      setUploadStatus(
        `Import complete: ${result.created} created, ${result.updated} updated${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`
      )
      toast.success(
        `Import complete: ${result.created} created, ${result.updated} updated${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`
      )

      if (result.errors.length > 0) {
        result.errors.forEach((error) => console.error(error))
      }

      setShowReview(false)
      setUploadedRows([])
      setSelectedFile(null)
      setImportReview(null)
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`)
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
        <DialogContent className="max-w-5xl max-h-96">
          <DialogHeader>
            <DialogTitle>Data Preview</DialogTitle>
            <DialogDescription>
              Showing first {preview.length} of {uploadedRows.length} rows. Review before proceeding.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
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
                      <td key={cidx} className="px-3 py-2 truncate max-w-xs text-muted-foreground">
                        {value || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAnalyzeData()} disabled={loading}>
              {loading ? "Analyzing..." : "Proceed to Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review & Confirmation Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="max-w-4xl max-h-96">
          <DialogHeader>
            <DialogTitle>Review Import</DialogTitle>
            <DialogDescription>
              Select which records to create or update. Unselected records will be skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto max-h-64">
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
                  {importReview.changedRecords.map(({ existing }, idx) => (
                    <div key={idx} className="flex items-center gap-2 border-l-2 border-amber-300 pl-2">
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
                      <label htmlFor={`changed-${idx}`} className="cursor-pointer">
                        {existing.firstName} {existing.lastName} (will update with uploaded data)
                      </label>
                    </div>
                  ))}
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReview(false)}>
              Back to Preview
            </Button>
            <Button onClick={() => void handleConfirmImport()} disabled={loading}>
              {loading ? "Importing..." : "Confirm Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
