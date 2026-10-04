# Deployment

Landscape Planner is a static, local-first browser application. It does not need
an application server or hosted database. GitHub Pages can host a public copy at
no charge when the source repository is public on GitHub Free.

The deployment workflow runs lint, unit tests, and the production build before
publishing `dist`. Generated build output remains an artifact and is not
committed to the repository.

## One-time GitHub setup

1. Create a **public** GitHub repository. A project repository will be published
   at `https://OWNER.github.io/REPOSITORY/`.
2. Connect this checkout and push `main`:

   ```powershell
   git remote add origin https://github.com/OWNER/REPOSITORY.git
   git push -u origin main
   ```

3. In the GitHub repository, open **Settings → Pages**. Under **Build and
   deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions**, select **Verify and deploy GitHub Pages**, and run it
   manually if the initial push occurred before Pages was enabled. Later pushes
   to `main` deploy automatically.
5. Open the URL shown by the deployment job and perform the release smoke test.

No deployment token or repository secret is required. The workflow uses the
short-lived GitHub token with read-only source access and grants Pages and OIDC
write permissions only to the deployment job.

## Base path

The workflow asks GitHub for the configured Pages base path and supplies it to
Vite through `VITE_BASE_PATH`. This supports ordinary project URLs such as
`/landscape-planner/`, account-root Pages sites, and a later custom domain.

To reproduce a project-site build locally:

```powershell
$env:VITE_BASE_PATH = '/landscape-planner/'
npm.cmd run build
Remove-Item Env:VITE_BASE_PATH
```

Do not commit `dist`; it is ignored and uploaded directly by the workflow.

## Release smoke test

After deployment:

1. Load the planner from the published HTTPS URL and confirm the scene renders.
2. Create or edit an object, enable instant exposure, and wait for the heatmap.
3. Run an accumulated direct/diffuse heatmap at coarse spacing.
4. Save a project JSON file, reload the site, and load the file again.
5. Confirm the browser's local recovery behavior and the no-GPU CPU path.
6. On a WebGPU-capable browser, run `?webgpu-validation` relative to the
   published URL and confirm the retained validation suite passes.

Project autosaves and catalogs remain in browser-local storage. They are not
uploaded to GitHub Pages or shared between devices. Browser storage is scoped to
the exact site origin, so data saved on `localhost`, the default `github.io`
address, and a future custom domain are separate. Export important projects to
JSON before changing the deployment domain.

The application contains no project-data upload or telemetry path. As with any
hosted site, GitHub receives ordinary web-request metadata when it serves the
static application.

## Cost and visibility

GitHub Pages is free for public repositories on GitHub Free. Standard
GitHub-hosted Actions runners are also free for public repositories. The site
and source code will be publicly accessible. Private-repository Pages hosting
requires a paid GitHub plan; if the source must remain private, distributing the
contents of `dist` or choosing another host should be evaluated instead.
