# Utilisation d'une image Node.js 24 Alpine
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

# Variables d'environnement par defaut
ENV NODE_ENV=production
ENV PORT=3000

# Exposition du port du serveur Express (Webhooks / API)
EXPOSE 3000

# Commande de demarrage du bot Discord
CMD ["node", "src/index.js"]
