# QGATE Consumer API Documentation (v1.0)

This guide is for **Service Consumers** and **Third-Party Developers** looking to integrate "Sign in with Q-Gate" into their applications.

## Authentication Integration

### 1. Initiate "Auth with Q-Gate"
`POST /api/auth/initiate-generic`

Starts a login challenge. Use this to generate a QR code for the user to scan with their QGate app.

- **Request Body:** None
- **Response (200 OK):**
  ```json
  {
    "sessionId": "uuid",
    "nonce": "base64-string"
  }
  ```

### 2. Real-time Authentication (WebSockets)
QGATE uses Socket.io for real-time authentication events. Use this to detect when a user has scanned the QR code and signed the challenge.

1. **Connect** to the QGate Backend.
2. **Join** the session room:
   ```javascript
   socket.emit('join', sessionId);
   ```
3. **Listen** for the `authenticated` event:
   ```javascript
   socket.on('authenticated', (sessionToken) => {
     // User is verified! use sessionToken for /api/me
   });
   ```

### 3. Verify Identity (Direct)
`POST /api/verify`

If you are performing a handshake directly (not via QR), use this to verify a quantum signature.

- **Request Body:**
  ```json
  {
    "sessionId": "uuid",
    "signature": "base64-string"
  }
  ```

### 4. Get User Profile
`GET /api/me`

Returns the profile of the currently authenticated user.

- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "userId": "QID-XXXXXX",
    "username": "string",
    "status": "authenticated"
  }
  ```

## SDK Integration
For a simpler integration, use the [QGate Web SDK](file:///c:/Users/Chandu/projects/QGATE/QGATE/qgate-sdk/qgate-auth-sdk.js).
