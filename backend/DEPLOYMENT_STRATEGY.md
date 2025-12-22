# Q-Gate Backend Deployment Strategy & Problem Analysis

This document outlines the production deployment strategy for the Q-Gate Post-Quantum Authentication backend and details the specific security problems this architecture solves compared to classical authentication systems.

---

## 1. Deployment Strategy (AWS Recommended)

To ensure scalability, resilience, and security in a real-world (college or enterprise) environment, we utilize a containerized cloud architecture.

### A. Compute Layer: AWS App Runner (or ECS)
*   **Service:** AWS App Runner.
*   **Why:** Fully managed container orchestration. It automatically builds and deploys the Docker container from the repository, handles load balancing, and scales instances up/down based on traffic.
*   **Configuration:**
    *   Environment Variables: `MONGO_URI` (Atlas), `REDIS_URL` (ElastiCache).
    *   Port: 5000.

### B. Database Layer: MongoDB Atlas
*   **Service:** MongoDB Atlas (Managed Service).
*   **Why:** Decouples data from the application container. Provides automated backups, point-in-time recovery, and high availability (replica sets) to prevent data loss if the backend crashes.

### C. Session Store: AWS ElastiCache (Redis)
*   **Service:** AWS ElastiCache for Redis.
*   **Why:** Stores ephemeral session data (Challenges and Opaque Tokens). Managed Redis ensures low-latency access and persistence independent of application restarts.

### D. Security Layer
*   **Application Level:** `helmet` (Headers) and `express-rate-limit` (DoS protection) are implemented in `server.js`.
*   **Network Level:** AWS WAF (Web Application Firewall) can be placed in front of App Runner to filter malicious traffic.

---

## 2. Problems Solved (Classical vs. Q-Gate)

This architecture addresses critical vulnerabilities inherent in traditional password-based and current 2FA systems.

### A. The Quantum Threat (Shor's Algorithm)
*   **Problem:** Classical encryption (RSA/ECC) relies on math problems that Quantum Computers will solve effortlessly, rendering current digital signatures useless.
*   **Q-Gate Solution:** Uses **Crystals-Dilithium (ML-DSA)**, a lattice-based algorithm chosen by NIST. It is mathematically resistant to both classical and quantum attacks.

### B. Database Leaks & Credential Stuffing
*   **Problem:** Traditional auth stores password hashes. If a DB is breached, attackers can crack hashes or use them in "credential stuffing" attacks on other sites.
*   **Q-Gate Solution:** We store **Public Keys**. Public keys are designed to be shared. If the MongoDB database is leaked, attackers gain **zero** access capabilities because the Private Key remains physically isolated on the user's device.

### C. Phishing & Man-in-the-Middle (MitM)
*   **Problem:** Users can be tricked into typing passwords into fake websites.
*   **Q-Gate Solution:**
    1.  **No Passwords:** There is nothing for the user to type.
    2.  **Device Binding:** The Private Key is stored in the mobile device's Secure Enclave/TEE. It never leaves the hardware. A fake website cannot extract the key to impersonate the user.

### D. Session Hijacking
*   **Problem:** JWTs (JSON Web Tokens) are often stateless. If stolen, they are hard to revoke immediately.
*   **Q-Gate Solution:** Uses **Opaque Tokens** backed by Redis.
    *   The token is just a random hex string (`crypto.randomBytes`).
    *   The session state lives in Redis.
    *   **Benefit:** We can instantly revoke a session (e.g., "Log out all devices") by simply deleting the key from Redis.

### E. Denial of Service (DoS)
*   **Problem:** Public API endpoints can be flooded with requests to crash the server.
*   **Q-Gate Solution:** Implemented `express-rate-limit` on `/api/*` routes to cap requests per IP, preventing script-kiddie attacks from overwhelming the authentication service.

---

## 3. Summary

Q-Gate moves authentication from "Something you know" (Passwords - Phishable, Weak) to "Something you have" (Device - Hardened, Unique) + "Something you are" (Biometrics), wrapped in a cryptographic layer that is secure against future computing threats.