import { Outlet, NavLink } from "react-router-dom"

export default function Layout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="h-14 border-b bg-background/90 backdrop-blur-sm flex items-center">
        <div className="mx-auto w-full max-w-7xl px-6 flex items-center justify-between">
          <div className="text-sm font-semibold tracking-wide">Talent Review Workspace</div>
          <nav className="flex items-center gap-6">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `text-sm ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              Talent Overview
            </NavLink>
            <NavLink
              to="/excel-upload"
              className={({ isActive }) =>
                `text-sm ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              Excel Upload
            </NavLink>
            <NavLink
              to="/attribute-admin"
              className={({ isActive }) =>
                `text-sm ${isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              Attribute Management
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex">
        <div className="flex-1 mx-auto w-full max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}