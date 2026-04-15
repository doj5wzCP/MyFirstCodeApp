import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AttributeAdminPage() {
  return (
    <div className="h-full p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Attribute Management</h1>
          <p className="text-sm text-muted-foreground">
            Admin placeholder for maintaining Career Path and Development Pool values.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Career Path</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Management UI placeholder. Logic is intentionally not implemented yet.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>Add</Button>
                <Button variant="outline" size="sm" disabled>Edit</Button>
                <Button variant="outline" size="sm" disabled>Delete</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Development Pool</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Management UI placeholder. Logic is intentionally not implemented yet.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>Add</Button>
                <Button variant="outline" size="sm" disabled>Edit</Button>
                <Button variant="outline" size="sm" disabled>Delete</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Button variant="outline" asChild>
          <Link to="/">Back to Talent Overview</Link>
        </Button>
      </div>
    </div>
  )
}
