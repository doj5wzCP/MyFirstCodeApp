import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  addCatalogValue,
  mergeCatalogWithObserved,
  removeCatalogValue,
  renameCatalogValue,
  type ManagedAttributeCategory,
} from "@/lib/attribute-catalog"
import { emptyFilters, type CandidateProfile } from "@/lib/talent-types"
import { listCandidates, replaceAttributeValue } from "@/lib/talent-data"
import { toast } from "sonner"

type UsageState = {
  candidates: CandidateProfile[]
  loading: boolean
}

const categoryConfig: Array<{ key: ManagedAttributeCategory; title: string; description: string }> = [
  {
    key: "functionalArea",
    title: "Potential Area",
    description: "Backed by Dataverse field doj5wz_functionalarea.",
  },
  {
    key: "developmentPool",
    title: "Readiness Level (Development Pool)",
    description: "Backed by Dataverse field doj5wz_developmentpool.",
  },
]

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function getCandidateValue(candidate: CandidateProfile, category: ManagedAttributeCategory): string {
  return category === "developmentPool" ? candidate.developmentPool : candidate.functionalArea
}

function getUsageCount(candidates: CandidateProfile[], category: ManagedAttributeCategory, value: string): number {
  const needle = normalize(value)
  return candidates.filter((candidate) => normalize(getCandidateValue(candidate, category)) === needle).length
}

export default function AttributeAdminPage() {
  const [usageState, setUsageState] = useState<UsageState>({ candidates: [], loading: true })
  const [draftByCategory, setDraftByCategory] = useState<Record<ManagedAttributeCategory, string>>({
    developmentPool: "",
    functionalArea: "",
  })
  const [renameDialog, setRenameDialog] = useState<{ category: ManagedAttributeCategory; oldValue: string } | null>(
    null
  )
  const [renameValue, setRenameValue] = useState("")
  const [saving, setSaving] = useState(false)

  async function refreshCandidates() {
    try {
      setUsageState((prev) => ({ ...prev, loading: true }))
      const candidates = await listCandidates(emptyFilters)
      setUsageState({ candidates, loading: false })
    } catch (error) {
      setUsageState((prev) => ({ ...prev, loading: false }))
      const message = error instanceof Error ? error.message : "Unable to load attributes"
      toast.error(message)
    }
  }

  useEffect(() => {
    void refreshCandidates()
  }, [])

  const optionsByCategory = {
    developmentPool: mergeCatalogWithObserved(
      "developmentPool",
      usageState.candidates.map((candidate) => candidate.developmentPool)
    ),
    functionalArea: mergeCatalogWithObserved(
      "functionalArea",
      usageState.candidates.map((candidate) => candidate.functionalArea)
    ),
  }

  async function addValue(category: ManagedAttributeCategory) {
    try {
      setSaving(true)
      addCatalogValue(category, draftByCategory[category])
      setDraftByCategory((prev) => ({ ...prev, [category]: "" }))
      toast.success("Attribute added")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add attribute"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function renameValueAndUsage() {
    if (!renameDialog) return

    const trimmedNewValue = renameValue.trim()
    if (!trimmedNewValue) {
      toast.error("New value is required")
      return
    }

    try {
      setSaving(true)
      const updatedCount = await replaceAttributeValue(renameDialog.category, renameDialog.oldValue, trimmedNewValue)
      renameCatalogValue(renameDialog.category, renameDialog.oldValue, trimmedNewValue)
      toast.success(
        updatedCount > 0
          ? `Attribute renamed and updated on ${updatedCount} candidate(s)`
          : "Attribute renamed"
      )
      setRenameDialog(null)
      setRenameValue("")
      await refreshCandidates()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to rename attribute"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteValue(category: ManagedAttributeCategory, value: string) {
    const usageCount = getUsageCount(usageState.candidates, category, value)
    if (usageCount > 0) {
      toast.error(`Cannot delete "${value}" because it is in use by ${usageCount} candidate(s).`)
      return
    }

    try {
      setSaving(true)
      removeCatalogValue(category, value)
      toast.success("Attribute deleted")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete attribute"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Attribute Management</h1>
          <p className="text-sm text-muted-foreground">
            Administrators can maintain candidate attributes and protect in-use values from deletion.
          </p>
        </div>

        {usageState.loading ? (
          <Card className="border shadow-none">
            <CardContent className="py-6 text-sm text-muted-foreground">Loading managed attributes...</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {categoryConfig.map((category) => (
              <Card key={category.key} className="border shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{category.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{category.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={draftByCategory[category.key]}
                      onChange={(event) =>
                        setDraftByCategory((prev) => ({ ...prev, [category.key]: event.target.value }))
                      }
                      placeholder={`Add ${category.title.toLowerCase()} value`}
                    />
                    <Button size="sm" disabled={saving} onClick={() => void addValue(category.key)}>
                      Add
                    </Button>
                  </div>

                  {optionsByCategory[category.key].length === 0 ? (
                    <div className="text-sm text-muted-foreground">No values maintained yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {optionsByCategory[category.key].map((value) => {
                        const usageCount = getUsageCount(usageState.candidates, category.key, value)
                        return (
                          <div key={value} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                            <div>
                              <div className="text-sm">{value}</div>
                              <div className="text-xs text-muted-foreground">
                                {usageCount > 0 ? `In use by ${usageCount} candidate(s)` : "Not in use"}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => {
                                  setRenameDialog({ category: category.key, oldValue: value })
                                  setRenameValue(value)
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={saving}
                                onClick={() => void deleteValue(category.key, value)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="border shadow-none">
          <CardContent className="py-4 text-xs text-muted-foreground">
            Skills and separate readiness-level entities are not present as standalone Dataverse columns in the current
            schema. The enabled admin functionality is backed by existing columns: potential area (functional area) and
            readiness level (development pool).
          </CardContent>
        </Card>

        <Dialog open={Boolean(renameDialog)} onOpenChange={(open) => !open && setRenameDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Attribute</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Renaming updates all candidates currently using this value.
              </p>
              <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialog(null)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void renameValueAndUsage()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="outline" asChild>
          <Link to="/">Back to Talent Overview</Link>
        </Button>
      </div>
    </div>
  )
}
