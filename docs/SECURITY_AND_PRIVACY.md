# Security and privacy notes

- Never commit `.env`, tokens, passwords, API keys or student data.
- The browser bundle must not contain service-role keys.
- Local browser storage is not encrypted and can be read by anyone with access to the browser profile/device.
- Do not upload identifiable school records to an AI provider without informed permission and a clear privacy policy.
- Before cloud accounts, implement server-side authorization and database row-level security.
- Export and deletion features should be tested before real users depend on the app.
- Consider parental consent and applicable privacy obligations before collecting data from minors.
