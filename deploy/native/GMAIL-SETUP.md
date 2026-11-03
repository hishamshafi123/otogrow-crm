# Connect Gmail to Otogrow OS

The founder confirmed on2026-11-03 that Google OAuth is not configured and both personal Gmail and company Google Workspace accounts are needed. The application supports owner-selected Gmail conversations and reviewed replies; this guide configures the existing native Google connection. It does not establish live acceptance by itself.

## 1. Create the Google application

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create the project that Otogrow will own.
2. In **APIs & Services → Library**, enable **Gmail API** and **People API**. The native sender uses People API to obtain the sender's display name. Leave Calendar integration off unless the business chooses to use it.
3. Open **Google Auth Platform → Branding**. Use the actual Otogrow application name and your support/developer contact address. Add the authorized domain `otogrow.com`. Use real public homepage/privacy-policy URLs when Google requests them; do not invent a policy URL.
4. Under **Audience**, choose **External**, because personal Gmail users cannot use an Internal-only Workspace app. While testing, add each exact personal and company mailbox to **Test users**. Google Workspace administrators may separately need to allow the app for their organization.
5. Under **Clients**, create an **OAuth client ID → Web application**. A Gmail API key or service-account key does not replace this user-consent flow.
6. Add this exact **Authorized redirect URI**:

   ```text
   https://crm.otogrow.com/auth/google-apis/get-access-token
   ```

   This is the mail/calendar connection callback. If Google sign-in to the CRM is also deliberately enabled later, its separate callback is `https://crm.otogrow.com/auth/google/redirect`.
7. Keep the client ID and secret in the server's protected configuration. Do not put the secret in Git, a frontend build variable, screenshots or a chat message.

Google documents the [web client creation steps](https://developers.google.com/workspace/guides/create-credentials) and [exact redirect URI matching/server-side consent](https://developers.google.com/identity/protocols/oauth2/web-server).

## 2. Configure the deployed server

An authorized server operator adds the following settings to the existing root-managed `/etc/otogrow-crm/crm.env`, replacing both placeholders privately:

```dotenv
MESSAGING_PROVIDER_GMAIL_ENABLED=true
CALENDAR_PROVIDER_GOOGLE_ENABLED=false
AUTH_GOOGLE_CLIENT_ID=<the web OAuth client ID>
AUTH_GOOGLE_CLIENT_SECRET=<the web OAuth client secret>
AUTH_GOOGLE_APIS_CALLBACK_URL=https://crm.otogrow.com/auth/google-apis/get-access-token
```

These are configuration instructions, not an executable credentials file. Keep the environment file readable only by the existing authorized service/operations users. The GitHub release workflow ships code; it does not populate or replace this server environment file. `AUTH_GOOGLE_ENABLED` controls optional Google single sign-on and is not required just to connect Gmail.

After saving the real configuration, the operator restarts the existing API and worker services and checks their status and public health:

```bash
sudo systemctl restart otogrow-crm.service otogrow-crm-worker.service
sudo systemctl is-active otogrow-crm.service otogrow-crm-worker.service
curl --fail --silent --show-error https://crm.otogrow.com/healthz
```

Do not print the environment file or put secrets into command arguments. Native periodic synchronization and queued reply dispatch require the worker. Gmail Pub/Sub push configuration is a separate optional setup and is not required for this initial native connection.

## 3. Review the requested Google access

After the provider-scope update is deployed, with Gmail enabled and Calendar disabled, the current authorization/token-validation policy requires:

| Scope | Existing native operation |
| --- | --- |
| `email`, `profile` | Identify the consenting Google account and its profile |
| `https://www.googleapis.com/auth/gmail.readonly` | Synchronize the owner's messages |
| `https://www.googleapis.com/auth/gmail.send` | Send an explicitly reviewed reply |
| `https://www.googleapis.com/auth/gmail.compose` | Existing native draft operations |

Declare the matching enabled scopes under **Data Access**. Calendar events are requested only if `CALENDAR_PROVIDER_GOOGLE_ENABLED=true`; no browser option can enable a disabled server provider. Existing accounts with a wider grant remain compatible. The provider grants mailbox access to the owner-connected application; selected-thread employee/agent access is enforced separately inside Otogrow OS. Do not describe Google OAuth itself as granting access to only the selected threads.

External apps using sensitive/restricted scopes may require verification and a security assessment unless an applicable exception covers their use. Testing is for explicit test users, and Gmail refresh tokens issued to External apps in Testing normally expire after seven days. Resolve the actual intended production audience/verification requirements before relying on unattended long-term sync. See Google's [restricted-scope verification guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) and [refresh-token expiration rules](https://developers.google.com/identity/protocols/oauth2).

## 4. Connect and select conversations

1. Sign in to Otogrow as the mailbox owner and open **Settings → Accounts**.
2. Choose Google, sign in with an allowed test account, and review the consent screen. Keep the native account/message visibility private for founder mail. Do not give the team generic access to the mailbox.
3. Confirm the account's synchronization status and wait for native messages to appear. A configured flag alone does not prove Gmail is connected or that synchronization works.
4. In **Inbox**, select the intended client/project conversation, then connect an exact synchronized account/thread. The mailbox owner reviews the source and sets the maximum Read/Prepare/Send access. Sending is off by default.
5. Grant only the named staff/roles who need that conversation. Their effective access is the intersection of current conversation permissions and the owner's maximum; it does not expose other mailbox threads.
6. Inspect the exact messages, prepare a manual reply or explicitly selected-message AI draft, and review the fixed recipient/subject/body before a separate Send. Uncertain sends remain uncertain until exact positive Sent evidence is synchronized; do not resend blindly.

Initial acceptance must use a deliberately agreed test mailbox/recipient. Verify inbound synchronization, private unrelated-thread exclusion, an authorized employee's selected-thread access, access revocation and one explicitly authorized reply. Do not send a real client email just to test installation. No live account was connected or message sent while writing this guide.
