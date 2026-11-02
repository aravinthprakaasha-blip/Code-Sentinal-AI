<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# CodeSentry AI

CodeSentry AI is a Vite-powered React application for static code analysis.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies with Bun (`bun install`) or npm (`npm install --legacy-peer-deps`).
2. Start the development server with `npm run dev`.
3. Run checks with `npm run lint`, `npm test`, and `npm run build`.

## Deploy to Vercel

This repository deploys as a static Vite site; the build output is `dist`. The
included [vercel.json](./vercel.json) rewrites application routes to the Vite
entry point so client-side navigation also works on direct visits and refreshes.

1. Push this repository to GitHub.
2. In Vercel, select **Add New → Project**, import this GitHub repository, and
   keep the detected Vite settings:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Deploy the project.
4. In Firebase Console, add the deployed Vercel hostname (for example,
   `your-project.vercel.app`) to **Authentication → Settings → Authorized
   domains**. Enable the authentication providers the app uses.
5. Redeploy after changing environment variables or Firebase configuration.

The Firebase web configuration in `firebase-applet-config.json` is used by the
browser app. Configure Firebase Authentication providers and Firestore rules
in the Firebase project before inviting users.

### Gemini API key

The current Gemini integration runs in the browser. Do **not** add a private
`GEMINI_API_KEY` as a Vercel environment variable expecting it to stay secret.
Vite's `VITE_*` variables are embedded in public client assets and can be
extracted by visitors. Without a Gemini key, AI features use the app's local
fallback responses. To use Gemini securely in production, move Gemini requests
behind an authenticated server-side endpoint and keep the key only in that
server environment.

The Python `backend` directory currently contains data models only; it is not a
server or API deployed by this Vercel configuration.
