# Use the official Node.js image as the base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies and clean npm cache
RUN npm ci --only=production && npm cache clean --force

# Copy the rest of the application code to the working directory
COPY . .

# Create a non-root user and switch to it
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Set the entrypoint to run the application
ENTRYPOINT ["node", "index.js"]