# Psipedia deployment source

- The canonical repository is `investradarsk/psipedia-sk` on branch `main`.
- Before changing source, fetch and compare GitHub `main` with any Sites checkout so newer work from either side is preserved.
- Every production change must pass the existing build, be committed, and be pushed to GitHub `main`.
- Use the existing Cloudflare project and bindings for production deployment. Do not create a replacement repository or Cloudflare project.
- If a Sites checkpoint is also required, synchronize the exact GitHub `main` source state first; GitHub remains the source of truth.
