# Rosogolla

Rosogolla is an AI chat workspace with a black-and-lime palette and an audio-reactive orb, an original motion intro, and local chat history powered by OpenRouter.

## Run locally

Run `npm start` from this directory with Node.js 22 or later. Open `http://localhost:4173`.

Configure an [OpenRouter API key](https://openrouter.ai/keys). For local runs, copy `.env.example` to the ignored `.env` file and fill in `OPENROUTER_API_KEY`. For hosted Rosogolla, set `OPENROUTER_API_KEY` as a private runtime secret. Chat uses this server-managed key for all authorized site visitors.

To configure an alternative model, set `OPENROUTER_MODEL` (defaults to `openrouter/free`).

To activate **Sign in with Google**, create a [Google OAuth Web client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), add the app's exact origin to Authorized JavaScript origins, and set `GOOGLE_CLIENT_ID` in `.env` or the hosted runtime. Restart or redeploy to load it. The server verifies Google's ID token. Chat history is stored in the browser, with separate guest and signed-in histories.

## In the workspace

- OpenRouter requests default to `openrouter/free`, configurable via `OPENROUTER_MODEL`. Open **Token usage** for a conversation's input, output and total tokens as reported by OpenRouter.
- Attach PDFs, text files or images using the paperclip. Four attachments can total up to 5 MB per message. The browser saves attachment names in history, while the file contents are kept in memory for the current tab. Text attachments are included directly and images are encoded as data URLs for vision-compatible models.
- Use the microphone to dictate where the browser supports speech recognition. Say **“send message”** to submit.
- Search titles or text from the sidebar. Use the magnifier in a conversation to step through matching words. Export the selected conversation as a Markdown transcript.
- Run `npm run check` for source checks or `npm run build` to produce the Sites Worker at `dist/server/index.js`.
