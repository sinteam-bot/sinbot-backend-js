# ==============================================================================
# STAGE 1 : Compilation du Frontend Nuxt (Vue.js) en Statique
# ==============================================================================
FROM node:24-alpine AS frontend-builder

WORKDIR /app

# Copie des dépendances du frontend
COPY frontend/package*.json ./frontend/

# Installation des dépendances Nuxt
RUN cd frontend && npm install

# Copie des sources du frontend
COPY frontend/ ./frontend/

# Génération statique du frontend Nuxt vers public/
RUN cd frontend && npm run generate

# ==============================================================================
# STAGE 2 : Construction de l'Image de Production du Bot
# ==============================================================================
FROM node:24-alpine

WORKDIR /app

# Outils de compilation nécessaires pour better-sqlite3 (module C++ natif)
RUN apk add --no-cache python3 make g++

# Copie des fichiers de dépendances du bot
COPY package*.json ./

# Installation des dépendances de production uniquement
RUN npm ci --only=production

# Suppression des outils de compilation pour alléger l'image
RUN apk del python3 make g++

# Copie du code source backend et de la configuration
COPY . .

# Copie des fichiers statiques compilés depuis l'étape frontend-builder
COPY --from=frontend-builder /app/public ./public

# Variables de build pour le suivi de version Git
ARG GIT_COMMIT_SHA="dev"
ARG BUILD_DATE=""
ARG GITHUB_REPO="sinteam-bot/chienne-bot"

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
ENV BUILD_DATE=${BUILD_DATE}
ENV GITHUB_REPO=${GITHUB_REPO}

# Exposition du port du serveur Express (Webhooks / API / Dashboard)
EXPOSE 3000

# Commande de démarrage du bot Discord
CMD ["node", "src/index.js"]
