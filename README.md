# PIP Vietnam Admin

Interactive map tool for resolving Vietnamese administrative boundaries via point-in-polygon lookup.

**Live:** <https://skytik.github.io/pip-vietnam-admin/>

## What it does

Click any point on the Vietnam map to resolve administrative units under two schemas:

- **2026 (new, 2-tier):** Province and Ward (post-merge boundaries).
- **Pre-2025 (old, 3-tier):** Province, District, and Ward/Commune.

Results appear in a side panel with statistics and the resolved ward polygon highlighted on the map. All lookups call the `point-in-polygon` Go API backend.

## Configure

Edit `config.js` and set `API_BASE_URL` to your deployed backend:

```js
window.PIP_CONFIG = {
  API_BASE_URL: "https://your-backend.example.com"
};
```

No trailing slash. The frontend calls `POST ${API_BASE_URL}/lookup` (JSON body `{lon, lat}`) and `GET ${API_BASE_URL}/geometry/{code}`.

## Backend requirements

- **HTTPS required.** GitHub Pages is served over HTTPS. Browsers block requests from an HTTPS page to an HTTP backend (mixed content). Your backend must be served over HTTPS for the deployed site to work.
- **CORS.** Set the `PIP_CORS_ORIGIN` environment variable on the Go service to the Pages origin (origin only, no path):

  ```
  PIP_CORS_ORIGIN=https://skytik.github.io
  ```

  This allows the browser preflight (`OPTIONS`) and actual requests to succeed.

## Local development

1. Start the `point-in-polygon` backend with permissive CORS:

   ```bash
   PIP_CORS_ORIGIN=* go run ./cmd/server
   ```

2. Keep `config.js` pointing at localhost:

   ```js
   API_BASE_URL: "http://localhost:8090"
   ```

3. Serve the site from this directory:

   ```bash
   python3 -m http.server 8000
   ```

4. Open <http://localhost:8000> in a browser.

## Deploy

Push to `main` and the GitHub Actions workflow publishes the site to Pages automatically.

**One-time setup:** In the repository Settings, go to **Pages** and set **Source** to **GitHub Actions**.

## Note

GeoJSON data files are **not** in this repository. They live with the `point-in-polygon` backend and exceed GitHub's 100 MB file-size limit. No secrets are committed here.
