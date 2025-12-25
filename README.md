# Q-GATE: Post-Quantum Authentication Ecosystem

Q-GATE is a state-of-the-art authentication system designed to be resilient against future quantum computing attacks. This repository contains the full stack ecosystem.

## Project Structure

- **`backend/`**: Node.js Express server using Crystals-Dilithium (ML-DSA) for post-quantum signatures and Redis for robust session management.
- **`q-gate-mobile/`**: React Native (Expo) mobile application that acts as the secure hardware key, leveraging device TEE/Secure Enclave for private key storage.
- **`QGate_Web_Client/`**: A reference web application demonstrating "Sign in with Q-Gate" integration and secure session handling.
- **`qgate-sdk/`**: Lightweight JavaScript SDK for 3rd-party service consumers.
- **`CONSUMER_API_GUIDE.md`**: Guide for 3rd-party developers and service integrations.
- **`PROVIDER_API_GUIDE.md`**: Internal guide for QGate system administration and mobile app protocols.

## Key Features

- **Quantum Resistance**: Uses NIST-approved Crystal-Dilithium for all cryptographic signatures.
- **No Passwords**: Authentication is based on "Something you have" (Device) + "Something you are" (Biometrics), eliminating phishing risks.
- **Instant Revocation**: Real-time session management via Redis allows for immediate logout across all devices.
- **Self-Healing Identity**: Mnemonic-based identity recovery ensures users nunca lose access to their Q-IDs.

## Running Locally

### Backend
1. Ensure MongoDB and Redis are running (local or cloud).
2. Configure `backend/.env` with your connection strings.
3. Run:
```bash
cd backend
npm install
npm run dev
```

### Mobile App
```bash
cd q-gate-mobile
npm install
npx expo start
```

### Web Client
```bash
cd QGate_Web_Client
npm install
npm run dev
```

### API & SDK
- Refer to [CONSUMER_API_GUIDE.md](file:///c:/Users/Chandu/projects/QGATE/QGATE/CONSUMER_API_GUIDE.md) for public integration specs.
- Internal protocols are documented in [PROVIDER_API_GUIDE.md](file:///c:/Users/Chandu/projects/QGATE/QGATE/PROVIDER_API_GUIDE.md).
- Check [qgate-sdk/index.html](file:///c:/Users/Chandu/projects/QGATE/QGATE/qgate-sdk/index.html) for a working SDK demo.
