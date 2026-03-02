# Sign-in OTP API — Postman / Real-time SMS

Base URL: `http://localhost:YOUR_PORT` (e.g. `http://localhost:3000` or your server URL).

**Important:** Set header `Content-Type: application/json` and send a JSON body.

---

## 1. Send OTP (real-time SMS)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/signin/send-otp`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
```json
{
  "mobileNumber": "9876543210"
}
```
- **Success (200):** `{ "message": "OTP sent successfully" }`
- **Error (400):** `{ "error": "mobileNumber must be exactly 10 digits", "hint": "..." }`
- **Error (500):** `{ "error": "Failed to send OTP via SMS", "hint": "..." }` — check `config.json` → `smsvendor` URL and gateway.

---

## 2. Verify OTP

- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/signin/verify-otp`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
```json
{
  "mobileNumber": "9876543210",
  "otp": "1234"
}
```
- **Success (200):** `{ "message": "OTP verified successfully", "userId": "...", "token": "JWT...", "isVerified": true/false, "name": "..." }`

---

## 3. Resend OTP

- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/signin/resend-otp`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
```json
{
  "mobileNumber": "9876543210"
}
```

---

## If Postman shows an error

1. **400 "mobileNumber must be exactly 10 digits"**  
   - Send a JSON body with key `mobileNumber` and a 10-digit string (e.g. `"9876543210"`).  
   - Set header `Content-Type: application/json`.

2. **500 "Failed to send OTP via SMS"**  
   - Backend could not accept the gateway response as success.  
   - Ensure `backend/src/config/config.json` has a valid `smsvendor` URL (with trailing `&`).  
   - Check gateway credentials and that the SMS API returns a success status (e.g. `status: "success"` or body containing "success"/"sent").

3. **Connection refused / ECONNREFUSED**  
   - Start the backend server and use the correct port in the URL.

4. **CORS**  
   - Backend allows `localhost`; for other origins set `ALLOWED_ORIGINS` in `.env`.
