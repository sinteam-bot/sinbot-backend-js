# Utilisation d'une image Node.js LTS (v20 ou v22 recommandee)
FROM node:24-alpine

# Definition du repertoire de travail dans le conteneur
WORKDIR /app

# Outils de compilation nescessaires pour les modules C++ natifs (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copie des fichiers de dependances
COPY package*.json ./

# Installation des dependances de production
RUN npm ci --only=production

# Suppression des outils de compilation pour alléger l'image finale
RUN apk del python3 make g++

# Copie de l'ensemble des fichiers du projet
COPY . .

# Variables de build pour le suivi de version Git
ARG GIT_COMMIT_SHA="dev"
ARG BUILD_DATE=""
ARG GITHUB_REPO="sinteam-bot/chienne-bot"

# Variables d'environnement par defaut
ENV NODE_ENV=production
ENV PORT=3000
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}
ENV BUILD_DATE=${BUILD_DATE}
ENV GITHUB_REPO=${GITHUB_REPO}

# Exposition du port du serveur Express (Webhooks / API)
EXPOSE 3000

# Commande de demarrage du bot Discord
CMD ["node", "src/index.js"]
