# Security and privacy notes

- Never commit `.env`, tokens, passwords, API keys or student data.
- The browser bundle must not contain service-role keys.
- Local browser storage is not encrypted and can be read by anyone with access to the browser profile/device.
- Do not upload identifiable school records to an AI provider without informed permission and a clear privacy policy.
- Before cloud accounts, implement server-side authorization and database row-level security.
- Export and deletion features should be tested before real users depend on the app.
- Consider parental consent and applicable privacy obligations before collecting data from minors.
- The optional AI adapter is off by default. Its key is held in `sessionStorage` for the life of the tab and is never stored in the app state, backups or the repository; anyone with access to the open browser profile can still read it.
- Text is sent to the AI service only after the learner confirms each request; only the source text in the import window is sent.
- Do not ship a build with a provider key. For shared use, route requests through a proxy that holds the key server-side and applies rate limits.
