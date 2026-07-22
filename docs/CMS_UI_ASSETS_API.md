# CMS / UI Asset Images — API Documentation

This document describes backend fields and endpoints added so the customer webapp can load all UI illustrations from CMS / Master Sheet instead of hardcoded assets.

Base customer API prefix: `/api/v1/customer`  
Admin API prefix: `/api/v1/customer/admin` (gateway may expose as `/customer/admin/...`)

---

## 1. Collection cover images

### Schema (`customer_collections`)

| Field | Type | Description |
|-------|------|-------------|
| `imageUrl` | `string` | Cover / hero image for collection landing pages |

### Customer API

`GET /collections/:slug`

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "High Nutrition",
    "slug": "high-nutrition",
    "imageUrl": "https://…/collections/cover.jpg",
    "products": [],
    "pagination": {}
  }
}
```

### Admin API

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/admin/cms/collections` | Body may include `imageUrl` |
| `PUT` | `/admin/cms/collections/:id` | Body may include `imageUrl` |
| `GET` | `/admin/cms/collections` | Returns `imageUrl` |

Upload cover via existing product image upload, or paste a public URL:
`POST /admin/home/upload-product-image` → `{ image: "<base64>" }` → `{ data: { url } }`

### Master Sheet (CMS Pages import)

Sheet: **Collections**  
Recognized image columns (any one):

- `Image URL`
- `ImageUrl`
- `Cover Image`
- `Cover Image URL`
- `imageUrl`

Values must contain `http` to be written to `imageUrl`.

---

## 2. App Config UI illustrations

### Schema (`systemconfigs` → `images`)

| Field | Description |
|-------|-------------|
| `placeholderUrl` | Generic product placeholder |
| `outOfStockImageUrl` | Overlay / badge when product is OOS |
| `emptyCartImageUrl` | Empty cart screen |
| `emptyOrdersImageUrl` | Empty orders list |
| `emptyNotificationsImageUrl` | Empty notification inbox |
| `emptySearchImageUrl` | Empty search results |
| `emptyWishlistImageUrl` | Empty wishlist (reserved) |
| `errorImageUrl` | Error / retry screens |
| `noProductsImageUrl` | Category/collection with no products |

### Related fields

| Path | Description |
|------|-------------|
| `wallet.imageUrl` | Wallet screen illustration |
| `paymentMethods[].imageUrl` | Payment method artwork (preferred over `icon`) |
| `supportCategories[].imageUrl` | Help category artwork (preferred over `icon`) |

### Customer APIs that return these fields

- `GET /app-config`
- `GET /bootstrap` → `appConfig`

`images`, `wallet`, and `imageUrl` on payment/support rows are always normalized (empty string when unset).

### Admin APIs

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/admin/app-config` | Full config including `images` |
| `PUT` | `/admin/app-config` | Full replace / merge via `$set` |
| `PUT` | `/admin/app-config/section/:section` | Sections: `images`, `wallet`, `paymentMethods`, `supportCategories`, … |
| `POST` | `/admin/app-config/upload-image` | Upload CMS illustration |

#### Upload CMS image

`POST /admin/app-config/upload-image`

Request:

```json
{
  "image": "data:image/png;base64,…",
  "folder": "cms-images"
}
```

Response:

```json
{
  "success": true,
  "data": { "url": "https://….amazonaws.com/cms-images/….png" }
}
```

Dashboard: **Customer App Settings → Images** tab (also empty-cart / empty-search fields on Checkout / Search tabs).

---

## 3. User profile avatar

### Schema (`customer_users`)

| Field | Type | Description |
|-------|------|-------------|
| `avatarUrl` | `string` | Public S3 URL of profile photo |

### Customer APIs

| Method | Path | Auth | Body / response |
|--------|------|------|-----------------|
| `GET` | `/user/profile` | Yes | Includes `avatarUrl` |
| `PUT` | `/user/profile` | Yes | May set `avatarUrl` or alias `profileImageUrl` |
| `POST` | `/user/profile/avatar` | Yes | `{ "image": "<base64>" }` → updated user |

Example upload response:

```json
{
  "success": true,
  "data": {
    "_id": "…",
    "name": "Ada",
    "email": "ada@example.com",
    "phoneNumber": "9876543210",
    "avatarUrl": "https://…/customer-avatars/…/….jpg"
  }
}
```

S3 folder: `customer-avatars/{userId}/`  
Bucket: `AWS_S3_BUCKET_CUSTOMER_AVATARS` (falls back to product images bucket).

---

## 4. Database migration

No separate migration script is required.

- Mongoose schemas gained optional string fields with defaults `''`.
- Existing MongoDB documents continue to work; missing keys resolve to empty strings via app defaults / `normalizePublicConfig`.
- To backfill: set URLs in Admin Dashboard, or re-import Master Sheet Collections with an Image URL column.

---

## 5. Frontend consumers (webapp)

| Screen | CMS field |
|--------|-----------|
| Collection hero | `collection.imageUrl` |
| Product OOS | `images.outOfStockImageUrl` |
| Empty cart | `images.emptyCartImageUrl` |
| Empty orders | `images.emptyOrdersImageUrl` |
| Empty notifications | `images.emptyNotificationsImageUrl` |
| Empty search | `images.emptySearchImageUrl` |
| No products | `images.noProductsImageUrl` |
| Error state | `images.errorImageUrl` |
| Wallet | `wallet.imageUrl` |
| Payment methods | `paymentMethods[].imageUrl` |
| Help categories | `supportCategories[].imageUrl` |
| Profile | `avatarUrl` |
| Brand logo | `branding.splashLogoUrl` (existing) |

Local Lucide / emoji / bundled logo remain **fallbacks only** when the CMS URL is empty.
