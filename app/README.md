# HoshimiStation Translator

SvelteKit UI for editing translation units extracted from `res/masterdb` and `res/adv/resource`.

The SQLite database lives at:

```text
../data/hoshimi.sqlite3
```

## Run

From the repository root:

```powershell
npm run dev
```

Open `http://127.0.0.1:5174`.

If the Vite dev server has module loading issues, use the stable build/preview mode:

```powershell
npm run serve
```

Rebuild the database:

```powershell
npm run import-db
```
