# Utilisation d'une image Node.js legere (LTS)
FROM node:20-alpine

# Definition du repertoire de travail dans le conteneur
WORKDIR /app

# Copie des fichiers de dependances
COPY package*.json ./

# Installation des dependances de production
RUN npm ci --only=production

# Copie de l'ensemble des fichiers du projet
COPY . .

# Variables d'environnement par defaut (overridden par docker-compose ou env)
ENV NODE_ENV=production
ENV PORT=3000

# Exposition du port du serveur Express (Webhooks / API)
EXPOSE 3000

# Commande de demarrage du bot Discord
CMD ["node", "src/index.js"]
