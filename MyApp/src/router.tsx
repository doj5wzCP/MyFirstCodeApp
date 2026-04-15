import { createBrowserRouter } from "react-router-dom"
import Layout from "@/pages/_layout"
import HomePage from "@/pages/home"
import CandidateDetailsPage from "@/pages/candidate-details"
import ExcelUploadPage from "@/pages/excel-upload"
import AttributeAdminPage from "@/pages/attribute-admin"
import NotFoundPage from "@/pages/not-found"

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "candidate/:candidateId", element: <CandidateDetailsPage /> },
      { path: "excel-upload", element: <ExcelUploadPage /> },
      { path: "attribute-admin", element: <AttributeAdminPage /> },
    ],
  },
], { 
  basename: BASENAME // IMPORTANT: Set basename for proper routing when hosted in Power Apps
})