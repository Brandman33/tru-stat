# tru-stat

The UK's key official figures on one page. Every number links to the government body that published it and shows the date it was published.

## What's in this folder

```
tru-stat/
├── public/                 ← the website
│   ├── index.html          ← the page (styles and scripts included)
│   ├── data/dashuk.json    ← saved figures: every number, its period, date and source
│   ├── fonts/              ← Open Sans (SIL Open Font Licence, see OFL.txt)
│   └── _headers            ← caching and security headers for Cloudflare
└── functions/api/live.js   ← fetches the latest figures from the ONS and Bank of England
```

## How "live" works

When someone opens the page, it shows the saved figures straight away, then asks `/api/live` for newer ones.

`/api/live` runs on Cloudflare. It fetches these straight from the official sources, and keeps the answer for an hour:

| Figure | Source | Series |
|---|---|---|
| Inflation (CPI) | ONS | D7G7 |
| Core inflation | ONS | DKO8 |
| Unemployment rate | ONS | MGSX |
| GDP growth (quarter on quarter) | ONS | IHYQ |
| GDP growth on a year ago | ONS | IHYR |
| Borrowing in a month | ONS | J5II |
| National debt (£) | ONS | HF6W |
| Debt as % of GDP | ONS | HF6X |
| Interest rate (Bank Rate) | Bank of England | IUDBEDR |

A live figure replaces the saved one only if it was published on the same day or later. Live figures get a green dot on their date. If a source doesn't answer, the page keeps the saved figure, so nothing breaks.

Everything else is updated by editing `data/dashuk.json` and redeploying: tax, welfare, aid, immigration, prisons, health and talking points. These figures are mostly published monthly, quarterly or yearly, as PDFs or spreadsheets, with no live feed.

## Put it on Cloudflare

The live function needs Cloudflare **Pages with Functions**. The drag-and-drop upload in the dashboard only publishes the `public` folder. The site would work, but only with the saved figures.

**Option 1: from your computer** (needs Node.js)

```
cd tru-stat
npx wrangler login
npx wrangler pages deploy public --project-name tru-stat
```

Run it from the `tru-stat` folder, so the `functions` folder is uploaded too. Your site appears at `https://tru-stat.pages.dev`, and you can add your own domain under the project's *Custom domains*.

**Option 2: from GitHub**

Put this folder in a GitHub repository. Then in Cloudflare go to *Workers & Pages → Create → Pages → Connect to Git*:

- Framework preset: *None*
- Build command: leave empty
- Build output directory: `public`

Cloudflare finds the `functions` folder automatically. Every push to the repository redeploys the site, so updating `data/dashuk.json` there updates the site.

## Check the live feed

Open `https://<your-site>/api/live`. You'll see the figures it found and any sources that failed, under `errors`. If a source keeps failing, its address may have changed. The page carries on with the saved figure in the meantime.

## Checking and corrections

- `functions/api/live.js` runs three automatic checks before a live figure is used: a plausible range, a maximum jump from the saved figure, and that it is at least as new. Anything that fails is listed under `held_back` at `/api/live`, and the page shows it as "held back for a manual check".
- `data/dashuk.json` has a `verification` section: for each figure id, `status` ("verified" or "second_hand"), `checked_on` (YYYY-MM-DD), `official_source`, `quote` and `table_or_series`. Cards show a green tick when verified, amber otherwise.
- `data/dashuk.json` has a `corrections` list: `date`, `figure`, `change`, `reason`. It appears on the page as the public corrections log.

## Updating the saved figures

Each entry in `data/dashuk.json` under `figures` holds:

`label`, `value`, `prev_value`, `prev_label`, `period`, `published` (YYYY-MM-DD), `next_update`, `source` and `url`.

Change the numbers and dates, keep the official source link, and redeploy. Keep `snapshot_date` at the date of your update.

## Principles

- Official sources only: the ONS, government departments, the Bank of England, UKHSA, the Met Office, the National Audit Office, the Information Commissioner and Parliament. Party, campaign and think-tank figures are never used as sources.
- Every figure shows its period, its publication date and a link to the original.
- No commentary and no colouring for political judgements. Green and red are used only where there's broad agreement on which direction is good: inflation, unemployment, growth and illness.
- Rings and pies only ever show a real share of a whole, or progress towards a stated target.
