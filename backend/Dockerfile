# Use a glibc-based (Debian) image rather than Alpine/musl.
#
# @xenova/transformers uses the `onnxruntime-node` native backend in Node, and
# that package only ships prebuilt binaries linked against glibc. On Alpine the
# native binding fails to load, which breaks local embeddings and therefore
# document indexing. Debian slim provides the glibc runtime onnxruntime needs.
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Pre-download the embedding model so production can embed OFFLINE. HuggingFace
# is not reachable from the runtime container, so the model must be baked in.
ENV TRANSFORMERS_CACHE=/app/.cache
RUN node download-model.mjs

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV TRANSFORMERS_CACHE=/app/.cache
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Carry over the pre-baked embedding model.
COPY --from=builder /app/.cache /app/.cache
EXPOSE 4000
CMD ["node", "dist/server.js"]
