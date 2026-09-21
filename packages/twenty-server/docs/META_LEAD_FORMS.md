# Meta lead forms through Google Sheets

The workspace navigation includes **Meta lead forms** for members with the API keys and webhooks settings permission. Each connection reads one Google Sheet tab and keeps a submission list linked to CRM People. Existing direct Meta webhooks continue to work independently.

## Connect a form

1. Connect the Meta form to Google Sheets using your existing Meta-to-Sheets integration.
2. In a Google Cloud project, enable the Google Sheets API and create a service account. Download its JSON key. Share only the required sheet with the key's `client_email`, with Viewer access.
3. In the CRM, open **Meta lead forms → Add lead form**. Enter a name, paste the URL of the correct tab, and upload the JSON key. The server encrypts the key using workspace-bound encryption; GraphQL never returns it.
4. Choose whether to import existing rows. Importing existing rows also invokes setter assignment and its Telegram alerts. The default excludes the rows present when the connection is created.
5. In **Settings → Setters and Telegram**, enable the intended setter, configure active days/hours (UTC) and capacity, and link their Telegram chat using the existing bot setup. With one eligible setter, all new contacts are assigned to that setter.

The first sheet row must include `id`, `lead_id`, or `leadgen_id`, and at least one of `email`, `phone_number`, or `phone`. Use plain text for Meta IDs and phone numbers to preserve digits and leading plus signs. `full_name`, `first_name`, and `last_name` are recognized; other columns remain available in the submission's answers. Header spaces and hyphens are normalized to underscores. A Meta `l:` ID prefix is removed.

## Form tabs and unread leads

Each connected form has a tab inside **Meta lead forms**, with its total lead count and a red unread badge. Selecting a tab shows that form’s leads and answers in place. The selected form is preserved in the page URL. Tabs support arrow keys, Home, and End.

Counts and leads refresh every 15 seconds. New imported submissions are unread for each user separately. **Mark displayed leads as read** clears only the current page’s unread leads; other forms, other pages, and leads arriving concurrently stay unread. Read state persists across sessions. Updating an existing submission does not make it unread again.

## Sync behavior

- The queue worker polls active connections approximately every 30 seconds after the previous pass finishes. Meta's delivery into Sheets adds its own delay. This is not an instantaneous push integration.
- **Sync now** runs an immediate read; **Pause sync** stops automatic imports.
- Stable lead IDs prevent reordered rows from creating duplicate submissions. The same contact can appear under several forms.
- Changed answers update the submission. Contact name, email, phone, and form answers update only when the current CRM value still matches the previous sheet value, preserving subsequent manual CRM edits.
- Empty rows and rows awaiting contact details are skipped until complete. Missing or duplicate IDs report an error.
- Removing a sheet row does not delete its CRM submission or contact. A deleted CRM contact is not resurrected by a previously imported sheet submission.
- Existing excluded rows remain excluded even if edited later.
- Sheet leads without an eligible setter are reconsidered on subsequent polls. Assignment follows existing CRM rules: one assignment per person, represented by a task. A repeat form submission for an already-assigned person does not create another assignment.
- Telegram delivery is recorded on the assignment. Sheet polling retries pending notifications without creating another assignment. Concurrent sends are serialized; a crash after Telegram accepts a message but before its delivery timestamp is committed can still cause a repeat alert.
- The selected sheet tab must have no more than 50,000 allocated rows; reads cover columns A through ZZ.

## Lead actions and meeting booking

Click a lead name or **Manage lead** to open its details on the form page. Phone numbers open the existing CRM dialer with the linked person; placing calls requires the existing Twilio setup. Imported leads already exist in People, and the status selector edits that record using its configured status options and normal record permissions.

**Book a meeting** reads the signed-in member’s primary Google calendar live, expands recurring events, excludes busy/all-day/past times, and displays slots in the calendar’s timezone. Meeting hours default to 09:00–18:00 and can be changed in the planner. Date and duration changes clear the selected time. Calendar access failures block booking rather than showing unverified availability.

The server checks availability again before inserting the event and serializes CRM booking requests per calendar. External calendar changes can still race the final check because Google does not provide atomic slot reservations. Meetings remain on the booking member’s calendar. Selecting a teammate adds them as an attendee and creates a CRM meeting task assigned to them; their calendar availability is not checked. Invitations are sent to the person’s primary CRM email. Booking updates the person to `MEETING_BOOKED` and adds a timeline note. A failure in these CRM updates is reported as a warning alongside the successful calendar booking, avoiding an invitation retry.

## Deployment and verification

Use the repository's Node version (`.nvmrc`). Generate and apply the new fast instance command through the normal upgrade pipeline before starting the updated API and worker. Keep the workspace encryption key stable. Regenerate the frontend metadata GraphQL schema after the API is rebuilt.

After connecting a sheet, verify **Last synced** and any displayed error. Append one new row with a unique Meta lead ID, then verify the submission, linked Person, assigned task, and Telegram notification. Do not test against a real setter without intending to send an alert.

Troubleshooting: missing sheet access, disabled Sheets API, a deleted tab, invalid headers, or a stopped worker prevent sync. Paused or out-of-hours setters and daily caps prevent immediate assignment. An unlinked Telegram chat or inactive bot prevents an alert.

The current repository upgrade command does not keep `--dry-run` read-only: instance migrations and some standard metadata sync commands still execute. During local verification, both new migrations were applied and the standard lead metadata sync ran.
