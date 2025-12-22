# Use Node.js LTS (Long Term Support) image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production dependencies for a smaller image)
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose the port from server.js
EXPOSE 5000

# Set environment variables fallbacks
ENV PORT=5000
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]
