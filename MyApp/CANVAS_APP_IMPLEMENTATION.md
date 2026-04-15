# Canvas App Implementation Blueprint (Dataverse Existing Tables)

This blueprint creates a desktop-first Canvas App using existing Dataverse tables only:

- Main table: `doj5wz_employeetalentprofile`
- Notes table: `doj5wz_notes1`

No table creation is required.

## 1) App Setup

1. Create a new **Canvas app (blank)** in Power Apps Studio.
2. Set layout to **Tablet/Desktop**.
3. Add data sources:
   - `doj5wz_employeetalentprofile`
   - `doj5wz_notes1`
4. Rename app screens and controls as proposed in this document for easy maintenance.

## 2) Required Screens

- `scrTalentOverview` (Screen 1 - Summary)
- `scrCandidateDetails` (Screen 2 - Details + Notes)
- `scrExcelUpload` (Placeholder)
- `scrAttributeAdmin` (Placeholder)

## 3) App Variables and Init

Set these in `App.OnStart`:

```powerfx
Set(varSelectedCandidate, Blank());
Set(varOnlyPromotionCandidates, false);
Set(varCandidateSearch, "");
Set(varNoteSearch, "");
```

Optional refresh helper button formula:

```powerfx
Refresh(doj5wz_employeetalentprofile);
Refresh(doj5wz_notes1);
Notify("Data refreshed", NotificationType.Success)
```

## 4) Screen 1 - Talent Overview

## Layout

- Header container (top):
  - Title label: `Talent Overview`
  - Buttons:
    - `btnUploadExcel` (text: `Upload Excel`)
    - `btnRefreshData` (text: `Refresh Data`)
- Filter/search container:
  - Dropdown/ComboBox controls:
    - `ddCountry`
    - `ddLegalEntity`
    - `ddOrgUnit`
    - `ddCareerPath`
    - `ddDevelopmentPool`
  - Toggle:
    - `tglPromotionOnly` (label: `Only promotion candidates`)
  - Search input:
    - `txtCandidateSearch` (hint: `Search name or global ID`)
- Main area:
  - Compact gallery `galCandidates`

## Filter control Items formulas

Use distinct values from main table:

```powerfx
// ddCountry.Items
Sort(Distinct(doj5wz_employeetalentprofile, Country), Value)

// ddLegalEntity.Items
Sort(Distinct(doj5wz_employeetalentprofile, 'Legal Entity'), Value)

// ddOrgUnit.Items
Sort(Distinct(doj5wz_employeetalentprofile, 'Organizational Unit'), Value)

// ddCareerPath.Items
Sort(Distinct(doj5wz_employeetalentprofile, 'Career Path'), Value)

// ddDevelopmentPool.Items
Sort(Distinct(doj5wz_employeetalentprofile, 'Development Pool'), Value)
```

For each dropdown add a default blank option if desired (for "All") by switching to ComboBox and allowing no selection.

## Search and filter formula for gallery

Set `galCandidates.Items`:

```powerfx
With(
    {
        q: Lower(Trim(txtCandidateSearch.Text))
    },
    Filter(
        doj5wz_employeetalentprofile,

        // Optional filters
        (IsBlank(ddCountry.Selected.Value) || Country = ddCountry.Selected.Value),
        (IsBlank(ddLegalEntity.Selected.Value) || 'Legal Entity' = ddLegalEntity.Selected.Value),
        (IsBlank(ddOrgUnit.Selected.Value) || 'Organizational Unit' = ddOrgUnit.Selected.Value),
        (IsBlank(ddCareerPath.Selected.Value) || 'Career Path' = ddCareerPath.Selected.Value),
        (IsBlank(ddDevelopmentPool.Selected.Value) || 'Development Pool' = ddDevelopmentPool.Selected.Value),

        // Promotion toggle
        (!tglPromotionOnly.Value || 'Promotion Candidate' = true),

        // Free-text search across candidate name and identifier
        (
            IsBlank(q) ||
            StartsWith(Lower('First Name'), q) ||
            StartsWith(Lower('Last Name'), q) ||
            StartsWith(Lower('Global ID'), q)
        )
    )
)
```

Note: if your logical/display names differ, use your exact Dataverse column names.

## Candidate row fields (gallery template)

Add labels in each gallery row:

- `ThisItem.'First Name'`
- `ThisItem.'Last Name'`
- `ThisItem.'Global ID'`
- `Coalesce(ThisItem.Country, ThisItem.'Organizational Unit')`
- `Coalesce(ThisItem.'Career Path', ThisItem.'Development Pool')`

On row select (`galCandidates.OnSelect`):

```powerfx
Set(varSelectedCandidate, ThisItem);
Navigate(scrCandidateDetails, ScreenTransition.Fade)
```

## Header button formulas

```powerfx
// btnUploadExcel.OnSelect
Navigate(scrExcelUpload, ScreenTransition.Fade)

// btnRefreshData.OnSelect
Refresh(doj5wz_employeetalentprofile);
Refresh(doj5wz_notes1);
Notify("Data refreshed", NotificationType.Success)
```

## 5) Screen 2 - Candidate Details

## Header

- Candidate name label:

```powerfx
Coalesce(varSelectedCandidate.'First Name', "") & " " & Coalesce(varSelectedCandidate.'Last Name', "")
```

- Global ID label:

```powerfx
"Global ID: " & Coalesce(varSelectedCandidate.'Global ID', "")
```

- Edit button `btnEditCandidate.OnSelect`:

```powerfx
EditForm(frmCandidate)
```

## Details section (2-column)

Insert `Edit form` named `frmCandidate`:

- Data source: `doj5wz_employeetalentprofile`
- Item:

```powerfx
varSelectedCandidate
```

- Columns: 2
- Group form cards visually into:
  - Identity
  - Organization
  - Talent Information

Suggested fields (adjust to your table schema):

- Identity: First Name, Last Name, Global ID
- Organization: Country, Legal Entity, Organizational Unit
- Talent Information: Career Path, Development Pool, Promotion Candidate

Save button for form updates:

```powerfx
SubmitForm(frmCandidate)
```

Form `OnSuccess`:

```powerfx
Set(varSelectedCandidate, frmCandidate.LastSubmit);
Notify("Candidate updated", NotificationType.Success)
```

## Notes section

Controls:

- Search input `txtNoteSearch` (hint: `Search notes`)
- Button `btnAddNote` (opens modal)
- Gallery `galNotes`

`galNotes.Items`:

```powerfx
With(
    { q: Lower(Trim(txtNoteSearch.Text)) },
    SortByColumns(
        Filter(
            doj5wz_notes1,
            // Replace 'Candidate' with the actual lookup column in doj5wz_notes1
            'Candidate'.doj5wz_employeetalentprofileid = varSelectedCandidate.doj5wz_employeetalentprofileid,
            IsBlank(q) ||
            q in Lower(Title) ||
            q in Lower(Description)
        ),
        "createdon",
        SortOrder.Descending
    )
)
```

Inside each note row show:

- Title: `ThisItem.Title`
- Description: `ThisItem.Description`
- Author: `ThisItem.'Created By'.'Full Name'`
- Date/time: `Text(ThisItem.CreatedOn, "yyyy-mm-dd hh:mm")`

Note: Dataverse system columns like Created By / Created On are auto-populated.

## Add Note modal dialog

Use a container popup controlled by variable `varShowAddNoteDialog`.

`btnAddNote.OnSelect`:

```powerfx
Set(varShowAddNoteDialog, true)
```

Modal controls:

- `txtNewNoteTitle`
- `txtNewNoteDescription` (multiline)
- `btnSaveNote`
- `btnCancelNote`

`btnSaveNote.OnSelect`:

```powerfx
Patch(
    doj5wz_notes1,
    Defaults(doj5wz_notes1),
    {
        Title: txtNewNoteTitle.Text,
        Description: txtNewNoteDescription.Text,
        // Replace 'Candidate' with your actual lookup field name
        Candidate: varSelectedCandidate
    }
);
Reset(txtNewNoteTitle);
Reset(txtNewNoteDescription);
Set(varShowAddNoteDialog, false);
Notify("Note added", NotificationType.Success)
```

`btnCancelNote.OnSelect`:

```powerfx
Set(varShowAddNoteDialog, false)
```

## 6) Excel Upload Placeholder Screen

Screen: `scrExcelUpload`

Add:

- Header title: `Excel Upload`
- Informational text block:
  - "This screen is a placeholder. Excel upload will be implemented via Power Automate."
  - "Intended behavior:"
  - "1) New records -> create in doj5wz_employeetalentprofile"
  - "2) Existing and same -> discard"
  - "3) Existing and different -> user review"
- Disabled button: `Upload (Coming Soon)`
- Back button to `scrTalentOverview`

## 7) Attribute Management Placeholder Screen

Screen: `scrAttributeAdmin`

Add:

- Header: `Attribute Management`
- Minimal section cards with labels:
  - Career Path
  - Development Pool
- Placeholder text: `Management UI placeholder - logic to be implemented later.`
- Optional mock controls (disabled Add/Edit/Delete buttons)

No data-write logic required yet.

## 8) Navigation Map

- `scrTalentOverview` -> candidate select -> `scrCandidateDetails`
- `scrTalentOverview` -> Upload Excel button -> `scrExcelUpload`
- `scrTalentOverview` -> Admin button (optional) -> `scrAttributeAdmin`
- Detail/placeholder screens include `Back` button to `scrTalentOverview`

## 9) Bosch-Style Visual Guidelines (Clean and Minimal)

- Neutral background with high contrast text
- Use one primary accent color for actions
- Tight spacing grid and clear alignment
- Avoid heavy shadows; use subtle borders and section dividers
- Keep typography consistent and compact for management overview

Suggested app theme settings:

- Base font: Segoe UI or Bosch corporate font if available
- Primary button fill: dark neutral
- Secondary button: outline
- Section cards: white/light gray with 1px border

## 10) Data Governance and Users

- Uses existing Dataverse auditing (no custom audit logic in app)
- All current users can edit
- Role-based restrictions can be introduced later using security roles and/or UI conditions

## 11) Field Name Mapping Checklist

Before finalizing formulas, confirm exact logical/display names in your Dataverse tables for:

- Main table:
  - First Name
  - Last Name
  - Global ID
  - Country
  - Legal Entity
  - Organizational Unit
  - Career Path
  - Development Pool
  - Promotion Candidate (Yes/No)
  - Primary key (`doj5wz_employeetalentprofileid` assumed)
- Notes table:
  - Title
  - Description (multiline text)
  - Lookup to candidate (`Candidate` assumed)
  - Created On, Created By

If names differ, keep structure the same and replace only field identifiers.