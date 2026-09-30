# VRChat world → guestbook API

The player types a message into a text field in the world; on submit the world sends one GET request. A message on an intact template is posted to the guestbook; anything else (blank message, mangled template) just leaves a footprint.

## Request

`GET https://blog.krsz.in/api/vrchat?msg=<padding spaces>Your message (Optional): <message>`

The world can only request a URL that was fixed when the world was uploaded or that the player typed into a URL input field, and it cannot build one in code. So the input field is **prefilled** with the template and the player types at the end of it. The prefilled text is `https://blog.krsz.in/api/vrchat?msg=`, then a run of spaces, then `Your message (Optional): ` (with a trailing space). The request is exactly what is in the field when the player submits.

- The padding spaces are cosmetic: **any number works, even zero**; the server ignores the count.
- The label `Your message (Optional):` must match **exactly, case-sensitive**. Keep a space after the colon.
- The client is assumed to send each space as `%20`.

| Field content | Result |
|---|---|
| Template intact + message | posted → `message` |
| Template intact + empty / whitespace / only HTML tags | footprint → `footprint` |
| Label edited or deleted, text typed before it, `?msg=` changed, or no query | footprint |
| Message over 2000 characters | nothing registered → `too-long` |

- The whole text after the label is the message: `&`, `=`, `+` and a stray `%` are all fine. Only `#` is lost (the client never sends it or what follows).
- HTML tags are stripped and the message is trimmed.
- If the player edits the address part, the request goes elsewhere or 404s, which the world sees as a failed download.

**Stored:** a message is **public** immediately, credited to `VRChat Player` (no player name is sent or recorded). A footprint stores only a coarse country/time zone derived from the connection.

## Response

HTTP 200 with a JSON body `{"status":"..."}` and `Cache-Control: no-store`. Read only `status`.

| `status` | Meaning | Suggested text for the player |
|---|---|---|
| `message` | Message posted | "Message posted to the guestbook." |
| `footprint` | Footprint registered | "Footprint left." |
| `daily` | This IP's 5 registrations for the day are used up | "Daily limit reached (5). Come back tomorrow." |
| `too-long` | Message over 2000 characters | "Message too long (max 2000 characters)." |
| `rate` | More than 2 requests in 10 s | "Too fast. Try again in a few seconds." |
| `rejected`, `no-edge`, `error` (HTTP 500) | Failure | A generic "Something went wrong, please try again later." |

**Limits:** per IP, 5 successful registrations a day, messages and footprints counted together (resets 00:00 UTC); 2 requests per 10 s. Rejected requests do not use up the daily count.

## Using it from the world

Platform constraints that shape the usage: VRChat allows **one text download every 5 seconds** for the whole client (extra ones queue and run in random order); and `blog.krsz.in` is not a trusted domain, so players must enable **Allow Untrusted URLs** in VRChat settings, or every request fails.

What the world needs: a URL input field whose default text is the template (set in the editor; scripts cannot rewrite it afterwards), a submit button, and a status text.

Flow:
1. The player edits the field and presses the submit button.
2. If a cooldown is running, ignore the press. Otherwise start a cooldown of at least 6 seconds, disable the button for that time, and show "Sending...".
3. Request the URL currently in the field as a plain text download.
4. On success, parse the returned text as JSON, read the string `status`, and show the matching text from the table above. If it is not JSON or has no `status`, show the generic failure text.
5. On failure, show a failure text that includes the error code and the Allow Untrusted URLs hint.

Required behavior:
- Send **only on an explicit player action** (the button), never on join.
- Cool down **≥ 6 s** between sends, and keep other text downloads out of the world, or they delay each other.
- Put the **Allow Untrusted URLs** hint in the UI; many players will otherwise think the button is broken.
- The field is **not cleared** after a send; make "sent" obvious so players do not resend the same message (each send uses one of the day's 5).
- UI copy: "leave the message blank to just leave a footprint"; messages are public; a footprint records only a coarse location, no name.

## Verify first

These are not documented by VRChat, so they are assumptions. Test them in a real client with a bare field and button before building UI, and report any failure: each one fails silently (every call `rejected`, or every message becoming a footprint).

| # | Assumption | Sign it fails |
|---|---|---|
| 1 | The field's default text can be prefilled and typing appends | Field is empty |
| 2 | VRChat accepts a URL containing spaces | Every request fails (with Allow Untrusted URLs on) |
| 3 | Spaces are sent as `%20`, not `+` | A typed message shows up as a footprint only |
| 4 | The client's User-Agent does not start with `Mozilla/` | Every response is `rejected` |
| 5 | The request is made by the player's client | A footprint's country is not the player's (the API owner can see the country the server recorded) |

## Testing

Any HTTP client can test the API: send a GET to the template URL with the padding and label percent-encoded, using a User-Agent that does not start with `Mozilla/`.

This writes real, public data and uses up the day's 5 for your IP, so mark test messages clearly and ask the API owner to delete them. Wait 6 seconds between calls.

| Request | Expected `status` | Uses one of the day's 5 |
|---|---|---|
| Intact template + a message | `message` | yes |
| Intact template + empty message | `footprint` | yes |
| Label missing its colon, label deleted, or no query at all | `footprint` | yes |
| Message of 2001 characters | `too-long` | no |
| A User-Agent starting with `Mozilla/` (browser-like) | `rejected` | no |
| 6th successful registration of the day from one IP | `daily` | n/a |
| 3rd request within 10 seconds | `rate` | no |

The `rejected` case writes nothing, so it doubles as a side-effect-free check that the API is reachable.

## Do not

- Use POST, headers, secrets or tokens (the world cannot send them), or send a player name (the API takes none).
- Change the label or the `msg` parameter without a matching server change, or every message silently becomes a footprint.
- Rely on HTTP status codes: normal outcomes are all 200.
