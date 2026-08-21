# Upload API

Upload, list, and delete files in the `public-files` R2 bucket. Files are publicly accessible at `https://bucket.krsz.in/<key>` (driven by `BUCKET_URL` in `shared/site-config.ts`).

## Authentication

All requests require an `Authorization` header:

```
Authorization: Bearer <UPLOAD_API_KEY>
```

Set the secret via:

```bash
npx wrangler secret put UPLOAD_API_KEY
```

---

## `POST /api/upload`

Generate a presigned PUT URL to upload a file directly to R2 (valid for 5 minutes).

### Request

```bash
curl -X POST https://blog.krsz.in/api/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"filename":"avatar.png","contentType":"image/png"}'
```

### Body

| Field | Type | Required | Description |
|---|---|---|---|
| `filename` | string | yes | Object key. Path separators (`/`, `\`) are stripped |
| `contentType` | string | no | MIME type. Default: `application/octet-stream` |

### Response `200`

```json
{
  "url": "https://...r2.cloudflarestorage.com/public-files/avatar.png?...",
  "key": "avatar.png",
  "publicUrl": "https://bucket.krsz.in/avatar.png",
  "expiresIn": 300
}
```

### Upload the file

Use the returned `url` within 5 minutes:

```bash
curl -X PUT "<url>" \
  -H "Content-Type: image/png" \
  --data-binary @avatar.png
```

> The `Content-Type` must match the one used when generating the presigned URL.

---

## `GET /api/upload`

List files in the bucket. Supports prefix filtering.

### Request

```bash
curl https://blog.krsz.in/api/upload \
  -H "Authorization: Bearer <TOKEN>"

curl "https://blog.krsz.in/api/upload?prefix=images/" \
  -H "Authorization: Bearer <TOKEN>"
```

### Query Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `prefix` | string | no | Filter by object key prefix |

### Response `200`

```json
{
  "files": [
    {
      "key": "avatar.png",
      "size": 100482,
      "lastModified": "2026-06-23T10:00:00.000Z",
      "publicUrl": "https://bucket.krsz.in/avatar.png"
    }
  ]
}
```

---

## `DELETE /api/upload`

Delete a file from the bucket.

### Request

```bash
curl -X DELETE "https://blog.krsz.in/api/upload?filename=avatar.png" \
  -H "Authorization: Bearer <TOKEN>"
```

### Query Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `filename` | string | yes | Object key to delete |

### Response `200`

```json
{
  "deleted": "avatar.png"
}
```

---

## Errors

All endpoints return `401` if the `Authorization` header is missing or invalid:

```json
{ "error": "Unauthorized" }
```

`POST` returns `400` when `filename` is missing. `DELETE` returns `400` when `filename` query param is missing.

```json
{ "error": "filename is required" }
```
