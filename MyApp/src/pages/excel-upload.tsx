import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ExcelUploadPage() {
  return (
    <div className="h-full p-6 md:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Excel Upload</h1>
          <p className="text-sm text-muted-foreground">
            Placeholder screen. Integration will be implemented later with Power Automate.
          </p>
        </div>

        <Card className="border shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Planned Import Logic</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. New records: create in doj5wz_employeetalentprofile.</p>
            <p>2. Existing and same: discard row.</p>
            <p>3. Existing and different: send to user review.</p>

            <div className="pt-3 flex items-center gap-2">
              <Button disabled>Upload (Coming Soon)</Button>
              <Button variant="outline" asChild>
                <Link to="/">Back to Talent Overview</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
