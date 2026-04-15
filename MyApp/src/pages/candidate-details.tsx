import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createNote, getCandidate, listNotes, updateCandidate } from "@/lib/talent-data"
import type { CandidateNote, CandidateProfile } from "@/lib/talent-types"
import { toast } from "sonner"

function DetailField({
  label,
  value,
  editable,
  onChange,
}: {
  label: string
  value: string
  editable: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editable ? (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <div className="min-h-9 rounded-md border px-3 py-2 text-sm">{value || "-"}</div>
      )}
    </div>
  )
}

export default function CandidateDetailsPage() {
  const { candidateId } = useParams<{ candidateId: string }>()
  const navigate = useNavigate()
  const [candidate, setCandidate] = useState<CandidateProfile | null>(null)
  const [draft, setDraft] = useState<CandidateProfile | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [notes, setNotes] = useState<CandidateNote[]>([])
  const [noteSearch, setNoteSearch] = useState("")
  const [showDialog, setShowDialog] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState("")
  const [newNoteDescription, setNewNoteDescription] = useState("")
  const [loading, setLoading] = useState(true)

  async function loadCandidateAndNotes(search = noteSearch) {
    if (!candidateId) return

    try {
      setLoading(true)
      const foundCandidate = await getCandidate(candidateId)
      if (!foundCandidate) {
        toast.error("Candidate not found")
        navigate("/")
        return
      }

      setCandidate(foundCandidate)
      setDraft(foundCandidate)

      const foundNotes = await listNotes(candidateId, search)
      setNotes(foundNotes)
    } catch {
      toast.error("Unable to load candidate details")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCandidateAndNotes()
    // Initial load for selected candidate.
  }, [candidateId])

  useEffect(() => {
    if (!candidateId) return
    const timer = setTimeout(() => {
      void loadCandidateAndNotes(noteSearch)
    }, 250)

    return () => clearTimeout(timer)
  }, [noteSearch])

  async function saveCandidate() {
    if (!candidateId || !draft) return

    try {
      const updated = await updateCandidate(candidateId, draft)
      if (!updated) {
        toast.error("Could not update candidate")
        return
      }

      setCandidate(updated)
      setDraft(updated)
      setIsEditing(false)
      toast.success("Candidate updated")
    } catch {
      toast.error("Failed to save candidate")
    }
  }

  async function addNote() {
    if (!candidateId) return
    try {
      await createNote(candidateId, newNoteTitle, newNoteDescription)
      setNewNoteTitle("")
      setNewNoteDescription("")
      setShowDialog(false)
      await loadCandidateAndNotes()
      toast.success("Note added")
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Unable to add note"
      toast.error(`Unable to add note: ${message}`)
    }
  }

  if (loading || !candidate || !draft) {
    return <div className="p-6 text-sm text-muted-foreground">Loading candidate details...</div>
  }

  return (
    <div className="h-full p-6 md:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {candidate.firstName} {candidate.lastName}
            </h1>
            <div className="text-sm text-muted-foreground">Global ID: {candidate.globalId || "-"}</div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void saveCandidate()}>Save</Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>Edit</Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/">Back</Link>
            </Button>
          </div>
        </div>

        <Card className="border shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Candidate Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Identity</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailField
                  label="First Name"
                  value={draft.firstName}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, firstName: value } : prev))}
                />
                <DetailField
                  label="Last Name"
                  value={draft.lastName}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, lastName: value } : prev))}
                />
                <DetailField
                  label="Global ID"
                  value={draft.globalId}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, globalId: value } : prev))}
                />
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Organization</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailField
                  label="Country"
                  value={draft.country}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, country: value } : prev))}
                />
                <DetailField
                  label="Legal Entity"
                  value={draft.legalEntity}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, legalEntity: value } : prev))}
                />
                <DetailField
                  label="Organizational Unit"
                  value={draft.organizationalUnit}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, organizationalUnit: value } : prev))}
                />
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Talent Information</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailField
                  label="Career Path"
                  value={draft.careerPath}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, careerPath: value } : prev))}
                />
                <DetailField
                  label="Development Pool"
                  value={draft.developmentPool}
                  editable={isEditing}
                  onChange={(value) => setDraft((prev) => (prev ? { ...prev, developmentPool: value } : prev))}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Promotion Candidate</Label>
                  {isEditing ? (
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.promotionCandidate ? "yes" : "no"}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev ? { ...prev, promotionCandidate: event.target.value === "yes" } : prev
                        )
                      }
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <div className="min-h-9 rounded-md border px-3 py-2 text-sm">
                      {candidate.promotionCandidate ? "Yes" : "No"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Notes</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  className="w-64"
                  placeholder="Search notes"
                  value={noteSearch}
                  onChange={(event) => setNoteSearch(event.target.value)}
                />
                <Button onClick={() => setShowDialog(true)}>Add Note</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {notes.length === 0 ? (
              <div className="text-sm text-muted-foreground">No notes found.</div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{note.title}</h3>
                    <div className="text-xs text-muted-foreground">
                      {new Date(note.createdOn).toLocaleString()} by {note.createdBy}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{note.description}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Notes are free text, timestamped, and associated with the author in Dataverse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={newNoteTitle}
                onChange={(event) => setNewNoteTitle(event.target.value)}
                placeholder="Discussion title"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="note-description">Description</Label>
              <Textarea
                id="note-description"
                value={newNoteDescription}
                onChange={(event) => setNewNoteDescription(event.target.value)}
                placeholder="Enter note details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void addNote()}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
