# USION

USION is a Gemini chat and live voice workspace with a bronze palette, an original motion intro, and local chat history.

## Run locally

Run `npm start` from this directory with Node.js 22 or later. Open `http://localhost:4173`.

Open **Settings** and connect a [Gemini API key](https://aistudio.google.com/app/apikey). The tab keeps the key in memory until reload or disconnect. For a local installation with a preconfigured key, copy `.env.example` to `.env` and fill in `GEMINI_API_KEY`. Hosted installations should use the platform's private runtime configuration for a shared key.

To activate **Sign in with Google**, create a [Google OAuth Web client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), add the app's exact origin to Authorized JavaScript origins, and set `GOOGLE_CLIENT_ID` in `.env` or the hosted runtime. Restart or redeploy to load it. The server verifies Google's ID token. Chat history is stored in the browser, with separate guest and signed-in histories.

## In the workspace

- Gemini requests use the model's advertised maximum temperature, with a fallback of 2 where model metadata is unavailable. Open **Token usage** for a conversation's input, output, thinking and total tokens as reported by Gemini.
- Attach PDFs, text files or images using the paperclip. Four attachments can total up to 5 MB per message. The browser saves attachment names in history, while the file contents are kept in memory for the current tab.
- Use the microphone to dictate where the browser supports speech recognition. Say **“send message”** to submit. **Live voice** opens a Gemini audio-to-audio session using a short-lived token and requires microphone access on HTTPS or localhost.
- Search titles or text from the sidebar. Use the magnifier in a conversation to step through matching words. Export the selected conversation as a Markdown transcript.
- Run `npm run check` for source checks or `npm run build` to produce the Sites Worker at `dist/server/index.js`.
