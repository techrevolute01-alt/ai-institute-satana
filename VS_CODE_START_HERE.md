# Skillora — Run locally in VS Code (Windows)

## Fastest way
1. Extract the whole `Skillora-VSCode-Ready.zip` file. Keep the `aiinstitutesatana2-main` folder intact.
2. Install **Node.js LTS** if it is not already installed: https://nodejs.org/
3. Open VS Code → **File → Open Folder** → select `aiinstitutesatana2-main`.
4. Double-click `RUN_PROJECT.bat` in File Explorer. The first run installs npm dependencies automatically, then starts the development server.
5. Open the local URL printed in the terminal (usually `http://localhost:5173`). Keep the terminal window open while using the app.

## Run from the VS Code terminal instead
Open **Terminal → New Terminal** in the project folder and run:

```bash
npm install
npm run dev
```

For a production build check:

```bash
npm run build
```

## Supabase configuration
The project expects Supabase environment variables in `.env`. This archive includes the `.env` file that was in the uploaded project. If you move to another Supabase project, update the values in `.env` with that project's URL and publishable/anon key. Never put a Supabase `service_role` key in a frontend `.env` file.

## Troubleshooting
- **`node` or `npm` not found:** install Node.js LTS, close and reopen VS Code, then retry.
- **Port 5173 already in use:** Vite will normally offer another local port; open the URL it prints.
- **Dependencies fail to install:** check internet access, then run `npm install` again in the terminal.
- **Supabase/auth/data errors:** check that the `.env` values are valid and that required Supabase migrations have been applied to the matching project.

This launcher starts the development server; it does not deploy the site publicly.
