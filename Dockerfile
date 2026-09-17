# ==============================================================================
# SUNWAI Node.js Core Backend & Frontend Static Server
# ==============================================================================
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors if present
COPY package.json ./

# Copy application source code
COPY server.js ./
COPY lib/ ./lib/
COPY data/ ./data/
COPY public/ ./public/

# Create uploads directory
RUN mkdir -p uploads

# Expose server port
EXPOSE 3000

# Healthcheck to verify the web service is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the Node.js server
CMD ["node", "server.js"]
