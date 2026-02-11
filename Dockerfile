C'est normal ! Contrairement à npm, pnpm n'est pas installé par défaut dans l'image node:22. Il faut l'activer ou l'installer explicitement.

De plus, ta méthode de COPY actuelle est un peu redondante. Voici comment corriger ton Dockerfile pour qu'il soit fonctionnel et optimisé :
Dockerfile

FROM node:22

# 1. On active Corepack qui gère pnpm nativement dans l'image Node
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

# 2. On copie uniquement les fichiers de dépendances
# pnpm a besoin du lockfile pour fonctionner correctement
COPY package.json pnpm-lock.yaml ./

# 3. Installation des dépendances avec le cache Docker
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# 4. On copie le reste du code
COPY . .

CMD ["pnpm", "start"]