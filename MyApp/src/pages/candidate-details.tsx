import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { mergeCatalogWithObserved } from "@/lib/attribute-catalog"
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

function toDayKey(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatTimelineDayLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (toDayKey(date.toISOString()) === toDayKey(today.toISOString())) {
    return "Today"
  }

  if (toDayKey(date.toISOString()) === toDayKey(yesterday.toISOString())) {
    return "Yesterday"
  }

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function groupNotesByDay(items: CandidateNote[]) {
  const groups = new Map<string, CandidateNote[]>()

  for (const note of items) {
    const key = toDayKey(note.createdOn)
    const existing = groups.get(key)
    if (existing) {
      existing.push(note)
    } else {
      groups.set(key, [note])
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([dayKey, dayNotes]) => ({
      dayKey,
      dayLabel: formatTimelineDayLabel(dayNotes[0].createdOn),
      notes: dayNotes,
    }))
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

  const groupedNotes = groupNotesByDay(notes)

  const developmentPoolOptions = mergeCatalogWithObserved("developmentPool", [draft?.developmentPool ?? ""])
  const potentialAreaOptions = mergeCatalogWithObserved("functionalArea", [draft?.functionalArea ?? ""])

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

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
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
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Potential Area</Label>
                    {isEditing ? (
                      <>
                        <Input
                          list="potential-area-options"
                          value={draft.functionalArea}
                          onChange={(event) =>
                            setDraft((prev) => (prev ? { ...prev, functionalArea: event.target.value } : prev))
                          }
                        />
                        <datalist id="potential-area-options">
                          {potentialAreaOptions.map((option) => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <div className="min-h-9 rounded-md border px-3 py-2 text-sm">{candidate.functionalArea || "-"}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Readiness Level (Development Pool)</Label>
                    {isEditing ? (
                      <>
                        <Input
                          list="development-pool-options"
                          value={draft.developmentPool}
                          onChange={(event) =>
                            setDraft((prev) => (prev ? { ...prev, developmentPool: event.target.value } : prev))
                          }
                        />
                        <datalist id="development-pool-options">
                          {developmentPoolOptions.map((option) => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <div className="min-h-9 rounded-md border px-3 py-2 text-sm">{candidate.developmentPool || "-"}</div>
                    )}
                  </div>
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
                <CardTitle className="text-base">Notes Timeline</CardTitle>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                  <Input
                    className="w-full sm:w-56"
                    placeholder="Search notes"
                    value={noteSearch}
                    onChange={(event) => setNoteSearch(event.target.value)}
                  />
                  <Button className="sm:shrink-0" onClick={() => setShowDialog(true)}>
                    Add Note
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {notes.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No notes found.</div>
              ) : (
                groupedNotes.map((group) => (
                  <section key={group.dayKey} className="space-y-3">
                    <Badge variant="secondary" className="rounded-sm px-2 py-1 text-[11px] font-semibold tracking-wide">
                      {group.dayLabel}
                    </Badge>
                    <div className="space-y-3">
                      {group.notes.map((note, index) => (
                        <div key={note.id} className="relative pl-6">
                          {index < group.notes.length - 1 && (
                            <span className="absolute left-[9px] top-7 h-[calc(100%-12px)] w-px bg-border" aria-hidden="true" />
                          )}
                          <span
                            className="absolute left-0 top-1.5 h-[18px] w-[18px] rounded-full border border-primary/45 bg-background shadow-sm"
                            aria-hidden="true"
                          >
                            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                          </span>

                          <div className="rounded-md border bg-card p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold text-foreground">{note.title || "Note"}</h3>
                              <Badge variant="outline" className="rounded-sm text-[11px] font-normal text-muted-foreground">
                                {new Date(note.createdOn).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{note.createdBy || "System"}</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                              {note.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </CardContent>
          </Card>
        </div>
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
