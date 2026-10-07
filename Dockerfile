# ==============================================================================
# Image de Production du Bot Discord & API Express
# ==============================================================================
FROM node:24-alpine

WORKDIR /app

# Dépendances système d'exécution et outils de compilation pour canvas / modules natifs
RUN apk add --no-cache \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    pixman \
    && apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

# Activation de corepack et installation de pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copie des fichiers de dépendances
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Installation des dépendances de production uniquement
RUN pnpm install --frozen-lockfile --prod \
    && apk del .build-deps

# Copie du code source backend et des données de configuration de base
COPY . .

# Variables de build pour le suivi de version Git
ARG GIT_COMMIT_SHA="dev"
ARG BUILD_DATE=""
ARG GITHUB_REPO="sinteam-bot/chienne-bot"

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=3000 \
    GIT_COMMIT_SHA=${GIT_COMMIT_SHA} \
    BUILD_DATE=${BUILD_DATE} \
    GITHUB_REPO=${GITHUB_REPO}

# Exposition du port API Webhook & REST
EXPOSE 3000

# Commande de démarrage
CMD ["node", "src/index.js"]
